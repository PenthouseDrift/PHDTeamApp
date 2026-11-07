/**
 * Debuffs for Tandem Clash and the Drift Campaign.
 *
 * Every debuff hits every car (no stat-threshold targeting) and is built from three parts:
 *   1. A BASE cut to one stat, fixed by the debuff's rarity. It is always there.
 *   2. A BONUS cut to a different stat, decided by the ATTACK game ("Lock On"): the player who played the debuff taps a
 *      shrinking ring onto a target. The bonus grows with the square of their accuracy, so a full bonus needs a near-perfect
 *      lock. The rarer the debuff, the bigger the bonus can be (and the faster the ring).
 *   3. A DEFENCE, decided by the DEFEND game ("Brace"): the player whose car is hit keeps a marker in the safe zone while
 *      gusts push it around. A perfect defence blocks half of the debuff and no more.
 *
 * Pure and seedable, so the arena, the battle simulator and the Campaign calibration all agree. The result is baked into a copy
 * of the debuff card (`applyDebuffImpact`), so the scoring engine needs no changes. Tandem Tour never calls anything in this
 * file and keeps its own debuffs exactly as they were.
 */

import {
  type DebuffCardDefinition,
  type DebuffCardPenalties,
  type DebuffClashSpec,
  type DebuffStat,
} from "@/lib/crew-cards";
import type { FullArtTier } from "@/lib/full-art-card";
import { rollThreeDebuffCards, shieldedPenalty } from "./progression";

type Rng = () => number;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const TIER_INDEX: Record<FullArtTier, number> = { bronze: 0, silver: 1, gold: 2, legend: 3, mythic: 3 };
const tierIndex = (tier: FullArtTier) => TIER_INDEX[tier] ?? 0;

// ── The numbers ─────────────────────────────────────────────────────────────

/** The stat points every debuff takes off its main stat, by rarity (Bronze to Legend). Always applied. */
export const BASE_CUT: readonly [number, number, number, number] = [3, 5, 8, 12];
/** The most the attack game can add off the second stat, by rarity. */
export const BONUS_MAX: readonly [number, number, number, number] = [3, 5, 8, 12];
/** The bonus is `BONUS_MAX x accuracy ^ ATTACK_CURVE`, so only a near-perfect attack gets all of it. */
export const ATTACK_CURVE = 2;
/** The most a perfect defence can block, as a share of the debuff. */
export const DEFENCE_MAX_BLOCK = 0.5;
/** The same, as a whole percentage for the screen. */
export const DEBUFF_DEFENCE_PCT = Math.round(DEFENCE_MAX_BLOCK * 100);
/** The accuracy used when a player skips a mini-game: dead average. */
export const DEFAULT_IMPACT_ACCURACY = 0.5;

export const baseCutFor = (tier: FullArtTier) => BASE_CUT[tierIndex(tier)];
export const bonusMaxFor = (tier: FullArtTier) => BONUS_MAX[tierIndex(tier)];

/** The extra stat points an attack of this accuracy adds to a debuff of this rarity. */
export function attackBonus(tier: FullArtTier, accuracy: number): number {
  return Math.round(bonusMaxFor(tier) * Math.pow(clamp(accuracy, 0, 1), ATTACK_CURVE));
}

/** The share of a debuff a defence of this accuracy blocks (0 to DEFENCE_MAX_BLOCK). */
export function defenceShare(accuracy: number): number {
  return DEFENCE_MAX_BLOCK * clamp(accuracy, 0, 1);
}

// ── Which stats each debuff goes after ──────────────────────────────────────

/** The main stat (base cut) and the second stat (attack bonus) of each debuff in the set, so they read as the hazard they are. */
export const DEBUFF_STATS: Record<string, { primary: DebuffStat; secondary: DebuffStat }> = {
  "debuff-01-black-ice": { primary: "grip", secondary: "steer" },
  "debuff-02-tyre-smoke": { primary: "steer", secondary: "drift" },
  "debuff-03-oil-spill": { primary: "grip", secondary: "accel" },
  "debuff-04-voltage-sag": { primary: "accel", secondary: "drift" },
  "debuff-05-servo-glitch": { primary: "steer", secondary: "grip" },
  "debuff-06-cold-tyres": { primary: "drift", secondary: "grip" },
  "debuff-07-wall-scrape": { primary: "drift", secondary: "steer" },
  "debuff-08-gyro-hunt": { primary: "drift", secondary: "steer" },
  "debuff-09-strict-marshal": { primary: "drift", secondary: "accel" },
  "debuff-10-turbo-overheat": { primary: "accel", secondary: "grip" },
  "debuff-11-de-bead": { primary: "grip", secondary: "drift" },
  "debuff-12-radio-jam": { primary: "steer", secondary: "accel" },
};

