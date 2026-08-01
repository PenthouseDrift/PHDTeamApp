"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import { isUserCheckedInToday } from "@/actions/admin/checkins";
import { redeemDayPass, redeemRentalHour } from "@/actions/wallet";
import { createRentalSession } from "@/actions/admin/rentals";
import { logActivity } from "@/lib/activity";

export async function performSelfCheckIn(
  userId: string,
  method: "membership" | "day_pass" | "rental",
  skipRevalidate = false
): Promise<ActionResult<{ checkedIn: boolean; method: string; message: string }>> {
  try {
    if (!userId) {
      return { success: false, error: "User ID required" };
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Check if user is already checked in today
    const alreadyCheckedIn = await isUserCheckedInToday(userId);
    if (alreadyCheckedIn) {
      return { success: false, error: "You are already checked in for today!" };
    }

    // Fetch user & membership details
    const [memberData, userData, membershipData] = await Promise.all([
      redis.hgetall(`member:${userId}`),
      redis.hgetall(`user:${userId}`),
      redis.hgetall(`membership:${userId}`),
    ]);

    const rawName =
      (memberData?.name as string) ||
      (userData?.name as string) ||
      "Member";
    const nickname =
      (memberData?.nickname as string) ||
      (userData?.nickname as string) ||
      "";
    const displayName = nickname.trim() ? `${rawName} ("${nickname.trim()}")` : rawName;

    let checkInMethod = "manual";
    let successMessage = "";

    if (method === "membership") {
      const isMembershipActive = membershipData && Number(membershipData.expiresAt) > now;
      if (!isMembershipActive) {
        return { success: false, error: "Your 28-day membership is not active" };
      }
      checkInMethod = "qr";
      successMessage = `Checked in with 28-Day Membership! Have a great track session 🏎️`;
    } else if (method === "day_pass") {
      const redeemRes = await redeemDayPass(userId, skipRevalidate);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Day Passes left in wallet" };
      }
      checkInMethod = "day_pass_wallet";
      successMessage = `Day Pass redeemed! Checked in for today 🎫 (${redeemRes.data.remaining} passes remaining)`;
    } else if (method === "rental") {
      const redeemRes = await redeemRentalHour(userId, skipRevalidate);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Car Rental Hours left in wallet" };
      }
      await createRentalSession(userId, displayName);
      checkInMethod = "rental_wallet";
      successMessage = `Car Rental Started! Checked in for today 🏎️ (${redeemRes.data.remaining} hrs remaining)`;
    }

    const entry = JSON.stringify({
      userId,
      adminId: userId, // Self check-in
      timestamp: now,
      method: checkInMethod,
      memberName: displayName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${userId}`, "1", { ex: 86400 });

    await logActivity({
      type: "checkin",
      memberId: userId,
      memberName: displayName,
      description: successMessage,
    });

    if (!skipRevalidate) {
      try {
        revalidatePath("/track-checkin");
        revalidatePath("/admin/members");
        revalidatePath("/admin/check-in");
        revalidatePath("/dashboard");
      } catch {
        // Safe fallback if called during server rendering
      }
    }

    return {
      success: true,
      data: { checkedIn: true, method: checkInMethod, message: successMessage },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Self check-in failed",
    };
  }
}

export async function performGuestSelfCheckIn(
  userId: string,
  guestName: string,
  method: "day_pass" | "rental",
  skipRevalidate = false
): Promise<ActionResult<{ checkedIn: boolean; message: string }>> {
  try {
    if (!userId || !guestName.trim()) {
      return { success: false, error: "Guest name is required" };
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const guestId = `guest_${now}`;
    const cleanGuestName = guestName.trim();

    let checkInMethod = "day_pass_wallet";
    let message = "";

    if (method === "day_pass") {
      const redeemRes = await redeemDayPass(userId, skipRevalidate);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Day Passes left in wallet" };
      }
      checkInMethod = "day_pass_wallet";
      message = `Guest ${cleanGuestName} checked in using 1 Day Pass! 🎫`;
    } else if (method === "rental") {
      const redeemRes = await redeemRentalHour(userId, skipRevalidate);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error || "No Car Rental Hours left in wallet" };
      }
      await createRentalSession(guestId, cleanGuestName);
      checkInMethod = "rental_wallet";
      message = `Guest ${cleanGuestName} checked in & Car Rental Session Started! 🏎️`;
    }

    const entry = JSON.stringify({
      userId: guestId,
      adminId: userId,
      timestamp: now,
      method: checkInMethod,
      memberName: `${cleanGuestName} (Guest)`,
    });

    await redis.rpush(`checkins:${today}`, entry);

    if (!skipRevalidate) {
      try {
        revalidatePath("/track-checkin");
        revalidatePath("/admin/members");
        revalidatePath("/admin/check-in");
        revalidatePath("/dashboard");
      } catch {
        // Safe fallback if called during server rendering
      }
    }

    return {
      success: true,
      data: { checkedIn: true, message },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Guest check-in failed",
    };
  }
}
