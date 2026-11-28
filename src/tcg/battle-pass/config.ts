/**
 * The monthly Battle Pass: a ladder of Drift XP earned in the current month (London time), from 0 up to `maxXp`. Reaching a
 * step earns a gift, which holds P-Credits or pack credits. The month starts again on the 1st. Pure code, shared by the
 * server, the admin page and the game.
 *
 * What a member has earned is never stored: it is worked out from their XP this month and the steps as they are now. So when
 * an admin adds a step a member has already passed, or the member simply wasn't online, the gift is waiting for them the next
 * time they load the game. Only what was opened is stored (see store.ts).
 */

export type BattlePassRewardKind = "pcredits" | "packcredits";

export interface BattlePassTier {
  /** Stays the same when the step is edited, so an opened gift is still remembered as opened. */
  id: string;
  /** XP needed this month to unlock the gift. */
  xp: number;
  kind: BattlePassRewardKind;
  amount: number;
  /** Hide what is inside until the member opens it, so it feels special. */
  secret: boolean;
}

export interface BattlePassConfig {
  enabled: boolean;
  /** The top of the ladder. */
  maxXp: number;
  tiers: BattlePassTier[];
  updatedAt: number;
}

export const MAX_TIERS = 60;
export const MIN_MAX_XP = 100;
export const MAX_MAX_XP = 1_000_000;
export const MAX_P_REWARD = 100_000;
export const MAX_PACK_REWARD = 50;
const clampInt = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ── Months (London) ─────────────────────────────────────────────────────────

const LONDON = "Europe/London";

function londonParts(instant: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour") };
}

/** "2026-11": the month a pass belongs to. It changes at midnight London time on the 1st, in winter and summer time alike. */
export function ukMonthKey(now: Date = new Date()): string {
  const p = londonParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** "November 2026" for a key like "2026-11". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, (m || 1) - 1, 1)));
}

/** The moment (ms since 1970) the next month starts: midnight on the 1st, London time. */
export function nextMonthStart(now: Date = new Date()): number {
  const p = londonParts(now);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  // Midnight in London is midnight UTC, or an hour earlier in summer time.
  const utcMidnight = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0);
  return londonParts(new Date(utcMidnight)).hour === 1 ? utcMidnight - 3_600_000 : utcMidnight;
}

// ── Building a ladder ───────────────────────────────────────────────────────

export interface LadderOptions {
  /** How many gifts on the ladder. */
  count: number;
  maxXp: number;
  /** Each gap between gifts is this many times the one before (1 = even gaps, 1.1 = 10% bigger each time). */
  gapGrowth: number;
  /** P-Credits in the first and in the last P-Credit gift. The ones between grow smoothly. */
  startP: number;
  endP: number;
  /** Every Nth gift is pack credits instead of P-Credits (0 = never). */
  packEvery: number;
  packAmount: number;
  /** The very last gift is this many pack credits (0 = keep it as it would have been). */
  finalPack: number;
  /** The last N gifts are secret. */
  secretLast: number;
}

/**
 * The recommended ladder. It is tuned so the pass feels rewarding to play but never beats buying:
 *  - a gift every 150 to 700 XP, with the gaps growing, so a casual player (about 2,500 XP a month) opens around ten;
 *  - mostly small P-Credit gifts that grow from 20 to 75, which top up a pack rather than replace one;
 *  - pack credits only as milestones (one at about 17%, one at about 48%, and the finale), as check-ins already hand those out;
 *  - the last three gifts secret, so the end of the pass is worth chasing.
 * A full pass is worth roughly thirteen Standard Packs, and only a very active player gets there.
 */
