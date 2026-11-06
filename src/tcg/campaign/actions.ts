"use server";

import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import * as service from "./service";
import type { MemberCard } from "@/lib/card-roll";
import type { CampaignBattle, CampaignDraft, CampaignOffer, CampaignState, CampaignView, EntryChoice } from "./types";

/**
 * Drift Campaign server actions. The mode is admin only for now: every action checks the signed-in member's role
 * before doing anything, so hiding the tab is not the only thing keeping other members out.
 */

async function run<T>(fn: (userId: string, isAdmin: boolean) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Please sign in." };
    if (session.user?.role !== "admin") return { success: false, error: "Drift Campaign is admin only for now." };
    return { success: true, data: await fn(userId, true) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
  }
}

/** The current cup (if any) and a paid entry waiting for its cars to be picked (if any). */
export async function getCampaignAction(): Promise<ActionResult<CampaignState>> {
  return run(async (userId) => {
    const view = await service.getCampaign(userId);
    const draft = view && view.status === "active" ? null : await service.getDraft(userId);
    return { view, draft };
  });
}

/** Pay the entry fee and deal your first six cars. This is where the fee is taken. */
export async function payCampaignEntryAction(entry: EntryChoice): Promise<ActionResult<{ draft: CampaignDraft; balance?: number }>> {
  return run((userId, isAdmin) => service.payEntry(userId, entry === "test" ? "test" : Number(entry), isAdmin));
}

/** Walk away from a paid entry before the cup starts. The fee is lost. */
export async function withdrawCampaignDraftAction(): Promise<ActionResult<boolean>> {
  return run((userId) => service.withdrawDraft(userId));
}

/** Start the cup with three of the six dealt cars (kept for the whole cup) and build the six rivals. Takes several seconds. The entry is already paid. */
export async function startCampaignAction(carIds: string[]): Promise<ActionResult<CampaignView>> {
  return run((userId) => service.startCampaign(userId, Array.isArray(carIds) ? carIds.map(String).slice(0, 6) : []));
}

/** Start the next round's battle. */
export async function beginCampaignRoundAction(): Promise<ActionResult<CampaignBattle>> {
  return run((userId) => service.beginRound(userId));
}

/** Repair a broken car with a matching Maintenance kit from your deck. */
export async function repairCampaignCarAction(input: {
  carId: string;
  maintenanceCardId: string;
}): Promise<ActionResult<{ car: MemberCard; view: CampaignView | null }>> {
  return run((userId) => service.repairCar(userId, String(input?.carId ?? ""), String(input?.maintenanceCardId ?? "")));
}

/** Top up a car that will not last the battles ahead, using any Maintenance kit from your deck. */
export async function serviceCampaignCarAction(input: {
  carId: string;
  maintenanceCardId: string;
}): Promise<ActionResult<{ car: MemberCard; view: CampaignView | null }>> {
  return run((userId) => service.serviceCar(userId, String(input?.carId ?? ""), String(input?.maintenanceCardId ?? "")));
}

/** Deal a different six, using one of your three re-rolls for this entry. */
export async function rerollCampaignCarsAction(): Promise<ActionResult<CampaignOffer>> {
  return run((userId) => service.rerollCars(userId));
}

/** Report how the battle ended. */
export async function reportCampaignResultAction(input: {
  won: boolean;
  playerCorners: number;
  opponentCorners: number;
}): Promise<ActionResult<CampaignView>> {
  return run((userId) =>
    service.reportResult(userId, {
      won: Boolean(input?.won),
      playerCorners: Number(input?.playerCorners),
      opponentCorners: Number(input?.opponentCorners),
    })
  );
}

/** Withdraw from the cup in progress. */
export async function withdrawCampaignAction(): Promise<ActionResult<CampaignView | null>> {
  return run((userId) => service.forfeitCampaign(userId));
}
