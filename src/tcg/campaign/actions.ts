"use server";

import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import * as service from "./service";
import type { MemberCard } from "@/lib/card-roll";
import type { CampaignBattle, CampaignCrewOffer, CampaignDraft, CampaignOffer, CampaignState, CampaignView, EntryChoice } from "./types";

/**
 * Drift Campaign server actions. The mode is open to every signed-in member. Every action checks the session. The role is passed on
 * from the session (never from anything the browser sends) in case an action needs an admin-only extra.
 */

async function run<T>(fn: (userId: string, isAdmin: boolean) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Please sign in." };
    return { success: true, data: await fn(userId, session.user?.role === "admin") };
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
  return run((userId) => service.payEntry(userId, entry === "test" ? "test" : Number(entry)));
}

/** Walk away from a paid entry before the cup starts. The fee is lost. */
export async function withdrawCampaignDraftAction(): Promise<ActionResult<boolean>> {
  return run((userId) => service.withdrawDraft(userId));
}

/** Start the cup with three of the six dealt cars and three of the six dealt Crew cards (kept for the whole cup) and build the first rival. The entry is already paid. */
export async function startCampaignAction(carIds: string[], crewIds: string[] = []): Promise<ActionResult<CampaignView>> {
  return run((userId) =>
    service.startCampaign(
      userId,
      Array.isArray(carIds) ? carIds.map(String).slice(0, 6) : [],
      Array.isArray(crewIds) ? crewIds.map(String).slice(0, 6) : []
    )
  );
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

/** Pay P-Credits to repair a broken car at once, when no kit in the deck can finish the repair. */
export async function buyCampaignRepairAction(input: {
  carId: string;
}): Promise<ActionResult<{ car: MemberCard; view: CampaignView | null; balance: number }>> {
  return run((userId) => service.buyRepair(userId, String(input?.carId ?? "")));
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

/** Deal a different six Crew cards, using one of your three Crew re-rolls for this entry. */
export async function rerollCampaignCrewAction(): Promise<ActionResult<CampaignCrewOffer>> {
  return run((userId) => service.rerollCrew(userId));
}

/** Report how the battle ended. */
export async function reportCampaignResultAction(input: {
  won: boolean;
  playerCorners: number;
  opponentCorners: number;
  playerTotalScore?: number;
  opponentTotalScore?: number;
}): Promise<ActionResult<CampaignView>> {
  return run((userId) =>
    service.reportResult(userId, {
      won: Boolean(input?.won),
      playerCorners: Number(input?.playerCorners),
      opponentCorners: Number(input?.opponentCorners),
      playerTotalScore: Number(input?.playerTotalScore),
      opponentTotalScore: Number(input?.opponentTotalScore),
    })
  );
}

/** Withdraw from the cup in progress. */
export async function withdrawCampaignAction(): Promise<ActionResult<CampaignView | null>> {
  return run((userId) => service.forfeitCampaign(userId));
}
