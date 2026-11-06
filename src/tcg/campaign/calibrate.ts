import { DEFAULT_SIM, mulberry32, simulateBattle, type PlayerKind } from "../battle-sim";
import type { PlayerProfile } from "../opponent-matching";
import type { Rng } from "../rival-ai";
import {
  ACCEPT_WITHIN_PCT,
  GRID_BATTLES,
  REFINE_BATTLES,
  REFINE_STEPS,
  SHOWCASE_ACCEPT_WITHIN_PCT,
  SHOWCASE_PROBE_BATTLES,
  STRENGTH_GRID,
} from "./config";
import type { FullArtTier } from "@/lib/full-art-card";
import { rivalAt, rosterTierOf, showcaseAt, type PlayerSide, type RivalBuild } from "./generate";
import type { ArtEntry } from "./types";

/**
 * Making each round as hard as the cup says.
 *
 * Step 1 measures this player's own win-rate curve: how often they beat a rival at each point on the strength ladder,
 * by playing simulated battles with the real scoring (battle-sim.ts). Step 2 reads each round's strength off that curve.
 * Step 3 builds the actual rival for the round and checks it by simulation, nudging the strength once or twice if the
 * rival that came out is easier or harder than the curve promised (a single rival is one draw, the curve is an average).
 *
 * "Win rate" means a typical player: half the simulated battles are played by a casual player (picks the shiny debuff)
 * and half by a good one (picks the damaging one), the same split the game's other difficulty curves use.
 */

const DUMMY_PERSONA = { driver: "Sim", team: "Sim" };
/** Different rivals shared across a grid point's battles, so the curve is an average over rival luck and not one lucky team. */
const GRID_VARIANTS = 6;

export type CurvePoint = [strength: number, winPct: number];

/** Percent of simulated battles the player wins against rivals chosen by `rivalFor`. */
export function winPct(side: PlayerSide, rivalFor: (rng: Rng) => RivalBuild, battles: number, seed: number): number {
  const rng = mulberry32(seed);
  let wins = 0;
  for (let i = 0; i < battles; i++) {
    const kind: PlayerKind = i % 2 === 0 ? "casual" : "good";
    const result = simulateBattle(
      {
        ...DEFAULT_SIM,
        player: kind,
        playerBuilder: () => ({ cars: side.cars, crew: side.crew }),
        rivalBuilder: (r) => {
          const build = rivalFor(r);
          return { carPool: build.carPool, crewPool: build.crewPool, skill: build.skill };
        },
      },
      rng
    );
    if (result.playerWon) wins++;
  }
  return (wins / battles) * 100;
}

/** The player's win rate (percent) at each grid strength, made to only ever fall as strength rises (the measurements are noisy). */
export function measureCurve(side: PlayerSide, profile: PlayerProfile, seed: number, battles = GRID_BATTLES): CurvePoint[] {
  const out: CurvePoint[] = [];
  let ceiling = 100;
  for (const strength of STRENGTH_GRID) {
    const variants = Array.from({ length: GRID_VARIANTS }, (_, k) =>
      rivalAt(profile, strength, [], seed + 7919 * (k + 1), DUMMY_PERSONA)
    );
    const pct = winPct(side, (rng) => variants[Math.floor(rng() * variants.length)], battles, seed ^ 0xa5a5);
    ceiling = Math.min(ceiling, pct);
    out.push([strength, ceiling]);
  }
  return out;
}

/** The strength at which the curve crosses `targetPct`, held to the ends of the grid when the target cannot be reached. */
export function strengthFor(curve: CurvePoint[], targetPct: number): number {
  if (curve.length === 0) return 0.6;
  if (targetPct >= curve[0][1]) return curve[0][0];
  const last = curve[curve.length - 1];
  if (targetPct <= last[1]) return last[0];
  for (let i = 0; i < curve.length - 1; i++) {
    const [s0, r0] = curve[i];
    const [s1, r1] = curve[i + 1];
    if (targetPct <= r0 && targetPct >= r1) {
      const t = r0 === r1 ? 0 : (r0 - targetPct) / (r0 - r1);
      return s0 + t * (s1 - s0);
    }
  }
  return last[0];
}

/** Percent of win rate lost per unit of strength near `strength`, for stepping toward a target. Never flatter than a floor. */
function slopeAt(curve: CurvePoint[], strength: number): number {
  for (let i = 0; i < curve.length - 1; i++) {
    const [s0, r0] = curve[i];
    const [s1, r1] = curve[i + 1];
    if (strength >= s0 && strength <= s1 && s1 > s0) return Math.max(20, (r0 - r1) / (s1 - s0));
  }
  return 40;
}

export interface RoundInput {
  round: number;
  targetPct: number;
  persona: { driver: string; team: string };
  art: ArtEntry[];
  /** Rarities to try for a roster of real cards of one rarity, strongest first. Leave out for a rival matched to the player's points. */
  showcase?: FullArtTier[];
}

export interface CalibratedRound {
  round: number;
  targetPct: number;
  strength: number;
  /** What the check simulation measured for this exact rival, in percent. */
  estimatedPct: number;
  build: RivalBuild;
  persona: { driver: string; team: string };
  /** The rarity the rival leads with, for the bracket. */
  tier: FullArtTier;
}

const MAX_STRENGTH = Math.max(...STRENGTH_GRID);

