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
import { FRAME_EFFECTS, ROLLED_STAT, clampColor, clampHexColor, type FrameEffect, type FullArtCardData, type FullArtTier } from "@/lib/full-art-card";
import { ALL_TIERS, ID_PATTERN, frameFieldsFor, type PackStyle } from "@/lib/pack-styles";

/** The id of the always-present Standard Pack's config. Custom packs use their own pack id. */
export const STANDARD_PACK_ID = "standard";

export type PackEntryKind = "style" | "card";

/**
 * How one pack uses a saved set card differently from how it was saved. The saved card itself is never changed, so the same
 * card can be used in many packs, each with its own rolled stats or restyle, and picking a card never makes a new saved card.
 */
/**
 * Small edits to how a set card looks in one pack: the words on it, where its picture sits, its colours and its frame effect.
 * Only the fields that were changed are present. They win over the card's own values and over the style's frame.
 */
export interface CardEdits {
  name?: string;
  ability?: string;
  effect?: string;
  driver?: string;
  team?: string;
  imageZoom?: number;
  imageX?: number;
  imageY?: number;
  customBorderColor?: string;
  customStatLabelColor?: string;
  customStatValueColor?: string;
  customBottomBarBgColor?: string;
  customBottomBarBorderColor?: string;
  customFrameEffect?: FrameEffect;
  customFrameShine?: boolean;
  customFlameColor?: string;
}

export interface EntryVariant {
  /** This pack's edits to the card's words, picture position, colours and frame effect. */
  edits?: CardEdits;
  /**
   * Stats the admin set for this card on this rarity. The card is given out on that rarity with exactly these stats,
   * whatever it was saved as. (Left out, with `rerollOnPull` also left out, the card keeps the stats it was saved with.)
   */
  stats?: FullArtCardData["stats"];
  /**
   * Roll the four stats fresh, to fit the rarity, each time a member pulls this card. The card is given out on that
   * rarity. Cannot be used together with `stats`.
   */
  rerollOnPull?: boolean;
  /** A style from the style library whose frame (colours, effect, shine) is put on the card. */
  styleId?: string;
  /** A redrawn picture (see restyleCardArtAction) used instead of the card's own. */
  artUrl?: string;
}

export interface PackEntry {
  kind: PackEntryKind;
  /** Style id (kind "style") or saved full art card id (kind "card"). */
  refId: string;
  /** Percent (0 to 100) of cards on this rarity that use this entry. */
  chancePct: number;
    /** Only for set cards (kind "card"): this pack's changes to the card. */
  variant?: EntryVariant;
  /**
   * Only for set cards (kind "card"): show this card under "Rare cards to pull" on the game's Home page.
   * Only ever saved as true; left out means it is not shown there.
   */
  displayPullable?: boolean;
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
  /**
   * The bonus pull. Left out, a custom pack has none and the Standard Pack keeps using the old pullable list at 1 in 100.
   * Once it is set (even to a chance of 0) it is the only thing that decides the bonus pull.
   */
  bonus?: PackBonus;
  /**
   * How many Crew Modifier cards (for Clash Arena) every opening of this pack also gives, from 0 to MAX_EXTRA_CARDS.
   * Left out means none, so packs saved before this existed are unchanged. The Standard Pack always gives one.
   */
  crewCards?: number;
  /** How many Repair Kit (Maintenance Consumable) cards every opening of this pack also gives. Left out means none. */
  repairCards?: number;
  updatedAt: number;
}

/** The most Crew or Repair Kit cards one pack can give. */
export const MAX_EXTRA_CARDS = 5;

/** A Crew or Repair Kit count cleaned: a whole number from 0 to MAX_EXTRA_CARDS, or undefined when it isn't one. */
export function cleanExtraCount(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_EXTRA_CARDS, Math.max(0, n)) : undefined;
}

/** How many Crew and Repair Kit cards a custom pack gives each time it is opened. */
export function packExtraCounts(config: Pick<PackConfig, "crewCards" | "repairCards"> | null | undefined): {
  crew: number;
  repair: number;
} {
  return { crew: cleanExtraCount(config?.crewCards) ?? 0, repair: cleanExtraCount(config?.repairCards) ?? 0 };
}

