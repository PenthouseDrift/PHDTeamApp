"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";

/**
 * Choose which dashboard the signed-in member lands on: the "classic" one or
 * the new beta dashboard (/dashboard2). Stored as `dashboardVersion` on the
 * member record ("new" when opted in; the field is removed for classic so
 * existing records are unaffected). /dashboard redirects to /dashboard2 while
 * the value is "new".
 *
 * Unlike the older profile actions, this derives the user from the SESSION
 * rather than trusting a client-supplied id, so one member can't change
 * another member's setting.
 */
export async function setDashboardPreference(
  version: "classic" | "new"
): Promise<ActionResult<"classic" | "new">> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "You must be signed in" };
    }
    if (version !== "classic" && version !== "new") {
      return { success: false, error: "Invalid dashboard option" };
    }

    const key = `member:${session.user.id}`;
    // New is the default, so "classic" must be stored explicitly as an opt-out.
    await redis.hset(key, { dashboardVersion: version });

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard2");
    return { success: true, data: version };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save dashboard preference",
    };
  }
}

export async function updateProfileAvatar(
  userId: string,
  avatarUrl: string
): Promise<ActionResult<null>> {
  try {
    await redis.hset(`member:${userId}`, { customAvatar: avatarUrl });
    (await import("@/lib/cache-bust")).bustMemberRoster();
    revalidatePath("/profile");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update avatar",
    };
  }
}

export async function updateNickname(
  userId: string,
  nickname: string
): Promise<ActionResult<string>> {
  try {
    const trimmed = nickname.trim();
    await redis.hset(`member:${userId}`, { nickname: trimmed });
    (await import("@/lib/cache-bust")).bustMemberRoster();
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/wallet");
    revalidatePath("/admin/members");
    revalidatePath("/admin/scanner");
    return { success: true, data: trimmed };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update nickname",
    };
  }
}

export async function updateUserTheme(
  userId: string,
  theme: "light" | "dark"
): Promise<ActionResult<"light" | "dark">> {
  try {
    await redis.hset(`member:${userId}`, { theme });
    revalidatePath("/profile");
    return { success: true, data: theme };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save theme preference",
    };
  }
}

/**
 * Save the signed-in member's auto check-in choices. Each option is independent
 * and optional: only the ones passed are written, so answering one doesn't
 * touch the other. The member id comes from the session, never the client.
 */
export async function setAutoCheckInPreferences(prefs: {
  dayPass?: boolean;
  rental?: boolean;
}): Promise<ActionResult<{ dayPass?: boolean; rental?: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "You must be signed in" };
    }

    const fields: Record<string, string> = {};
    if (typeof prefs.dayPass === "boolean") fields.autoCheckInDayPass = String(prefs.dayPass);
    if (typeof prefs.rental === "boolean") fields.autoCheckInRental = String(prefs.rental);
    if (Object.keys(fields).length === 0) {
      return { success: false, error: "Nothing to save" };
    }

    await redis.hset(`member:${session.user.id}`, fields);

    revalidatePath("/profile");
    revalidatePath("/dashboard2");
    return { success: true, data: { dayPass: prefs.dayPass, rental: prefs.rental } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save your choice",
    };
  }
}
