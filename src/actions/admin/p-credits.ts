"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { logActivity } from "@/lib/activity";
import { bustAdminMembers } from "@/lib/cache-bust";
import { grantPCredits } from "@/tcg/storage";
import type { ActionResult } from "@/types";

/** Most P-Credits one grant can add. */
const MAX_GRANT = 10_000;

/**
 * Admin only: give P-Credits to a member (for example a prize, a goodwill gesture, or putting right a
 * failed purchase). Logged to the activity feed with who it was for. Returns the member's new total.
 */
export async function adminGrantPCredits(
  memberId: string,
  amount: number
): Promise<ActionResult<{ pCredits: number }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") return { success: false, error: "Only admins can give P-Credits" };

    const grant = Math.trunc(Number(amount));
    if (!Number.isFinite(grant) || grant < 1 || grant > MAX_GRANT) {
      return { success: false, error: `Choose an amount between 1 and ${MAX_GRANT.toLocaleString()}` };
    }
    if (typeof memberId !== "string" || !/^[\w.-]{1,128}$/.test(memberId) || memberId.startsWith("guest_")) {
      return { success: false, error: "Member not found" };
    }

    const profile = (await redis.hmget<Record<string, unknown>>(`member:${memberId}`, "email", "name")) ?? {};
    if (!profile.email) return { success: false, error: "Member not found" };

    const pCredits = await grantPCredits(memberId, grant);

    await logActivity({
      type: "purchase",
      memberId,
      memberName: typeof profile.name === "string" && profile.name ? profile.name : "Member",
      description: `[ADMIN ACTION] Gave ${grant.toLocaleString()} P-Credits manually (now ${pCredits.toLocaleString()})`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    bustAdminMembers();
    revalidatePath("/admin/members");
    return { success: true, data: { pCredits } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not give the P-Credits" };
  }
}
