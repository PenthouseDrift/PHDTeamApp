/**
 * Tandem Clash rival AI.
 *
 * The rival used to play its cars and Crew cards in a fixed array order, whatever the track, the
 * corners or the debuffs. This module makes it think the way a good player does:
 *
 *   1. ROSTER  From a pool of cars and Crew cards, pick the best 3 + 3 for THIS battle's track, corner
 *              types and debuffs (not just the highest rated).
 *   2. ORDER   Decide which car goes on which corner and which Crew card suits which corner.
 *   3. PLAY    At each corner, choose which Crew card to spend, weighing what it is worth here against
 *              what it would be worth on the corners still to come.
 *
 * It only uses information a human has: the track, the corner types, its own debuffs, the player's
 * three cars, and (once a corner starts) the player's car and debuff there. It cannot see the player's
 * Crew cards or future debuffs.
 *
 * Every decision goes through `pickIndex`, which takes a `skill` from 0 to 1. At 1 it always takes the
 * best option. Lower, it sometimes takes the second or third best, the way a person misjudges. Skill is
 * how the difficulty is tuned (see scripts/simulate-clash.ts).
 *
 * Pure: no React, no server code, and every random choice takes an `rng`, so it can be simulated.
 */

import type { MemberCard } from "@/lib/card-roll";
import {
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  rollClashRarityTier,
  crewDefinitionToCardData,
  scaleCrewCardDefinition,
  type CrewCardDefinition,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";
import type { FullArtTier } from "@/lib/full-art-card";
import { WIN_RATE_CURVES } from "./difficulty-curves";
import { evaluateCornerMatchup, type ClashSectorSpec } from "./progression";

export type Rng = () => number;
export type Trio<T> = [T, T, T];
type Corner = 0 | 1 | 2;

/** What the rival knows when it makes its decisions. */
export interface RivalContext {
  track: TrackCardDefinition;
  sectors: ClashSectorSpec[];
  /** The rival's own three debuffs, one per corner. */
  rivalDebuffs: DebuffCardDefinition[];
  /** The Crew definitions in play (admin-edited ones included). Defaults to the built-in set. */
  crewDefs?: CrewCardDefinition[];
}

/** A corner is worth about one point of "expected corners won". This is how many score points make it a 73/27 call. */
const SPREAD = 7;
const winProb = (margin: number) => 1 / (1 + Math.exp(-margin / SPREAD));

/** Stands in for a debuff the rival can't see yet: it costs nothing. */
export const NEUTRAL_DEBUFF: DebuffCardDefinition = {
  ...DEBUFF_CARD_SET[0],
  id: "unknown-hazard",
  name: "Unknown hazard",
  penalties: {},
};

/** How many Crew cards are looked at in detail when choosing from a big pool. */
const CREW_SHORTLIST_PER_CORNER = 4;
/** How many ordered pairs of (cars, Crew) are kept to choose between. */
const SHORTLIST_PLANS = 12;

/**
 * Choose an option from their values. Skill 1 always takes the best. Lower skill spreads the choice
 * over the better options, more widely the lower it is, so a low-skill rival makes human mistakes
 * instead of random ones (it still rarely picks something awful).
 */
export function pickIndex(values: number[], skill: number, rng: Rng): number {
  if (values.length <= 1) return 0;
  const best = values.indexOf(Math.max(...values));
  if (skill >= 1) return best;
  const temperature = Math.max(0.02, (1 - Math.max(0, skill)) * 0.6);
  const top = Math.max(...values);
  const weights = values.map((v) => Math.exp((v - top) / temperature));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return best;
}

/**
 * The rival's chance (0 to 1) of winning a corner with this car and Crew card against this car. The
 * player's Crew card is unknown to the rival, so it assumes none (the corner's loaner card).
 */
function cornerWinProb(
  ctx: RivalContext,
  corner: Corner,
  rivalCar: MemberCard,
  rivalCrew: MemberCard,
  playerCar: MemberCard,
  playerDebuff: DebuffCardDefinition = NEUTRAL_DEBUFF
): number {
  const r = evaluateCornerMatchup({
    cornerIdx: corner,
    sector: ctx.sectors[corner],
    playerCard: playerCar,
    rivalCard: rivalCar,
    playerCrewCard: null,
    rivalCrewCard: rivalCrew,
    playerDebuffCard: playerDebuff,
    rivalDebuffCard: ctx.rivalDebuffs[corner] ?? NEUTRAL_DEBUFF,
    trackCard: ctx.track,
    crewPool: ctx.crewDefs,
  });
  return winProb(r.rivalScore - r.playerScore);
}

/** The same, averaged over the player's three cars, for corners where the player's car isn't known yet. */
function averageWinProb(
  ctx: RivalContext,
  corner: Corner,
  rivalCar: MemberCard,
  rivalCrew: MemberCard,
  playerCars: MemberCard[]
): number {
  if (playerCars.length === 0) return 0.5;
  let sum = 0;
  for (const p of playerCars) sum += cornerWinProb(ctx, corner, rivalCar, rivalCrew, p);
  return sum / playerCars.length;
}

const CORNERS: Corner[] = [0, 1, 2];

/** Indices of the `n` largest numbers, best first. */
function topIndices(values: number[], n: number): number[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.i);
}

