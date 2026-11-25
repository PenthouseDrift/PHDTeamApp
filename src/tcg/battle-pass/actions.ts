"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getCardCredits } from "@/lib/card-credits";
import { getPCredits, getTcgStoreConfig } from "@/tcg/storage";
import { getEffectivePrice } from "@/tcg/config";
import type { ActionResult } from "@/types";
import {
  DEFAULT_LADDER,
  battlePassWarnings,
  defaultBattlePassConfig,
  sanitizeBattlePassConfig,
  type BattlePassConfig,
  type BattlePassRewardKind,
  type BattlePassView,
  type BattlePassWarning,
  type LadderOptions,
} from "./config";
import { loadBattlePassConfig, loadBattlePassLog, loadBattlePassView, loadMonthStats, openGift, saveBattlePassConfig, type BattlePassLogEntry } from "./store";

// ── Members ─────────────────────────────────────────────────────────────────

async function memberId(): Promise<{ id: string; admin: boolean } | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? { id, admin: session.user.role === "admin" } : null;
}

/**
 * This month's pass for the signed-in member. Switched off, only admins get it (to look at it before it goes live); everyone
 * else gets a closed pass with nothing in it.
 */
export async function getBattlePassAction(): Promise<ActionResult<BattlePassView>> {
  try {
    const who = await memberId();
    if (!who) return { success: false, error: "Please sign in." };
    const view = await loadBattlePassView(who.id);
    if (!view.enabled && !who.admin) return { success: true, data: { ...view, tiers: [], readyCount: 0 } };
    return { success: true, data: view };
  } catch (error) {
    console.error("[battle-pass] could not load the pass:", error);
    return { success: false, error: "Could not load the Battle Pass." };
  }
}

export interface OpenGiftResult {
  reward: { kind: BattlePassRewardKind; amount: number };
  secret: boolean;
  pCredits: number;
  packCredits: number;
  /** The pass afterwards, so the track and the count of waiting gifts are up to date. */
  view: BattlePassView;
}

/** Open a gift: pays it once and returns what was inside. */
export async function openBattlePassGiftAction(tierId: string): Promise<ActionResult<OpenGiftResult>> {
  try {
    const who = await memberId();
    if (!who) return { success: false, error: "Please sign in." };
    const id = String(tierId ?? "");
    if (!/^[a-z0-9_-]{1,24}$/i.test(id)) return { success: false, error: "That gift isn't valid." };

    const result = await openGift(who.id, id);
    if (!result.ok) return { success: false, error: result.error };

    const [pCredits, packCredits, view] = await Promise.all([getPCredits(who.id), getCardCredits(who.id), loadBattlePassView(who.id)]);
    revalidatePath("/cards");
    return { success: true, data: { reward: result.reward, secret: result.secret, pCredits, packCredits, view } };
  } catch (error) {
    console.error("[battle-pass] opening a gift failed:", error);
    return { success: false, error: "Could not open that gift. Please try again." };
  }
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function adminId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === "admin" ? session.user.id : null;
}

export interface BattlePassAdminData {
  config: BattlePassConfig;
  defaults: BattlePassConfig;
  ladderDefaults: LadderOptions;
  warnings: BattlePassWarning[];
  /** What a Standard Pack costs right now, to say what the ladder is worth in packs. */
  packPrice: number;
  log: BattlePassLogEntry[];
  thisMonth: { opens: number; pcredits: number; packcredits: number };
  /** True when no ladder has been saved yet, so what is shown is the starting one. */
  isDefault: boolean;
}

export async function getBattlePassAdminData(): Promise<ActionResult<BattlePassAdminData>> {
  try {
    if (!(await adminId())) return { success: false, error: "Only admins can open this page." };
    const [config, log, thisMonth, store] = await Promise.all([loadBattlePassConfig(), loadBattlePassLog(10), loadMonthStats(), getTcgStoreConfig()]);
    const packPrice = getEffectivePrice(store.standardPackPrice, store.standardPackSalePrice);
    return {
      success: true,
      data: {
        config,
        defaults: defaultBattlePassConfig(),
        ladderDefaults: DEFAULT_LADDER,
        warnings: battlePassWarnings(config, packPrice),
        packPrice,
        log,
        thisMonth,
        isDefault: config.updatedAt === 0,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load the settings." };
  }
}

/** The warnings for a ladder as it would be saved, so the page can ask the admin to confirm them. */
export async function checkBattlePassConfig(input: unknown): Promise<ActionResult<{ config: BattlePassConfig; warnings: BattlePassWarning[] }>> {
  if (!(await adminId())) return { success: false, error: "Only admins can change this." };
  const config = sanitizeBattlePassConfig(input);
  return { success: true, data: { config, warnings: battlePassWarnings(config) } };
}

export async function saveBattlePassConfigAction(input: unknown): Promise<ActionResult<{ config: BattlePassConfig; warnings: BattlePassWarning[] }>> {
  try {
    const id = await adminId();
    if (!id) return { success: false, error: "Only admins can change this." };
    const config = await saveBattlePassConfig(input, id);
    revalidatePath("/cards");
    revalidatePath("/admin/driftclash/battle-pass");
    return { success: true, data: { config, warnings: battlePassWarnings(config) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}
