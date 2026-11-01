/**
 * The FINALE: one last decision on every corner, after both Crew cards are down and before the corner is judged.
 *
 * One of three games is picked at random each corner:
 *  - Stat Duel:   both sides pick a stat. Your points are your car's value in that stat minus the rival car's value in
 *                 the same stat (it can be negative). The rival does the same against you.
 *  - Timing:      a skill game. Your timing becomes points, scaled by how well the car handles (grip + steer).
 *  - Allocation:  a level playing field: both sides start with 10 in every stat (not the car they are driving) and spend
 *                 a pool of 15 points across the four stats in secret. Each stat is a judge. Win the judge (higher
 *                 stat after allocation) and you score a fixed award. Ties score for nobody.
 *
 * The rival's stats are hidden from the player, so the player has to guess. Everything in here is pure (no React, no
 * Math.random unless the caller passes it as `rng`) so it can be tested on its own.
 */

import type { CornerFinalStats, EvaluatedCornerResult } from "./progression";
import { pickIndex, type Rng } from "./rival-ai";

export type FinaleMode = "stat_duel" | "timing" | "allocation";
export type FinaleStat = keyof CornerFinalStats;

export const FINALE_MODES: FinaleMode[] = ["stat_duel", "timing", "allocation"];
export const FINALE_STATS: FinaleStat[] = ["drift", "accel", "grip", "steer"];

export const FINALE_STAT_LABEL: Record<FinaleStat, string> = {
  drift: "Drift",
  accel: "Accel",
  grip: "Grip",
  steer: "Steer",
};

/** No side can gain or lose more than this many points in a finale (a Legend Crew flat bonus is 15). */
export const FINALE_POINT_CAP = 15;
/** Points each side gets to spend in the Allocation game. */
export const ALLOCATION_POOL = 15;
/** Every stat starts here in the Allocation game, for both sides. The cars' own stats are not used. */
export const ALLOCATION_BASE = 10;
/** Points for winning one judge in the Allocation game (4 judges, so at most 12). */
export const JUDGE_POINTS = 3;
/** The fewest points a perfect timing run is worth (a car with grip + steer of 2). */
export const TIMING_MIN_MAX_POINTS = 6;
/** The most points a perfect timing run is worth (a car with grip + steer of 50). */
export const TIMING_MAX_MAX_POINTS = 12;

export const FINALE_MODE_INFO: Record<FinaleMode, { icon: string; title: string; blurb: string }> = {
  stat_duel: {
    icon: "🎯",
    title: "Stat Duel",
    blurb:
      "Pick a stat. Your car's number in that stat is set against the rival car's, and the gap is added to your score. The rival is picking one too. Their stats are hidden.",
  },
  timing: {
    icon: "⏱️",
    title: "Perfect Drift",
    blurb:
      "Stop the marker in the green zone. The closer you land, the more points you score. Better grip and steer turn good timing into more points.",
  },
  allocation: {
    icon: "🎛️",
    title: "Setup Allocation",
    blurb: `Both cars start from ${ALLOCATION_BASE} in every stat, whatever car you are driving. Spend ${ALLOCATION_POOL} setup points across the four stats. Each stat is a judge: beat the rival's stat and you score ${JUDGE_POINTS} points. Allocations are secret until the reveal.`,
  },
};

export type FinaleAllocation = Record<FinaleStat, number>;

export type FinaleChoice =
  | { mode: "stat_duel"; stat: FinaleStat }
  | { mode: "timing"; accuracy: number }
  | { mode: "allocation"; allocation: FinaleAllocation };

export interface FinaleOutcome {
  mode: FinaleMode;
  /** Points added to the player's corner score (can be negative in the Stat Duel). */
  playerPoints: number;
  /** Points added to the rival's corner score. */
  rivalPoints: number;
  playerChoice: FinaleChoice;
  rivalChoice: FinaleChoice;
  /** One line describing what happened, shown at the reveal. */
  summary: string;
}

