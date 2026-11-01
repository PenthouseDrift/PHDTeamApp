/**
 * Pack configuration: how a pack rolls a card's rarity, and what can take the place of the normal
 * generated card on each rarity. Pure (no server imports) so the roll, the admin page and the store
 * share one definition.
 *
 * The roll for one card:
 *   1. Pick the rarity (the pack's own odds, or the standard stat-based odds).
 *   2. Look at that rarity's entries. Each entry is a custom style or a fixed set card with a chance
 *      (a percentage of cards on that rarity). Roll once across them: an entry that hits is used.
 *   3. If no entry hits, the card is the normal generated card. Entries' chances add up to 100 or
 *      less, and what is left over is the normal generated card.
 */

import { RARITY_ODDS, RARITY_STAT_BRACKETS, rollStats, rollStatsAndRarity, statTotal, type Rng } from "@/lib/card-roll";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { ALL_TIERS, ID_PATTERN } from "@/lib/pack-styles";

/** The id of the always-present Standard Pack's config. Custom packs use their own pack id. */
export const STANDARD_PACK_ID = "standard";

export type PackEntryKind = "style" | "card";

export interface PackEntry {
  kind: PackEntryKind;
  /** Style id (kind "style") or saved full art card id (kind "card"). */
  refId: string;
  /** Percent (0 to 100) of cards on this rarity that use this entry. */
  chancePct: number;
}

/** Rarities that have their own odds. Bronze is whatever is left. */
export type OddsTier = Exclude<FullArtTier, "bronze">;
export const ODDS_TIERS: OddsTier[] = ["mythic", "legend", "gold", "silver"];
export type OddsPct = Record<OddsTier, number>;

export interface PackConfig {
  /** "standard" or a custom pack's id. */
  packId: string;
  /**
   * Master switch. For the Standard Pack nothing here applies while this is off, so the pack rolls
   * exactly as it always has. Custom packs that have a config are always on.
   */
  enabled: boolean;
  /** Use `oddsPct` for the rarity roll instead of the standard odds. Always on for custom packs. */
  oddsOverride: boolean;
  /** Percent chance of each rarity (bronze is the remainder). Used only with `oddsOverride`. */
  oddsPct: OddsPct;
  rarities: Record<FullArtTier, PackEntry[]>;
  updatedAt: number;
}

export const MAX_ENTRIES_PER_RARITY = 30;
/** A rounding allowance when comparing percentages that should add up to 100. */
const EPSILON = 1e-4;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const clampPct = (v: unknown, places = 4) => {
  const n = Number(v);
  return Number.isFinite(n) ? round(Math.min(100, Math.max(0, n)), places) : 0;
};

/** The standard odds, as percentages for the rarities that have their own (bronze is the rest). */
export function standardOddsPct(): OddsPct {
  const out = { mythic: 0, legend: 0, gold: 0, silver: 0 } as OddsPct;
  for (const o of RARITY_ODDS) {
    if (o.tier !== "bronze") out[o.tier as OddsTier] = round(o.chance * 100, 6);
  }
  return out;
}

export function emptyRarities(): Record<FullArtTier, PackEntry[]> {
  return { bronze: [], silver: [], gold: [], legend: [], mythic: [] };
}

export function emptyPackConfig(packId: string): PackConfig {
  const isStandard = packId === STANDARD_PACK_ID;
  return {
    packId,
    enabled: !isStandard,
    oddsOverride: !isStandard,
    oddsPct: standardOddsPct(),
    rarities: emptyRarities(),
    updatedAt: 0,
  };
}

/** Entries cleaned: known kinds and ids, no duplicates, capped in number, and trimmed to add up to at most 100. */
export function cleanEntries(v: unknown): PackEntry[] {
  const list = Array.isArray(v) ? v : [];
  const seen = new Set<string>();
  const out: PackEntry[] = [];
  let used = 0;
  for (const raw of list) {
    if (out.length >= MAX_ENTRIES_PER_RARITY) break;
    const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const kind: PackEntryKind | null = e.kind === "style" ? "style" : e.kind === "card" ? "card" : null;
    const refId = typeof e.refId === "string" ? e.refId.trim() : "";
    if (!kind || !ID_PATTERN.test(refId) || seen.has(`${kind}:${refId}`)) continue;
    seen.add(`${kind}:${refId}`);
    const chancePct = Math.min(clampPct(e.chancePct), round(Math.max(0, 100 - used), 4));
    used += chancePct;
    out.push({ kind, refId, chancePct });
  }
  return out;
}

