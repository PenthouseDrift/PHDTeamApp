"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { addDayPasses, addRentalHours } from "@/actions/wallet";
import { logActivity } from "@/lib/activity";
import { processSuccessfulMembershipPayment } from "@/lib/membership-activation";
import { clearCardCredits, grantCardCredits } from "@/lib/card-credits";

/** Impersonation cookie values. "member" = a regular member with NO active
 *  membership; "member_active" = a member WITH an active membership (so the
 *  dashboard renders the active-member state). Both downgrade the role to
 *  "member"; the "active" variant additionally fakes a membership for display. */
export type ImpersonateVariant = "member" | "member_active";
const IMPERSONATE_COOKIE = "dev_impersonate_role";

/**
 * Toggle member impersonation. Pass a `variant` to choose plain member vs
 * member-with-membership. Enabling one variant replaces the other. Passing
 * `enabled: false` clears impersonation entirely.
 */
export async function toggleImpersonation(
  enabled: boolean,
  variant: ImpersonateVariant = "member"
) {
  if (process.env.NODE_ENV !== "development") return { success: false };

  const cookieStore = await cookies();

  if (enabled) {
    cookieStore.set(IMPERSONATE_COOKIE, variant, {
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  } else {
    cookieStore.delete(IMPERSONATE_COOKIE);
  }

  // Invalidate everything so the UI rebuilds with the new role
  revalidatePath("/", "layout");

  return { success: true };
}

/** Read the current impersonation variant, or null when not impersonating. */
export async function getImpersonation(): Promise<ImpersonateVariant | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const cookieStore = await cookies();
  const v = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  return v === "member" || v === "member_active" ? v : null;
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

/**
 * DEV ONLY: credit the signed-in user's wallet with test day passes / rental
 * hours without a payment. This used to live only on the classic /wallet page;
 * as a global action it's usable from the dev panel on any page in either
 * experience. Logged to the activity feed as a dev entry, like before.
 */
export async function devAddWalletBalance(itemType: "daypass" | "rental", quantity = 1) {
  if (process.env.NODE_ENV !== "development") return { success: false as const };
  const session = await auth();
  if (!session?.user?.id) return { success: false as const };

  const qty = Math.max(1, Math.min(20, Math.floor(quantity) || 1));
  if (itemType === "daypass") await addDayPasses(session.user.id, qty);
  else await addRentalHours(session.user.id, qty);

  await logActivity({
    type: "purchase",
    memberId: session.user.id,
    memberName: session.user.name ?? "Dev user",
    description: `[DEV MODE] Simulated ${qty}x ${itemType === "daypass" ? "Day Pass" : "Rental Hours"}`,
    amount: 0,
    currency: "GBP",
    isDev: true,
  });

  revalidatePath("/", "layout");
  return { success: true as const };
}

/**
 * DEV ONLY: activate a real 28-day membership record for the signed-in user with
 * no payment (the classic /membership/purchase page had this as a hidden test
 * button). Unlike the display-only "impersonate member with membership" toggle,
 * this writes the actual membership record.
 */
export async function devActivateMembership() {
  if (process.env.NODE_ENV !== "development") return { success: false as const };
  const session = await auth();
  if (!session?.user?.id) return { success: false as const };

  await processSuccessfulMembershipPayment(session.user.id, `test_dev_${new Date().getTime()}`);
  revalidatePath("/", "layout");
  return { success: true as const };
}

/**
 * DEV ONLY: give the signed-in user card credits without a track check-in, so the card pack flow
 * can be tried straight away. Credits are normally earned by checking in (see lib/card-credits.ts).
 */
export async function devAddCardCredits(amount = 1) {
  if (process.env.NODE_ENV !== "development") return { success: false as const };
  const session = await auth();
  if (!session?.user?.id) return { success: false as const };

  await grantCardCredits(session.user.id, Math.min(20, Math.max(1, Math.floor(amount) || 1)));
  revalidatePath("/", "layout");
  return { success: true as const };
}

/** DEV ONLY: set the signed-in user's card credits back to zero. */
export async function devResetCardCredits() {
  if (process.env.NODE_ENV !== "development") return { success: false as const };
  const session = await auth();
  if (!session?.user?.id) return { success: false as const };

  await clearCardCredits(session.user.id);
  revalidatePath("/", "layout");
  return { success: true as const };
}
