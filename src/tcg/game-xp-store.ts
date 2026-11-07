import { redis } from "@/lib/redis";
import { estimatedXpForPastGames } from "./game-xp";

/**
 * Where a driver's Drift XP total is kept: a field on their Clash stats hash, next to their wins and losses. Server only.
 * (The rules for how much XP a game is worth are in game-xp.ts.)
 */
const clashStatsKey = (userId: string) => `tcg:clash:stats:${userId}`;

/** Add XP to a driver's total and return the new total. The add is atomic, so two games finishing together both count. */
export async function addGameXp(userId: string, amount: number): Promise<number> {
  const add = Math.max(0, Math.round(amount) || 0);
  if (add === 0) return Math.max(0, Number(await redis.hget(clashStatsKey(userId), "gameXp")) || 0);
  return Number(await redis.hincrby(clashStatsKey(userId), "gameXp", add)) || add;
}

/**
 * One-time catch-up for a driver who played before Drift XP existed: gives them XP for the games on record (see
 * estimatedXpForPastGames). The marker is set first and only one caller can set it, so it happens once however many
 * requests, pages or scripts arrive together. XP already earned counts towards the amount instead of adding to it, so nobody
 * ends up with less. Pass the driver's current wins, losses and XP; returns their XP afterwards.
 */
export async function ensureGameXpBackfilled(
  userId: string,
  current: { wins: number; losses: number; gameXp: number; alreadyDone?: boolean }
): Promise<number> {
  if (current.alreadyDone) return current.gameXp;
  const first = await redis.hsetnx(clashStatsKey(userId), "gameXpBackfilled", Date.now());
  if (!first) return Math.max(0, Number(await redis.hget(clashStatsKey(userId), "gameXp")) || 0);
  const missing = Math.max(0, estimatedXpForPastGames(current.wins, current.losses) - current.gameXp);
  return missing > 0 ? addGameXp(userId, missing) : current.gameXp;
}

/**
 * Count one more tournament (Drift Campaign cup) won by a driver, for the Hall of Fame. Kept next to the wins and Drift XP.
 * The add is atomic. The caller makes sure it is only called once per cup. Returns the new total.
 */
export async function addCupWon(userId: string): Promise<number> {
  return Number(await redis.hincrby(clashStatsKey(userId), "cupsWon", 1)) || 1;
}