/** Coerce anything read from Redis or sent by the browser into a well-formed config, or null if it is not one. */
export function sanitizePackConfig(input: unknown): PackConfig | null {
  try {
    const value = typeof input === "string" ? JSON.parse(input) : input;
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const packId = typeof v.packId === "string" ? v.packId : "";
    if (packId !== STANDARD_PACK_ID && !ID_PATTERN.test(packId)) return null;
    const isStandard = packId === STANDARD_PACK_ID;

    const rawOdds = (v.oddsPct && typeof v.oddsPct === "object" ? v.oddsPct : {}) as Record<string, unknown>;
    const defaults = standardOddsPct();
    const oddsPct = {} as OddsPct;
    for (const t of ODDS_TIERS) oddsPct[t] = rawOdds[t] === undefined ? defaults[t] : clampPct(rawOdds[t], 6);
    const total = ODDS_TIERS.reduce((sum, t) => sum + oddsPct[t], 0);
    if (total > 100) for (const t of ODDS_TIERS) oddsPct[t] = round((oddsPct[t] / total) * 100, 6);

    const rawRarities = (v.rarities && typeof v.rarities === "object" ? v.rarities : {}) as Record<string, unknown>;
    const rarities = emptyRarities();
    for (const tier of ALL_TIERS) rarities[tier] = cleanEntries(rawRarities[tier]);

    return {
      packId,
      enabled: isStandard ? v.enabled === true : true,
      oddsOverride: isStandard ? v.oddsOverride === true : true,
      oddsPct,
      rarities,
      updatedAt: Number(v.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** A message describing the first problem with a config, or null when it is fine to save. */
export function validatePackConfig(config: PackConfig): string | null {
  const total = ODDS_TIERS.reduce((sum, t) => sum + config.oddsPct[t], 0);
  if (config.oddsOverride && total > 100 + EPSILON) {
    return "The rarity odds add up to more than 100%. Lower one of them.";
  }
  for (const tier of ALL_TIERS) {
    const sum = config.rarities[tier].reduce((s, e) => s + e.chancePct, 0);
    if (sum > 100 + EPSILON) {
      return `${tier[0].toUpperCase()}${tier.slice(1)}: the chances add up to ${round(sum, 2)}%. They can't be more than 100%.`;
    }
  }
  return null;
}

/** The percentage chance of each rarity this pack rolls, adding up to 100. */
export function effectivePcts(config: Pick<PackConfig, "oddsOverride" | "oddsPct">): Record<FullArtTier, number> {
  const odds = config.oddsOverride ? config.oddsPct : standardOddsPct();
  const rest = 100 - ODDS_TIERS.reduce((sum, t) => sum + odds[t], 0);
  return {
    mythic: odds.mythic,
    legend: odds.legend,
    gold: odds.gold,
    silver: odds.silver,
    // A remainder this small is just rounding, so treat it as none.
    bronze: rest < EPSILON ? 0 : round(rest, 6),
  };
}

/** "1 in X" for a percentage, e.g. 5 -> 20. Null when the chance is 0. */
export function oneInFromPct(pct: number): number | null {
  return pct > 0 ? round(100 / pct, 2) : null;
}

/** The percentage for "1 in X", e.g. 20 -> 5. A blank or zero X means never. */
export function pctFromOneIn(oneIn: number): number {
  return Number.isFinite(oneIn) && oneIn >= 1 ? round(100 / oneIn, 6) : 0;
}

// ── Rolling ─────────────────────────────────────────────────────────────────

const ROLL_ORDER: FullArtTier[] = ["mythic", "legend", "gold", "silver", "bronze"];

/** Pick a rarity from percentages. The rarest rarities are checked first. */
export function rollTier(pcts: Record<FullArtTier, number>, rng: Rng): FullArtTier {
  const total = ROLL_ORDER.reduce((sum, t) => sum + pcts[t], 0);
  let r = rng() * total;
  for (const tier of ROLL_ORDER) {
    if (r < pcts[tier]) return tier;
    r -= pcts[tier];
  }
  return [...ROLL_ORDER].reverse().find((t) => pcts[t] > 0) ?? "bronze";
}

/** Stats whose total lands in the given rarity's range, so the card's stats always match its rarity. */
export function rollStatsForTier(tier: FullArtTier, rng: Rng): FullArtCardData["stats"] {
  if (tier === "mythic") return { drift: "25", accel: "25", grip: "25", steer: "25" };
  const bracket = RARITY_STAT_BRACKETS.find((b) => b.tier === tier) ?? RARITY_STAT_BRACKETS[RARITY_STAT_BRACKETS.length - 1];
  for (let i = 0; i < 5000; i++) {
    const stats = rollStats(rng);
    const total = statTotal(stats);
    if (total >= bracket.minTotal && total <= bracket.maxTotal) return stats;
  }
  const each = String(Math.min(25, Math.max(1, Math.round((bracket.minTotal + bracket.maxTotal) / 8))));
  return { drift: each, accel: each, grip: each, steer: each };
}

/**
 * Roll once across a rarity's entries. Returns the entry that hit, or null for the normal generated
 * card. An entry that is no longer available (its style or card was deleted) also gives null.
 */
export function pickEntry(entries: PackEntry[], rng: Rng, isAvailable: (entry: PackEntry) => boolean): PackEntry | null {
  let r = rng() * 100;
  for (const entry of entries) {
    if (r < entry.chancePct) return isAvailable(entry) ? entry : null;
    r -= entry.chancePct;
  }
  return null;
}

export interface PackRoll {
  tier: FullArtTier;
  stats: FullArtCardData["stats"];
  /** The style or fixed card that took this card's place, or null for the normal generated card. */
  entry: PackEntry | null;
}

/**
 * Roll one card for a pack. With the standard odds this is the same rarity-and-stats roll every pack
 * has always used. With the pack's own odds the rarity is rolled first and the stats are rolled to fit it.
 */
export function rollPackCard(config: PackConfig, rng: Rng, isAvailable: (entry: PackEntry) => boolean): PackRoll {
  let tier: FullArtTier;
  let stats: FullArtCardData["stats"];
  if (config.oddsOverride) {
    tier = rollTier(effectivePcts(config), rng);
    stats = rollStatsForTier(tier, rng);
  } else {
    ({ tier, stats } = rollStatsAndRarity(rng));
  }
  return { tier, stats, entry: pickEntry(config.rarities[tier] ?? [], rng, isAvailable) };
}

// ── Reading a config ────────────────────────────────────────────────────────

/** Percent of cards on a rarity that are the normal generated card. */
export function generatedPct(entries: PackEntry[]): number {
  const used = entries.reduce((sum, e) => sum + e.chancePct, 0);
  return used >= 100 - EPSILON ? 0 : round(100 - used, 4);
}

/** Percent of ALL cards in the pack that use an entry (the rarity's chance times the entry's chance). */
export function entryOverallPct(pcts: Record<FullArtTier, number>, tier: FullArtTier, entry: PackEntry): number {
  return round((pcts[tier] * entry.chancePct) / 100, 6);
}

/**
 * True when some card in the pack may need to be drawn: a style hit, or a normal generated card on
 * a rarity the pack can roll. Such a pack needs a car (the member's photo, or community cars).
 * A pack of fixed cards only can be bought and opened instantly.
 */
export function packNeedsGeneration(config: PackConfig): boolean {
  const pcts = effectivePcts(config);
  return ALL_TIERS.some((tier) => {
    if (pcts[tier] <= 0) return false;
    const entries = config.rarities[tier];
    return entries.some((e) => e.kind === "style" && e.chancePct > 0) || generatedPct(entries) > 0;
  });
}

// ── Converting an old pack ──────────────────────────────────────────────────

/**
 * An old custom pack is one weighted list of cards. As a config it is the same pack: each rarity's
 * chance is its share of the weights, and within a rarity each card's chance is its share of that
 * rarity's weights. Every card in the pack keeps exactly the odds it had.
 */
export function configFromLegacyPack(
  packId: string,
  cards: Array<{ cardId: string; weight: number; tier: FullArtTier }>
): PackConfig {
  const config = emptyPackConfig(packId);
  config.oddsPct = { mythic: 0, legend: 0, gold: 0, silver: 0 };
  const total = cards.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (total <= 0) return config;

  for (const tier of ALL_TIERS) {
    const group = cards.filter((c) => c.tier === tier && c.weight > 0);
    const groupWeight = group.reduce((sum, c) => sum + c.weight, 0);
    if (groupWeight <= 0) continue;
    if (tier !== "bronze") config.oddsPct[tier as OddsTier] = round((groupWeight / total) * 100, 6);

    let used = 0;
    config.rarities[tier] = group.map((c, i) => {
      // The last card takes what is left, so the list adds up to exactly 100.
      const chancePct = i === group.length - 1 ? round(100 - used, 4) : round((c.weight / groupWeight) * 100, 4);
      used += chancePct;
      return { kind: "card" as const, refId: c.cardId, chancePct };
    });
  }
  return config;
}
