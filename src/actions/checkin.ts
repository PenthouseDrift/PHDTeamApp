"use server";

import { redis } from "@/lib/redis";
import type { ActionResult } from "@/types";

export async function performCheckIn(
  memberId: string,
  adminId: string,
  method: "qr" | "manual"
): Promise<ActionResult<{ checkedIn: boolean }>> {
  // Will be fully implemented in Task 12
  try {
    const membership = await redis.hgetall(`membership:${memberId}`);
    if (!membership || Number(membership.expiresAt) <= Date.now()) {
      return { success: false, error: "Membership is not active" };
    }

    // Check dedup
    const dedupKey = `checkin:dedup:${memberId}`;
    const alreadyCheckedIn = await redis.get(dedupKey);
    if (alreadyCheckedIn) {
      return {
        success: false,
        error: "Member already checked in within the last hour",
      };
    }

    // Record check-in
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(dedupKey, "1", { ex: 3600 });

    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Check-in failed",
    };
  }
}
