/**
 * Free XP gifts: for every `everyXp` Drift XP a driver earns, they can collect `pCredits` P-Credits. This is separate from the
 * Battle Pass. It counts a driver's lifetime Drift XP (the same total as the Hall of Fame), not the month. Pure code, shared by
 * the server, the admin page and the game.
 *
 * What is stored per driver is only `paidTo`: the XP total their gifts have been paid up to. Gifts waiting are
 * floor((XP - paidTo) / everyXp), so changing the interval later never double pays or loses anything.
 */

export interface XpGiftConfig {
  /** A gift every this much Drift XP. 0 switches the gifts off. */
  everyXp: number;
  /** P-Credits in each gift. 0 also switches the gifts off. */
  pCredits: number;
  updatedAt: number;
}

export const DEFAULT_XP_GIFT: XpGiftConfig = { everyXp: 500, pCredits: 25, updatedAt: 0 };

export const MIN_EVERY_XP = 50;
export const MAX_EVERY_XP = 100_000;
export const MAX_GIFT_PCREDITS = 10_000;

const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Coerce anything into a well-formed config. An interval under the minimum is raised to it, and 0 means off. */
export function sanitizeXpGiftConfig(input: unknown): XpGiftConfig {
  let v: Record<string, unknown> = {};
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    /* use the defaults */
  }
  const rawEvery = clampInt(v.everyXp, DEFAULT_XP_GIFT.everyXp, 0, MAX_EVERY_XP);
  return {
    everyXp: rawEvery === 0 ? 0 : Math.max(MIN_EVERY_XP, rawEvery),
    pCredits: clampInt(v.pCredits, DEFAULT_XP_GIFT.pCredits, 0, MAX_GIFT_PCREDITS),
    updatedAt: clampInt(v.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function isXpGiftOn(config: Pick<XpGiftConfig, "everyXp" | "pCredits">): boolean {
  return config.everyXp > 0 && config.pCredits > 0;
}

/** What a driver sees: the gifts ready to collect, and how far off the next one is. */
export interface XpGiftState {
  on: boolean;
  /** Gifts ready to collect now. */
  owed: number;
  /** P-Credits those gifts hold. */
  amount: number;
  /** XP still needed for the next gift. */
  toNext: number;
  /** 0 to 1: how far through the current gift. */
  progress: number;
}

export function xpGiftState(config: Pick<XpGiftConfig, "everyXp" | "pCredits">, xp: number, paidTo: number): XpGiftState {
  if (!isXpGiftOn(config)) return { on: false, owed: 0, amount: 0, toNext: 0, progress: 0 };
  const earned = Math.max(0, Math.floor(xp) - Math.max(0, Math.floor(paidTo)));
  const owed = Math.floor(earned / config.everyXp);
  const into = earned - owed * config.everyXp;
  return {
    on: true,
    owed,
    amount: owed * config.pCredits,
    toNext: config.everyXp - into,
    progress: into / config.everyXp,
  };
}

/** What the server sends the game: the settings, and the XP total this driver's gifts have been paid up to. */
export interface XpGiftView {
  everyXp: number;
  pCredits: number;
  paidTo: number;
}