const STAT_ORDER: DebuffStat[] = ["drift", "accel", "grip", "steer"];
const PENALTY_KEY = { drift: "driftPenalty", accel: "accelPenalty", grip: "gripPenalty", steer: "steerPenalty" } as const;

/**
 * The two stats a debuff goes after. A debuff in the standard set has its own pair. A custom one made in the admin page uses
 * the stat it already penalises (or Grip) as its main stat, and the next stat along as its second.
 */
export function debuffStatsFor(def: DebuffCardDefinition): { primary: DebuffStat; secondary: DebuffStat } {
  const known = DEBUFF_STATS[def.id];
  if (known) return known;
  const pen = def.penalties ?? {};
  const primary = STAT_ORDER.find((s) => (pen[PENALTY_KEY[s]] ?? 0) > 0) ?? "grip";
  return { primary, secondary: STAT_ORDER[(STAT_ORDER.indexOf(primary) + 1) % STAT_ORDER.length] };
}

// ── Card text ───────────────────────────────────────────────────────────────

const statName = (s: DebuffStat) => s.toUpperCase();
const tagOf = (def: DebuffCardDefinition) => def.ability.split("·")[0]?.trim() || def.name.toUpperCase();
const flavourOf = (def: DebuffCardDefinition) => {
  const m = def.effect.match(/^([^.!?]+[.!?])/);
  return m ? m[1].trim() : `${def.name}!`;
};

// ── Dealing a debuff ────────────────────────────────────────────────────────

/**
 * A debuff as it is dealt in Clash: the base cut to its main stat for its rarity, and the second stat and the most the attack
 * game can add recorded on the card. Any flat points or stat-threshold condition are dropped, so it hits every car. A card that
 * has already been through this comes back unchanged.
 */
export function toClashDebuff(def: DebuffCardDefinition): DebuffCardDefinition {
  if (def.clash) return def;
  const { primary, secondary } = debuffStatsFor(def);
  const baseCut = baseCutFor(def.tier);
  const bonusMax = bonusMaxFor(def.tier);
  const clash: DebuffClashSpec = { primary, secondary, baseCut, bonusMax };
  const penalties: DebuffCardPenalties = { [PENALTY_KEY[primary]]: baseCut };
  return {
    ...def,
    penalties,
    clash,
    ability: `${tagOf(def)} · -${baseCut} ${statName(primary)} (+${bonusMax} ${statName(secondary)})`.slice(0, 48),
    effect: `${flavourOf(def)} Always -${baseCut} ${statName(primary)}, plus up to -${bonusMax} ${statName(secondary)} from the attack game. A good defence blocks up to ${Math.round(DEFENCE_MAX_BLOCK * 100)}%.`.slice(0, 160),
  };
}

/**
 * Deal three debuffs the way Clash always has (three different cards, each with its own rolled rarity), as Clash debuffs.
 * Tandem Tour keeps calling `rollThreeDebuffCards` directly and is not affected.
 */
export function rollThreeClashDebuffCards(
  pool?: DebuffCardDefinition[],
  rng: Rng = Math.random
): [DebuffCardDefinition, DebuffCardDefinition, DebuffCardDefinition] {
  const [a, b, c] = rollThreeDebuffCards(pool, rng);
  return [toClashDebuff(a), toClashDebuff(b), toClashDebuff(c)];
}

// ── Landing a debuff ────────────────────────────────────────────────────────

/**
 * The debuff after the two games: the base cut to the main stat, plus the attack bonus off the second stat, each reduced by
 * the defence (rounded the way a Crew shield is, so halves go to the defender). Always built from the card as dealt, so playing
 * it twice gives the same result.
 */
