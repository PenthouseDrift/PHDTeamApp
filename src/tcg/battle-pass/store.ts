import { redis } from "@/lib/redis";
import { grantCardCredits } from "@/lib/card-credits";
import { grantPCredits } from "@/tcg/storage";
import {
  buildBattlePassView,
  defaultBattlePassConfig,
  sanitizeBattlePassConfig,
  ukMonthKey,
  type BattlePassConfig,
  type BattlePassRewardKind,
  type BattlePassView,
  type OpenedGift,
} from "./config";

/**
 * Redis access for the Battle Pass. Plain functions (no "use server"), used by actions.ts and the XP code.
 *
 * Keys (prefix tcg:bp:):
 *   config                  the admin's ladder (JSON)             config:log   change log (list)
 *   <YYYY-MM>:<userId>      hash: `xp` earned that month, and `o:<stepId>` = the gift opened for that step (JSON)
 *   stats:<YYYY-MM>         hash of what was paid that month: opens, pcredits, packcredits
 * A new month is a new key, so there is nothing to reset and nothing to clean up by hand. Old months expire by themselves.
 */

const K = {
  config: "tcg:bp:config",
  configLog: "tcg:bp:config:log",
  member: (month: string, userId: string) => `tcg:bp:${month}:${userId}`,
  stats: (month: string) => `tcg:bp:stats:${month}`,
};

/** About four months: long enough to look back at, short enough that old months tidy themselves away. */
const TTL_SECONDS = 120 * 86400;

export async function loadBattlePassConfig(): Promise<BattlePassConfig> {
  try {
    const raw = await redis.get(K.config);
    if (!raw) return defaultBattlePassConfig();
    return sanitizeBattlePassConfig(raw);
  } catch (error) {
    console.error("[battle-pass] could not read the config, using the default:", error);
    return defaultBattlePassConfig();
  }
}

export async function saveBattlePassConfig(input: unknown, adminId: string): Promise<BattlePassConfig> {
  const before = await loadBattlePassConfig();
  const next = { ...sanitizeBattlePassConfig(input), updatedAt: Date.now() };
  await redis.set(K.config, JSON.stringify(next));
  await redis.lpush(K.configLog, JSON.stringify({ at: Date.now(), by: adminId, before, after: next }));
  await redis.ltrim(K.configLog, 0, 49);
  return next;
}

export interface BattlePassLogEntry {
  at: number;
  by: string;
}

export async function loadBattlePassLog(limit = 10): Promise<BattlePassLogEntry[]> {
  try {
    const rows = (await redis.lrange(K.configLog, 0, limit - 1)) ?? [];
    return rows
      .map((r) => {
        try {
          const v = typeof r === "string" ? JSON.parse(r) : r;
          return { at: Number(v?.at) || 0, by: String(v?.by ?? "") };
        } catch {
          return null;
        }
      })
      .filter((r): r is BattlePassLogEntry => r !== null && r.at > 0);
  } catch {
    return [];
  }
}

/**
 * Count XP towards this month's pass. Called every time Drift XP is earned. It never throws: a problem here must not stop a
 * game from finishing or its XP from being paid.
 */
export async function addBattlePassXp(userId: string, amount: number, now: Date = new Date()): Promise<void> {
  const add = Math.max(0, Math.round(amount) || 0);
  if (add === 0 || !userId) return;
  try {
    const key = K.member(ukMonthKey(now), userId);
    await redis.hincrby(key, "xp", add);
    await redis.expire(key, TTL_SECONDS);
  } catch (error) {
    console.error("[battle-pass] could not add monthly XP:", error);
  }
}

