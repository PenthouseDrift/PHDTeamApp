import { redis } from "@/lib/redis";
import { logActivity } from "@/lib/activity";
import { clearPendingCheckout } from "@/lib/pending-checkouts";
import { bustAdminMembers } from "@/lib/cache-bust";

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

type FinalizerItemType = "membership" | "daypass" | "rental" | "marketplace" | "pcredits";

export async function processSuccessfulPaymentReference(
  checkoutReference: string,
  checkoutId: string,
  amount: number = 0,
  currency: string = "GBP"
): Promise<{
  success: boolean;
  itemType: FinalizerItemType;
  memberId: string;
  guestName?: string;
  /** True when the member's auto check-in setting used the pass they just bought to check them in. */
  autoCheckedIn?: boolean;
}> {
  let memberId = "";
  let itemType: FinalizerItemType = "membership";
  let quantity = 1;
  let guestName: string | undefined = undefined;
  // Amount actually charged, persisted in the checkout metadata at creation time.
  // Preferred over the webhook amount, which can be missing or mis-reported.
  let storedAmount: number | undefined = undefined;
  let storedCurrency: string | undefined = undefined;
  // Marketplace-only metadata (populated from the checkout:<id> record).
  let listingId: string | undefined = undefined;
  let variantId: string | undefined = undefined;
  let itemLabel: string | undefined = undefined;
  // Basket checkouts carry a lines[] array (one entry per listing). Single-item
  // checkouts leave this undefined and use listingId/variantId above.
  let lines:
    | { listingId: string; variantId?: string; quantity: number; unitPrice: number; label: string }[]
    | undefined = undefined;

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
        if (stored.listingId) listingId = String(stored.listingId);
        if (stored.variantId) variantId = String(stored.variantId);
        if (stored.itemLabel) itemLabel = String(stored.itemLabel);
        if (Array.isArray(stored.lines) && stored.lines.length > 0) {
          lines = stored.lines
            .map((l: Record<string, unknown>) => ({
              listingId: String(l.listingId || ""),
              variantId: l.variantId ? String(l.variantId) : undefined,
              quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
              unitPrice: Math.max(0, Number(l.unitPrice) || 0),
              label: String(l.label || "Marketplace item"),
            }))
            .filter((l: { listingId: string }) => l.listingId.length > 0);
        }
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
      itemType = cleanParts[0] as "membership" | "daypass" | "rental" | "pcredits";
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

  // Atomically claim this checkout so only ONE caller does the crediting/
  // logging. The webhook and the client-side finalize endpoint both fire on a
  // successful payment and can run concurrently; a read-then-set guard races
  // and double-credits. `SET ... NX` returns null if the key already exists, so
  // exactly one caller wins the claim and the rest skip. Returns true if claimed.
  async function claim(key: string): Promise<boolean> {
    const res = await redis.set(key, "1", { nx: true, ex: 86400 * 30 });
    return res === "OK";
  }

  // 3. Process payment idempotently based on itemType
  if (itemType === "membership") {
    await processSuccessfulMembershipPayment(memberId, checkoutId);
    bustAdminMembers();
    // Guard the activity log so the same checkout isn't logged twice when both
    // the webhook and the finalize endpoint run for one payment.
    if (await claim(`payment:logged:${checkoutId}`)) {
      await recordPurchase("membership", quantity);
    }
    await clearPendingCheckout(checkoutId);
    return { success: true, itemType: "membership", memberId, guestName };
  } else if (itemType === "daypass") {
    let autoCheckedIn = false;
    if (await claim(`payment:processed:${checkoutId}`)) {
      bustAdminMembers();
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
      // Bought for themselves (not a guest) and auto check-in is on: use it now.
      if (!guestName) {
        const { tryAutoCheckIn } = await import("@/lib/auto-checkin");
        autoCheckedIn = await tryAutoCheckIn(memberId, "day_pass");
      }
    }
    await clearPendingCheckout(checkoutId);
    return { success: true, itemType: "daypass", memberId, guestName, autoCheckedIn };
  } else if (itemType === "rental") {
    let autoCheckedIn = false;
    if (await claim(`payment:processed:${checkoutId}`)) {
      bustAdminMembers();
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
      if (!guestName) {
        const { tryAutoCheckIn } = await import("@/lib/auto-checkin");
        autoCheckedIn = await tryAutoCheckIn(memberId, "rental");
      }
    }
    await clearPendingCheckout(checkoutId);
    return { success: true, itemType: "rental", memberId, guestName, autoCheckedIn };
  } else if (itemType === "marketplace") {
    if (await claim(`payment:processed:${checkoutId}`)) {
      const saleCurrency = storedCurrency || currency;

      // Normalise to a list of lines. Basket checkouts carry lines[]; legacy
      // single-item checkouts are treated as a one-line basket so the rest of
      // this branch has a single code path.
      const saleLines =
        lines && lines.length > 0
          ? lines
          : listingId
          ? [
              {
                listingId,
                variantId,
                quantity,
                // Single-item records store the TOTAL amount; quantity was always
                // 1 there, so total == unit price.
                unitPrice:
                  storedAmount !== undefined && storedAmount > 0
                    ? storedAmount
                    : Number.isFinite(amount) && amount > 0
                    ? amount
                    : 0,
                label: itemLabel || "Marketplace item",
              },
            ]
          : [];

      if (saleLines.length === 0) {
        throw new Error(`Marketplace checkout ${checkoutId} has no line items in metadata`);
      }

      // Prefer the amount captured at checkout time; otherwise derive from the
      // lines (unit price × qty). This is the figure shown on the order + email.
      const linesTotal = saleLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const saleTotal =
        storedAmount !== undefined && storedAmount > 0
          ? storedAmount
          : Number.isFinite(amount) && amount > 0
          ? amount
          : Math.round(linesTotal * 100) / 100;

      // 1. Decrement stock (+ ASBO-RC ledger) for EVERY line via the internal
      //    sell path. recordOnlineSale handles variant / ASBO / normal paths and
      //    clamps to real stock, and writes the ASBO-RC ledger per unit when the
      //    listing is soldByAsboRc. Gated by CRON_SECRET (no user session here).
      try {
        const { recordOnlineSale } = await import("@/actions/marketplace");
        for (const line of saleLines) {
          try {
            const result = await recordOnlineSale(
              process.env.CRON_SECRET || "",
              line.listingId,
              line.quantity,
              line.variantId
            );
            if (!result.success) {
              console.error(`Marketplace stock decrement failed for ${line.listingId}:`, result.error);
            }
          } catch (e) {
            console.error(`Marketplace recordOnlineSale threw for ${line.listingId}:`, e);
          }
        }
      } catch (e) {
        console.error("Marketplace recordOnlineSale import failed:", e);
      }

      // 2. Create ONE paid Click & Collect order holding every line, for the
      //    buyer's history and the admin fulfilment queue.
      let orderId = checkoutId;
      try {
        const { createOrder, updateOrderStatus } = await import("@/actions/orders");
        const created = await createOrder(
          memberId,
          saleLines.map((l) => ({
            productId: l.listingId,
            name: l.label,
            price: l.unitPrice,
            quantity: l.quantity,
          })),
          saleTotal,
          "click_collect",
          checkoutReference
        );
        if (created.success) {
          orderId = created.data.id;
          // Mark paid → auto-promotes to ready_for_collection + fulfilment queue.
          await updateOrderStatus(orderId, "paid");
        }
      } catch (e) {
        console.error("Marketplace order creation failed:", e);
      }

      // 2b. If the buyer had reserved any of these items, turn those reservations
      //     into this purchase: release the held units (they're sold now) and
      //     link the reservation to the order so it leaves their "Reserved" list.
      try {
        const { consumeReservationsForPurchase } = await import("@/lib/marketplace-reservations");
        await consumeReservationsForPurchase(
          memberId,
          saleLines.map((l) => ({ listingId: l.listingId, variantId: l.variantId, quantity: l.quantity })),
          orderId
        );
      } catch (e) {
        console.error("Marketplace reservation consume failed:", e);
      }

      // 3. Record the sale in the activity log (online revenue). One entry for
      //    the whole basket, at the total charged.
      const activityLabel =
        saleLines.length === 1
          ? saleLines[0].label
          : `${saleLines.length} items (${saleLines.reduce((s, l) => s + l.quantity, 0)} units)`;
      await logActivity({
        type: "purchase",
        memberId,
        memberName: finalName,
        description: `Marketplace: ${activityLabel} (Click & Collect)`,
        amount: saleTotal,
        currency: saleCurrency,
      });

      // 4. Email the buyer an order confirmation listing every line (best-effort).
      try {
        const buyerEmail = (await redis.hget(`member:${memberId}`, "email")) as string | null;
        if (buyerEmail) {
          const { sendEmail, renderOrderConfirmation } = await import("@/lib/email");
          const { subject, html } = renderOrderConfirmation({
            buyerName: memberName,
            orderId,
            items: saleLines.map((l) => ({ name: l.label, quantity: l.quantity, price: l.unitPrice })),
            totalAmount: saleTotal,
            currency: saleCurrency,
          });
          await sendEmail({ to: buyerEmail, subject, html });
        } else {
          console.warn(`[marketplace] No email on file for member ${memberId}; skipping confirmation`);
        }
      } catch (e) {
        console.error("Marketplace confirmation email failed:", e);
      }
      // The claim() at the top of this branch already set payment:processed
      // atomically, so there's nothing more to mark here.
    }
    await clearPendingCheckout(checkoutId);
    return { success: true, itemType: "marketplace", memberId, guestName };
  } else if (itemType === "pcredits") {
    if (await claim(`payment:processed:${checkoutId}`)) {
      const { grantPCredits } = await import("@/tcg/storage");
      const newBalance = await grantPCredits(memberId, quantity);
      bustAdminMembers();

      const paidAmount =
        storedAmount !== undefined && storedAmount > 0
          ? storedAmount
          : Number.isFinite(amount) && amount > 0
          ? amount
          : 0;
      const saleCurrency = storedCurrency || currency;
      const bundleLabel = itemLabel || `${quantity.toLocaleString()} P-Credits`;

      await logActivity({
        type: "purchase",
        memberId,
        memberName: finalName,
        description: `TCG Store: ${bundleLabel}`,
        amount: paidAmount,
        currency: saleCurrency,
      });

      // Send P-Credits confirmation email via Resend (best-effort)
      try {
        const buyerEmail = (await redis.hget(`member:${memberId}`, "email")) as string | null;
        if (buyerEmail) {
          const { sendEmail, renderPCreditsConfirmation } = await import("@/lib/email");
          const { subject, html } = renderPCreditsConfirmation({
            buyerName: memberName,
            orderId: checkoutId,
            bundleName: bundleLabel,
            pCredits: quantity,
            newBalance,
            totalAmount: paidAmount,
            currency: saleCurrency,
          });
          await sendEmail({ to: buyerEmail, subject, html });
        } else {
          console.warn(`[pcredits] No email on file for member ${memberId}; skipping confirmation`);
        }
      } catch (e) {
        console.error("P-Credits confirmation email failed:", e);
      }
    }
    await redis.del(`pending_pcredits_checkout:${memberId}`).catch(() => {});
    await clearPendingCheckout(checkoutId);
    return { success: true, itemType: "pcredits", memberId, guestName };
  }

  throw new Error(`Unsupported item type: ${itemType}`);
}
