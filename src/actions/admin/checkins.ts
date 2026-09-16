"use server";

import { redis } from "@/lib/redis";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import type { ActionResult } from "@/types";
import { sendGlobalNotification } from "@/actions/notifications";
import { logActivity } from "@/lib/activity";
import { recordCheckInCount } from "@/lib/checkin-count";

export interface CheckInEntry {
  userId: string;
  adminId: string;
  timestamp: number;
  method: "qr" | "manual" | "membership" | "day_pass" | "day_pass_wallet" | "day_pass_cash" | "rental" | "rental_wallet" | "rental_cash" | "membership_cash" | "self_checkin";
  memberName: string;
  /** True when a cash/in-person check-in has not been paid for yet. */
  unpaid?: boolean;
}

export async function getSelfCheckInStatus(): Promise<boolean> {
  noStore();
  try {
    const status = await redis.get("settings:self_checkin_active");
    const isActive = status === "true" || status === true;

    if (isActive) {
      const { getUpcomingEvents } = await import("@/actions/events");
      const { getEventTiming } = await import("@/lib/event-utils");

      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const parts = formatter.formatToParts(now);
      const partMap: Record<string, string> = {};
      parts.forEach((p) => { partMap[p.type] = p.value; });
      const localToday = `${partMap.year}-${partMap.month}-${partMap.day}`;

      const events = await getUpcomingEvents();
      const todaysEvents = events.filter((e) => e.date === localToday);

      // Self check-in is only valid while there is a live event today.
      // Deactivate when there is no event today, or all of today's events have finished.
      const hasLiveEventToday = todaysEvents.some((e) => {
        const state = getEventTiming(e).state;
        return state === "today" || state === "happening_now";
      });

      if (!hasLiveEventToday) {
        await redis.set("settings:self_checkin_active", "false");
        return false;
      }
    }

    return isActive;
  } catch (error) {
    return false;
  }
}

export async function toggleSelfCheckInStatus(adminId: string): Promise<ActionResult<{ active: boolean }>> {
  try {
    const current = await getSelfCheckInStatus();
    const next = !current;
    
    // Use string representation for explicit parsing later
    await redis.set("settings:self_checkin_active", next ? "true" : "false");
    
    if (next) {
      // Background the notification dispatch so it doesn't block the UI response
      sendGlobalNotification({
        title: "Track Check-In Open! 🏁",
        message: "Self check-in is now active. You can check yourself in from your dashboard to skip the queue at the gates.",
        url: "/track-checkin"
      }, adminId).catch(console.error);
    }
    
    revalidatePath("/admin", "page");
    revalidatePath("/dashboard", "page");
    
    return { success: true, data: { active: next } };
  } catch (error) {
    console.error("toggle fail:", error);
    return { success: false, error: "Failed to toggle self check-in" };
  }
}