/** A set card in a pack's bonus pull. `weight` (1 to 100) is its share of the bonus pulls: higher is pulled more often. */
export interface BonusEntry {
  /** A saved full art card id. */
  refId: string;
    weight: number;
  /** This pack's changes to the card. Only the style and redrawn picture count: a bonus card's rarity and stats are set when it is given out. */
  variant?: EntryVariant;
  /** Show this card under "Rare cards to pull" on the game's Home page. Only ever saved as true. */
  displayPullable?: boolean;
}

/**
 * The bonus pull: an extra card that sometimes comes in a pack on top of its normal cards. Each pack has its own chance
 * of it (`chancePct`, a percent of packs; 1 means 1 in 100) and its own list of set cards to pull it from. The picture
 * is fixed, so a bonus pull never costs an AI image. It does not depend on a rarity roll, and (for the Standard Pack)
 * it works whether or not the master switch for styles and set cards is on.
 */
export interface PackBonus {
  chancePct: number;
  entries: BonusEntry[];
}

export const MAX_BONUS_ENTRIES = 60;
export const MIN_BONUS_WEIGHT = 1;
export const MAX_BONUS_WEIGHT = 100;
/** The Standard Pack's bonus pull has always been 1 in 100. */
export const DEFAULT_BONUS_CHANCE_PCT = 1;

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
    // A new custom pack gives one Crew card and one Repair Kit, like the Standard Pack. (The Standard Pack ignores these.)
    ...(isStandard ? {} : { crewCards: 1, repairCards: 1 }),
    updatedAt: 0,
  };
}

/** Redrawn set card pictures live under set-cards/ in our own file store, so nothing else can be pointed at. */
const SET_CARD_ART_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/set-cards\/\S+$/i;

const TEXT_LIMITS = { name: 40, ability: 48, effect: 160, driver: 30, team: 30 } as const;
const COLOUR_FIELDS = [
  "customBorderColor",
  "customStatLabelColor",
  "customStatValueColor",
  "customBottomBarBgColor",
  "customBottomBarBorderColor",
] as const;

