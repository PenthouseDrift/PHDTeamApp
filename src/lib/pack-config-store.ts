import { redis } from "@/lib/redis";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import { fullArtCardKey } from "@/lib/member-card-store";
import type { Rng } from "@/lib/card-roll";
import {
  applyVariant,
  bonusIsActive,
  pickBonusEntry,
  rollBonusHit,
  sanitizePackConfig,
  STANDARD_PACK_ID,
  type PackConfig,
  type PackEntry,
} from "@/lib/pack-config";
import { sanitizePackStyle, type PackStyle } from "@/lib/pack-styles";
import { loadPackStyle, packStyleKey } from "@/lib/pack-styles-store";

/**
 * Where pack configs live in Redis:
 *
 *   tcg:pack:configs   one hash; the field is a pack id ("standard" or a custom pack's id), the value
 *                      is that pack's config as JSON (see pack-config.ts)
 *
 * A custom pack WITH a config opens by the new rules (rarity odds, then styles and set cards per
 * rarity). A custom pack WITHOUT one is an old pack and opens exactly as it always has. The Standard
 * Pack has no config until an admin saves one, and does nothing different until it is switched on.
 */
export const PACK_CONFIGS_KEY = "tcg:pack:configs";

export async function loadPackConfig(packId: string): Promise<PackConfig | null> {
  const raw = await redis.hget(PACK_CONFIGS_KEY, packId);
  return raw ? sanitizePackConfig(raw) : null;
}

/** Every saved config, by pack id. */
export async function loadAllPackConfigs(): Promise<Record<string, PackConfig>> {
  const raw = (await redis.hgetall<Record<string, unknown>>(PACK_CONFIGS_KEY)) ?? {};
  const out: Record<string, PackConfig> = {};
  for (const [id, value] of Object.entries(raw)) {
    const config = sanitizePackConfig(value);
    if (config && config.packId === id) out[id] = config;
  }
  return out;
}

export async function savePackConfig(config: PackConfig): Promise<PackConfig> {
  const saved: PackConfig = { ...config, updatedAt: Date.now() };
  await redis.hset(PACK_CONFIGS_KEY, { [saved.packId]: JSON.stringify(saved) });
  return saved;
}

export async function deletePackConfig(packId: string): Promise<void> {
  await redis.hdel(PACK_CONFIGS_KEY, packId);
}

// ── What a roll needs ───────────────────────────────────────────────────────

/** A pack's config with the styles and set cards it refers to already loaded. */
export interface PackRuntime {
  config: PackConfig;
  styles: Map<string, PackStyle>;
  /** Saved full art cards that have a picture, keyed by id. */
  cards: Map<string, FullArtCardData & { id: string }>;
}

export function entryRefs(config: PackConfig): { styleIds: string[]; cardIds: string[] } {
  const styleIds = new Set<string>();
  const cardIds = new Set<string>();
  for (const entries of Object.values(config.rarities)) {
    for (const e of entries) {
      (e.kind === "style" ? styleIds : cardIds).add(e.refId);
      // A set card can carry a style of its own (its frame), which has to be loaded too.
      if (e.variant?.styleId) styleIds.add(e.variant.styleId);
    }
  }
  for (const e of config.bonus?.entries ?? []) if (e.variant?.styleId) styleIds.add(e.variant.styleId);
  return { styleIds: [...styleIds], cardIds: [...cardIds] };
}

/** Saved set cards that exist and have a picture, by id. Anything missing or unreadable is simply left out. */
export async function loadSetCards(ids: string[]): Promise<Map<string, FullArtCardData & { id: string }>> {
  const cards = new Map<string, FullArtCardData & { id: string }>();
  if (ids.length === 0) return cards;
  const rows = await redis.mget(...ids.map(fullArtCardKey));
  ids.forEach((id, i) => {
    try {
      const raw = rows[i];
      const value = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!value || typeof value !== "object") return;
      const card = sanitizeFullArtCard(value as Partial<FullArtCardData>);
      if (card.imageUrl) cards.set(id, { ...card, id });
    } catch {
      /* a card that can't be read is simply not available */
    }
  });
  return cards;
}

/**
 * Load the styles and cards a config refers to, including the cards of its bonus pull. Things that no longer exist or
 * have no picture are left out.
 */
export async function loadRuntimeFor(config: PackConfig): Promise<PackRuntime> {
  const { styleIds, cardIds } = entryRefs(config);
  const styles = new Map<string, PackStyle>();
  const allCardIds = [...new Set([...cardIds, ...(config.bonus?.entries.map((e) => e.refId) ?? [])])];

  const [styleRows, cards] = await Promise.all([
    styleIds.length > 0 ? redis.mget(...styleIds.map(packStyleKey)) : Promise.resolve([]),
    loadSetCards(allCardIds),
  ]);
  styleIds.forEach((id, i) => {
    const style = sanitizePackStyle(styleRows[i]);
    if (style) styles.set(id, style);
  });
  return { config, styles, cards };
}

/**
 * Roll a pack's bonus pull: one roll against the pack's chance, then one card from its list by weight. Returns the set card
 * (picture and details as saved) or null when there is no bonus this time, or the pack has none set up. Pass the pack's
 * `runtime` when it is already loaded to save a read. The card is not changed here; give it out with `bonusPullCard`.
 */
export async function rollPackBonus(
  config: PackConfig,
  rng: Rng,
  runtime?: PackRuntime | null
): Promise<(FullArtCardData & { id: string }) | null> {
  const bonus = config.bonus;
  if (!bonusIsActive(bonus) || !rollBonusHit(bonus, rng)) return null;
  const cards = runtime?.cards ?? (await loadSetCards(bonus.entries.map((e) => e.refId)));
  const picked = pickBonusEntry(bonus.entries, rng, (e) => cards.has(e.refId));
  const card = picked ? cards.get(picked.refId) : undefined;
  if (!picked || !card) return null;
  if (!picked.variant) return card;

  // This pack's restyle of the card: its style's frame and redrawn picture.
  let styles: ReadonlyMap<string, PackStyle> | undefined = runtime?.styles;
  const styleId = picked.variant.styleId;
  if (styleId && !styles?.has(styleId)) {
    const style = await loadPackStyle(styleId).catch(() => null);
    styles = style ? new Map([[styleId, style]]) : styles;
  }
  return applyVariant(card, picked.variant, styles);
}

/** Whether an entry can be used right now (its style or card still exists). */
export function entryAvailable(runtime: PackRuntime): (entry: PackEntry) => boolean {
  return (entry) => (entry.kind === "style" ? runtime.styles.has(entry.refId) : runtime.cards.has(entry.refId));
}

/**
 * The Standard Pack's runtime, or null when it should roll exactly as it always has: no config, the
 * master switch off, or nothing set up that would change a roll. Any problem reading Redis also gives
 * null, so a pack always opens.
 */
export async function loadStandardPackRuntime(): Promise<PackRuntime | null> {
  try {
    const config = await loadPackConfig(STANDARD_PACK_ID);
    if (!config || !config.enabled) return null;
    const hasEntries = Object.values(config.rarities).some((entries) => entries.length > 0);
    if (!hasEntries && !config.oddsOverride) return null;
    return await loadRuntimeFor(config);
  } catch (error) {
    console.error("[pack-config] could not load the Standard Pack config, rolling as normal:", error);
    return null;
  }
}
