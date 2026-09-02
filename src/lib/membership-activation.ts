import { redis } from "@/lib/redis";
import { logActivity } from "@/lib/activity";

/** Returns 23:59:59.999 UTC on the day that is 28 days after `fromDate` */
function endOfDay28(fromDate: Date): number {
  const target = new Date(fromDate);
  target.setUTCDate(target.getUTCDate() + 28);
  target.setUTCHours(23, 59, 59, 999);
  return target.getTime();
}

export async function processSuccessfulMembershipPayment(
  memberId: string,
  checkoutId: string
): Promise<{ success: boolean; expiresAt: number }> {
  // Check if already processed with this payment reference
  const existingRef = await redis.hget(`membership:${memberId}`, "paymentRef");
  const currentExpiry = await redis.hget(`membership:${memberId}`, "expiresAt");

  if (existingRef === checkoutId && currentExpiry) {
    return { success: true, expiresAt: Number(currentExpiry) };
  }

  const now = Date.now();
  let newExpiresAt: number;

  if (currentExpiry && Number(currentExpiry) > now) {
    // Renewal: extend from current expiry date
    newExpiresAt = endOfDay28(new Date(Number(currentExpiry)));
  } else {
    // New or expired: start from today
    newExpiresAt = endOfDay28(new Date(now));
  }

  await redis.hset(`membership:${memberId}`, {
    userId: memberId,
    status: "active",
    purchasedAt: now,
    expiresAt: newExpiresAt,
    paymentRef: checkoutId,
  });

  // Mirror status onto the member profile hash so any reader of member:<id>
  // (dashboard/wallet) sees the active membership immediately, matching the
  // in-person activation path.
  await redis.hset(`member:${memberId}`, {
    membershipStatus: "active",
    membershipExpiresAt: newExpiresAt,
  });

  // Add to active memberships sorted set (score = expiresAt for cron expiry)
  await redis.zadd("memberships:active", {
    score: newExpiresAt,
    member: memberId,
  });

  // Ensure member is in the all memberships set
  await redis.zadd("memberships:all", { score: now, member: memberId });

  return { success: true, expiresAt: newExpiresAt };
}