export async function submitSelfCheckIn(memberId: string, memberName: string): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const isActive = await getSelfCheckInStatus();
    if (!isActive) {
      return { success: false, error: "Self check-in is not currently active." };
    }

    const alreadyCheckedIn = await isUserCheckedInToday(memberId);
    if (alreadyCheckedIn) {
      return { success: false, error: "You are already checked in today." };
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const dedupKey = `checkin:dedup:${memberId}`;

    const entry = JSON.stringify({
      userId: memberId,
      adminId: memberId, // Self check-in uses member's own ID
      timestamp: now,
      method: "self_checkin",
      memberName,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(dedupKey, "1", { ex: 86400 });

    await logActivity({
      type: "checkin",
      memberId,
      memberName,
      description: "Checked in via Self Check-In",
      isDev: false,
    });

    revalidatePath("/admin/members");
    revalidatePath("/dashboard");
    return { success: true, data: { checkedIn: true } };
  } catch (error) {
    console.error("Self Check-in Error:", error);
    return { success: false, error: "An unexpected error occurred during self check-in." };
  }
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
  method: "manual" | "membership_cash" | "membership" = "manual"
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
    await recordCheckInCount(memberId, now);

    const adminName = (await redis.hget(`member:${adminId}`, "name")) as string || "Admin";
    const methodDesc =
      method === "membership_cash"
        ? "Cash Membership"
        : method === "membership"
        ? "Membership Track Access"
        : "Manual Override";
    const { priceForCheckInMethod, CURRENCY } = await import("@/lib/pricing");
    const amount = await priceForCheckInMethod(method, memberId);
    await logActivity({
      type: "checkin",
      memberId,
      memberName,
      description: `[ADMIN ACTION] Checked in by ${adminName} (${methodDesc})`,
      method,
      ...(amount !== null ? { amount, currency: CURRENCY } : {}),
      isDev: false,
    });

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
  method: "manual" | "day_pass" | "rental" = "manual",
  isUnpaid: boolean = false
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const guestId = `guest_${now}`;

    if (method === "rental") {
      const { createRentalSession } = await import("@/actions/admin/rentals");
      await createRentalSession(guestId, name);
    }

    const checkinMethod = method === "day_pass" ? "day_pass_cash" : method === "rental" ? "rental_cash" : "manual";
    // "Unpaid" only applies to cash pass/rental guest check-ins, not free manual.
    const unpaid = isUnpaid && (method === "day_pass" || method === "rental");

    const entry = JSON.stringify({
      userId: guestId,
      adminId,
      timestamp: now,
      method: checkinMethod,
      memberName: name,
      ...(unpaid ? { unpaid: true } : {}),
    });

    await redis.rpush(`checkins:${today}`, entry);

    const adminName = (await redis.hget(`member:${adminId}`, "name")) as string || "Admin";
    const { priceForCheckInMethod, CURRENCY } = await import("@/lib/pricing");
    const amount = await priceForCheckInMethod(checkinMethod, guestId);
    await logActivity({
      type: "checkin",
      memberId: guestId,
      memberName: name,
      description: `[ADMIN ACTION] Non-member guest checked in manually by ${adminName} (${method}${unpaid ? ", Not Paid Yet" : ""})`,
      method: checkinMethod,
      timestamp: now,
      ...(unpaid ? { unpaid: true } : amount !== null ? { amount, currency: CURRENCY } : {}),
      isDev: false,
    });

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
  newMethod: "manual" | "membership" | "day_pass" | "day_pass_wallet" | "day_pass_cash" | "rental" | "rental_wallet" | "rental_cash" | "membership_cash" | "qr"
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

export async function updateCheckInName(
  index: number,
  newName: string
): Promise<ActionResult<{ name: string }>> {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (
      !session?.user ||
      (session.user.role !== "admin" && session.user.role !== "moderator")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const trimmed = newName.trim();
    if (!trimmed) {
      return { success: false, error: "Name cannot be empty" };
    }
    if (trimmed.length > 60) {
      return { success: false, error: "Name is too long (max 60 characters)" };
    }

    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;

    const entries = await redis.lrange(key, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Check-in entry not found" };
    }

    const entryStr = entries[index];
    const parsed = typeof entryStr === "string" ? JSON.parse(entryStr) : entryStr;

    // Only allow renaming manually-added guests (people without an account).
    if (!parsed?.userId || !String(parsed.userId).startsWith("guest_")) {
      return {
        success: false,
        error: "Only manually added guests (without an account) can be renamed",
      };
    }

    const previousName = parsed.memberName;
    parsed.memberName = trimmed;
    await redis.lset(key, index, JSON.stringify(parsed));

    // Keep any active rental session label in sync with the new guest name.
    if (String(parsed.method || "").includes("rental")) {
      try {
        const { createOrExtendRentalSession } = await import("@/actions/admin/rentals");
        await createOrExtendRentalSession(parsed.userId, trimmed);
      } catch (e) {
        console.error("Failed to sync rental session name:", e);
      }
    }

    const adminName = (await redis.hget(`member:${session.user.id}`, "name")) as string || "Admin";
    await logActivity({
      type: "checkin",
      memberId: parsed.userId,
      memberName: trimmed,
      description: `[ADMIN ACTION] Guest name updated from "${previousName}" to "${trimmed}" by ${adminName}`,
      isDev: false,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    return { success: true, data: { name: trimmed } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update guest name",
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

export async function markCheckInPaid(
  index: number
): Promise<ActionResult<{ amount: number }>> {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized" };
    }

    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;
    const entries = await redis.lrange(key, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Check-in not found" };
    }

    const raw = entries[index];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed?.unpaid) {
      return { success: false, error: "This check-in is already paid" };
    }

    // Cross-reference the price for this check-in's method (respects discount).
    const { priceForCheckInMethod, CURRENCY } = await import("@/lib/pricing");
    const resolved = await priceForCheckInMethod(parsed.method, parsed.userId);
    const amount = resolved ?? 0;

    // 1) Update the check-in list entry: clear the unpaid flag.
    const updatedEntry = { ...parsed, unpaid: false };
    await redis.lset(key, index, JSON.stringify(updatedEntry));

    // 2) Update the matching activity-log entry: set amount + clear unpaid so
    //    it now counts toward revenue.
    const { markActivityCheckInPaid } = await import("@/actions/admin/activity");
    await markActivityCheckInPaid(parsed.userId, Number(parsed.timestamp), amount, CURRENCY);

    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/admin/activity");
    revalidatePath("/admin/activity/revenue");
    revalidatePath("/dashboard");
    return { success: true, data: { amount } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark as paid",
    };
  }
}

export async function checkInWithDayPass(
  memberId: string,
  memberName: string,
  adminId: string,
  isPaidInPerson: boolean,
  isUnpaid: boolean = false
): Promise<ActionResult<{ checkedIn: boolean }>> {
  try {
    const { redeemDayPass } = await import("@/actions/wallet");
    // Only redeem a wallet pass for the actual wallet path. Cash (paid or
    // unpaid) never touches the wallet.
    if (!isPaidInPerson) {
      const redeemRes = await redeemDayPass(memberId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error };
      }
    }

    // "Unpaid" only applies to the cash/in-person path.
    const unpaid = isPaidInPerson && isUnpaid;

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const method = isPaidInPerson ? "day_pass_cash" : "day_pass_wallet";

    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method,
      memberName,
      ...(unpaid ? { unpaid: true } : {}),
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${memberId}`, "1", { ex: 86400 });
    await recordCheckInCount(memberId, now);

    const adminName = (await redis.hget(`member:${adminId}`, "name")) as string || "Admin";
    const { priceForCheckInMethod, CURRENCY } = await import("@/lib/pricing");
    const amount = await priceForCheckInMethod(method, memberId);
    const paidLabel = isPaidInPerson ? (unpaid ? "Not Paid Yet" : "Paid Cash") : "Redeemed from Wallet";
    await logActivity({
      type: "checkin",
      memberId,
      memberName,
      description: `[ADMIN ACTION] Checked in with Day Pass by ${adminName} (${paidLabel})`,
      method,
      timestamp: now,
      // Unpaid entries carry no amount (no revenue until marked paid).
      ...(unpaid ? { unpaid: true } : amount !== null ? { amount, currency: CURRENCY } : {}),
      isDev: false,
    });

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
  isPaidInPerson: boolean,
  isUnpaid: boolean = false
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

    const unpaid = isPaidInPerson && isUnpaid;

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const method = isPaidInPerson ? "rental_cash" : "rental_wallet";

    const entry = JSON.stringify({
      userId: memberId,
      adminId,
      timestamp: now,
      method,
      memberName,
      ...(unpaid ? { unpaid: true } : {}),
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${memberId}`, "1", { ex: 86400 });
    await recordCheckInCount(memberId, now);

    const adminName = (await redis.hget(`member:${adminId}`, "name")) as string || "Admin";
    const { priceForCheckInMethod, CURRENCY } = await import("@/lib/pricing");
    const amount = await priceForCheckInMethod(method, memberId);
    const paidLabel = isPaidInPerson ? (unpaid ? "Not Paid Yet" : "Paid Cash") : "Redeemed from Wallet";
    await logActivity({
      type: "checkin",
      memberId,
      memberName,
      description: `[ADMIN ACTION] Checked in with Rental by ${adminName} (${paidLabel})`,
      method,
      timestamp: now,
      ...(unpaid ? { unpaid: true } : amount !== null ? { amount, currency: CURRENCY } : {}),
      isDev: false,
    });

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

    const adminName = (await redis.hget(`member:${adminId}`, "name")) as string || "Admin";
    await logActivity({
      type: "checkin",
      memberId: guestId,
      memberName: `${cleanFriendName} (Guest of ${memberName})`,
      description: `[ADMIN ACTION] Friend checked in by ${adminName} using ${memberName}'s wallet (${passType})`,
      isDev: false,
    });

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
