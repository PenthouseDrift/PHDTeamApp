/**
 * Drift XP: the experience a driver earns by playing games. It is separate from the collector level in progression.ts,
 * which comes from the cards a member owns.
 *
 * Pure, so the server (which pays it out) and the screens (which show it) use the same rules.
 *
 *  - Every game gives XP. A win gives a base amount plus more for the margin: how far the player's points total finished
 *    ahead of the opponent's. A loss gives a small amount just for playing.
 *  - Winning all three corners (a clean sweep) gives a bonus.
 *  - Winning a challenge gives a bonus for its tier (the card rarity it is for). Like the prize, it is paid once a day
 *    per challenge.
 *  - In the Drift Campaign every round won gives a bonus that grows with the round.
 *
 * The points and corners come from the player's own game (the server never sees the battle), so the amounts are capped.
 */

/** XP for any win, before the margin. */
export const WIN_BASE_XP = 10;
/** One extra XP for every this many points of margin... */
export const MARGIN_POINTS_PER_XP = 5;
/** ...up to this much, so one lopsided game can't be worth a lot. */
export const MARGIN_XP_CAP = 40;
/** XP for playing a game you lost. */
export const LOSS_XP = 3;
/** Bonus for winning all three corners. */
export const CLEAN_SWEEP_XP = 15;
/** Bonus for winning a challenge, by the rarity tier it is for. "any" covers challenges that are open to every card. */
export const CHALLENGE_TIER_XP: Record<string, number> = { any: 15, bronze: 10, silver: 20, gold: 35, legend: 60, mythic: 100 };
/** Bonus for winning a campaign round: this much per round number, plus the base. Round 1 is worth 25 and round 6 is worth 100. */
export const CAMPAIGN_ROUND_BASE_XP = 10;
export const CAMPAIGN_ROUND_XP_PER_ROUND = 15;

/**
 * Past games were played before Drift XP existed, and only the win and loss counts were kept (not the points, sweeps,
 * challenges or rounds). So they are paid at an average: a win at the base plus a typical margin, a loss at the loss rate.
 */
export const PAST_WIN_XP = WIN_BASE_XP + 5;
export const PAST_LOSS_XP = LOSS_XP;

/** XP to give a driver for the games they had already played. An estimate, since the detail of those games wasn't kept. */
export function estimatedXpForPastGames(wins: number, losses: number): number {
  return Math.max(0, Math.round(wins)) * PAST_WIN_XP + Math.max(0, Math.round(losses)) * PAST_LOSS_XP;
}

/** XP needed for each level grows with the square of the level: level N starts at LEVEL_XP * (N - 1)^2. */
export const LEVEL_XP = 100;

/** A game's points can't be more than this per side (three corners), so a made-up total can't pay more than it should. */
const MAX_GAME_POINTS = 600;

export interface GameXpBreakdown {
  /** Base XP for the game plus the margin bonus (or the small XP for a loss). */
  match: number;
  /** The clean sweep bonus. */
  sweep: number;
  /** The challenge tier bonus. */
  challenge: number;
  /** The campaign round bonus. */
  round: number;
  total: number;
}

const clampPoints = (n: unknown) => Math.max(0, Math.min(MAX_GAME_POINTS, Math.round(Number(n) || 0)));

/** The XP for one finished game, from its result and totals. */
export function gameXpFor(input: {
  won: boolean;
  playerTotal?: number;
  opponentTotal?: number;
  playerCorners?: number;
  /** A challenge win's rarity tier, when it earned the challenge bonus. */
  challengeTier?: string | null;
  /** The campaign round just won (1 to 6), when the game was a campaign round. */
  campaignRound?: number | null;
}): GameXpBreakdown {
  const margin = Math.max(0, clampPoints(input.playerTotal) - clampPoints(input.opponentTotal));
  const match = input.won ? WIN_BASE_XP + Math.min(MARGIN_XP_CAP, Math.floor(margin / MARGIN_POINTS_PER_XP)) : LOSS_XP;
  const sweep = input.won && Math.trunc(Number(input.playerCorners) || 0) >= 3 ? CLEAN_SWEEP_XP : 0;
  const challenge = input.won && input.challengeTier ? (CHALLENGE_TIER_XP[input.challengeTier] ?? CHALLENGE_TIER_XP.any) : 0;
  const round =
    input.won && input.campaignRound && input.campaignRound > 0
      ? CAMPAIGN_ROUND_BASE_XP + CAMPAIGN_ROUND_XP_PER_ROUND * Math.min(6, Math.trunc(input.campaignRound))
      : 0;
  return { match, sweep, challenge, round, total: match + sweep + challenge + round };
}

export interface GameXpProgress {
  level: number;
  xp: number;
  /** XP earned inside this level, and how much the level needs, for a progress bar. */
  intoLevel: number;
  forLevel: number;
  progressPct: number;
}

/** A driver's Drift level and how far through it they are. */
export function getGameXpProgress(xp: number): GameXpProgress {
  const total = Math.max(0, Math.round(Number(xp) || 0));
  const level = Math.floor(Math.sqrt(total / LEVEL_XP)) + 1;
  const floor = LEVEL_XP * (level - 1) ** 2;
  const next = LEVEL_XP * level ** 2;
  const forLevel = Math.max(1, next - floor);
  const intoLevel = total - floor;
  return { level, xp: total, intoLevel, forLevel, progressPct: Math.min(100, Math.max(0, Math.round((intoLevel / forLevel) * 100))) };
}