export async function processSuccessfulPaymentReference(
  checkoutReference: string,
  checkoutId: string,
  amount: number = 0,
  currency: string = "GBP"
): Promise<{ success: boolean; itemType: "membership" | "daypass" | "rental"; memberId: string; guestName?: string }> {
  let memberId = "";
  let itemType: "membership" | "daypass" | "rental" = "membership";
  let quantity = 1;
  let guestName: string | undefined = undefined;
  // Amount actually charged, persisted in the checkout metadata at creation time.
  // Preferred over the webhook amount, which can be missing or mis-reported.
  let storedAmount: number | undefined = undefined;
  let storedCurrency: string | undefined = undefined;

  // 1. First check if we have metadata stored in Redis under checkout:${checkoutId}
  if (checkoutId) {
    const storedCheckoutStr = await redis.get(`checkout:${checkoutId}`);
    if (storedCheckoutStr) {
      try {
        const stored = typeof storedCheckoutStr === "string" ? JSON.parse(storedCheckoutStr) : storedCheckoutStr;
        if (stored.memberId) memberId = stored.memberId;
        if (stored.itemType) itemType = stored.itemType;
        if (stored.quantity) quantity = Number(stored.quantity) || 1;
        if (stored.guestName) guestName = stored.guestName;
        if (stored.amount !== undefined && Number.isFinite(Number(stored.amount))) {
          storedAmount = Number(stored.amount);
        }
        if (stored.currency) storedCurrency = String(stored.currency);
      } catch (e) {
        console.error("Failed to parse stored checkout JSON:", e);
      }
    }
  }

  // 2. Fallback to reference string parsing if metadata was not found in Redis
  if (!memberId && checkoutReference) {
    const parts = checkoutReference.split("_");
    
    // Example format: phd_<userId>_<timestamp> (from createCheckout in sumup.ts)
    // Example format: phd_daypass_<userId>_<timestamp>
    
    // Clean up "phd" prefix if it exists
    const cleanParts = parts[0] === "phd" ? parts.slice(1) : parts;
    
    if (cleanParts.length >= 3) {
      itemType = cleanParts[0] as "membership" | "daypass" | "rental";
      memberId = cleanParts[1];
      quantity = parseInt(cleanParts[2], 10) || 1;
    } else if (cleanParts.length >= 2) {
      // If only 2 parts, assume it's just <userId>_<timestamp> and itemType is membership
      itemType = "membership";
      memberId = cleanParts[0];
    } else if (cleanParts.length === 1) {
      itemType = "membership";
      memberId = cleanParts[0];
    }
  }

  if (!memberId) {
    throw new Error(`Unable to determine memberId for checkout ID: ${checkoutId} (ref: ${checkoutReference})`);
  }

  // Fetch member name for the transaction log
  const memberName = (await redis.hget(`member:${memberId}`, "name")) as string || "Unknown Member";
  const finalName = guestName ? `${memberName} (for ${guestName})` : memberName;

  // Resolve the amount to log, in order of reliability:
  //   1. The amount persisted in the checkout metadata at creation time.
  //   2. The amount reported by the payment webhook.
  //   3. Cross-reference against the app's pricing config (BASE_PRICES minus
  //      the member's discount, times quantity).
  async function resolveAmount(type: "membership" | "daypass" | "rental", qty: number): Promise<number> {
    if (storedAmount !== undefined && storedAmount > 0) return storedAmount;
    if (Number.isFinite(amount) && amount > 0) return amount;

    try {
      const { getMemberDiscounts, priceFor } = await import("@/lib/pricing");
      const discounts = await getMemberDiscounts(memberId);
      const perUnit = priceFor(type, discounts[type]).final;
      return Math.round(perUnit * qty * 100) / 100;
    } catch (e) {
      console.error("Failed to cross-reference pricing config:", e);
      return amount;
    }
  }

  async function recordPurchase(type: "membership" | "daypass" | "rental", qty: number) {
    const itemName = type === "membership" ? "Membership" : type === "daypass" ? "Day Pass" : "Rental Hours";
    const resolvedAmount = await resolveAmount(type, qty);
    await logActivity({
      type: "purchase",
      memberId,
      memberName: finalName,
      description: `Purchased ${qty}x ${itemName}`,
      amount: resolvedAmount,
      currency: storedCurrency || currency,
    });
  }

  // 3. Process payment idempotently based on itemType
  if (itemType === "membership") {
    await processSuccessfulMembershipPayment(memberId, checkoutId);
    await recordPurchase("membership", quantity);
    return { success: true, itemType: "membership", memberId, guestName };
  } else if (itemType === "daypass") {
    const key = `payment:processed:${checkoutId}`;
    const alreadyProcessed = await redis.get(key);
    if (!alreadyProcessed) {
      const walletData = await redis.hgetall(`wallet:${memberId}`);
      const currentPasses = Number(walletData?.dayPasses) || 0;
      const currentRentals = Number(walletData?.rentalHours) || 0;
      const newPasses = currentPasses + quantity;
      await redis.hset(`wallet:${memberId}`, {
        userId: memberId,
        dayPasses: newPasses,
        rentalHours: currentRentals,
        updatedAt: Date.now(),
      });
      await recordPurchase("daypass", quantity);
      await redis.set(key, "1", { ex: 86400 * 30 });
    }
    return { success: true, itemType: "daypass", memberId, guestName };
  } else if (itemType === "rental") {
    const key = `payment:processed:${checkoutId}`;
    const alreadyProcessed = await redis.get(key);
    if (!alreadyProcessed) {
      const walletData = await redis.hgetall(`wallet:${memberId}`);
      const currentPasses = Number(walletData?.dayPasses) || 0;
      const currentRentals = Number(walletData?.rentalHours) || 0;
      const newHours = currentRentals + quantity;
      await redis.hset(`wallet:${memberId}`, {
        userId: memberId,
        dayPasses: currentPasses,
        rentalHours: newHours,
        updatedAt: Date.now(),
      });
      await recordPurchase("rental", quantity);
      await redis.set(key, "1", { ex: 86400 * 30 });
    }
    return { success: true, itemType: "rental", memberId, guestName };
  }

  throw new Error(`Unsupported item type: ${itemType}`);
}
