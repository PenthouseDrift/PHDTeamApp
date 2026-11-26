import { redis } from "@/lib/redis";
import { isCrewCard } from "@/lib/crew-cards";
import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { memberCardKey, memberCardsIndexKey, parseStoredCard } from "@/lib/member-card-store";
import { getMemberIds } from "@/lib/member-roster";
import { getGameXpProgress } from "./game-xp";
import { getCardPower, getCollectorProgressFromTotals } from "./progression";
import type { DriftClashLeaderboardEntry } from "./types";

/**
 * The Hall of Fame, built so it costs the same however many members and cards there are. Server only.
 *
 * It used to read the newest 1,000 cards in the game on every rebuild and add them up, which got more expensive (and less
 * correct, once there were more than 1,000 cards) with every pack opened. Now each member's cards are added up ONCE, into a
 * small summary, and the board is read from sorted lists:
 *
 *   tcg:lb:m:<userId>     the member's summary: cards, how many of each rarity, power, best car, plus a signature
 *   tcg:lb:z:<ranking>    one sorted list per way the board can be ordered: power, rarity, wins, cups, xp
 *   tcg:lb:dirty          members whose cards have changed and whose summary needs adding up again
 *
 * Reading the board is five "top N" reads plus three small reads for each driver on it (at most about 3 x 125 commands), whatever
 * the size of the game. Writing is one set-add when someone's cards change; the adding up happens later, in small batches,
 * when the board is next rebuilt. Anything that was missed is caught by the member's own page load (syncSnapshotFromCards) and by
 * the daily sweep (reconcileAll), so the board repairs itself.
 */

import { LB_DIRTY_KEY } from "./leaderboard-keys";
export { LB_DIRTY_KEY };
const READY_KEY = "tcg:lb:ready";
const ENQUEUED_KEY = "tcg:lb:enqueued";
const LOCK_KEY = "tcg:lb:lock";
const snapKey = (userId: string) => `tcg:lb:m:${userId}`;
const memberKey = (userId: string) => `member:${userId}`;
const clashStatsKey = (userId: string) => `tcg:clash:stats:${userId}`;
const Z = {
  power: "tcg:lb:z:power",
  rarity: "tcg:lb:z:rarity",
  wins: "tcg:lb:z:wins",
  cups: "tcg:lb:z:cups",
  xp: "tcg:lb:z:xp",
} as const;

// ── Adding up a member's cards ──────────────────────────────────────────────

export interface CardAggregate {
  /** Cards in the collection (re-rolled-away cards are not in it). */
  totalCards: number;
  tiers: Record<FullArtTier, number>;
  power: number;
  /** Cards that are not bonus cards. Only a floor for "packs opened" for members who opened packs before it was counted. */
  primaryCards: number;
  /** The most powerful car, for the board. */
  top: { carName: string; tier: FullArtTier; imageUrl: string } | null;
}

type AggregatableCard = Pick<MemberCard, "tier" | "stats" | "cardType" | "crewCardId" | "name" | "imageUrl" | "bonus" | "archived">;

/** A real car card: not a Crew card, a Repair Kit, a debuff or a track card. */
const isPlainCar = (card: Pick<MemberCard, "cardType" | "crewCardId" | "name">) => !card.cardType && !card.crewCardId && !isCrewCard(card);

export function aggregateCards(cards: AggregatableCard[]): CardAggregate {
  const tiers: Record<FullArtTier, number> = { bronze: 0, silver: 0, gold: 0, legend: 0, mythic: 0 };
  let power = 0;
  let totalCards = 0;
  let primaryCards = 0;
  let bestCar: { card: AggregatableCard; power: number } | null = null;
  let bestAny: { card: AggregatableCard; power: number } | null = null;
  for (const card of cards) {
    // Only active cards count towards the collection.
    if (card.archived) continue;
    totalCards++;
    if (!card.bonus) primaryCards++;
    tiers[card.tier] = (tiers[card.tier] ?? 0) + 1;
    const p = getCardPower(card);
    power += p;
    if (!bestAny || p > bestAny.power) bestAny = { card, power: p };
    if (isPlainCar(card) && (!bestCar || p > bestCar.power)) bestCar = { card, power: p };
  }
  const best = bestCar ?? bestAny;
  return {
    totalCards,
    tiers,
    power: Math.round(power),
    primaryCards,
    top: best ? { carName: best.card.name, tier: best.card.tier, imageUrl: best.card.imageUrl } : null,
  };
}