export function applyDebuffImpact(dealt: DebuffCardDefinition, attackAccuracy: number, defendAccuracy: number): DebuffCardDefinition {
  const def = toClashDebuff(dealt);
  const clash = def.clash as DebuffClashSpec;
  const bonus = attackBonus(def.tier, attackAccuracy);
  const share = defenceShare(defendAccuracy);
  const mainCut = shieldedPenalty(clash.baseCut, share);
  const bonusCut = shieldedPenalty(bonus, share);

  const penalties: DebuffCardPenalties = {};
  if (mainCut > 0) penalties[PENALTY_KEY[clash.primary]] = mainCut;
  if (bonusCut > 0) penalties[PENALTY_KEY[clash.secondary]] = bonusCut;

  const blockedPct = Math.round(share * 100);
  const parts = [
    mainCut > 0 && `-${mainCut} ${statName(clash.primary)}`,
    bonusCut > 0 && `-${bonusCut} ${statName(clash.secondary)}`,
  ].filter(Boolean) as string[];
  const hasEffect = parts.length > 0;
  const braced = blockedPct > 0 ? ` ${blockedPct}% braced.` : "";
  return {
    ...def,
    penalties,
    ability: `${tagOf(def)} · ${hasEffect ? parts.join(" ") : "NO EFFECT"}`.slice(0, 48),
    effect: hasEffect ? `${flavourOf(def)} ${parts.join(" and ")}.${braced}` : `${flavourOf(def)} Fully shrugged off.`,
    impact: {
      attackAccuracy: Math.round(clamp(attackAccuracy, 0, 1) * 100) / 100,
      defendAccuracy: Math.round(clamp(defendAccuracy, 0, 1) * 100) / 100,
      bonus,
      blockedPct,
    },
  };
}

/** A short name for how a debuff landed, for the screen. */
export function impactLabel(def: DebuffCardDefinition): string {
  const impact = def.impact;
  if (!impact) return "";
  const hit = impact.attackAccuracy >= 0.85 ? "Direct hit" : impact.attackAccuracy >= 0.6 ? "Solid hit" : impact.attackAccuracy >= 0.3 ? "Glancing hit" : "Light touch";
  return impact.blockedPct > 0 ? `${hit}, ${impact.blockedPct}% braced` : hit;
}

// ── The attack game: Lock On ────────────────────────────────────────────────
//
// A ring shrinks toward the middle. Tap when it matches the target ring. Closer is better, and a ring that is allowed to
// shrink all the way scores nothing. It is deliberately hard to be perfect: the lock zone is narrow and the ring is quick, and
// the bonus rewards accuracy more than proportionally (see ATTACK_CURVE). The rarer the debuff, the faster the ring.

/** The ring starts at this size (1 = the full width of the play area). */
export const RING_START = 1;
/** The size of the target ring. */
export const RING_TARGET = 0.38;
/** Within this much of the target counts as a perfect lock. */
export const RING_PERFECT_BAND = 0.025;
/** Beyond the perfect band, accuracy falls to 0 over this much ring size. */
export const RING_FALLOFF = 0.2;

/** Seconds the ring takes to shrink from full size to nothing, by the debuff's rarity. */
export function ringSeconds(tier: FullArtTier): number {
  return [1.6, 1.4, 1.2, 1.0][tierIndex(tier)];
}

/** The ring's size `elapsed` seconds after it starts shrinking (0 once it has gone). */
export function ringRadiusAt(elapsed: number, totalSeconds: number): number {
  return clamp(RING_START * (1 - elapsed / Math.max(0.1, totalSeconds)), 0, RING_START);
}

/** Accuracy (0 to 1) for tapping when the ring is at `radius`. */
export function ringAccuracy(radius: number): number {
  const miss = Math.abs(radius - RING_TARGET);
  return clamp(1 - Math.max(0, miss - RING_PERFECT_BAND) / RING_FALLOFF, 0, 1);
}

// ── The defence game: Brace ─────────────────────────────────────────────────
//
// A marker starts in the middle of a track. Gusts push it left and right, and the player counter-steers (hold left or hold
// right) to keep it inside the safe zone. Accuracy is the share of the time it spent inside. The rarer the debuff, the
// stronger the gusts. Different from Lock On in every way: it is about holding steady, not about one well-timed tap.

