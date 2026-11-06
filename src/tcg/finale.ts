/**
 * The FINALE: one last decision on every corner, after both Crew cards are down and before the corner is judged.
 *
 * One of three games is picked at random each corner:
 *  - Stat Duel:   both sides pick a stat. Your points are your car's value in that stat minus the rival car's value in
 *                 the same stat (it can be negative). The rival does the same against you.
 *  - Timing:      a skill game. Your timing becomes points, scaled by how well the car handles (grip + steer). Every
 *                 full pass of the marker from one side of the bar to the other takes 1 point off what is available.
 *                 At 0 the run ends by itself and scores nothing.
 *  - Allocation:  a level playing field: both sides start with 10 in every stat (not the car they are driving) and spend
 *                 a pool of 15 points across the four stats in secret. Each stat is a judge, and the judges are NOT
 *                 worth the same: the four awards are 6, 4, 3 and 2 points, dealt to the stats at random and shown
 *                 before anyone spends. Win a judge (higher stat after allocation) and you score its award. Ties score
 *                 for nobody. The awards add up to an odd number (15), so two sides that each win every judge they
 *                 can never finish level: which judges you win matters, not just how many.
 *
 * The rival's stats are hidden from the player, so the player has to guess. Everything in here is pure (no React, no
 * Math.random unless the caller passes it as `rng`) so it can be tested on its own.
 */

import type { CornerFinalStats, CornerScoreParts, EvaluatedCornerResult } from "./progression";
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
/**
 * What the four judges in the Allocation game are worth. They are dealt to the four stats at random each time
 * (see `rollAllocationWeights`). They add up to 15, an odd number, so when every judge is won by someone the two
 * sides can never score the same.
 */
export const ALLOCATION_AWARDS = [6, 4, 3, 2] as const;
/** Each stat's judge award in the Allocation game. */
export type FinaleWeights = Record<FinaleStat, number>;
/** The awards in a fixed order, for when none were dealt (a skipped or older finale). */
export const DEFAULT_ALLOCATION_WEIGHTS: FinaleWeights = { drift: 6, accel: 4, grip: 3, steer: 2 };

/** Deal the four awards to the four stats at random. */
export function rollAllocationWeights(rng: Rng = Math.random): FinaleWeights {
  const awards = [...ALLOCATION_AWARDS];
  for (let i = awards.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [awards[i], awards[j]] = [awards[j], awards[i]];
  }
  return { drift: awards[0], accel: awards[1], grip: awards[2], steer: awards[3] };
}
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
      "Stop the marker in the green zone. The closer you land, the more points you score, and better grip and steer are worth more. The marker starts very fast and slows down, but every full pass takes 1 point off, and at 0 the run ends by itself with nothing.",
  },
  allocation: {
    icon: "🎛️",
    title: "Setup Allocation",
    blurb: `Both cars start from ${ALLOCATION_BASE} in every stat, whatever car you are driving. Spend ${ALLOCATION_POOL} setup points across the four stats. Each stat is a judge, and they are not worth the same: the awards (${ALLOCATION_AWARDS.join(", ")}) are dealt to the stats at random and shown to both of you. Beat the rival's stat to win its award. Allocations are secret until the reveal.`,
  },
};

export type FinaleAllocation = Record<FinaleStat, number>;

export type FinaleChoice =
  | { mode: "stat_duel"; stat: FinaleStat }
  /** `passes` = full passes the marker made before it was stopped. Each one took 1 point off what was available. */
  | { mode: "timing"; accuracy: number; passes: number }
  /** `weights` = what each stat's judge is worth this time (the same for both sides). */
  | { mode: "allocation"; allocation: FinaleAllocation; weights: FinaleWeights };

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

