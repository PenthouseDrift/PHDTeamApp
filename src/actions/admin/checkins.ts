"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export interface CheckInEntry {
  userId: string;
  adminId: string;
  timestamp: number;
  method: "qr" | "manual";
  memberName: string;
}

export async function getTodayCheckIns(): Promise<CheckInEntry[]> {
  const today = new Date().toISOString().split("T")[0];
  const entries = await redis.lrange(`checkins:${today}`, 0, -1);

  if (!entries || entries.length === 0) return [];

  return entries.map((entry) => {
    if (typeof entry === "string") {
      return JSON.parse(entry) as CheckInEntry;
    }
    return entry as unknown as CheckInEntry;
  });
}

export async function getCheckInsByDate(date: string): Promise<CheckInEntry[]> {
  const entries = await redis.lrange(`checkins:${date}`, 0, -1);

  if (!entries || entries.length === 0) return [];

  return entries.map((entry) => {
    if (typeof entry === "string") {
      return JSON.parse(entry) as CheckInEntry;
    }
    return entry as unknown as CheckInEntry;
  });
}

export async function quickCheckIn(
  memberId: string,
  memberName: string,
  adminId: string
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    // No membership check required — admin override for manual tracking
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Check dedup
    const dedupKey = `checkin:dedup:${memberId}`;
    const alreadyCheckedIn = await redis.get(dedupKey);
    if (alreadyCheckedIn) {
      return { success: false, error: `${memberName} is already checked in today` };
    }

    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method: "manual",
      memberName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(dedupKey, "1", { ex: 3600 });

    revalidatePath("/admin/members");
    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Check-in failed",
    };
  }
}

export async function addNonMemberCheckIn(
  name: string,
  adminId: string
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    const entry = JSON.stringify({
      userId: `guest_${now}`,
      adminId,
      timestamp: now,
      method: "manual",
      memberName: name,
    });

    await redis.rpush(`checkins:${today}`, entry);

    revalidatePath("/admin/members");
    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Check-in failed",
    };
  }
}

export async function removeCheckIn(
  index: number
): Promise<ActionResult<null>> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;

    // Get all entries, remove the one at index, rewrite the list
    const entries = await redis.lrange(key, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Check-in not found" };
    }

    // Remove by setting to a placeholder then removing it
    const placeholder = "__REMOVED__";
    await redis.lset(key, index, placeholder);
    await redis.lrem(key, 1, placeholder);

    // Also clear the dedup key if it was a real user
    const entry = entries[index];
    const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;
    if (parsed?.userId && !parsed.userId.startsWith("guest_")) {
      await redis.del(`checkin:dedup:${parsed.userId}`);
    }

    revalidatePath("/admin/members");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove check-in",
    };
  }
}
