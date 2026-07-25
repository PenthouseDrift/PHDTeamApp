"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

/** Returns 23:59:59.999 UTC on the day that is 28 days after `fromDate` */
function endOfDay28(fromDate: Date): number {
  const target = new Date(fromDate);
  target.setUTCDate(target.getUTCDate() + 28);
  target.setUTCHours(23, 59, 59, 999);
  return target.getTime();
}

/** Snaps an admin-chosen date string (YYYY-MM-DD) to end of that UTC day */
function endOfChosenDay(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

export async function activateMembership(
  memberId: string,
  customExpiryDate?: string
): Promise<ActionResult<{ expiresAt: number }>> {
  try {
    const now = Date.now();

    let newExpiresAt: number;

    if (customExpiryDate) {
      // Admin override — snap to end of the chosen day
      newExpiresAt = endOfChosenDay(customExpiryDate);
    } else {
      // Check if member has an active membership to extend
      const existing = await redis.hgetall(`membership:${memberId}`);
      if (existing && Number(existing.expiresAt) > now) {
        // Extend 28 days from current expiry end-of-day
        newExpiresAt = endOfDay28(new Date(Number(existing.expiresAt)));
      } else {
        // New or expired: 28 days from today, end of day
        newExpiresAt = endOfDay28(new Date(now));
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

export async function clearMembershipRecord(
  memberId: string
): Promise<ActionResult<null>> {
  try {
    await redis.del(`membership:${memberId}`);
    await redis.zrem("memberships:active", memberId);
    await redis.zrem("memberships:all", memberId);

    revalidatePath("/admin/members");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear membership record",
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

