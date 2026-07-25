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

export async function isUserCheckedInToday(userId: string): Promise<boolean> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [dedup, entries] = await Promise.all([
      redis.get(`checkin:dedup:${userId}`),
      redis.lrange(`checkins:${today}`, 0, -1),
    ]);

    if (dedup) return true;

    if (entries && entries.length > 0) {
      return entries.some((entry) => {
        try {
          const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;
          return parsed.userId === userId;
        } catch {
          return false;
        }
      });
    }

    return false;
  } catch (error) {
    console.error("isUserCheckedInToday error:", error);
    return false;
  }
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
    const alreadyCheckedIn = await isUserCheckedInToday(memberId);
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
    await redis.set(dedupKey, "1", { ex: 86400 });

    revalidatePath("/admin/members");
    revalidatePath("/dashboard");
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
  adminId: string,
  method: "manual" | "day_pass" | "rental" = "manual"
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const guestId = `guest_${now}`;

    if (method === "rental") {
      const { createRentalSession } = await import("@/actions/admin/rentals");
      await createRentalSession(guestId, name);
    }

    const entry = JSON.stringify({
      userId: guestId,
      adminId,
      timestamp: now,
      method,
      memberName: name,
    });

    await redis.rpush(`checkins:${today}`, entry);

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
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

export async function checkInWithDayPass(
  memberId: string,
  memberName: string,
  adminId: string,
  isPaidInPerson: boolean
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const { redeemDayPass } = await import("@/actions/wallet");
    if (!isPaidInPerson) {
      const redeemRes = await redeemDayPass(memberId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error };
      }
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method: "day_pass",
      memberName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${memberId}`, "1", { ex: 86400 });

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Day Pass check-in failed",
    };
  }
}

export async function checkInWithRental(
  memberId: string,
  memberName: string,
  adminId: string,
  isPaidInPerson: boolean
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const { redeemRentalHour } = await import("@/actions/wallet");
    const { createRentalSession } = await import("@/actions/admin/rentals");

    if (!isPaidInPerson) {
      const redeemRes = await redeemRentalHour(memberId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error };
      }
    }

    await createRentalSession(memberId, memberName);

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method: "rental",
      memberName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${memberId}`, "1", { ex: 86400 });

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Car rental check-in failed",
    };
  }
}
