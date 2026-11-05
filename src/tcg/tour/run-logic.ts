import { clampCondition } from "./condition";
import type { ResolveOutput } from "./engine";
import { makeRng } from "./rng";
import { getUpgradeDef, isInstant, rollOffers, toHeldUpgrade } from "./upgrades";
import type { Stance, TourConfig, TourLoadout, TourOpponent, TourRunState, TourSummary } from "./types";

/**
 * The rules for moving a Tour from one step to the next, as pure functions. The server actions and the balance
 * simulator both use these, so they cannot drift apart. Nothing here touches Redis or the member's cards.
 */

export function createRunState(input: {
  id: string;
  userId: string;
  userName: string;
  seed: string;
  config: TourConfig;
  loadout: TourLoadout;
  rating: number;
  paid: { free: boolean; pCredits: number };
  now: number;
}): TourRunState {
  const { config } = input;
  const condition: Record<string, number> = {};
  for (const car of input.loadout.cars) condition[car.id] = 100;
  return {
    id: input.id,
    userId: input.userId,
    userName: input.userName,
    seed: input.seed,
    status: "active",
    step: "pit",
    round: 1,
    maxRounds: config.maxRounds,
    strikes: config.maxStrikes,
    maxStrikes: config.maxStrikes,
    wins: 0,
    rating: input.rating,
    ratingDelta: 0,
    loadout: input.loadout,
    condition,
    usedKitIds: [],
    upgrades: [],
    picked: [],
    offers: rollOffers(makeRng(`${input.seed}:offers:1:0`), [], config),
    rerollsUsed: 0,
    freeRerolls: 1,
    facedGhostIds: [],
    opponent: null,
    preview: null,
    drive: null,
    restartsUsed: 0,
    stanceHistory: [],
    rounds: [],
    lastLog: null,
    paid: input.paid,
    summary: null,
    startedAt: input.now,
    updatedAt: input.now,
  };
}

/** What the next reroll costs: 0 while a free one is left, the configured price after, or null when more are not allowed. */
export function rerollCost(state: Pick<TourRunState, "freeRerolls">, config: TourConfig): number | null {
  if (state.freeRerolls > 0) return 0;
  return config.rerollPricePCredits > 0 ? config.rerollPricePCredits : null;
}

/** Fresh offers for a reroll. The caller has already charged for it, if it cost anything. */
export function applyReroll(state: TourRunState, config: TourConfig): TourRunState {
  const free = state.freeRerolls > 0;
  const rerollsUsed = state.rerollsUsed + 1;
  return {
    ...state,
    rerollsUsed,
    freeRerolls: free ? state.freeRerolls - 1 : state.freeRerolls,
    offers: rollOffers(
      makeRng(`${state.seed}:offers:${state.round}:${rerollsUsed}`),
      state.upgrades.map((u) => u.id),
      config,
      state.offers ?? []
    ),
  };
}

/** Keep one of the offered upgrades (or none). One-off effects happen now; the others are held. */
export function applyPick(state: TourRunState, upgradeId: string | null, config: TourConfig): TourRunState {
  if (upgradeId === null) return { ...state, offers: null };
  const def = getUpgradeDef(upgradeId, config);
  if (!def) throw new Error("That upgrade is not available.");
  let next: TourRunState = { ...state, offers: null, picked: [...state.picked, def.id] };
  if (isInstant(def)) {
    const amount = def.values.amount ?? 0;
    if (def.effect.kind === "free_reroll") {
      next = { ...next, freeRerolls: next.freeRerolls + amount };
    } else if (def.effect.kind === "condition") {
      const condition = { ...next.condition };
      const ids = Object.keys(condition);
      const targets =
        def.effect.target === "all"
          ? ids
          : ids.length > 0
            ? [ids.reduce((low, id) => (condition[id] < condition[low] ? id : low), ids[0])]
            : [];
      for (const id of targets) condition[id] = clampCondition(condition[id] + amount);
      next = { ...next, condition };
    }
  } else {
    next = { ...next, upgrades: [...next.upgrades, toHeldUpgrade(def)] };
  }
  return next;
}

/** Restore a car's condition with a repair kit. The caller consumes the kit card. */
export function applyKit(state: TourRunState, kitId: string, carId: string, amount: number): TourRunState {
  return {
    ...state,
    usedKitIds: [...state.usedKitIds, kitId],
    condition: { ...state.condition, [carId]: clampCondition((state.condition[carId] ?? 100) + amount) },
  };
}

/** The state after a Round has been resolved: the result is kept so a refresh or a resume still shows it. */
export function applyRoundResult(
  state: TourRunState,
  out: ResolveOutput,
  opponent: TourOpponent,
  stance: Stance,
  now: number
): TourRunState {
  return {
    ...state,
    step: "result",
    wins: state.wins + (out.won ? 1 : 0),
    strikes: state.strikes - (out.strikeLost ? 1 : 0),
    condition: out.conditionAfter,
    upgrades: out.upgradesAfter,
    ratingDelta: state.ratingDelta + out.ratingDelta,
    stanceHistory: [...state.stanceHistory, stance],
    facedGhostIds: opponent.ghostId ? [...state.facedGhostIds, opponent.ghostId] : state.facedGhostIds,
    rounds: [
      ...state.rounds,
      {
        round: state.round,
        result: out.won ? "win" : "loss",
        opponent: opponent.name,
        opponentKind: opponent.kind,
        opponentRating: opponent.rating,
        stance,
        carName: out.log.player.carName,
        totals: out.log.totals,
      },
    ],
    lastLog: out.log,
    opponent: null,
    preview: null,
    drive: null,
    updatedAt: now,
  };
}

/** Whether the Tour is over after the Round just played. */
export function tourIsOver(state: Pick<TourRunState, "strikes" | "round" | "maxRounds">): "strikes" | "finished" | null {
  if (state.strikes <= 0) return "strikes";
  if (state.round >= state.maxRounds) return "finished";
  return null;
}

/** Move on from a result to the next Round's Pit Phase. */
export function applyContinue(state: TourRunState, config: TourConfig, now: number): TourRunState {
  const round = state.round + 1;
  return {
    ...state,
    step: "pit",
    round,
    rerollsUsed: 0,
    offers: rollOffers(makeRng(`${state.seed}:offers:${round}:0`), state.upgrades.map((u) => u.id), config),
    lastLog: state.lastLog,
    updatedAt: now,
  };
}

/** The best round (most points scored) of a Tour, or null. */
export function bestRoundOf(state: Pick<TourRunState, "rounds">): number | null {
  const wins = state.rounds.filter((r) => r.result === "win");
  if (wins.length === 0) return null;
  return wins.reduce((best, r) => (r.totals.player - r.totals.rival > best.totals.player - best.totals.rival ? r : best), wins[0]).round;
}

export type { TourSummary };