/** Something that changes whenever the numbers on the board for these cards would. */
const signatureOf = (a: CardAggregate) => `c${a.totalCards}p${a.power}m${a.tiers.mythic}l${a.tiers.legend}g${a.tiers.gold}s${a.tiers.silver}n${a.primaryCards}`;

// The scores put a driver's main number first and the tie-breakers after it, so one sorted list answers "who is top".
const powerScore = (a: CardAggregate) => a.power * 100_000 + Math.min(a.totalCards, 99_999);
const rarityScore = (a: CardAggregate) => a.tiers.mythic * 1e10 + a.tiers.legend * 1e5 + Math.min(a.tiers.gold, 99_999);

// ── Writing ─────────────────────────────────────────────────────────────────

/** Store a member's summary and put them in the power and rarity lists. A member with no cards is not on the board. */
async function writeAggregate(userId: string, a: CardAggregate): Promise<void> {
  const p = redis.pipeline();
  if (a.totalCards === 0) {
    p.del(snapKey(userId)).zrem(Z.power, userId).zrem(Z.rarity, userId);
    await p.exec();
    return;
  }
  p.hset(snapKey(userId), {
    n: a.totalCards,
    b: a.tiers.bronze,
    s: a.tiers.silver,
    g: a.tiers.gold,
    l: a.tiers.legend,
    m: a.tiers.mythic,
    pw: a.power,
    np: a.primaryCards,
    top: JSON.stringify(a.top),
    sig: signatureOf(a),
    at: Date.now(),
  });
  p.zadd(Z.power, { score: powerScore(a), member: userId });
  if (a.tiers.mythic + a.tiers.legend > 0) p.zadd(Z.rarity, { score: rarityScore(a), member: userId });
  else p.zrem(Z.rarity, userId);
  await p.exec();
}

/** Put a member in a sorted list with this score, or take them out when it is 0 (they have nothing to rank on). */
async function setScore(key: string, userId: string, value: number): Promise<void> {
  const v = Math.max(0, Math.trunc(Number(value) || 0));
  if (v > 0) await redis.zadd(key, { score: v, member: userId });
  else await redis.zrem(key, userId);
}

/** Drift XP changed. Never throws: a problem here must not stop a game from finishing. */
export async function lbSetXp(userId: string, xp: number): Promise<void> {
  try {
    await setScore(Z.xp, userId, xp);
  } catch (error) {
    console.error("[leaderboard] could not update XP:", error);
  }
}

/** Clash wins changed. */
export async function lbSetWins(userId: string, wins: number): Promise<void> {
  try {
    await setScore(Z.wins, userId, wins);
  } catch (error) {
    console.error("[leaderboard] could not update wins:", error);
  }
}

/** Campaign cups won changed. */
export async function lbSetCups(userId: string, cups: number): Promise<void> {
  try {
    await setScore(Z.cups, userId, cups);
  } catch (error) {
    console.error("[leaderboard] could not update cups:", error);
  }
}

/** Say that these members' cards have changed. One cheap write; the adding up is done later, in batches. Never throws. */
export async function markLeaderboardDirty(...userIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  try {
    await redis.sadd(LB_DIRTY_KEY, ...(ids as [string, ...string[]]));
  } catch (error) {
    console.error("[leaderboard] could not mark members changed:", error);
  }
}

/** Wins, cups and XP from the member's Clash stats into their lists. */
async function refreshProgress(userId: string): Promise<void> {
  const row = await redis.hmget<Record<string, unknown>>(clashStatsKey(userId), "wins", "cupsWon", "gameXp");
  await Promise.all([
    setScore(Z.wins, userId, Number(row?.wins) || 0),
    setScore(Z.cups, userId, Number(row?.cupsWon) || 0),
    setScore(Z.xp, userId, Number(row?.gameXp) || 0),
  ]);
}

/** Add a member's cards up from scratch: reads their own cards and nobody else's. */
export async function recomputeMember(userId: string): Promise<CardAggregate> {
  const ids = ((await redis.zrange(memberCardsIndexKey(userId), 0, -1)) as string[]) ?? [];
  const cards: AggregatableCard[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await redis.mget(...ids.slice(i, i + 200).map((id) => memberCardKey(String(id))));
    for (const row of rows) {
      const card = parseStoredCard(row);
      if (card) cards.push(card);
    }
  }
  const aggregate = aggregateCards(cards);
  await writeAggregate(userId, aggregate);
  await refreshProgress(userId);
  return aggregate;
}