/**
 * Pick and arrange the rival's three cars and three Crew cards for this battle.
 *
 * `cars` and `crew` are pools (three or more of each). With exactly three it just finds the best
 * arrangement; with more it also chooses which to bring. The returned lists are in corner order:
 * car 0 and Crew 0 are the plan for corner 1, and so on.
 */
export function arrangeRival(input: {
  cars: MemberCard[];
  crew: MemberCard[];
  ctx: RivalContext;
  /** The player's three cars, which the rival can see in the lineup. */
  playerCars: MemberCard[];
  skill: number;
  rng: Rng;
}): { cars: Trio<MemberCard>; crew: Trio<MemberCard> } {
  const { cars, crew, ctx, playerCars, skill, rng } = input;
  if (cars.length < 3 || crew.length < 3) {
    // Nothing to choose between; keep what there is.
    return { cars: cars.slice(0, 3) as Trio<MemberCard>, crew: crew.slice(0, 3) as Trio<MemberCard> };
  }

  // A big Crew pool is shortlisted first: for each corner, the Crew cards that do best with the pool's strongest car.
  let crewList = crew;
  if (crew.length > 8) {
    const lead = cars[0];
    const keep = new Set<number>();
    for (const k of CORNERS) {
      const v = crew.map((c) => averageWinProb(ctx, k, lead, c, playerCars));
      for (const i of topIndices(v, CREW_SHORTLIST_PER_CORNER)) keep.add(i);
    }
    crewList = [...keep].map((i) => crew[i]);
    if (crewList.length < 3) crewList = crew.slice(0, 3);
  }

  // value[car][crew][corner]
  const value = cars.map((car) =>
    crewList.map((c) => CORNERS.map((k) => averageWinProb(ctx, k, car, c, playerCars)))
  );

  type Plan = { carIdx: [number, number, number]; crewIdx: [number, number, number]; total: number };
  const plans: Plan[] = [];
  for (let a = 0; a < cars.length; a++) {
    for (let b = 0; b < cars.length; b++) {
      if (b === a) continue;
      for (let c = 0; c < cars.length; c++) {
        if (c === a || c === b) continue;
        const carIdx: [number, number, number] = [a, b, c];
        // For each corner, that car's best few Crew cards; then the best distinct combination.
        const best = CORNERS.map((k) => topIndices(crewList.map((_, j) => value[carIdx[k]][j][k]), 5));
        let bestCombo: Plan | null = null;
        for (const j0 of best[0]) {
          for (const j1 of best[1]) {
            if (j1 === j0) continue;
            for (const j2 of best[2]) {
              if (j2 === j0 || j2 === j1) continue;
              const total = value[a][j0][0] + value[b][j1][1] + value[c][j2][2];
              if (!bestCombo || total > bestCombo.total) bestCombo = { carIdx, crewIdx: [j0, j1, j2], total };
            }
          }
        }
        if (bestCombo) plans.push(bestCombo);
      }
    }
  }
  if (plans.length === 0) {
    return { cars: cars.slice(0, 3) as Trio<MemberCard>, crew: crew.slice(0, 3) as Trio<MemberCard> };
  }
  plans.sort((x, y) => y.total - x.total);
  const shortlist = plans.slice(0, SHORTLIST_PLANS);
  const chosen = shortlist[pickIndex(shortlist.map((p) => p.total), skill, rng)];
  return {
    cars: chosen.carIdx.map((i) => cars[i]) as Trio<MemberCard>,
    crew: chosen.crewIdx.map((j) => crewList[j]) as Trio<MemberCard>,
  };
}

