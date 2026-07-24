"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

const TWENTY_EIGHT_DAYS = 28 * 24 * 60 * 60 * 1000;

export async function activateMembership(
  memberId: string,
  customExpiryDate?: string
): Promise<ActionResult<{ expiresAt: number }>> {
  try {
    const now = Date.now();

    let newExpiresAt: number;

    if (customExpiryDate) {
      // Admin override — use the custom date
      newExpiresAt = new Date(customExpiryDate + "T23:59:59").getTime();
    } else {
      // Check if member has an active membership to extend
      const existing = await redis.hgetall(`membership:${memberId}`);
      if (existing && Number(existing.expiresAt) > now) {
        // Extend from current expiry
        newExpiresAt = Number(existing.expiresAt) + TWENTY_EIGHT_DAYS;
      } else {
        // New or expired: start from now
        newExpiresAt = now + TWENTY_EIGHT_DAYS;
      }
    }

    await redis.hset(`membership:${memberId}`, {
      userId: memberId,
      status: "active",
      purchasedAt: now,
      expiresAt: newExpiresAt,
      paymentRef: `manual_${now}`,
    });

    // Add to active memberships sorted set
    await redis.zadd("memberships:active", { score: newExpiresAt, member: memberId });

    // Ensure member is in the all memberships set
    await redis.zadd("memberships:all", { score: now, member: memberId });

    revalidatePath("/admin/members");
    return { success: true, data: { expiresAt: newExpiresAt } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to activate membership",
    };
  }
}

export async function revokeMembership(
  memberId: string
): Promise<ActionResult<null>> {
  try {
    const pastExpiry = Date.now() - 1000;

    await redis.hset(`membership:${memberId}`, {
      userId: memberId,
      status: "expired",
      expiresAt: pastExpiry,
    });

    await redis.zrem("memberships:active", memberId);

    revalidatePath("/admin/members");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke membership",
    };
  }
}

export async function adminAdjustWallet(
  memberId: string,
  itemType: "daypass" | "rental",
  delta: number // positive = add, negative = remove
): Promise<ActionResult<{ dayPasses: number; rentalHours: number }>> {
  try {
    const walletData = await redis.hgetall(`wallet:${memberId}`);
    const current = {
      dayPasses: Math.max(0, Number(walletData?.dayPasses) || 0),
      rentalHours: Math.max(0, Number(walletData?.rentalHours) || 0),
    };

    const newDayPasses = itemType === "daypass"
      ? Math.max(0, current.dayPasses + delta)
      : current.dayPasses;
    const newRentalHours = itemType === "rental"
      ? Math.max(0, current.rentalHours + delta)
      : current.rentalHours;

    await redis.hset(`wallet:${memberId}`, {
      userId: memberId,
      dayPasses: newDayPasses,
      rentalHours: newRentalHours,
      updatedAt: Date.now(),
    });

    revalidatePath("/admin/members");
    return { success: true, data: { dayPasses: newDayPasses, rentalHours: newRentalHours } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to adjust wallet",
    };
  }
}

