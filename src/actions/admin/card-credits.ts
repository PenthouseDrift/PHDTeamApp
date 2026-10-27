"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { logActivity } from "@/lib/activity";
import { bustAdminMembers } from "@/lib/cache-bust";
import { adjustCardCredits } from "@/lib/card-credits";
import type { ActionResult } from "@/types";

/** Most credits one click can add or remove. */
const MAX_CHANGE = 50;

/**
 * Admin only: add or remove card pack credits on a member's account (for example to reward someone,
 * or put right a missed check-in). Logged to the activity feed with who it was for.
 */
export async function adminAdjustCardCredits(memberId: string, delta: number): Promise<ActionResult<{ cardCredits: number }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") return { success: false, error: "Only admins can change card credits" };

    const change = Math.trunc(Number(delta));
    if (!Number.isFinite(change) || change === 0 || Math.abs(change) > MAX_CHANGE) {
      return { success: false, error: `Choose a change between 1 and ${MAX_CHANGE}` };
    }
    if (typeof memberId !== "string" || !/^[\w.-]{1,128}$/.test(memberId) || memberId.startsWith("guest_")) {
      return { success: false, error: "Member not found" };
    }

    const profile = (await redis.hmget<Record<string, unknown>>(`member:${memberId}`, "email", "name")) ?? {};
    if (!profile.email) return { success: false, error: "Member not found" };

    const cardCredits = await adjustCardCredits(memberId, change);

    await logActivity({
      type: "purchase",
      memberId,
      memberName: typeof profile.name === "string" && profile.name ? profile.name : "Member",
      description: `[ADMIN ACTION] ${change > 0 ? "Added" : "Removed"} ${Math.abs(change)}x card pack credit(s) manually (now ${cardCredits})`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    bustAdminMembers();
    revalidatePath("/admin/members");
    return { success: true, data: { cardCredits } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not change the card credits" };
  }
}
