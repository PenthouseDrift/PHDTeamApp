/**
 * Gives Drift XP to every driver who played a Clash battle before Drift XP existed, using the wins and losses on record
 * (an estimate, see estimatedXpForPastGames in src/tcg/game-xp.ts). It is the same one-time catch-up the game does the first
 * time a driver's stats are read, run for everyone at once. Safe to run twice: each driver is only caught up once, and XP
 * they already have counts towards their amount rather than adding to it.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-game-xp.ts            show what would change (changes nothing)
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-game-xp.ts --apply    do it
 *
 * Uses the database named in .env.local.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const PREFIX = "tcg:clash:stats:";

async function main() {
  const apply = process.argv.includes("--apply");
  // Imported after the env file is read, because the Redis client reads its address when it is first loaded.
  const { redis } = await import("@/lib/redis");
  const { ensureGameXpBackfilled } = await import("@/tcg/game-xp-store");
  const { estimatedXpForPastGames, getGameXpProgress } = await import("@/tcg/game-xp");

  let host = "(unknown)";
  try {
    host = new URL(process.env.UPSTASH_REDIS_REST_URL ?? "").host;
  } catch {
    /* leave as unknown */
  }
  console.log(`${apply ? "APPLYING" : "Dry run"} against ${host}\n`);

  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const [next, found] = (await redis.scan(cursor, { match: `${PREFIX}*`, count: 500 })) as [string | number, string[]];
    keys.push(...found);
    cursor = next;
  } while (String(cursor) !== "0");

  let played = 0;
  let changed = 0;
  let alreadyDone = 0;
  let totalGiven = 0;
  const rows: string[] = [];

  for (const key of keys) {
    const userId = key.slice(PREFIX.length);
    const raw = (await redis.hgetall<Record<string, unknown>>(key)) ?? {};
    const wins = Math.max(0, Number(raw.wins) || 0);
    const losses = Math.max(0, Number(raw.losses) || 0);
    const current = Math.max(0, Number(raw.gameXp) || 0);
    if (wins + losses === 0) continue;
    played++;
    if (raw.gameXpBackfilled) {
      alreadyDone++;
      continue;
    }
    const target = Math.max(current, estimatedXpForPastGames(wins, losses));
    const given = target - current;
    totalGiven += given;
    if (given > 0) changed++;
    rows.push(
      `${userId.slice(0, 12).padEnd(12)}  ${String(wins).padStart(4)}W ${String(losses).padStart(4)}L   ${String(current).padStart(6)} -> ${String(target).padStart(6)} XP   (+${given})  Drift Lv ${getGameXpProgress(target).level}`
    );
    if (apply) await ensureGameXpBackfilled(userId, { wins, losses, gameXp: current });
  }

  console.log(rows.join("\n") || "(nothing to do)");
  console.log(
    `\n${keys.length} stats records, ${played} drivers have played a battle, ${alreadyDone} already caught up.` +
      `\n${apply ? "Caught up" : "Would catch up"} ${rows.length} drivers (${changed} gaining XP), ${totalGiven.toLocaleString()} XP in total.`
  );
  if (!apply && rows.length > 0) console.log("Run again with --apply to do it.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
