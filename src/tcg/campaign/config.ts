/**
 * Drift Campaign settings. One place for every number, so the cup can be re-tuned without touching the logic.
 *
 * The campaign is a six-round knockout cup. Each round the player must beat one driver to stay in. A loss ends the run.
 * Every opponent is built (and checked by simulation) at the start of the run so that a typical player wins the round
 * about as often as that round's target win chance says (see targets.ts).
 */

export interface CampaignRoundSpec {
  round: number;
  /** Shown on the bracket. */
  name: string;
  short: string;
  icon: string;
}

export const CAMPAIGN_ROUNDS: CampaignRoundSpec[] = [
  { round: 1, name: "Round of 64", short: "R64", icon: "🚗" },
  { round: 2, name: "Round of 32", short: "R32", icon: "🏁" },
  { round: 3, name: "Round of 16", short: "R16", icon: "🔥" },
  { round: 4, name: "Quarter-Final", short: "QF", icon: "⚡" },
  { round: 5, name: "Semi-Final", short: "SF", icon: "💎" },
  { round: 6, name: "The Final: Champion", short: "Final", icon: "👑" },
];

/** The player picks this many cars from their own deck and keeps them for the whole cup. */
export const CARS_TO_PICK = 3;
/** How many random cars from the player's deck are dealt for them to choose those three from. */
export const OFFER_SIZE = 6;
/**
 * A member needs at least this many bronze car cards to enter the cup. It keeps the deck from being emptied of
 * everything but a few good cars before entering.
 */
export const MIN_BRONZE_CARS = 6;
/**
 * How likely each rarity is for each of the six dealt slots, as relative weights (bronze, silver, gold, legend; Mythic
 * counts as legend). Each slot rolls its rarity first, then takes a car of that rarity from the member's deck. Where the
 * deck has no car of that rarity left, the next best rarity is used instead (see deal.ts).
 */
export const OFFER_TIER_WEIGHTS = [40, 30, 20, 10] as const;
/**
 * Extra deals of six a member gets, on top of the first. They are stored on the member's campaign profile, not on a cup, so
 * reloading or leaving the picker does not refill them. They refill when a cup ends, however it ends (won, lost,
 * withdrawn), since every cup is a new entry.
 */
export const REROLLS_PER_CUP = 3;

/** How many cars each rival brings to choose its three from. */
export const RIVAL_POOL_SIZE = 6;

/**
 * Rival strength ladder points used to measure the player's win-rate curve. 0 is a pushover, 1.25 is as strong as a
 * rival can be made (see `rivalAt` in generate.ts).
 */
export const STRENGTH_GRID = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.12, 1.25];

/**
 * Battles simulated per grid point, per refinement step and for the final check. More is steadier but slower.
 *
 * These cost server CPU (starting a cup builds six rivals this way, and Vercel bills the time). They were cut from the first
 * values (160 / 240 / 2 steps / 100 probes, accept within 4): a cup start dropped from about 15 s to about 6 s of CPU in
 * scripts/simulate-campaign.ts, and rounds land on average 5.6 points from their target win rate instead of 4.4.
 * Raise them for tighter difficulty at more cost; run that script to see both numbers.
 */
export const GRID_BATTLES = 80;
export const REFINE_BATTLES = 160;
export const REFINE_STEPS = 1;

/** Battles per probe when a showcase roster is checked: can it be beaten as often as the round needs? */
export const SHOWCASE_PROBE_BATTLES = 50;
/** A showcase roster is used only if its best refined version lands within this many points of the target. */
export const SHOWCASE_ACCEPT_WITHIN_PCT = 9;

/** A refined rival is accepted when its simulated win rate is within this many percentage points of the target. */
export const ACCEPT_WITHIN_PCT = 5;

/** A run that has not moved for this long is dropped from Redis. */
export const RUN_TTL_SECONDS = 60 * 60 * 24 * 3;

/**
 * Entry fees in P-Credits. A member picks one when they start a cup. Admins can also enter a free "test" cup that pays no
 * prize (for trying the mode out).
 */
export const ENTRY_FEES = [50, 100, 200];

/**
 * The prize as a multiple of the entry fee, by how many rounds were won (index 0 = none, 6 = the whole cup). The prize is
 * paid when the cup ends, however it ends, so losing never costs more than the entry and stopping early is never better
 * than playing on. With the win chances of 80/70/60/50/30/20% a typical player gets back about 94% of the fee on average;
 * change these numbers to change the economy.
 */
export const PRIZE_MULTIPLIERS = [0, 0.25, 0.5, 1, 2, 4, 20];

/** The prize in P-Credits for winning `wins` rounds on an entry of `fee`. */
export function prizeFor(fee: number, wins: number): number {
  const w = Math.min(PRIZE_MULTIPLIERS.length - 1, Math.max(0, Math.trunc(wins)));
  return Math.round(Math.max(0, fee) * PRIZE_MULTIPLIERS[w]);
}