/** This month's XP and the gifts already opened for a member. */
export async function loadMemberMonth(userId: string, now: Date = new Date()): Promise<{ xp: number; opened: Record<string, OpenedGift> }> {
  const empty = { xp: 0, opened: {} as Record<string, OpenedGift> };
  try {
    const row = (await redis.hgetall(K.member(ukMonthKey(now), userId))) as Record<string, unknown> | null;
    if (!row) return empty;
    const opened: Record<string, OpenedGift> = {};
    for (const [field, value] of Object.entries(row)) {
      if (!field.startsWith("o:")) continue;
      try {
        const v = (typeof value === "string" ? JSON.parse(value) : value) as Partial<OpenedGift> | null;
        if (v && (v.kind === "pcredits" || v.kind === "packcredits")) {
          opened[field.slice(2)] = { kind: v.kind, amount: Math.max(0, Number(v.amount) || 0), at: Number(v.at) || 0 };
        }
      } catch {
        /* skip a record that can't be read */
      }
    }
    return { xp: Math.max(0, Number(row.xp) || 0), opened };
  } catch (error) {
    console.error("[battle-pass] could not read the member's month:", error);
    return empty;
  }
}

export async function loadBattlePassView(userId: string, now: Date = new Date()): Promise<BattlePassView> {
  const [config, month] = await Promise.all([loadBattlePassConfig(), loadMemberMonth(userId, now)]);
  return buildBattlePassView(config, month.xp, month.opened, now);
}

/** How many gifts a member has waiting, for the badge on the tab. 0 when the pass is switched off. */
export async function loadReadyCount(userId: string, now: Date = new Date()): Promise<number> {
  try {
    const view = await loadBattlePassView(userId, now);
    return view.enabled ? view.readyCount : 0;
  } catch {
    return 0;
  }
}

export type OpenResult =
  | { ok: true; reward: { kind: BattlePassRewardKind; amount: number }; secret: boolean }
  | { ok: false; error: string };

/**
 * Open one gift. The gift is marked opened FIRST, and only one request can do that (the first to set the mark), so a double
 * tap, two tabs or two devices pay it once. If paying then fails, the mark is taken off again so the gift can be opened later.
 */
export async function openGift(userId: string, tierId: string, now: Date = new Date()): Promise<OpenResult> {
  const config = await loadBattlePassConfig();
  if (!config.enabled) return { ok: false, error: "The Battle Pass isn't open right now." };
  const tier = config.tiers.find((t) => t.id === tierId);
  if (!tier) return { ok: false, error: "That gift is no longer on the Battle Pass." };

  const month = ukMonthKey(now);
  const key = K.member(month, userId);
  const xp = Math.max(0, Number(await redis.hget(key, "xp")) || 0);
  if (xp < tier.xp) return { ok: false, error: "You haven't reached that gift yet." };

  const field = `o:${tier.id}`;
  const gift: OpenedGift = { kind: tier.kind, amount: tier.amount, at: now.getTime() };
  const first = await redis.hsetnx(key, field, JSON.stringify(gift));
  if (!first) return { ok: false, error: "You've already opened that gift." };

  try {
    if (tier.kind === "pcredits") await grantPCredits(userId, tier.amount);
    else await grantCardCredits(userId, tier.amount);
  } catch (error) {
    await redis.hdel(key, field).catch(() => {});
    console.error("[battle-pass] paying a gift failed, so it was put back:", error);
    return { ok: false, error: "That gift couldn't be paid just now. Please try again." };
  }

  await redis.expire(key, TTL_SECONDS).catch(() => {});
  try {
    const stats = K.stats(month);
    await redis.hincrby(stats, "opens", 1);
    await redis.hincrby(stats, tier.kind, tier.amount);
    await redis.expire(stats, TTL_SECONDS);
  } catch {
    /* the counters are only for the admin page */
  }
  return { ok: true, reward: { kind: tier.kind, amount: tier.amount }, secret: tier.secret };
}

/** What has been paid out this month, for the admin page. */
export async function loadMonthStats(now: Date = new Date()): Promise<{ opens: number; pcredits: number; packcredits: number }> {
  try {
    const row = ((await redis.hgetall(K.stats(ukMonthKey(now)))) ?? {}) as Record<string, unknown>;
    return { opens: Number(row.opens) || 0, pcredits: Number(row.pcredits) || 0, packcredits: Number(row.packcredits) || 0 };
  } catch {
    return { opens: 0, pcredits: 0, packcredits: 0 };
  }
}
