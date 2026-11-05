"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getMemberRoster } from "@/lib/member-roster";
import type { ActionResult } from "@/types";
import { DEFAULT_TOUR_CONFIG, configWarnings, sanitizeTourConfig, type ConfigWarning } from "./config";
import { cancelTour } from "./service";
import {
  addEarlyAccess,
  listActiveRuns,
  listEarlyAccess,
  loadConfigLog,
  loadStats,
  loadTourConfig,
  removeEarlyAccess,
  saveTourConfig,
  type ConfigLogEntry,
  type DayStats,
} from "./store";
import { UPGRADE_CATALOGUE } from "./upgrades";
import type { TourConfig, UpgradeDef } from "./types";

/**
 * Admin actions for the Tandem Tour settings page. Every one checks for an admin first.
 */

async function adminId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role === "admin" ? session.user.id : null;
}

export interface TourAdminData {
  config: TourConfig;
  defaults: TourConfig;
  warnings: ConfigWarning[];
  log: ConfigLogEntry[];
  economy: DayStats[];
  earlyAccess: Array<{ id: string; name: string; email: string }>;
  activeRuns: Array<{ id: string; userName: string; round: number; wins: number; strikes: number; paid: boolean; price: number; idleMinutes: number }>;
  upgrades: UpgradeDef[];
  members: Array<{ id: string; name: string; email: string }>;
}

export async function getTourAdminData(): Promise<ActionResult<TourAdminData>> {
  try {
    if (!(await adminId())) return { success: false, error: "Only admins can open this page." };
    const [config, log, economy, earlyIds, runs, roster] = await Promise.all([
      loadTourConfig(),
      loadConfigLog(20),
      loadStats(7),
      listEarlyAccess(),
      listActiveRuns(50),
      getMemberRoster(),
    ]);
    const byId = new Map(roster.map((m) => [m.id, m]));
    return {
      success: true,
      data: {
        config,
        defaults: DEFAULT_TOUR_CONFIG,
        warnings: configWarnings(config),
        log,
        economy,
        earlyAccess: earlyIds.map((id) => ({ id, name: byId.get(id)?.nickname || byId.get(id)?.name || "Unknown member", email: byId.get(id)?.email ?? "" })),
        activeRuns: runs.map((r) => ({
          id: r.id,
          userName: r.userName,
          round: r.round,
          wins: r.wins,
          strikes: r.strikes,
          paid: !r.paid.free,
          price: r.paid.pCredits,
          idleMinutes: Math.round((Date.now() - r.updatedAt) / 60000),
        })),
        upgrades: UPGRADE_CATALOGUE,
        members: roster.map((m) => ({ id: m.id, name: m.nickname || m.name, email: m.email })),
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load the settings." };
  }
}

/** The warnings for a config as it would be saved, so the page can ask the admin to confirm them. */
export async function checkTourConfig(input: unknown): Promise<ActionResult<{ config: TourConfig; warnings: ConfigWarning[] }>> {
  if (!(await adminId())) return { success: false, error: "Only admins can change this." };
  const config = sanitizeTourConfig(input);
  return { success: true, data: { config, warnings: configWarnings(config) } };
}

export async function saveTourConfigAction(input: unknown): Promise<ActionResult<{ config: TourConfig; warnings: ConfigWarning[] }>> {
  try {
    const id = await adminId();
    if (!id) return { success: false, error: "Only admins can change this." };
    const config = await saveTourConfig(input, id);
    revalidatePath("/cards");
    revalidatePath("/admin/driftclash/tour");
    return { success: true, data: { config, warnings: configWarnings(config) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save." };
  }
}

export async function setTourEarlyAccessAction(input: { userId: string; allowed: boolean }): Promise<ActionResult<null>> {
  try {
    if (!(await adminId())) return { success: false, error: "Only admins can change this." };
    const userId = String(input?.userId ?? "");
    if (!/^[A-Za-z0-9_.@-]{3,80}$/.test(userId)) return { success: false, error: "That member wasn't found." };
    if (input.allowed) await addEarlyAccess(userId);
    else await removeEarlyAccess(userId);
    revalidatePath("/cards");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not change early access." };
  }
}

export async function endStuckTourAction(input: { runId: string }): Promise<ActionResult<{ refunded: number }>> {
  try {
    const id = await adminId();
    if (!id) return { success: false, error: "Only admins can end a Tour." };
    const result = await cancelTour(String(input?.runId ?? ""), id);
    revalidatePath("/admin/driftclash/tour");
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not end that Tour." };
  }
}
