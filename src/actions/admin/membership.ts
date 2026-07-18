"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

const TWENTY_EIGHT_DAYS = 28 * 24 * 60 * 60 * 1000;

export async function activateMembership(
  memberId: string
): Promise<ActionResult<{ expiresAt: number }>> {
  try {
    const now = Date.now();

    // Check if member has an active membership to extend
    const existing = await redis.hgetall(`membership:${memberId}`);
    let newExpiresAt: number;

    if (existing && Number(existing.expiresAt) > now) {
      // Extend from current expiry
      newExpiresAt = Number(existing.expiresAt) + TWENTY_EIGHT_DAYS;
    } else {
      // New or expired: start from now
      newExpiresAt = now + TWENTY_EIGHT_DAYS;
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