/**
 * The member's own page load has their cards in hand already, so keep their summary right for free: one read to compare, and
 * a write only if something changed. This is what makes the board repair itself for anyone who plays.
 */
export async function syncSnapshotFromCards(userId: string, cards: AggregatableCard[]): Promise<boolean> {
  const aggregate = aggregateCards(cards);
  const have = await redis.hget(snapKey(userId), "sig");
  if (have !== null && String(have) === signatureOf(aggregate)) return false;
  await writeAggregate(userId, aggregate);
  // A member the board has not seen before also needs their wins and XP put in.
  if (have === null) await refreshProgress(userId);
  return true;
}

/** Add up members whose cards changed, a few at a time, within a time limit. Returns how many were done. */
export async function processDirty(max: number, budgetMs: number): Promise<number> {
  const started = Date.now();
  let done = 0;
  while (done < max && Date.now() - started < budgetMs) {
    const take = Math.min(10, max - done);
    const popped = (await redis.spop(LB_DIRTY_KEY, take)) as unknown;
    const ids = Array.isArray(popped) ? popped.map(String) : popped ? [String(popped)] : [];
    if (ids.length === 0) break;
    await Promise.all(
      ids.map(async (id) => {
        try {
          await recomputeMember(id);
        } catch (error) {
          console.error("[leaderboard] could not add up a member, will retry:", error);
          await redis.sadd(LB_DIRTY_KEY, id).catch(() => 0);
        }
      })
    );
    done += ids.length;
  }
  return done;
}

/**
 * Check every member against the board: queue them all (once, unless `enqueue` asks to start again), then add up as many as the
 * time allows. Run daily by a cron job, and once the first time the board is read. Returns how many are still waiting.
 */
export async function reconcileAll(options: { budgetMs: number; enqueue?: boolean }): Promise<number> {
  if (options.enqueue || !(await redis.get(ENQUEUED_KEY))) {
    const all = await getMemberIds();
    for (let i = 0; i < all.length; i += 500) {
      await redis.sadd(LB_DIRTY_KEY, ...(all.slice(i, i + 500) as [string, ...string[]]));
    }
    await redis.set(ENQUEUED_KEY, "1");
  }
  await processDirty(Number.MAX_SAFE_INTEGER, options.budgetMs);
  return Number(await redis.scard(LB_DIRTY_KEY)) || 0;
}

/** The first time the board is read, add up every member once. Only one request does it; the rest carry on without waiting. */
async function ensureReady(): Promise<void> {
  if (await redis.get(READY_KEY)) return;
  const got = await redis.set(LOCK_KEY, "1", { nx: true, ex: 120 });
  if (!got) return;
  try {
    const left = await reconcileAll({ budgetMs: 25_000 });
    if (left === 0) await redis.set(READY_KEY, "1");
  } finally {
    await redis.del(LOCK_KEY).catch(() => 0);
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

const toNum = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));

/** A driver's level, rank and the numbers that change as they play, from the totals on their row. */
export function withProgress(entry: DriftClashLeaderboardEntry, packsOpened: number, clashWins: number, driftXp: number): DriftClashLeaderboardEntry {
  const progress = getCollectorProgressFromTotals(
    { totalPower: entry.collectorPower, tierCounts: { bronze: 0, silver: 0, gold: 0, legend: 0, mythic: 0 } },
    clashWins,
    packsOpened
  );
  return {
    ...entry,
    packsOpened,
    clashWins,
    driftXp,
    driftLevel: getGameXpProgress(driftXp).level,
    level: progress.level,
    rankTitle: progress.rankTitle,
    rankIcon: progress.rankIcon,
  };
}