/** Edits cleaned: text trimmed to the card's limits (the name can't be blank), colours and numbers checked. Undefined when nothing is left. */
export function cleanEdits(v: unknown): CardEdits | undefined {
  if (!v || typeof v !== "object") return undefined;
  const src = v as Record<string, unknown>;
  const out: CardEdits = {};

  for (const key of ["name", "ability", "effect", "driver", "team"] as const) {
    if (typeof src[key] !== "string") continue;
    const text = (src[key] as string).replace(/\s+/g, " ").trim().slice(0, TEXT_LIMITS[key]);
    if (key === "name" && !text) continue;
    out[key] = text;
  }
  const num = (k: string, min: number, max: number) => {
    const n = Number(src[k]);
    return src[k] !== undefined && src[k] !== null && src[k] !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
  };
  const zoom = num("imageZoom", 100, 300);
  const x = num("imageX", 0, 100);
  const y = num("imageY", 0, 100);
  if (zoom !== undefined) out.imageZoom = zoom;
  if (x !== undefined) out.imageX = x;
  if (y !== undefined) out.imageY = y;

  for (const key of COLOUR_FIELDS) {
    const colour = clampColor(src[key]);
    if (colour) out[key] = colour;
  }
  if (FRAME_EFFECTS.includes(src.customFrameEffect as FrameEffect)) out.customFrameEffect = src.customFrameEffect as FrameEffect;
  if (typeof src.customFrameShine === "boolean") out.customFrameShine = src.customFrameShine;
  const flame = clampHexColor(src.customFlameColor);
  if (flame) out.customFlameColor = flame;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** A variant cleaned: all four stats from 1 to 25, a known style id, a picture from our own file store. Undefined when nothing is left. */
export function cleanVariant(v: unknown): EntryVariant | undefined {
  if (!v || typeof v !== "object") return undefined;
  const src = v as Record<string, unknown>;
  const out: EntryVariant = {};

  const s = src.stats && typeof src.stats === "object" ? (src.stats as Record<string, unknown>) : null;
  if (s) {
    const read = (k: string) => Math.round(Number(s[k]));
    const [drift, accel, grip, steer] = [read("drift"), read("accel"), read("grip"), read("steer")];
    if ([drift, accel, grip, steer].every((n) => Number.isFinite(n))) {
      const clamp = (n: number) => String(Math.min(25, Math.max(1, n)));
      out.stats = { drift: clamp(drift), accel: clamp(accel), grip: clamp(grip), steer: clamp(steer) };
    }
  }
  // Stats are either set by hand or rolled at the pull, never both. Set stats win if both somehow arrive.
  if (src.rerollOnPull === true && !out.stats) out.rerollOnPull = true;
  const styleId = typeof src.styleId === "string" ? src.styleId.trim() : "";
  if (ID_PATTERN.test(styleId)) out.styleId = styleId;
  const artUrl = typeof src.artUrl === "string" ? src.artUrl.trim() : "";
  if (artUrl.length <= 600 && SET_CARD_ART_URL.test(artUrl)) out.artUrl = artUrl;
  const edits = cleanEdits(src.edits);
  if (edits) out.edits = edits;

  return out.stats || out.rerollOnPull || out.styleId || out.artUrl || out.edits ? out : undefined;
}

/** What happens to a set card's stats in a pack: kept as saved, rolled fresh at each pull, or set by hand. */
export type StatsMode = "keep" | "reroll" | "custom";
export function variantStatsMode(variant: EntryVariant | undefined): StatsMode {
  return variant?.stats ? "custom" : variant?.rerollOnPull ? "reroll" : "keep";
}

/**
 * A saved set card as one pack uses it: with the entry's stats (set by hand, or rolled when `rng` is given and the entry
 * rerolls at the pull), the rarity it is on, the style's frame, and the redrawn picture. A style that no longer exists is
 * ignored. Nothing is saved; the card passed in is not changed.
 *
 * Pass `rng` only where a card is actually being given out. Without it a "reroll at the pull" card shows "??" for its
 * stats (on the entry's rarity), since they aren't known until it is pulled. This is what the editor and the store's set
 * list show. Nothing reads the stats back from a card shown this way.
 */
export function applyVariant<T extends FullArtCardData>(
  card: T,
  variant: EntryVariant | undefined,
  styles: ReadonlyMap<string, PackStyle> | undefined,
  tier?: FullArtTier,
  rng?: Rng
): T {
  if (!variant) return card;
  const style = variant.styleId ? styles?.get(variant.styleId) : undefined;
  const rolled = variant.rerollOnPull && tier && rng ? rollStatsForTier(tier, rng) : undefined;
  const unknown = variant.rerollOnPull && tier && !rng && !variant.stats ? { drift: ROLLED_STAT, accel: ROLLED_STAT, grip: ROLLED_STAT, steer: ROLLED_STAT } : undefined;
  return {
    ...card,
    ...(variant.stats ? { stats: variant.stats, ...(tier ? { tier } : {}) } : {}),
    ...(variant.rerollOnPull && tier ? { tier, ...(rolled ? { stats: rolled } : unknown ? { stats: unknown } : {}) } : {}),
    ...(style ? frameFieldsFor(style.frame) : {}),
    // This pack's own edits win over the card and over the style's frame.
    ...(variant.edits ?? {}),
    ...(variant.artUrl ? { imageUrl: variant.artUrl } : {}),
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
    const variant = kind === "card" ? cleanVariant(e.variant) : undefined;
        out.push({
      kind,
      refId,
      chancePct,
      ...(variant ? { variant } : {}),
      ...(kind === "card" && e.displayPullable === true ? { displayPullable: true } : {}),
    });
  }
  return out;
}

/** A bonus pull cleaned: a chance from 0 to 100, and known card ids with no duplicates, weights in range, capped in number. */
export function cleanBonus(v: unknown): PackBonus | undefined {
  if (!v || typeof v !== "object") return undefined;
  const src = v as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: BonusEntry[] = [];
  for (const raw of Array.isArray(src.entries) ? src.entries : []) {
    if (entries.length >= MAX_BONUS_ENTRIES) break;
    const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const refId = typeof e.refId === "string" ? e.refId.trim() : "";
    if (!ID_PATTERN.test(refId) || seen.has(refId)) continue;
    seen.add(refId);
    const weight = Math.round(Number(e.weight));
    // A bonus card's stats are set when it is given out, so only the style, picture and edits of a variant are kept.
    const variantRaw = cleanVariant(e.variant);
    const variant =
      variantRaw?.styleId || variantRaw?.artUrl || variantRaw?.edits
        ? {
            ...(variantRaw.styleId ? { styleId: variantRaw.styleId } : {}),
            ...(variantRaw.artUrl ? { artUrl: variantRaw.artUrl } : {}),
            ...(variantRaw.edits ? { edits: variantRaw.edits } : {}),
          }
        : undefined;
    entries.push({
      refId,
            weight: Number.isFinite(weight) ? Math.min(MAX_BONUS_WEIGHT, Math.max(MIN_BONUS_WEIGHT, weight)) : MIN_BONUS_WEIGHT,
      ...(variant ? { variant } : {}),
      ...(e.displayPullable === true ? { displayPullable: true } : {}),
    });
  }
  return { chancePct: clampPct(src.chancePct, 6), entries };
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

    const bonus = cleanBonus(v.bonus);
    const crewCards = cleanExtraCount(v.crewCards);
    const repairCards = cleanExtraCount(v.repairCards);
    return {
      packId,
      enabled: isStandard ? v.enabled === true : true,
      oddsOverride: isStandard ? v.oddsOverride === true : true,
      oddsPct,
      rarities,
      ...(bonus ? { bonus } : {}),
      ...(!isStandard && crewCards !== undefined ? { crewCards } : {}),
      ...(!isStandard && repairCards !== undefined ? { repairCards } : {}),
      updatedAt: Number(v.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

/** A message describing the first problem with a config, or null when it is fine to save. */
export function validatePackConfig(config: PackConfig): string | null {
  if (config.bonus && config.bonus.chancePct > 0 && config.bonus.entries.length === 0) {
    return "The bonus pull has a chance but no cards. Add a card to it, or set its chance to never.";
  }
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

// ── The bonus pull ──────────────────────────────────────────────────────────

/** True when a pack's bonus pull is set up and switched on (a chance above 0 and at least one card). */
export function bonusIsActive(bonus: PackBonus | undefined): bonus is PackBonus {
  return Boolean(bonus && bonus.chancePct > 0 && bonus.entries.length > 0);
}

/** Does this pack open include its bonus pull? One roll against the pack's chance. */
export function rollBonusHit(bonus: PackBonus, rng: Rng): boolean {
  return rng() * 100 < bonus.chancePct;
}

/** Pick one card of the bonus pull in proportion to the weights. Cards that are no longer available are skipped. */
export function pickBonusEntry(entries: BonusEntry[], rng: Rng, isAvailable: (entry: BonusEntry) => boolean): BonusEntry | null {
  const usable = entries.filter(isAvailable);
  const total = usable.reduce((sum, e) => sum + e.weight, 0);
  if (usable.length === 0 || total <= 0) return null;
  let r = rng() * total;
  for (const entry of usable) {
    if (r < entry.weight) return entry;
    r -= entry.weight;
  }
  return usable[usable.length - 1];
}

/** The percent of all pack opens that pull this card as the bonus: the pack's bonus chance times the card's share. */
export function bonusEntryOverallPct(bonus: PackBonus, entry: BonusEntry): number {
  const total = bonus.entries.reduce((sum, e) => sum + e.weight, 0);
  return total > 0 ? round((bonus.chancePct * entry.weight) / total, 6) : 0;
}

/**
 * How a set card is given out as a bonus pull: as a Legend card, with each stat lifted into 23 to 25, whatever rarity and
 * stats it was saved with. This is how the Standard Pack's bonus card has always been given out. (Stats saved on the old
 * out-of-10 scale are converted first.) The one exception is a Mythic card: it stays Mythic with 25 in every stat, because
 * Legend stops short of that and a Mythic card shown as Legend would carry Mythic's stats under the wrong rarity.
 */
export function bonusPullCard(source: Pick<FullArtCardData, "stats"> & { tier?: FullArtTier }): {
  tier: FullArtTier;
  stats: FullArtCardData["stats"];
} {
  if (source.tier === "mythic") return { tier: "mythic", stats: { drift: "25", accel: "25", grip: "25", steer: "25" } };
  const raw = source.stats || { drift: "24", accel: "23", grip: "23", steer: "24" };
  const lift = (value: string | undefined, fallback: number) => {
    const n = Number(value || fallback) > 10 ? Number(value) : Number(value || 9) * 2.5;
    return String(Math.max(23, Math.min(25, Math.round(n))));
  };
  return {
    tier: "legend",
    stats: { drift: lift(raw.drift, 24), accel: lift(raw.accel, 23), grip: lift(raw.grip, 23), steer: lift(raw.steer, 24) },
  };
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
  // Moving an old pack over must not change what it gives out, so it keeps giving no Crew or Repair Kit cards.
  config.crewCards = 0;
  config.repairCards = 0;
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
