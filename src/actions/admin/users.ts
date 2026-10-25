"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { Member, ActionResult } from "@/types";
import { logActivity } from "@/lib/activity";

export async function getAllUsers(): Promise<Member[]> {
  try {
    // Contains every member's email, so staff only.
    const { requireStaff } = await import("@/lib/staff-auth");
    if (!(await requireStaff())) return [];

    const { getMemberRoster } = await import("@/lib/member-roster");
    const roster = await getMemberRoster();
    return roster.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      image: r.image,
      role: r.role,
      qrCode: null,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("getAllUsers error:", error);
    return [];
  }
}

export async function setUserRole(
  userId: string,
  newRole: "admin" | "moderator" | "member" | "asbo-rc"
): Promise<ActionResult<{ role: "admin" | "moderator" | "member" | "asbo-rc" }>> {
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    await redis.hset(`member:${userId}`, { role: newRole });
    const { bustMemberRoster, bustAdminMembers } = await import("@/lib/cache-bust");
    bustMemberRoster();
    bustAdminMembers();
    
    const memberName = (await redis.hget(`member:${userId}`, "name")) as string || "Member";
    await logActivity({
      type: "purchase",
      memberId: userId,
      memberName,
      description: `[ADMIN ACTION] Changed user role to: ${newRole.toUpperCase()}`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/members");
    return { success: true, data: { role: newRole } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update role",
    };
  }
}

export async function toggleAdminRole(
  userId: string,
  makeAdmin: boolean
): Promise<ActionResult<{ role: "admin" | "moderator" | "member" | "asbo-rc" }>> {
  return setUserRole(userId, makeAdmin ? "admin" : "member");
}