/** Put the viewer's own row right up to date (two small reads), whatever age the kept board is. */
export async function freshenViewerRow(entries: DriftClashLeaderboardEntry[], viewerId: string): Promise<DriftClashLeaderboardEntry[]> {
  const index = entries.findIndex((e) => e.userId === viewerId);
  if (index < 0) return entries;
  try {
    const [member, clash] = await Promise.all([
      redis.hmget<Record<string, unknown>>(memberKey(viewerId), "packsOpened"),
      redis.hmget<Record<string, unknown>>(clashStatsKey(viewerId), "wins", "gameXp"),
    ]);
    const next = [...entries];
    const e = entries[index];
    next[index] = withProgress(e, Math.max(toNum(member?.packsOpened), 0), toNum(clash?.wins), toNum(clash?.gameXp));
    return next;
  } catch {
    return entries;
  }
}

/**
 * Build the board: the top `limit` drivers of each of the five ways it can be ordered (a driver with little power can still lead
 * on XP), then each driver's details. `backfillXp` lets the caller catch up Drift XP for a driver who played before it existed.
 */
export async function buildLeaderboard(
  limit: number,
  options: { backfillXp?: (userId: string, current: { wins: number; losses: number; gameXp: number; alreadyDone: boolean }) => Promise<number> } = {}
): Promise<DriftClashLeaderboardEntry[]> {
  await ensureReady();
  // Members whose cards changed since the last build are added up now (a bounded batch, so one build can't run away).
  await processDirty(60, 8_000);

  const lists = (await Promise.all(Object.values(Z).map((key) => redis.zrange(key, 0, limit - 1, { rev: true })))) as string[][];
  const userIds = [...new Set(lists.flat().map(String))];
  if (userIds.length === 0) return [];

  const p = redis.pipeline();
  for (const id of userIds) {
    p.hgetall(snapKey(id));
    p.hmget(memberKey(id), "nickname", "name", "customAvatar", "image", "packsOpened");
    p.hmget(clashStatsKey(id), "wins", "losses", "gameXp", "gameXpBackfilled", "cupsWon");
  }
  const rows = (await p.exec()) as Array<Record<string, unknown> | null>;

  const entries: DriftClashLeaderboardEntry[] = [];
  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    const snap = rows[i * 3];
    const member = rows[i * 3 + 1];
    const clash = rows[i * 3 + 2];
    // No summary means no cards (or one not added up yet): not on the board.
    if (!snap || toNum(snap.n) === 0) continue;

    const nickname = typeof member?.nickname === "string" ? member.nickname.trim() : "";
    const fullName = typeof member?.name === "string" ? member.name.trim() : "";
    const customAvatar = typeof member?.customAvatar === "string" && member.customAvatar ? member.customAvatar : null;
    const oauthImage = typeof member?.image === "string" && member.image ? member.image : null;

    const wins = toNum(clash?.wins);
    let driftXp = toNum(clash?.gameXp);
    if (options.backfillXp && !clash?.gameXpBackfilled) {
      try {
        driftXp = await options.backfillXp(uid, { wins, losses: toNum(clash?.losses), gameXp: driftXp, alreadyDone: false });
      } catch (error) {
        console.error("[leaderboard] Drift XP catch-up failed:", error);
      }
    }

    let top: DriftClashLeaderboardEntry["topCard"] = null;
    try {
      const raw = typeof snap.top === "string" ? JSON.parse(snap.top) : snap.top;
      if (raw && typeof raw === "object") top = raw as DriftClashLeaderboardEntry["topCard"];
    } catch {
      top = null;
    }

    // The count kept on the member is the real number of packs opened. The summary's card count is only a floor, for members
    // who opened packs before it was kept.
    const packsOpened = Math.max(toNum(member?.packsOpened), toNum(snap.np));

    const base: DriftClashLeaderboardEntry = {
      userId: uid,
      driverName: nickname || fullName || "PHD Driver",
      avatarUrl: customAvatar || oauthImage,
      totalCards: toNum(snap.n),
      mythicCount: toNum(snap.m),
      legendCount: toNum(snap.l),
      goldCount: toNum(snap.g),
      collectorPower: toNum(snap.pw),
      level: 1,
      rankTitle: "",
      rankIcon: "",
      packsOpened,
      clashWins: wins,
      driftXp,
      driftLevel: 1,
      cupsWon: toNum(clash?.cupsWon),
      topCard: top,
    };
    entries.push(withProgress(base, packsOpened, wins, driftXp));
  }

  // Most powerful first, like the board has always been.
  return entries.sort((a, b) => b.collectorPower - a.collectorPower || b.mythicCount - a.mythicCount || b.totalCards - a.totalCards);
}
