"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function toggleImpersonation(enabled: boolean) {
  if (process.env.NODE_ENV !== "development") return { success: false };

  const cookieStore = await cookies();
  
  if (enabled) {
    cookieStore.set("dev_impersonate_role", "member", {
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  } else {
    cookieStore.delete("dev_impersonate_role");
  }

  // Invalidate everything so the UI rebuilds with the new role
  revalidatePath("/", "layout");
  
  return { success: true };
}

/** Dev-only cookie that forces member self check-in open regardless of the
 *  event schedule. Used for local testing of the check-in flow. */
const FORCE_SELF_CHECKIN_COOKIE = "dev_force_selfcheckin";

export async function toggleForceSelfCheckIn(enabled: boolean) {
  if (process.env.NODE_ENV !== "development") return { success: false };

  const cookieStore = await cookies();

  if (enabled) {
    cookieStore.set(FORCE_SELF_CHECKIN_COOKIE, "1", {
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  } else {
    cookieStore.delete(FORCE_SELF_CHECKIN_COOKIE);
  }

  revalidatePath("/", "layout");

  return { success: true };
}

export async function getForceSelfCheckIn(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") return false;
  const cookieStore = await cookies();
  return cookieStore.get(FORCE_SELF_CHECKIN_COOKIE)?.value === "1";
}