/**
 * Which of the rival's remaining Crew cards to play on this corner. Called once the corner has started,
 * so the player's car and debuff here are known. Each option is valued by how likely it wins this corner
 * plus the best the other cards could do on the corners still to come.
 *
 * Returns an index into `crew`.
 */
export function chooseRivalCrew(input: {
  cornerIdx: Corner;
  ctx: RivalContext;
  /** The rival's cars in corner order. */
  cars: Trio<MemberCard>;
  crew: Trio<MemberCard>;
  /** Indexes into `crew` already played. */
  usedCrew: number[];
  playerCar: MemberCard;
  playerDebuff: DebuffCardDefinition;
  playerCars: MemberCard[];
  skill: number;
  rng: Rng;
}): number {
  const { cornerIdx, ctx, cars, crew, usedCrew, playerCar, playerDebuff, playerCars, skill, rng } = input;
  const remaining = [0, 1, 2].filter((i) => !usedCrew.includes(i));
  if (remaining.length <= 1) return remaining[0] ?? 0;

  const later = CORNERS.filter((k) => k > cornerIdx);
  const futureBest = (cardIdxs: number[]): number => {
    // The best way to hand these cards out over the remaining corners (at most 2 of each).
    if (later.length === 0 || cardIdxs.length === 0) return 0;
    if (cardIdxs.length === 1) return Math.max(...later.map((k) => averageWinProb(ctx, k, cars[k], crew[cardIdxs[0]], playerCars)));
    const [x, y] = cardIdxs;
    const [k1, k2] = later;
    if (k2 === undefined) return Math.max(...cardIdxs.map((c) => averageWinProb(ctx, k1, cars[k1], crew[c], playerCars)));
    const a = averageWinProb(ctx, k1, cars[k1], crew[x], playerCars) + averageWinProb(ctx, k2, cars[k2], crew[y], playerCars);
    const b = averageWinProb(ctx, k1, cars[k1], crew[y], playerCars) + averageWinProb(ctx, k2, cars[k2], crew[x], playerCars);
    return Math.max(a, b);
  };

  const values = remaining.map((r) => {
    const now = cornerWinProb(ctx, cornerIdx, cars[cornerIdx], crew[r], playerCar, playerDebuff);
    return now + futureBest(remaining.filter((i) => i !== r));
  });
  return remaining[pickIndex(values, skill, rng)];
}

// ── Challenge rosters ───────────────────────────────────────────────────────

/** A Crew card the rival can bring: a definition and the rarity it is played at. */
export interface RivalCrewSpec {
  cardId: string;
  tier: FullArtTier;
}

/** Crew cards for the rival from a list of specs, built the same way the server builds them. */
export function crewCardsFromSpecs(specs: RivalCrewSpec[], defs: CrewCardDefinition[] = CREW_CARD_SET): MemberCard[] {
  const out: MemberCard[] = [];
  for (const spec of specs) {
    const def = defs.find((d) => d.id === spec.cardId);
    if (!def) continue;
    out.push({
      id: `rival-crew-${spec.cardId}-${spec.tier}`,
      userId: "challenge-bot",
      ...crewDefinitionToCardData(scaleCrewCardDefinition(def, spec.tier)),
      styleIds: [],
      kept: true,
      rerolled: false,
      createdAt: 0,
    } as MemberCard);
  }
  return out;
}

/** Every Crew card in the set at one rarity. */
export function fullCrewPoolSpecs(tier: FullArtTier, defs: CrewCardDefinition[] = CREW_CARD_SET): RivalCrewSpec[] {
  return defs.map((d) => ({ cardId: d.id, tier }));
}

const TIER_STEPS: FullArtTier[] = ["bronze", "silver", "gold", "legend"];

