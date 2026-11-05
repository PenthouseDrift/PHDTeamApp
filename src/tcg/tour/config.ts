import type { PrizeRow, TourConfig, UpgradeRarity } from "./types";

/**
 * Tandem Tour settings: defaults, and a sanitiser for whatever is read from Redis or sent by the admin page.
 * Pure code (no Redis), so the engine, the simulator and the screens can all use it. The admin-editable copy
 * is loaded and saved in config-store.ts.
 *
 * Every number here is a STARTING value to be tuned with scripts/tour-sim.ts and then in the admin page.
 */

export const DEFAULT_TOUR_CONFIG: TourConfig = {
  // Off until the owner switches it on. While off, only admins see the Tour tab.
  enabled: false,
  earlyAccessOnly: true,
  adminsRunFree: true,
  maxRounds: 8,
  maxStrikes: 3,
  freeRunsPerDay: 1,
  entryPricePCredits: 50,
  maxPaidRunsPerDay: 5,
  rerollPricePCredits: 0,
  decisionTimerSeconds: 0,
  prizes: [
    { wins: 0, pCredits: 0, packCredits: 0 },
    { wins: 1, pCredits: 0, packCredits: 0 },
    { wins: 2, pCredits: 10, packCredits: 0 },
    { wins: 3, pCredits: 20, packCredits: 0 },
    { wins: 4, pCredits: 32, packCredits: 0 },
    { wins: 5, pCredits: 50, packCredits: 0 },
    { wins: 6, pCredits: 80, packCredits: 0 },
    { wins: 7, pCredits: 120, packCredits: 0 },
    { wins: 8, pCredits: 200, packCredits: 1 },
  ],
  streakRewards: [
    { days: 3, pCredits: 10, packCredits: 0 },
    { days: 7, pCredits: 30, packCredits: 0 },
    { days: 14, pCredits: 60, packCredits: 1 },
  ],
  multipliers: { streak: 1, earlyAccess: 1 },
  tuning: {
    startRating: 1000,
    stanceBonus: 4,
    gambleMin: -3,
    gambleMax: 6,
    wearBase: 18,
    wearAttack: 8,
    burstWear: 15,
    wallWear: 6,
    conditionFloorMultiplier: 0.8,
    repairByRarity: { bronze: 20, silver: 35, gold: 50, legend: 100, mythic: 100 },
    ratingK: 24,
    ghostsPerRound: 300,
    ratingBand: 150,
    // Found with scripts/tour-sim.ts so members of every card rarity average about 3.5 wins against bots.
    botEdge: { bronze: 0, silver: 0, gold: 0, legend: 0, mythic: 0 },
    botEdgePerRound: 0,
    // Found with scripts/tour-sim.ts: driving skill is worth about two wins across the range, card rarity about one and a half.
    skillSwing: 0.2,
    skillPivot: 0.55,
    botAccuracyStart: 0.55,
    botAccuracyPerRound: 0.05,
  },
  upgradeWeights: { common: 70, rare: 25, epic: 5 },
  upgradeOverrides: {},
  updatedAt: 0,
};

const num = (v: unknown, fallback: number, min: number, max: number, integer = true): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return integer ? Math.round(clamped) : clamped;
};

function cleanPrizes(v: unknown, maxRounds: number): PrizeRow[] {
  const byWins = new Map<number, PrizeRow>();
  if (Array.isArray(v)) {
    for (const raw of v) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const wins = num(r.wins, -1, -1, 12);
      if (wins < 0) continue;
      byWins.set(wins, { wins, pCredits: num(r.pCredits, 0, 0, 100000), packCredits: num(r.packCredits, 0, 0, 100) });
    }
  }
  // One row for every win count from 0 to the Round count; a missing row pays nothing.
  const out: PrizeRow[] = [];
  for (let w = 0; w <= maxRounds; w++) out.push(byWins.get(w) ?? { wins: w, pCredits: 0, packCredits: 0 });
  return out;
}

