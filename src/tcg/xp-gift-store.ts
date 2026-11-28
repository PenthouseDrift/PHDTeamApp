import { redis } from "@/lib/redis";
import { grantPCredits } from "@/tcg/storage";
import { clashStatsKey } from "./game-xp-store";
import { DEFAULT_XP_GIFT, isXpGiftOn, sanitizeXpGiftConfig, type XpGiftConfig, type XpGiftView } from "./xp-gifts";

/**
 * Redis access for the free XP gifts. Plain functions (no "use server"), used by xp-gift-actions.ts and the cards page.
 *
 * Keys:
 *   tcg:xpgift:config       the admin's settings (JSON)       tcg:xpgift:config:log   change log (list)
 *   tcg:xpgift:stats        hash of everything paid: gifts, pcredits
 *   tcg:clash:stats:<id>    the driver's stats hash; `xpGiftPaidTo` is the XP total their gifts are paid up to
 */

const K = {
  config: "tcg:xpgift:config",
  configLog: "tcg:xpgift:config:log",
  stats: "tcg:xpgift:stats",
};
const PAID_TO = "xpGiftPaidTo";

export async function loadXpGiftConfig(): Promise<XpGiftConfig> {
  try {
    const raw = await redis.get(K.config);
    if (!raw) return { ...DEFAULT_XP_GIFT };
    return sanitizeXpGiftConfig(raw);
  } catch (error) {
    console.error("[xp-gifts] could not read the settings, using the default:", error);
    return { ...DEFAULT_XP_GIFT };
  }
}

export async function saveXpGiftConfig(input: unknown, adminId: string): Promise<XpGiftConfig> {
  const before = await loadXpGiftConfig();
  const next = { ...sanitizeXpGiftConfig(input), updatedAt: Date.now() };
  await redis.set(K.config, JSON.stringify(next));
  await redis.lpush(K.configLog, JSON.stringify({ at: Date.now(), by: adminId, before, after: next }));
  await redis.ltrim(K.configLog, 0, 49);
  return next;
}

/** What has been paid in total, for the admin page. */
export async function loadXpGiftStats(): Promise<{ gifts: number; pcredits: number }> {
  try {
    const row = ((await redis.hgetall(K.stats)) ?? {}) as Record<string, unknown>;
    return { gifts: Number(row.gifts) || 0, pcredits: Number(row.pcredits) || 0 };
  } catch {
    return { gifts: 0, pcredits: 0 };
  }
}

const toInt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * The settings and where this driver's gifts are paid up to. The first time a driver is seen with the gifts on, their gifts are
 * marked as paid up to the XP they have right now, so only XP earned from here on counts (no back pay for old XP). Only one
 * request can set that mark, so it is set once. Returns null when the gifts are off.
 */
export async function loadXpGiftView(userId: string): Promise<XpGiftView | null> {
  try {
    const config = await loadXpGiftConfig();
    if (!isXpGiftOn(config)) return null;
    const key = clashStatsKey(userId);
    const [xpRaw, paidRaw] = await Promise.all([redis.hget(key, "gameXp"), redis.hget(key, PAID_TO)]);
    let paidTo: number;
    if (paidRaw === null || paidRaw === undefined) {
      const xp = toInt(xpRaw);
      const first = await redis.hsetnx(key, PAID_TO, xp);
      paidTo = first ? xp : toInt(await redis.hget(key, PAID_TO));
    } else {
      paidTo = toInt(paidRaw);
    }
    return { everyXp: config.everyXp, pCredits: config.pCredits, paidTo };
  } catch (error) {
    console.error("[xp-gifts] could not load the gifts for a driver:", error);
    return null;
  }
}

export type ClaimXpGiftResult =
  | { ok: true; gifts: number; amount: number; balance: number; view: XpGiftView }
  | { ok: false; error: string };

/**
 * Collect every gift a driver has waiting, in one go. The "paid up to" mark is moved on FIRST with an atomic add. If another
 * request moved it at the same time, this one sees that, puts its own move back and pays nothing, so a double tap, two tabs or
 * two devices pay a gift once. If paying then fails, the mark is put back so the gifts can be collected later.
 */
export async function claimXpGifts(userId: string): Promise<ClaimXpGiftResult> {
  const config = await loadXpGiftConfig();
  if (!isXpGiftOn(config)) return { ok: false, error: "Free XP gifts aren't running right now." };

  const key = clashStatsKey(userId);
  const [xpRaw, paidRaw] = await Promise.all([redis.hget(key, "gameXp"), redis.hget(key, PAID_TO)]);
  if (paidRaw === null || paidRaw === undefined) {
    // Not seen yet: mark them as paid up to now, and there is nothing to collect.
    await redis.hsetnx(key, PAID_TO, toInt(xpRaw));
    return { ok: false, error: "No gift is ready yet." };
  }
  const xp = toInt(xpRaw);
  const paidTo = toInt(paidRaw);
  const gifts = Math.floor(Math.max(0, xp - paidTo) / config.everyXp);
  if (gifts < 1) return { ok: false, error: "No gift is ready yet." };

  const advance = gifts * config.everyXp;
  const amount = gifts * config.pCredits;
  const after = toInt(await redis.hincrby(key, PAID_TO, advance));
  if (after - advance !== paidTo) {
    await redis.hincrby(key, PAID_TO, -advance);
    return { ok: false, error: "Those gifts were just collected." };
  }

  let balance: number;
  try {
    balance = await grantPCredits(userId, amount);
  } catch (error) {
    await redis.hincrby(key, PAID_TO, -advance).catch(() => {});
    console.error("[xp-gifts] paying the gifts failed, so they were put back:", error);
    return { ok: false, error: "Your gift couldn't be paid just now. Please try again." };
  }

  try {
    await redis.hincrby(K.stats, "gifts", gifts);
    await redis.hincrby(K.stats, "pcredits", amount);
  } catch {
    /* the counters are only for the admin page */
  }
  return { ok: true, gifts, amount, balance, view: { everyXp: config.everyXp, pCredits: config.pCredits, paidTo: after } };
}
