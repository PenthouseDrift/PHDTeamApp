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