export const DEFAULT_LADDER: LadderOptions = {
  count: 24,
  maxXp: 10_000,
  gapGrowth: 1.07,
  startP: 20,
  endP: 80,
  packEvery: 8,
  packAmount: 1,
  finalPack: 2,
  secretLast: 3,
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * A ladder where the XP between gifts and the size of the gifts both grow as you climb. The gaps are shaped by `gapGrowth`
 * and scaled so the last gift sits exactly at `maxXp`. Used for the starting ladder and the admin's "Build a ladder" tool.
 */
export function generateTiers(input: Partial<LadderOptions> = {}): BattlePassTier[] {
  const o = { ...DEFAULT_LADDER, ...input };
  const count = clampInt(o.count, DEFAULT_LADDER.count, 1, MAX_TIERS);
  const maxXp = clampInt(o.maxXp, DEFAULT_LADDER.maxXp, MIN_MAX_XP, MAX_MAX_XP);
  const growth = Math.min(3, Math.max(1, Number(o.gapGrowth) || 1));
  const startP = clampInt(o.startP, DEFAULT_LADDER.startP, 1, MAX_P_REWARD);
  const endP = clampInt(o.endP, DEFAULT_LADDER.endP, 1, MAX_P_REWARD);
  const packEvery = clampInt(o.packEvery, 0, 0, MAX_TIERS);
  const packAmount = clampInt(o.packAmount, 1, 1, MAX_PACK_REWARD);
  const finalPack = clampInt(o.finalPack, 0, 0, MAX_PACK_REWARD);
  const secretLast = clampInt(o.secretLast, 0, 0, count);

  const weights = Array.from({ length: count }, (_, i) => growth ** i);
  const total = weights.reduce((a, b) => a + b, 0);
  const step = maxXp >= 2000 ? 50 : maxXp >= 500 ? 10 : 5;

  const xps: number[] = [];
  let running = 0;
  for (let i = 0; i < count; i++) {
    running += (weights[i] / total) * maxXp;
    const at = i === count - 1 ? maxXp : Math.min(maxXp - 1, roundTo(running, step));
    // Always at least a little further than the one before.
    xps.push(Math.max(at, (xps[i - 1] ?? 0) + 1));
  }
  xps[count - 1] = maxXp;

  return xps.map((xp, i) => {
    const isLast = i === count - 1;
    const isPack = (packEvery > 0 && (i + 1) % packEvery === 0) || (isLast && finalPack > 0);
    const t = count > 1 ? i / (count - 1) : 1;
    const rawP = startP * (endP / startP) ** t;
    const p = clampInt(rawP >= 100 ? roundTo(rawP, 25) : roundTo(rawP, 5), startP, 1, MAX_P_REWARD);
    return {
      id: `t${i + 1}`,
      xp,
      kind: isPack ? ("packcredits" as const) : ("pcredits" as const),
      amount: isPack ? (isLast && finalPack > 0 ? finalPack : packAmount) : p,
      secret: i >= count - secretLast,
    };
  });
}

/** What the game starts with until an admin saves their own. It is switched off, so nothing is paid until it is reviewed. */
export function defaultBattlePassConfig(): BattlePassConfig {
  return { enabled: false, maxXp: DEFAULT_LADDER.maxXp, tiers: generateTiers(), updatedAt: 0 };
}
// ── Cleaning what an admin sends ────────────────────────────────────────────

const ID_PATTERN = /^[a-z0-9_-]{1,24}$/i;

/** Coerce anything into a well-formed config: steps in XP order, each with a unique id and a sensible reward. */
export function sanitizeBattlePassConfig(input: unknown): BattlePassConfig {
  const d = defaultBattlePassConfig();
  let v: Record<string, unknown> = {};
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    /* use the defaults */
  }
  const maxXp = clampInt(v.maxXp, d.maxXp, MIN_MAX_XP, MAX_MAX_XP);

  const raw = Array.isArray(v.tiers) ? (v.tiers as unknown[]) : d.tiers;
  const rows = raw
    .slice(0, MAX_TIERS * 2)
    .map((r) => {
      const t = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const kind: BattlePassRewardKind = t.kind === "packcredits" ? "packcredits" : "pcredits";
      return {
        id: typeof t.id === "string" && ID_PATTERN.test(t.id) ? t.id : "",
        xp: clampInt(t.xp, 0, 0, maxXp),
        kind,
        amount: clampInt(t.amount, 1, 1, kind === "pcredits" ? MAX_P_REWARD : MAX_PACK_REWARD),
        secret: t.secret === true,
      };
    })
    .filter((t) => t.xp > 0)
    .sort((a, b) => a.xp - b.xp)
    .slice(0, MAX_TIERS);

  // Every step needs its own id. Keep the ones that were sent, and give new steps the next free "t<number>".
  const used = new Set<string>();
  const tiers: BattlePassTier[] = rows.map((r) => {
    let id = r.id;
    if (!id || used.has(id)) {
      let n = 1;
      while (used.has(`t${n}`) || rows.some((o) => o !== r && o.id === `t${n}`)) n++;
      id = `t${n}`;
    }
    used.add(id);
    return { ...r, id };
  });

  return {
    enabled: v.enabled === true,
    maxXp,
    tiers,
    updatedAt: clampInt(v.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}
export interface BattlePassWarning {
  text: string;
  /** Money warnings must be confirmed before saving; the others are just information. */
  needsConfirm: boolean;
}

/** What a member who reaches the top earns in total. */
export function ladderTotals(config: { tiers: Pick<BattlePassTier, "kind" | "amount">[] }): { pCredits: number; packCredits: number } {
  return config.tiers.reduce(
    (sum, t) => ({
      pCredits: sum.pCredits + (t.kind === "pcredits" ? t.amount : 0),
      packCredits: sum.packCredits + (t.kind === "packcredits" ? t.amount : 0),
    }),
    { pCredits: 0, packCredits: 0 }
  );
}

/** What a gift or a whole ladder is worth in P-Credits, counting each pack credit as one Standard Pack at `packPrice`. */
export function ladderValue(tiers: Pick<BattlePassTier, "kind" | "amount">[], packPrice: number): number {
  const totals = ladderTotals({ tiers });
  return totals.pCredits + totals.packCredits * Math.max(1, packPrice);
}

/** A full pass worth more than this many Standard Packs makes buying packs look pointless, so saving it needs a tick. */
export const MAX_SENSIBLE_PACKS = 15;

/** Things worth a second look before saving. They never stop a save; the ones that create money need a tick to confirm. */
export function battlePassWarnings(config: BattlePassConfig, packPrice = 100): BattlePassWarning[] {
  const out: BattlePassWarning[] = [];
  const totals = ladderTotals(config);
  if (config.tiers.length === 0) out.push({ needsConfirm: false, text: "There are no gifts on the ladder yet." });
  else {
    const packs = ladderValue(config.tiers, packPrice) / Math.max(1, packPrice);
    out.push({
      needsConfirm: false,
      text: `A member who reaches the top earns ${totals.pCredits.toLocaleString("en-GB")} P-Credits and ${totals.packCredits} pack credit${totals.packCredits === 1 ? "" : "s"} each month, worth about ${packs.toFixed(1)} Standard Packs (at ${packPrice.toLocaleString("en-GB")} P each).`,
    });
    if (packs > MAX_SENSIBLE_PACKS) {
      out.push({
        needsConfirm: true,
        text: `That is more than ${MAX_SENSIBLE_PACKS} Standard Packs a month for free, which could make buying packs look pointless.`,
      });
    }
    const last = config.tiers[config.tiers.length - 1];
    if (last.xp < config.maxXp) out.push({ needsConfirm: false, text: `The last gift is at ${last.xp.toLocaleString("en-GB")} XP, below the top of the ladder (${config.maxXp.toLocaleString("en-GB")}).` });
  }
  if (config.enabled) {
    out.push({ needsConfirm: true, text: "The Battle Pass is on, so members are paid these gifts as soon as they reach them (and gifts they already reached this month are waiting for them)." });
  } else {
    out.push({ needsConfirm: false, text: "The Battle Pass is switched off. Members can't see it or open gifts, but XP still counts towards this month." });
  }
  return out;
}

// ── What a member sees ──────────────────────────────────────────────────────

/** What was actually paid for a step the member opened. Kept as it was, even if the step is edited later. */
export interface OpenedGift {
  kind: BattlePassRewardKind;
  amount: number;
  at: number;
}

export type TierState = "locked" | "ready" | "opened";

export interface BattlePassTierView {
  id: string;
  xp: number;
  state: TierState;
  secret: boolean;
  /** Left out (null) while a secret gift is still shut, so the browser never holds the answer. */
  reward: { kind: BattlePassRewardKind; amount: number } | null;
}

export interface BattlePassView {
  enabled: boolean;
  monthKey: string;
  monthLabel: string;
  /** XP earned this month. */
  xp: number;
  maxXp: number;
  /** When the month, and so the ladder, starts again (ms since 1970). */
  resetsAt: number;
  tiers: BattlePassTierView[];
  /** Gifts reached but not opened yet. */
  readyCount: number;
}

export function buildBattlePassView(
  config: BattlePassConfig,
  xp: number,
  opened: Record<string, OpenedGift>,
  now: Date = new Date()
): BattlePassView {
  const monthKey = ukMonthKey(now);
  const tiers = config.tiers.map<BattlePassTierView>((t) => {
    const gift = opened[t.id];
    const state: TierState = gift ? "opened" : xp >= t.xp ? "ready" : "locked";
    const reward = gift ? { kind: gift.kind, amount: gift.amount } : t.secret ? null : { kind: t.kind, amount: t.amount };
    return { id: t.id, xp: t.xp, state, secret: t.secret, reward };
  });
  return {
    enabled: config.enabled,
    monthKey,
    monthLabel: monthLabel(monthKey),
    xp: Math.max(0, Math.round(xp)),
    maxXp: config.maxXp,
    resetsAt: nextMonthStart(now),
    tiers,
    readyCount: tiers.filter((t) => t.state === "ready").length,
  };
}

/**
 * The same pass with a newer XP total, for showing progress between loads (XP earned in a game while the page is open).
 * Only locked steps can become ready; an opened one stays opened.
 */
export function withLiveXp(view: BattlePassView, xp: number): BattlePassView {
  const live = Math.max(view.xp, Math.round(xp));
  if (live === view.xp) return view;
  const tiers = view.tiers.map((t) => (t.state === "locked" && live >= t.xp ? { ...t, state: "ready" as const } : t));
  return { ...view, xp: live, tiers, readyCount: tiers.filter((t) => t.state === "ready").length };
}

/** The first gift not reached yet, or null when every gift has been reached. */
export function nextLockedTier(view: BattlePassView): BattlePassTierView | null {
  return view.tiers.find((t) => t.state === "locked") ?? null;
}

export function rewardLabel(reward: { kind: BattlePassRewardKind; amount: number }): string {
  return reward.kind === "pcredits"
    ? `${reward.amount.toLocaleString("en-GB")} P-Credits`
    : `${reward.amount} pack credit${reward.amount === 1 ? "" : "s"}`;
}
