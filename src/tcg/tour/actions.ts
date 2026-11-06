"use server";

import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import type { ActionResult } from "@/types";
import * as service from "./service";
import type { Stance, TourEligibleCards, TourLobbyView, TourRunView } from "./types";

/**
 * Tandem Tour server actions: the only door the browser has into the mode. Each one checks the session, then hands
 * over to service.ts. The browser sends choices (cards, an upgrade, a car, a stance); it never sends a result.
 */

async function currentUser(): Promise<service.TourUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const hash = ((await redis.hmget(`member:${id}`, "nickname", "name")) ?? {}) as Record<string, unknown>;
  const nick = typeof hash.nickname === "string" ? hash.nickname.trim() : "";
  const name = typeof hash.name === "string" ? hash.name.trim() : "";
  return { id, name: (nick || name || session.user?.name || "Driver").slice(0, 30), role: session.user?.role ?? null };
}

async function run<T>(fn: (user: service.TourUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in to play." };
    return { success: true, data: await fn(user) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
  }
}

/** Whether to show the Tour tab to the signed-in member at all. */
export async function getTourAccess(): Promise<boolean> {
  try {
    const user = await currentUser();
    if (!user) return false;
    return (await service.getAccess(user)).ok;
  } catch {
    return false;
  }
}

/** True when Tandem Tour is only visible to this member because they are an admin (it is not switched on for members yet). */
export async function getTourAdminPreview(): Promise<boolean> {
  try {
    const user = await currentUser();
    if (!user) return false;
    const access = await service.getAccess(user);
    return access.ok && access.reason !== null;
  } catch {
    return false;
  }
}

export async function getTourLobby(): Promise<ActionResult<TourLobbyView>> {
  return run((user) => service.getLobby(user));
}

export async function getTourEligibleCards(): Promise<ActionResult<TourEligibleCards>> {
  return run(async (user) => {
    await service.getAccess(user);
    return service.getEligibleCards(user);
  });
}

export async function getActiveTour(): Promise<ActionResult<TourRunView | null>> {
  return run((user) => service.resumeTour(user));
}

export async function startTour(input: {
  carIds: string[];
  crewIds: string[];
  kitIds: string[];
  actionKey: string;
}): Promise<ActionResult<TourRunView>> {
  return run((user) =>
    service.startTour(user, {
      carIds: Array.isArray(input?.carIds) ? input.carIds.map(String).slice(0, 12) : [],
      crewIds: Array.isArray(input?.crewIds) ? input.crewIds.map(String).slice(0, 12) : [],
      kitIds: Array.isArray(input?.kitIds) ? input.kitIds.map(String).slice(0, 12) : [],
      actionKey: String(input?.actionKey ?? ""),
    })
  );
}

/** Keep one of the offered upgrades, or pass null to skip them. */
export async function pickTourUpgrade(input: { runId: string; upgradeId: string | null }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.pickUpgrade(user, String(input?.runId), input?.upgradeId === null ? null : String(input?.upgradeId)));
}

export async function rerollTourOffers(input: { runId: string }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.rerollOffers(user, String(input?.runId)));
}

/** Uses a repair kit. The kit card is deleted from the collection. */
export async function consumeTourRepairKit(input: { runId: string; kitId: string; carId: string }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.useRepairKit(user, String(input?.runId), String(input?.kitId), String(input?.carId)));
}

export async function beginTourRound(input: { runId: string }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.beginRound(user, String(input?.runId)));
}

/** Lock in the car and stance and open the drive. */
export async function startTourDrive(input: { runId: string; carId: string; stance: Stance }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.startDrive(user, String(input?.runId), String(input?.carId), input?.stance));
}

/** Send back the steering recorded during the drive (the server works out the score itself). */
export async function submitTourDrive(input: { runId: string; recording: string }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.submitDrive(user, String(input?.runId), input?.recording));
}

export async function continueTour(input: { runId: string }): Promise<ActionResult<TourRunView>> {
  return run((user) => service.continueAfterRound(user, String(input?.runId)));
}

export async function setTourPrefs(input: { optOut?: boolean; dailyLimit?: number; tutorialSeen?: boolean }): Promise<ActionResult<null>> {
  return run(async (user) => {
    await service.setPrefs(user, {
      ...(typeof input?.optOut === "boolean" ? { optOut: input.optOut } : {}),
      ...(typeof input?.dailyLimit === "number" ? { dailyLimit: input.dailyLimit } : {}),
      ...(typeof input?.tutorialSeen === "boolean" ? { tutorialSeen: input.tutorialSeen } : {}),
    });
    return null;
  });
}

export async function dismissTourNotes(): Promise<ActionResult<null>> {
  return run(async (user) => {
    await service.dismissNotes(user);
    return null;
  });
}