/** A rarity moved up (or down) by some steps, kept within bronze to legend. */
export function shiftTier(tier: FullArtTier, steps: number): FullArtTier {
  const i = Math.max(0, TIER_STEPS.indexOf(tier === "mythic" ? "legend" : tier));
  return TIER_STEPS[Math.min(TIER_STEPS.length - 1, Math.max(0, i + steps))];
}

/**
 * A Crew collection for a rival, like one a member would own: different cards drawn from the set (by their
 * pull weights), each at a rarity rolled with the real pack odds. `boost` lifts cards up that many
 * rarities on average (it can be a fraction), which is how a rival is made stronger than an ordinary member.
 */
export function rollRivalCrewSpecs(
  rng: Rng,
  count: number,
  boost: number,
  defs: CrewCardDefinition[] = CREW_CARD_SET
): RivalCrewSpec[] {
  const left = defs.slice();
  const out: RivalCrewSpec[] = [];
  while (out.length < count && left.length > 0) {
    const total = left.reduce((s, d) => s + Math.max(1, d.pullWeight || 10), 0);
    let r = rng() * total;
    let at = left.length - 1;
    for (let i = 0; i < left.length; i++) {
      r -= Math.max(1, left[i].pullWeight || 10);
      if (r <= 0) {
        at = i;
        break;
      }
    }
    const [def] = left.splice(at, 1);
    // A boost of 0.4 lifts about 4 cards in 10 one rarity: a whole number of steps, plus a chance of one more.
    const whole = Math.floor(boost);
    const steps = whole + (boost > whole && rng() < boost - whole ? 1 : 0);
    out.push({ cardId: def.id, tier: shiftTier(rollClashRarityTier(rng), steps) });
  }
  return out;
}

// ── Difficulty ──────────────────────────────────────────────────────────────

export interface ChallengeDifficulty {
  /** How well it plays, 0 to 1. */
  skill: number;
  /** Skip this share (0 to 1) of the best community cars when building the rival's car pool, so it fields good cars, not the very best. */
  carSkip: number;
  /** How many Crew cards the rival owns to choose its three from. Fewer means less choice. */
  crewCount: number;
  /** Lifts the rarity of every Crew card the rival owns. */
  crewBoost: number;
}

/**
 * How hard each challenge is. Tuned with scripts/simulate-clash.ts so that a typical player (half
 * casual, half good) beats a challenge about 3 times in 10.
 */
export const CHALLENGE_DIFFICULTY: Record<string, ChallengeDifficulty> = {
  bronze: { skill: 0.9, carSkip: 0.4, crewCount: 4, crewBoost: 0 },
  silver: { skill: 0.9, carSkip: 0.5, crewCount: 3, crewBoost: 0 },
  gold: { skill: 0.9, carSkip: 0.3, crewCount: 3, crewBoost: 0 },
  legend: { skill: 0.95, carSkip: 0.4, crewCount: 4, crewBoost: 0 },
  // Mythic rivals play perfectly with the full car and Crew choice (the top of the strength ladder before Crew
  // cards get rarer). Measured at about 31% for a typical player.
  mythic: { skill: 1, carSkip: 0, crewCount: 10, crewBoost: 0 },
  // A challenge that allows any rarity is built from Bronze cars.
  any: { skill: 0.9, carSkip: 0.4, crewCount: 4, crewBoost: 0 },
};

/** How many cars the rival can choose its three from. */
export const RIVAL_CAR_POOL = 6;

/**
 * The cars a challenge rival can choose from: `poolSize` cars from a list sorted best first, after skipping
 * the best `skipFraction` of it. A share, not a count, so it behaves the same however big the community is.
 * It never skips so far that there are too few cars left.
 */
export function rivalCarPoolFrom<T>(sortedBestFirst: T[], poolSize: number, skipFraction: number): T[] {
  const start = Math.min(Math.floor(sortedBestFirst.length * Math.max(0, skipFraction)), Math.max(0, sortedBestFirst.length - poolSize));
  return sortedBestFirst.slice(start, start + poolSize);
}

// ── Setting a win rate ──────────────────────────────────────────────────────

/** The top of the strength ladder. Past 1 the rival's Crew cards also get rarer, steadily, up to a full rarity higher. */
export const MAX_STRENGTH = 1.25;