/** Coerce anything into a well-formed config, filling gaps from the defaults. */
export function sanitizeTourConfig(input: unknown): TourConfig {
  const d = DEFAULT_TOUR_CONFIG;
  let v: Record<string, unknown> = {};
  try {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    /* use the defaults */
  }
  const t = (v.tuning && typeof v.tuning === "object" ? v.tuning : {}) as Record<string, unknown>;
  const rep = (t.repairByRarity && typeof t.repairByRarity === "object" ? t.repairByRarity : {}) as Record<string, unknown>;
  const mult = (v.multipliers && typeof v.multipliers === "object" ? v.multipliers : {}) as Record<string, unknown>;
  const weights = (v.upgradeWeights && typeof v.upgradeWeights === "object" ? v.upgradeWeights : {}) as Record<string, unknown>;
  const maxRounds = num(v.maxRounds, d.maxRounds, 3, 12);

  const overrides: TourConfig["upgradeOverrides"] = {};
  if (v.upgradeOverrides && typeof v.upgradeOverrides === "object") {
    for (const [id, raw] of Object.entries(v.upgradeOverrides as Record<string, unknown>)) {
      if (!/^[a-z0-9_-]{2,40}$/i.test(id) || !raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      overrides[id] = {
        ...(typeof o.enabled === "boolean" ? { enabled: o.enabled } : {}),
        ...(o.amount !== undefined ? { amount: num(o.amount, 0, -50, 100) } : {}),
        ...(o.rounds !== undefined ? { rounds: num(o.rounds, 1, 1, 12) } : {}),
        ...(o.uses !== undefined ? { uses: num(o.uses, 1, 1, 12) } : {}),
      };
    }
  }

  const streakRewards: TourConfig["streakRewards"] = Array.isArray(v.streakRewards)
    ? (v.streakRewards as unknown[])
        .map((raw) => {
          const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          return { days: num(r.days, 0, 0, 365), pCredits: num(r.pCredits, 0, 0, 100000), packCredits: num(r.packCredits, 0, 0, 100) };
        })
        .filter((r) => r.days > 0)
        .sort((a, b) => a.days - b.days)
        .slice(0, 12)
    : d.streakRewards;

  return {
    enabled: v.enabled === true,
    earlyAccessOnly: v.earlyAccessOnly === undefined ? d.earlyAccessOnly : v.earlyAccessOnly === true,
    adminsRunFree: v.adminsRunFree === undefined ? d.adminsRunFree : v.adminsRunFree === true,
    maxRounds,
    maxStrikes: num(v.maxStrikes, d.maxStrikes, 1, 5),
    freeRunsPerDay: num(v.freeRunsPerDay, d.freeRunsPerDay, 0, 20),
    entryPricePCredits: num(v.entryPricePCredits, d.entryPricePCredits, 0, 100000),
    maxPaidRunsPerDay: num(v.maxPaidRunsPerDay, d.maxPaidRunsPerDay, 0, 100),
    rerollPricePCredits: num(v.rerollPricePCredits, d.rerollPricePCredits, 0, 100000),
    decisionTimerSeconds: (() => {
      const s = num(v.decisionTimerSeconds, 0, 0, 120);
      return s === 0 ? 0 : Math.max(15, s);
    })(),
    prizes: cleanPrizes(v.prizes ?? d.prizes, maxRounds),
    streakRewards,
    multipliers: {
      streak: num(mult.streak, d.multipliers.streak, 0, 10, false),
      earlyAccess: num(mult.earlyAccess, d.multipliers.earlyAccess, 0, 10, false),
    },
    tuning: {
      startRating: num(t.startRating, d.tuning.startRating, 100, 5000),
      stanceBonus: num(t.stanceBonus, d.tuning.stanceBonus, 0, 30),
      gambleMin: num(t.gambleMin, d.tuning.gambleMin, -30, 30),
      gambleMax: num(t.gambleMax, d.tuning.gambleMax, -30, 30),
      wearBase: num(t.wearBase, d.tuning.wearBase, 0, 100),
      wearAttack: num(t.wearAttack, d.tuning.wearAttack, 0, 100),
      burstWear: num(t.burstWear, d.tuning.burstWear, 0, 100),
      wallWear: num(t.wallWear, d.tuning.wallWear, 0, 100),
      conditionFloorMultiplier: num(t.conditionFloorMultiplier, d.tuning.conditionFloorMultiplier, 0.3, 1, false),
      repairByRarity: {
        bronze: num(rep.bronze, d.tuning.repairByRarity.bronze, 0, 100),
        silver: num(rep.silver, d.tuning.repairByRarity.silver, 0, 100),
        gold: num(rep.gold, d.tuning.repairByRarity.gold, 0, 100),
        legend: num(rep.legend, d.tuning.repairByRarity.legend, 0, 100),
        mythic: num(rep.mythic, d.tuning.repairByRarity.mythic, 0, 100),
      },
      ratingK: num(t.ratingK, d.tuning.ratingK, 1, 100),
      ghostsPerRound: num(t.ghostsPerRound, d.tuning.ghostsPerRound, 10, 2000),
      ratingBand: num(t.ratingBand, d.tuning.ratingBand, 20, 2000),
      botEdge: (() => {
        const e = (t.botEdge && typeof t.botEdge === "object" ? t.botEdge : {}) as Record<string, unknown>;
        const f = d.tuning.botEdge;
        return {
          bronze: num(e.bronze, f.bronze, -30, 30, false),
          silver: num(e.silver, f.silver, -30, 30, false),
          gold: num(e.gold, f.gold, -30, 30, false),
          legend: num(e.legend, f.legend, -30, 30, false),
          mythic: num(e.mythic, f.mythic, -30, 30, false),
        };
      })(),
      botEdgePerRound: num(t.botEdgePerRound, d.tuning.botEdgePerRound, -10, 10, false),
      skillSwing: num(t.skillSwing, d.tuning.skillSwing, 0, 0.6, false),
      skillPivot: num(t.skillPivot, d.tuning.skillPivot, 0.2, 0.9, false),
      botAccuracyStart: num(t.botAccuracyStart, d.tuning.botAccuracyStart, 0, 1, false),
      botAccuracyPerRound: num(t.botAccuracyPerRound, d.tuning.botAccuracyPerRound, 0, 0.2, false),
    },
    upgradeWeights: {
      common: num(weights.common, d.upgradeWeights.common, 0, 1000),
      rare: num(weights.rare, d.upgradeWeights.rare, 0, 1000),
      epic: num(weights.epic, d.upgradeWeights.epic, 0, 1000),
    } as Record<UpgradeRarity, number>,
    upgradeOverrides: overrides,
    updatedAt: num(v.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** The prize for a Win Count. */
export function prizeForWins(config: TourConfig, wins: number): PrizeRow {
  return config.prizes.find((p) => p.wins === wins) ?? { wins, pCredits: 0, packCredits: 0 };
}

/** The next prize row (more wins) that pays more than the one for `wins`, or null at the top. */
export function nextPrizeAfter(config: TourConfig, wins: number): PrizeRow | null {
  const here = prizeForWins(config, wins);
  return (
    config.prizes
      .filter((p) => p.wins > wins && (p.pCredits > here.pCredits || p.packCredits > here.packCredits))
      .sort((a, b) => a.wins - b.wins)[0] ?? null
  );
}

/**
 * A rough share of Tours that end on each Win Count (0 to 8 wins), taken from scripts/tour-sim.ts against bots for
 * a typical driver. Used only to estimate what a prize table costs on average; real results will differ.
 */
export const NOMINAL_WIN_SHARE = [0.02, 0.06, 0.12, 0.18, 0.2, 0.18, 0.13, 0.08, 0.03];

/** The average P-Credit prize of one Tour for this prize table, and as a share of the entry price (null when it is free). */
export function estimateReturn(config: Pick<TourConfig, "prizes" | "entryPricePCredits">): { averagePrize: number; returnPct: number | null } {
  const share = NOMINAL_WIN_SHARE;
  let total = 0;
  let used = 0;
  for (let w = 0; w < share.length; w++) {
    const row = config.prizes.find((p) => p.wins === w);
    total += share[w] * (row?.pCredits ?? 0);
    used += share[w];
  }
  const averagePrize = used > 0 ? total / used : 0;
  return {
    averagePrize,
    returnPct: config.entryPricePCredits > 0 ? (averagePrize / config.entryPricePCredits) * 100 : null,
  };
}

export interface ConfigWarning {
  text: string;
  /** Money warnings must be confirmed before saving; the others are just information. */
  needsConfirm: boolean;
}

/** Things worth a second look before saving. They do not stop a save; money warnings need a tick to confirm. */
export function configWarnings(config: TourConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const est = estimateReturn(config);
  if (est.returnPct !== null && est.returnPct > 100) {
    out.push({ needsConfirm: true, text: `Paid runs pay back about ${est.returnPct.toFixed(0)}% of their price on average, so each one creates P-Credits.` });
  }
  if (config.freeRunsPerDay > 0 && est.averagePrize > 0) {
    out.push({
      needsConfirm: false,
      text: `Each free run pays about ${est.averagePrize.toFixed(0)} P-Credits on average, so ${config.freeRunsPerDay} free run${config.freeRunsPerDay === 1 ? "" : "s"} a day creates P-Credits for every member who plays.`,
    });
  }
  const top = config.prizes.reduce((m, p) => Math.max(m, p.pCredits), 0);
  if (config.entryPricePCredits > 0 && top > config.entryPricePCredits * 10) {
    out.push({ needsConfirm: true, text: `The top prize (${top} P-Credits) is more than 10 times the entry price.` });
  }
  if (!config.enabled) out.push({ needsConfirm: false, text: "The mode is switched off, so only admins can see it." });
  else if (!config.earlyAccessOnly) out.push({ needsConfirm: true, text: "Early access is off, so every signed-in member can play." });
  return out;
}