/**
 * Try the round's showcase rarities in turn. A rarity is used when its softest version can be beaten at least as often as
 * the target (otherwise it is too strong for these cards and the next rarity down is tried), and its hardest version is
 * not already too easy (otherwise a stronger rival is needed than this rarity offers, so the matched rival takes over).
 * Within a rarity the strength is tuned to the target the same way as for a matched rival. Returns null if none fit.
 */
function tryShowcase(
  side: PlayerSide,
  r: RoundInput,
  seed: number,
  refineBattles: number,
  refineSteps: number
): CalibratedRound | null {
  const rivalSeed = seed * 31 + r.round * 1009;
  const simSeed = seed ^ (r.round * 7717);
  for (const tier of r.showcase ?? []) {
    const variantsAt = (strength: number) =>
      Array.from({ length: 4 }, (_, k) => showcaseAt(tier, strength, r.art, rivalSeed + 7919 * (k + 1), r.persona));
    const winAt = (strength: number) => {
      const variants = variantsAt(strength);
      return winPct(side, (rng) => variants[Math.floor(rng() * variants.length)], SHOWCASE_PROBE_BATTLES, simSeed);
    };

    const softest = winAt(0);
    if (softest < r.targetPct + 2) continue; // too strong even at its softest: try a lower rarity
    const hardest = winAt(MAX_STRENGTH);
    if (hardest > r.targetPct + ACCEPT_WITHIN_PCT) return null; // too weak even at its hardest: a stronger kind of rival is needed

    // This rarity's own win-rate curve, from four points.
    const curve: CurvePoint[] = [[0, softest]];
    for (const s of [0.4, 0.8]) curve.push([s, winAt(s)]);
    curve.push([MAX_STRENGTH, hardest]);
    let ceiling = 100;
    const monotone = curve.map(([s, pct]): CurvePoint => ((ceiling = Math.min(ceiling, pct)), [s, ceiling]));

    let strength = strengthFor(monotone, r.targetPct);
    let best: CalibratedRound | null = null;
    for (let step = 0; step <= refineSteps; step++) {
      const build = showcaseAt(tier, strength, r.art, rivalSeed, r.persona);
      const estimatedPct = winPct(side, () => build, refineBattles, simSeed);
      const candidate: CalibratedRound = {
        round: r.round,
        targetPct: r.targetPct,
        strength,
        estimatedPct,
        build,
        persona: r.persona,
        tier: rosterTierOf(build.carPool),
      };
      if (!best || Math.abs(estimatedPct - r.targetPct) < Math.abs(best.estimatedPct - r.targetPct)) best = candidate;
      if (Math.abs(estimatedPct - r.targetPct) <= ACCEPT_WITHIN_PCT) break;
      const next = strength + (estimatedPct - r.targetPct) / slopeAt(monotone, strength);
      const clamped = Math.min(MAX_STRENGTH, Math.max(0, next));
      if (Math.abs(clamped - strength) < 0.005) break;
      strength = clamped;
    }
    if (best && Math.abs(best.estimatedPct - r.targetPct) <= SHOWCASE_ACCEPT_WITHIN_PCT) return best;
  }
  return null;
}

/** Build and check one rival per round, each aimed at its round's target win rate. */
export function calibrate(
  side: PlayerSide,
  profile: PlayerProfile,
  rounds: RoundInput[],
  seed: number,
  options: { gridBattles?: number; refineBattles?: number; refineSteps?: number } = {}
): { curve: CurvePoint[]; rounds: CalibratedRound[] } {
  const refineBattles = options.refineBattles ?? REFINE_BATTLES;
  const refineSteps = options.refineSteps ?? REFINE_STEPS;
  const curve = measureCurve(side, profile, seed, options.gridBattles ?? GRID_BATTLES);

  const calibrated = rounds.map((r) => {
    if (r.showcase && r.showcase.length > 0) {
      const showcase = tryShowcase(side, r, seed, refineBattles, refineSteps);
      if (showcase) return showcase;
    }
    const rivalSeed = seed * 31 + r.round * 1009;
    let strength = strengthFor(curve, r.targetPct);
    let best: CalibratedRound | null = null;
    for (let step = 0; step <= refineSteps; step++) {
      const build = rivalAt(profile, strength, r.art, rivalSeed, r.persona);
      const estimatedPct = winPct(side, () => build, refineBattles, seed ^ (r.round * 7717));
      const candidate: CalibratedRound = {
        round: r.round,
        targetPct: r.targetPct,
        strength,
        estimatedPct,
        build,
        persona: r.persona,
        tier: rosterTierOf(build.carPool),
      };
      if (!best || Math.abs(estimatedPct - r.targetPct) < Math.abs(best.estimatedPct - r.targetPct)) best = candidate;
      if (Math.abs(estimatedPct - r.targetPct) <= ACCEPT_WITHIN_PCT) break;
      // Too easy (win rate above target) means the rival must be stronger, and the other way round.
      const next = strength + (estimatedPct - r.targetPct) / slopeAt(curve, strength);
      const clamped = Math.min(MAX_STRENGTH, Math.max(0, next));
      if (Math.abs(clamped - strength) < 0.005) break;
      strength = clamped;
    }
    return best as CalibratedRound;
  });

  return { curve, rounds: calibrated };
}