export function rollFinaleMode(rng: Rng = Math.random): FinaleMode {
  return FINALE_MODES[Math.min(FINALE_MODES.length - 1, Math.floor(rng() * FINALE_MODES.length))];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const capPoints = (n: number) => clamp(Math.round(n), -FINALE_POINT_CAP, FINALE_POINT_CAP);

export function emptyAllocation(): FinaleAllocation {
  return { drift: 0, accel: 0, grip: 0, steer: 0 };
}

export function allocationTotal(a: FinaleAllocation): number {
  return FINALE_STATS.reduce((sum, s) => sum + a[s], 0);
}

/** An allocation made of whole, non-negative numbers that never spends more than the pool. */
export function sanitizeAllocation(a: Partial<FinaleAllocation> | undefined): FinaleAllocation {
  const out = emptyAllocation();
  let left = ALLOCATION_POOL;
  for (const s of FINALE_STATS) {
    const v = clamp(Math.floor(Number(a?.[s]) || 0), 0, left);
    out[s] = v;
    left -= v;
  }
  return out;
}

/** Spread the pool as evenly as possible. */
export function evenAllocation(): FinaleAllocation {
  const out = emptyAllocation();
  const base = Math.floor(ALLOCATION_POOL / FINALE_STATS.length);
  let extra = ALLOCATION_POOL - base * FINALE_STATS.length;
  for (const s of FINALE_STATS) {
    out[s] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
  }
  return out;
}

/** 0 to 1 from where the marker stopped on the 0 to 1 bar. The green zone is the middle. */
export function timingAccuracy(position: number): number {
  const dist = Math.abs(clamp(position, 0, 1) - 0.5);
  const GREEN_HALF_WIDTH = 0.03;
  return clamp(1 - Math.max(0, dist - GREEN_HALF_WIDTH) / (0.5 - GREEN_HALF_WIDTH), 0, 1);
}

/** What a perfect timing run is worth for this car. */
export function timingMaxPoints(stats: CornerFinalStats): number {
  const handling = clamp(stats.grip + stats.steer, 2, 50);
  return TIMING_MIN_MAX_POINTS + Math.round(((handling - 2) / 48) * (TIMING_MAX_MAX_POINTS - TIMING_MIN_MAX_POINTS));
}

/** The choice the player gets if they skip the finale. */
export function defaultPlayerChoice(mode: FinaleMode, playerStats: CornerFinalStats): FinaleChoice {
  if (mode === "stat_duel") {
    const best = FINALE_STATS.reduce((a, b) => (playerStats[b] > playerStats[a] ? b : a), FINALE_STATS[0]);
    return { mode, stat: best };
  }
  if (mode === "allocation") return { mode, allocation: evenAllocation() };
  return { mode, accuracy: 0.5 };
}

// ── The rival's side ──────────────────────────────────────────────────────

/** Roughly a normal curve with a spread of 1. */
function gaussian(rng: Rng): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

/**
 * The rival is not told the player's stats either. It sees them with some error, which shrinks as its skill rises
 * (about 1.5 points at skill 1, about 5.5 at skill 0).
 */
function estimateStats(real: CornerFinalStats, skill: number, rng: Rng): CornerFinalStats {
  const spread = 1.5 + (1 - clamp(skill, 0, 1)) * 4;
  const out = { ...real };
  for (const s of FINALE_STATS) out[s] = clamp(real[s] + gaussian(rng) * spread, 1, 25);
  return out;
}

/** How well the rival times its run, 0 to 1. Averages 0.8 at skill 1 and 0.45 at skill 0. */
export function rivalTimingAccuracy(skill: number, rng: Rng): number {
  const noise = (rng() + rng() + rng() - 1.5) * 0.3;
  return clamp(0.45 + 0.35 * clamp(skill, 0, 1) + noise, 0, 1);
}

/**
 * Both sides start from the same stats, so this is a pure guessing game about where the other side will spend. The
 * rival guesses that the player spreads its points about evenly, give or take (a wider guess the lower its skill),
 * then spends just enough to beat the stats it thinks are cheapest.
 */
function rivalAllocation(skill: number, rng: Rng): FinaleAllocation {
  const average = ALLOCATION_POOL / FINALE_STATS.length;
  const spread = 1.5 + (1 - clamp(skill, 0, 1)) * 3;
  const guessedPlayer = emptyAllocation();
  for (const s of FINALE_STATS) guessedPlayer[s] = Math.max(0, average + gaussian(rng) * spread);

  // How many setup points it takes to beat each stat. Win the cheapest judges first.
  const cost = FINALE_STATS.map((s) => ({
    stat: s,
    cost: Math.floor(guessedPlayer[s]) + 1,
  })).sort((a, b) => a.cost - b.cost || rng() - 0.5);

  const out = emptyAllocation();
  let left = ALLOCATION_POOL;
  for (const c of cost) {
    if (c.cost <= left) {
      out[c.stat] += c.cost;
      left -= c.cost;
    }
  }
  // Any left over goes onto the judges it is already winning, or the cheapest one if it won none.
  const spendOn = cost.find((c) => out[c.stat] > 0)?.stat ?? cost[0].stat;
  out[spendOn] += left;
  return sanitizeAllocation(out);
}

/** The rival's pick for a finale. `skill` is 0 to 1 (see `CASUAL_AI_SKILL`). */
export function chooseRivalFinale(input: {
  mode: FinaleMode;
  rivalStats: CornerFinalStats;
  playerStats: CornerFinalStats;
  skill: number;
  rng?: Rng;
}): FinaleChoice {
  const { mode, rivalStats, playerStats, skill } = input;
  const rng = input.rng ?? Math.random;
  if (mode === "timing") return { mode, accuracy: rivalTimingAccuracy(skill, rng) };
  // The setup game ignores the cars' stats: everyone starts from the same base.
  if (mode === "allocation") return { mode, allocation: rivalAllocation(skill, rng) };
  const estimate = estimateStats(playerStats, skill, rng);
  const values = FINALE_STATS.map((s) => rivalStats[s] - estimate[s]);
  return { mode, stat: FINALE_STATS[pickIndex(values, skill, rng)] };
}

// ── Resolving ──────────────────────────────────────────────────────────────

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function resolveFinale(input: {
  playerStats: CornerFinalStats;
  rivalStats: CornerFinalStats;
  playerChoice: FinaleChoice;
  rivalChoice: FinaleChoice;
}): FinaleOutcome {
  const { playerStats, rivalStats, playerChoice, rivalChoice } = input;

  if (playerChoice.mode === "stat_duel" && rivalChoice.mode === "stat_duel") {
    const ps = playerChoice.stat;
    const rs = rivalChoice.stat;
    const playerPoints = capPoints(playerStats[ps] - rivalStats[ps]);
    const rivalPoints = capPoints(rivalStats[rs] - playerStats[rs]);
    return {
      mode: "stat_duel",
      playerPoints,
      rivalPoints,
      playerChoice,
      rivalChoice,
      summary: `Stat Duel: you picked ${FINALE_STAT_LABEL[ps]} (${playerStats[ps]} v ${rivalStats[ps]} = ${signed(
        playerPoints
      )}), the rival picked ${FINALE_STAT_LABEL[rs]} (${rivalStats[rs]} v ${playerStats[rs]} = ${signed(rivalPoints)})`,
    };
  }

  if (playerChoice.mode === "allocation" && rivalChoice.mode === "allocation") {
    const pa = sanitizeAllocation(playerChoice.allocation);
    const ra = sanitizeAllocation(rivalChoice.allocation);
    let pWins = 0;
    let rWins = 0;
    // Everyone starts from the same base, so only the allocations are compared (the cars' stats are not used).
    for (const s of FINALE_STATS) {
      const p = ALLOCATION_BASE + pa[s];
      const r = ALLOCATION_BASE + ra[s];
      if (p > r) pWins += 1;
      else if (r > p) rWins += 1;
    }
    const playerPoints = capPoints(pWins * JUDGE_POINTS);
    const rivalPoints = capPoints(rWins * JUDGE_POINTS);
    const spread = (a: FinaleAllocation) => FINALE_STATS.map((s) => ALLOCATION_BASE + a[s]).join("/");
    return {
      mode: "allocation",
      playerPoints,
      rivalPoints,
      playerChoice: { mode: "allocation", allocation: pa },
      rivalChoice: { mode: "allocation", allocation: ra },
      summary: `Setup Allocation: you ${spread(pa)} v rival ${spread(ra)} (drift/accel/grip/steer). You won ${pWins} of 4 judges (${signed(
        playerPoints
      )}), the rival won ${rWins} (${signed(rivalPoints)})`,
    };
  }

  if (playerChoice.mode === "timing" && rivalChoice.mode === "timing") {
    const pAcc = clamp(playerChoice.accuracy, 0, 1);
    const rAcc = clamp(rivalChoice.accuracy, 0, 1);
    const playerPoints = capPoints(pAcc * timingMaxPoints(playerStats));
    const rivalPoints = capPoints(rAcc * timingMaxPoints(rivalStats));
    return {
      mode: "timing",
      playerPoints,
      rivalPoints,
      playerChoice: { mode: "timing", accuracy: pAcc },
      rivalChoice: { mode: "timing", accuracy: rAcc },
      summary: `Perfect Drift: you landed ${Math.round(pAcc * 100)}% (${signed(playerPoints)}), the rival landed ${Math.round(
        rAcc * 100
      )}% (${signed(rivalPoints)})`,
    };
  }

  throw new Error("resolveFinale: both sides must play the same finale mode");
}

/** The corner's result with the finale's points added. Scores never drop below the engine's floor of 5. */
export function applyFinaleToResult(base: EvaluatedCornerResult, outcome: FinaleOutcome): EvaluatedCornerResult {
  const playerScore = Math.max(5, base.playerScore + outcome.playerPoints);
  const rivalScore = Math.max(5, base.rivalScore + outcome.rivalPoints);
  return {
    ...base,
    playerScore,
    rivalScore,
    playerScoreBeforeFinale: base.playerScore,
    rivalScoreBeforeFinale: base.rivalScore,
    playerFinalePoints: outcome.playerPoints,
    rivalFinalePoints: outcome.rivalPoints,
    finaleSummary: outcome.summary,
    effectsTriggered: [...base.effectsTriggered, `${FINALE_MODE_INFO[outcome.mode].icon} ${outcome.summary}`],
    won: playerScore > rivalScore,
    tied: playerScore === rivalScore,
  };
}