/** Spread the pool in proportion to what each judge is worth (the sensible default when you do not choose). */
export function proportionalAllocation(weights: FinaleWeights): FinaleAllocation {
  const total = FINALE_STATS.reduce((sum, s) => sum + weights[s], 0) || 1;
  const out = emptyAllocation();
  let left = ALLOCATION_POOL;
  // Whole points by largest remainder, so the pool is spent exactly.
  const exact = FINALE_STATS.map((s) => ({ stat: s, share: (weights[s] / total) * ALLOCATION_POOL }));
  for (const e of exact) {
    out[e.stat] = Math.floor(e.share);
    left -= out[e.stat];
  }
  exact.sort((a, b) => (b.share % 1) - (a.share % 1));
  for (let i = 0; left > 0; i = (i + 1) % exact.length) {
    out[exact[i].stat] += 1;
    left -= 1;
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

/** Seconds the marker takes to cross the bar on the first pass: very quick. */
export const TIMING_FIRST_PASS_SECONDS = 0.45;
/** Seconds it takes on the last pass before the points run out: the slowest it gets. */
export const TIMING_LAST_PASS_SECONDS = 1.4;

/**
 * How long the marker takes to cross the bar on a given pass (0 is the first). It starts fast and slows down with every
 * pass, as the points come off, so a late stop is easier to land but is worth less. `totalPasses` is how many passes there
 * are before the points run out (the run's maximum points).
 */
export function timingPassSeconds(pass: number, totalPasses: number): number {
  const last = Math.max(1, totalPasses - 1);
  const t = clamp(pass / last, 0, 1);
  return TIMING_FIRST_PASS_SECONDS + (TIMING_LAST_PASS_SECONDS - TIMING_FIRST_PASS_SECONDS) * t;
}

/**
 * What a perfect timing run is worth for this car, if it is stopped in the first pass. Every full pass the marker
 * makes from one side of the bar to the other takes 1 off this.
 */
export function timingMaxPoints(stats: CornerFinalStats): number {
  const handling = clamp(stats.grip + stats.steer, 2, 50);
  return TIMING_MIN_MAX_POINTS + Math.round(((handling - 2) / 48) * (TIMING_MAX_MAX_POINTS - TIMING_MIN_MAX_POINTS));
}

/** The points a timing run can still earn after the marker has made `passes` full passes (never below 0). */
export function timingPointsAvailable(stats: CornerFinalStats, passes: number): number {
  return Math.max(0, timingMaxPoints(stats) - Math.max(0, Math.floor(passes)));
}

/** The choice the player gets if they skip the finale. */
export function defaultPlayerChoice(
  mode: FinaleMode,
  playerStats: CornerFinalStats,
  weights: FinaleWeights = DEFAULT_ALLOCATION_WEIGHTS
): FinaleChoice {
  if (mode === "stat_duel") {
    const best = FINALE_STATS.reduce((a, b) => (playerStats[b] > playerStats[a] ? b : a), FINALE_STATS[0]);
    return { mode, stat: best };
  }
  if (mode === "allocation") return { mode, allocation: proportionalAllocation(weights), weights };
  return { mode, accuracy: 0.5, passes: 0 };
}

// ── The rival's side ──────────────────────────────────────────────────────

/** Roughly a normal curve with a spread of 1. */
function gaussian(rng: Rng): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

/**
 * The rival is not told the player's stats either. It sees them with some error, which shrinks as its skill rises
 * (about 3.5 points at skill 1, about 7.5 at skill 0).
 */
function estimateStats(real: CornerFinalStats, skill: number, rng: Rng): CornerFinalStats {
  const spread = 3.5 + (1 - clamp(skill, 0, 1)) * 4;
  const out = { ...real };
  for (const s of FINALE_STATS) out[s] = clamp(real[s] + gaussian(rng) * spread, 1, 25);
  return out;
}

/**
 * How many full passes the rival lets the marker make before it stops it. A strong rival stops it in the first pass or
 * two (0 or 1); a weak one waits longer (up to 4 at skill 0), so it has fewer points left.
 */
export function rivalTimingPasses(skill: number, rng: Rng): number {
  return Math.floor(rng() * (2 + (1 - clamp(skill, 0, 1)) * 3));
}

/** How well the rival times its run, 0 to 1. Averages 0.8 at skill 1 and 0.45 at skill 0. */
export function rivalTimingAccuracy(skill: number, rng: Rng): number {
  const noise = (rng() + rng() + rng() - 1.5) * 0.3;
  return clamp(0.45 + 0.35 * clamp(skill, 0, 1) + noise, 0, 1);
}

/**
 * Both sides start from the same stats, so this is a guessing game about where the other side will spend, over
 * judges that are not worth the same. The rival guesses that the player spends in proportion to what the judges are
 * worth, give or take (a wider guess the lower its skill). It then looks at every set of judges it could afford to
 * beat that guess on and takes the set that is worth the most, spending what is left on those same judges.
 */
function rivalAllocation(skill: number, weights: FinaleWeights, rng: Rng): FinaleAllocation {
  const spread = 3 + (1 - clamp(skill, 0, 1)) * 3;
  const guess = proportionalAllocation(weights);
  const guessedPlayer = emptyAllocation();
  for (const s of FINALE_STATS) guessedPlayer[s] = Math.max(0, guess[s] + gaussian(rng) * spread);

  let best: { set: FinaleStat[]; value: number; cost: number } = { set: [], value: -1, cost: 0 };
  for (let mask = 0; mask < 1 << FINALE_STATS.length; mask++) {
    const set = FINALE_STATS.filter((_, i) => (mask & (1 << i)) !== 0);
    const cost = set.reduce((sum, s) => sum + Math.floor(guessedPlayer[s]) + 1, 0);
    if (cost > ALLOCATION_POOL) continue;
    // A touch of noise so equally good sets are not always broken the same way.
    const value = set.reduce((sum, s) => sum + weights[s], 0) + rng() * 0.01;
    if (value > best.value) best = { set, value, cost };
  }

  const out = emptyAllocation();
  for (const s of best.set) out[s] = Math.floor(guessedPlayer[s]) + 1;
  let left = ALLOCATION_POOL - best.cost;
  // What is left goes onto the judges it is already winning, the most valuable first.
  const winning = [...best.set].sort((a, b) => weights[b] - weights[a]);
  for (let i = 0; left > 0 && winning.length > 0; i = (i + 1) % winning.length) {
    out[winning[i]] += 1;
    left -= 1;
  }
  return sanitizeAllocation(out);
}

/** The rival's pick for a finale. `skill` is 0 to 1 (see `CASUAL_AI_SKILL`). */
export function chooseRivalFinale(input: {
  mode: FinaleMode;
  rivalStats: CornerFinalStats;
  playerStats: CornerFinalStats;
  skill: number;
  /** What each judge is worth in the Allocation game (the same weights the player was shown). */
  weights?: FinaleWeights;
  rng?: Rng;
}): FinaleChoice {
  const { mode, rivalStats, playerStats, skill } = input;
  const weights = input.weights ?? DEFAULT_ALLOCATION_WEIGHTS;
  const rng = input.rng ?? Math.random;
  if (mode === "timing") return { mode, accuracy: rivalTimingAccuracy(skill, rng), passes: rivalTimingPasses(skill, rng) };
  // The setup game ignores the cars' stats: everyone starts from the same base.
  if (mode === "allocation") return { mode, allocation: rivalAllocation(skill, weights, rng), weights };
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
    const weights = playerChoice.weights ?? DEFAULT_ALLOCATION_WEIGHTS;
    let playerPoints = 0;
    let rivalPoints = 0;
    const won: string[] = [];
    const lost: string[] = [];
    // Everyone starts from the same base, so only the allocations are compared (the cars' stats are not used).
    for (const s of FINALE_STATS) {
      const p = ALLOCATION_BASE + pa[s];
      const r = ALLOCATION_BASE + ra[s];
      if (p > r) {
        playerPoints += weights[s];
        won.push(`${FINALE_STAT_LABEL[s]} +${weights[s]}`);
      } else if (r > p) {
        rivalPoints += weights[s];
        lost.push(`${FINALE_STAT_LABEL[s]} +${weights[s]}`);
      }
    }
    playerPoints = capPoints(playerPoints);
    rivalPoints = capPoints(rivalPoints);
    const spread = (a: FinaleAllocation) => FINALE_STATS.map((s) => ALLOCATION_BASE + a[s]).join("/");
    return {
      mode: "allocation",
      playerPoints,
      rivalPoints,
      playerChoice: { mode: "allocation", allocation: pa, weights },
      rivalChoice: { mode: "allocation", allocation: ra, weights },
      summary: `Setup Allocation: you ${spread(pa)} v rival ${spread(ra)} (drift/accel/grip/steer). You won ${
        won.length > 0 ? won.join(", ") : "no judges"
      } (${signed(playerPoints)}); the rival won ${lost.length > 0 ? lost.join(", ") : "no judges"} (${signed(rivalPoints)})`,
    };
  }

  if (playerChoice.mode === "timing" && rivalChoice.mode === "timing") {
    const pAcc = clamp(playerChoice.accuracy, 0, 1);
    const rAcc = clamp(rivalChoice.accuracy, 0, 1);
    const pPasses = Math.max(0, Math.floor(playerChoice.passes));
    const rPasses = Math.max(0, Math.floor(rivalChoice.passes));
    const playerPoints = capPoints(pAcc * timingPointsAvailable(playerStats, pPasses));
    const rivalPoints = capPoints(rAcc * timingPointsAvailable(rivalStats, rPasses));
    return {
      mode: "timing",
      playerPoints,
      rivalPoints,
      playerChoice: { mode: "timing", accuracy: pAcc, passes: pPasses },
      rivalChoice: { mode: "timing", accuracy: rAcc, passes: rPasses },
      summary: `Perfect Drift: you landed ${Math.round(pAcc * 100)}% after ${pPasses} ${
        pPasses === 1 ? "pass" : "passes"
      } (${signed(playerPoints)}), the rival landed ${Math.round(rAcc * 100)}% after ${rPasses} (${signed(rivalPoints)})`,
    };
  }

  throw new Error("resolveFinale: both sides must play the same finale mode");
}

/** The corner's result with the finale's points added. Scores never drop below the engine's floor of 5. */
export function applyFinaleToResult(base: EvaluatedCornerResult, outcome: FinaleOutcome): EvaluatedCornerResult {
  const playerScore = Math.max(5, base.playerScore + outcome.playerPoints);
  const rivalScore = Math.max(5, base.rivalScore + outcome.rivalPoints);
  // Keep every number inspectable: the parts still add up to the score, and the breakdown text names the finale.
  const withFinale = (parts: CornerScoreParts | undefined, points: number, score: number, before: number) =>
    parts ? { ...parts, finalePts: points, floorAdjust: parts.floorAdjust + (score - (before + points)) } : parts;
  const text = (breakdown: string, points: number, score: number, before: number) => {
    const floor = score - (before + points);
    return `${breakdown}${points !== 0 ? ` ${points > 0 ? "+" : "-"} ${Math.abs(points)} Finale` : ""}${floor > 0 ? ` + ${floor} Min score` : ""}`;
  };
  return {
    ...base,
    playerScore,
    rivalScore,
    playerBreakdown: text(base.playerBreakdown, outcome.playerPoints, playerScore, base.playerScore),
    rivalBreakdown: text(base.rivalBreakdown, outcome.rivalPoints, rivalScore, base.rivalScore),
    playerScoreParts: withFinale(base.playerScoreParts, outcome.playerPoints, playerScore, base.playerScore),
    rivalScoreParts: withFinale(base.rivalScoreParts, outcome.rivalPoints, rivalScore, base.rivalScore),
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
