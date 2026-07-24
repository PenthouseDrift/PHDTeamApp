import { redis } from "@/lib/redis";

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
  checkoutId: string
): Promise<{ success: boolean; itemType: "membership" | "daypass" | "rental"; memberId: string }> {
  const parts = checkoutReference.split("_");
  if (parts.length < 3) {
    throw new Error("Invalid checkout reference format");
  }

  const itemType = parts[0] as "membership" | "daypass" | "rental";
  const memberId = parts[1];
  const quantity = parseInt(parts[2], 10) || 1;

  if (itemType === "membership") {
    await processSuccessfulMembershipPayment(memberId, checkoutId);
    return { success: true, itemType: "membership", memberId };
  } else if (itemType === "daypass") {
    const key = `payment:processed:${checkoutId}`;
    const alreadyProcessed = await redis.get(key);
    if (!alreadyProcessed) {
      const current = await redis.hget(`wallet:${memberId}`, "dayPasses");
      const newPasses = (Number(current) || 0) + quantity;
      await redis.hset(`wallet:${memberId}`, {
        userId: memberId,
        dayPasses: newPasses,
        updatedAt: Date.now(),
      });
      await redis.set(key, "1", { ex: 86400 * 30 });
    }
    return { success: true, itemType: "daypass", memberId };
  } else if (itemType === "rental") {
    const key = `payment:processed:${checkoutId}`;
    const alreadyProcessed = await redis.get(key);
    if (!alreadyProcessed) {
      const current = await redis.hget(`wallet:${memberId}`, "rentalHours");
      const newHours = (Number(current) || 0) + quantity;
      await redis.hset(`wallet:${memberId}`, {
        userId: memberId,
        rentalHours: newHours,
        updatedAt: Date.now(),
      });
      await redis.set(key, "1", { ex: 86400 * 30 });
    }
    return { success: true, itemType: "rental", memberId };
  }

  throw new Error(`Unsupported item type: ${itemType}`);
}
