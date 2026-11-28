"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { claimXpGifts, loadXpGiftConfig, loadXpGiftStats, saveXpGiftConfig } from "./xp-gift-store";
import type { XpGiftConfig, XpGiftView } from "./xp-gifts";

// ── Members ─────────────────────────────────────────────────────────────────

export interface ClaimXpGiftData {
  gifts: number;
  amount: number;
  pCredits: number;
  view: XpGiftView;
}

/** Collect every free XP gift the signed-in member has waiting. */
export async function claimXpGiftsAction(): Promise<ActionResult<ClaimXpGiftData>> {
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return { success: false, error: "Please sign in." };
    const result = await claimXpGifts(id);
    if (!result.ok) return { success: false, error: result.error };
    revalidatePath("/cards");
    return { success: true, data: { gifts: result.gifts, amount: result.amount, pCredits: result.balance, view: result.view } };
  } catch (error) {
    console.error("[xp-gifts] collecting gifts failed:", error);
    return { success: false, error: "Could not collect your gift. Please try again." };
  }
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function adminId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === "admin" ? session.user.id : null;
}

export interface XpGiftAdminData {
  config: XpGiftConfig;
  paid: { gifts: number; pcredits: number };
  /** True when nothing has been saved yet, so what is shown is the starting setting (which is live). */
  isDefault: boolean;
}

export async function getXpGiftAdminData(): Promise<ActionResult<XpGiftAdminData>> {
  try {
    if (!(await adminId())) return { success: false, error: "Only admins can open this page." };
    const [config, paid] = await Promise.all([loadXpGiftConfig(), loadXpGiftStats()]);
    return { success: true, data: { config, paid, isDefault: config.updatedAt === 0 } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load the settings." };
  }
}

export async function saveXpGiftConfigAction(input: unknown): Promise<ActionResult<{ config: XpGiftConfig }>> {
  try {
    const id = await adminId();
    if (!id) return { success: false, error: "Only admins can change this." };
    const config = await saveXpGiftConfig(input, id);
    revalidatePath("/cards");
    revalidatePath("/admin/driftclash/xp-gifts");
    return { success: true, data: { config } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}