/**
 * One number, 0 (a pushover) to `MAX_STRENGTH` (as strong as the rival can be made), that turns every difficulty
 * dial together: how well it plays, how good its cars are, how many Crew cards it chooses from, and (right at
 * the top) how rare they are.
 */
export function ladderDials(strength: number): ChallengeDifficulty {
  const s = Math.min(MAX_STRENGTH, Math.max(0, strength));
  const base = Math.min(1, s);
  return {
    skill: 0.3 + 0.7 * base,
    carSkip: 0.9 * (1 - base),
    crewCount: Math.round(3 + 7 * base),
    crewBoost: s > 1 ? (s - 1) / (MAX_STRENGTH - 1) : 0,
  };
}

/** Strengths the win-rate curves are measured at (scripts/calibrate-difficulty.ts). */
export const LADDER_POINTS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.08, 1.16, 1.25];

/** Which curve a challenge rarity uses. A challenge open to any rarity is run on Bronze cars. */
export function curveKey(rarity: string): string {
  return rarity === "any" ? "bronze" : rarity;
}

/** The measured curve for a rarity, made to only ever fall as strength rises (the measurements are a little noisy). */
function monotoneCurve(rarity: string): Array<[number, number]> {
  const raw = WIN_RATE_CURVES[curveKey(rarity)] ?? WIN_RATE_CURVES.gold ?? [];
  const out: Array<[number, number]> = [];
  let ceiling = 1;
  for (const [strength, rate] of raw) {
    ceiling = Math.min(ceiling, rate);
    out.push([strength, ceiling]);
  }
  return out;
}

/** The lowest and highest win rate (percent) that can be set for a rarity. */
export function winRateRange(rarity: string): { minPct: number; maxPct: number } {
  const curve = monotoneCurve(rarity);
  if (curve.length === 0) return { minPct: 5, maxPct: 60 };
  return { minPct: Math.ceil(curve[curve.length - 1][1] * 100), maxPct: Math.floor(curve[0][1] * 100) };
}

/**
 * The dials that make a typical player win about `targetPct` percent of the time against a challenge of this
 * rarity. A target outside what can be reached is brought to the nearest end. A typical player is half
 * casual and half good (see battle-sim.ts), with 4 cars of the rarity and 8 Crew cards.
 */
export function dialsForWinRate(rarity: string, targetPct: number): { dials: ChallengeDifficulty; strength: number; clamped: boolean } {
  const curve = monotoneCurve(rarity);
  if (curve.length === 0) return { dials: CHALLENGE_DIFFICULTY[rarity] ?? CHALLENGE_DIFFICULTY.any, strength: 0.8, clamped: false };
  const target = Math.min(0.99, Math.max(0.01, targetPct / 100));
  if (target >= curve[0][1]) return { dials: ladderDials(curve[0][0]), strength: curve[0][0], clamped: target > curve[0][1] };
  const last = curve[curve.length - 1];
  if (target <= last[1]) return { dials: ladderDials(last[0]), strength: last[0], clamped: target < last[1] };
  for (let i = 0; i < curve.length - 1; i++) {
    const [s0, r0] = curve[i];
    const [s1, r1] = curve[i + 1];
    if (target <= r0 && target >= r1) {
      const t = r0 === r1 ? 0 : (r0 - target) / (r0 - r1);
      const strength = s0 + t * (s1 - s0);
      return { dials: ladderDials(strength), strength, clamped: false };
    }
  }
  return { dials: ladderDials(last[0]), strength: last[0], clamped: false };
}

/** The dials a challenge uses: its target win rate if one is set, otherwise the standard difficulty for its rarity. */
export function difficultyFor(challenge: { allowedRarity: string; targetWinRatePct?: number | null }): ChallengeDifficulty {
  if (typeof challenge.targetWinRatePct === "number" && challenge.targetWinRatePct > 0) {
    return dialsForWinRate(challenge.allowedRarity, challenge.targetWinRatePct).dials;
  }
  return CHALLENGE_DIFFICULTY[challenge.allowedRarity] ?? CHALLENGE_DIFFICULTY.any;
}

/** Casual battles are against other members' cards, so the AI only arranges them well. */
export const CASUAL_AI_SKILL = 0.9;
