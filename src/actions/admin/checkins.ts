"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export interface CheckInEntry {
  userId: string;
  adminId: string;
  timestamp: number;
  method: "qr" | "manual" | "day_pass" | "day_pass_wallet" | "day_pass_cash" | "rental" | "rental_wallet" | "rental_cash" | "membership_cash";
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
  adminId: string,
  method: "manual" | "membership_cash" = "manual"
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
      method,
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
      method: method === "day_pass" ? "day_pass_cash" : method === "rental" ? "rental_cash" : "manual",
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

export async function updateCheckInMethod(
  index: number,
  newMethod: "manual" | "day_pass" | "day_pass_wallet" | "day_pass_cash" | "rental" | "rental_wallet" | "rental_cash" | "membership_cash" | "qr"
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (
      !session?.user ||
      (session.user.role !== "admin" && session.user.role !== "moderator")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;

    const entries = await redis.lrange(key, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Check-in entry not found" };
    }

    const entryStr = entries[index];
    const parsed = typeof entryStr === "string" ? JSON.parse(entryStr) : entryStr;
    parsed.method = newMethod;

    await redis.lset(key, index, JSON.stringify(parsed));

    if (newMethod === "rental" && parsed.userId && parsed.memberName) {
      const { createOrExtendRentalSession } = await import("@/actions/admin/rentals");
      await createOrExtendRentalSession(parsed.userId, parsed.memberName);
    }

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    return { success: true, data: { success: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update check-in type",
    };
  }
}

export async function removeCheckIn(
  index: number
): Promise<ActionResult<null>> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;

    const entries = await redis.lrange(key, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Check-in not found" };
    }

    const placeholder = "__REMOVED__";
    await redis.lset(key, index, placeholder);
    await redis.lrem(key, 1, placeholder);

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
      method: isPaidInPerson ? "day_pass_cash" : "day_pass_wallet",
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
      method: isPaidInPerson ? "rental_cash" : "rental_wallet",
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

export async function checkInFriendWithPass(
  memberId: string,
  memberName: string,
  friendName: string,
  passType: "day_pass" | "rental",
  adminId: string
): Promise<ActionResult<{ message: string; remaining: number }>> {
  try {
    const cleanFriendName = friendName.trim() || `Guest of ${memberName}`;
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const guestId = `guest_${now}`;

    let checkInMethod = "day_pass_wallet";
    let message = "";
    let remaining = 0;

    if (passType === "day_pass") {
      const { redeemDayPass } = await import("@/actions/wallet");
      const redeemRes = await redeemDayPass(memberId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Day Passes left in member wallet" };
      }
      remaining = redeemRes.data.remaining;
      checkInMethod = "day_pass_wallet";
      message = `Guest ${cleanFriendName} checked in using 1 Day Pass from ${memberName}'s wallet! 🎫 (${remaining} left)`;
    } else {
      const { redeemRentalHour } = await import("@/actions/wallet");
      const { createRentalSession } = await import("@/actions/admin/rentals");
      const redeemRes = await redeemRentalHour(memberId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Rental Hours left in member wallet" };
      }
      remaining = redeemRes.data.remaining;
      await createRentalSession(guestId, `${cleanFriendName} (Guest of ${memberName})`);
      checkInMethod = "rental_wallet";
      message = `Guest ${cleanFriendName} checked in & Car Rental Started using ${memberName}'s wallet! 🏎️ (${remaining} hrs left)`;
    }

    const entry = JSON.stringify({
      userId: guestId,
      adminId,
      timestamp: now,
      method: checkInMethod,
      memberName: `${cleanFriendName} (Guest of ${memberName})`,
    });

    await redis.rpush(`checkins:${today}`, entry);

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    return { success: true, data: { message, remaining } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to check in friend with wallet pass",
    };
  }
}