/** Seconds a brace lasts. */
export const BRACE_SECONDS = 4;
/** The safe zone is the middle of the track, this far either side of the centre (the track is 0 to 1). */
export const BRACE_ZONE_HALF = 0.13;
/** How hard a counter-steer pushes the marker (track widths per second, per second). */
export const BRACE_CONTROL = 3.4;
/** The marker loses this share of its speed each second (so 0.35 means it keeps 35% after one second). */
export const BRACE_DRAG = 0.35;

/** How strong the gusts are, by the debuff's rarity. Always less than BRACE_CONTROL, so a brace can be held. */
export function braceStrength(tier: FullArtTier): number {
  return [1.7, 2.0, 2.3, 2.6][tierIndex(tier)];
}

/** Two random starting points for the gust pattern, so no two braces are the same. */
export function rollBracePhases(rng: Rng = Math.random): [number, number] {
  return [rng() * Math.PI * 2, rng() * Math.PI * 2];
}

/** The sideways push at time `t` seconds (positive pushes right). */
export function braceGust(t: number, phases: [number, number], strength: number): number {
  return strength * (0.65 * Math.sin(2.1 * t + phases[0]) + 0.35 * Math.sin(3.7 * t + phases[1]));
}

export interface BraceState {
  /** Where the marker is on the track, 0 (far left) to 1 (far right). */
  x: number;
  /** Its speed, in track widths per second. */
  v: number;
}

export const BRACE_START: BraceState = { x: 0.5, v: 0 };

/**
 * Move the marker on by `dt` seconds at time `t`. `input` is the counter-steer: -1 (Left held), 0 (nothing held) or 1 (Right held).
 * Values in between are allowed and just push less. The track has walls.
 */
export function braceStep(
  state: BraceState,
  input: number,
  t: number,
  phases: [number, number],
  strength: number,
  dt: number
): BraceState {
  const push = clamp(input, -1, 1);
  let v = state.v + (braceGust(t, phases, strength) + push * BRACE_CONTROL) * dt;
  v *= Math.pow(BRACE_DRAG, dt);
  let x = state.x + v * dt;
  if (x < 0) {
    x = 0;
    v = 0;
  } else if (x > 1) {
    x = 1;
    v = 0;
  }
  return { x, v };
}

export const braceInZone = (x: number) => Math.abs(x - 0.5) <= BRACE_ZONE_HALF;

/** Accuracy (0 to 1) from the time the marker spent inside the safe zone. */
export function braceAccuracy(secondsInZone: number, totalSeconds: number = BRACE_SECONDS): number {
  return clamp(secondsInZone / Math.max(0.1, totalSeconds), 0, 1);
}

// ── Simulated players (the AI rival and the battle simulator) ───────────────

const noise = (rng: Rng) => (rng() + rng() + rng() - 1.5) * 0.3;

/** A simulated player's attack accuracy: a good one averages 0.7, a casual one 0.4 (Lock On is hard). */
export function simulatedAttackAccuracy(kind: "good" | "casual", rng: Rng): number {
  return clamp((kind === "good" ? 0.7 : 0.4) + noise(rng), 0, 1);
}

/** A simulated player's defence accuracy: a good one averages 0.8, a casual one 0.55 (Brace is more forgiving than Lock On). */
export function simulatedDefendAccuracy(kind: "good" | "casual", rng: Rng): number {
  return clamp((kind === "good" ? 0.8 : 0.55) + noise(rng), 0, 1);
}

/** How well the rival AI attacks, 0 to 1. Averages 0.6 at skill 1 and 0.3 at skill 0. */
export function rivalAttackAccuracy(skill: number, rng: Rng): number {
  return clamp(0.3 + 0.3 * clamp(skill, 0, 1) + noise(rng), 0, 1);
}

/** How well the rival AI defends, 0 to 1. Averages 0.75 at skill 1 and 0.4 at skill 0. */
export function rivalDefendAccuracy(skill: number, rng: Rng): number {
  return clamp(0.4 + 0.35 * clamp(skill, 0, 1) + noise(rng), 0, 1);
}
