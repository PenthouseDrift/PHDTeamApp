import { randomInt } from "crypto";
import { redis } from "@/lib/redis";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { FEATURED_CARDS_KEY, MEMBER_CARD_ID_PATTERN } from "@/lib/member-card-store";
import {
  DEFAULT_BONUS_CHANCE_PCT,
  STANDARD_PACK_ID,
  applyVariant,
  bonusIsActive,
  bonusPullCard,
  packExtraCounts,
  pickBonusEntry,
  rollBonusHit,
  rollPackCard,
  type PackConfig,
} from "@/lib/pack-config";
import { entryAvailable, loadRuntimeFor, loadSetCards, type PackRuntime } from "@/lib/pack-config-store";
import { ALL_TIERS } from "@/lib/pack-styles";
import { buildPackExtraCards } from "@/tcg/pack-extras";

/**
 * Open a pack on paper. This rolls a pack exactly the way opening one does (the same rarity roll, the same pick of a set
 * card or style, the same bonus pull and the same Crew and Repair Kit cards) but charges nobody, saves nothing and never
 * asks the AI for a picture. A card that opening would have drawn with AI comes back as "drawn", with its rarity and the
 * style it would be drawn in, so a simulation costs nothing however many packs it covers.
 */

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** One thing a simulated pack gave. */
export type SimSlot =
  | { kind: "set"; card: FullArtCardData }
  | { kind: "drawn"; tier: FullArtTier; styleId?: string; styleName?: string }
  | { kind: "bonus"; card: FullArtCardData }
  | { kind: "crew"; card: FullArtCardData }
  | { kind: "repair"; card: FullArtCardData };

export interface SimPackInput {
  config: PackConfig;
  /** Cards rolled from the pack's rarities. The Standard Pack always rolls two (your car and a community car). */
  cardsPerPack: number;
}

/** The Standard Pack's custom setup only counts while its switch is on. */
const isStandardPack = (config: PackConfig) => config.packId === STANDARD_PACK_ID;

function availability(config: PackConfig, runtime: PackRuntime) {
  if (isStandardPack(config) && !config.enabled) return () => false;
  return entryAvailable(runtime);
}

function slotsPerPack(input: SimPackInput): number {
  return isStandardPack(input.config) ? 2 : Math.max(1, Math.min(3, Math.round(input.cardsPerPack) || 1));
}

/** The Standard Pack, before its bonus pull is set up in the pack maker, uses the old pullable list at 1 in 100. */
async function legacyBonus(): Promise<{ id: string; weight: number }[]> {
  const raw = ((await redis.hgetall(FEATURED_CARDS_KEY)) ?? {}) as Record<string, unknown>;
  return Object.entries(raw)
    .map(([id, w]) => ({ id, weight: Number(w) }))
    .filter((e) => MEMBER_CARD_ID_PATTERN.test(e.id) && Number.isFinite(e.weight) && e.weight > 0);
}

/** Roll the bonus pull for one pack. Returns the set card, or null when there is none this time. */
async function rollBonus(
  config: PackConfig,
  runtime: PackRuntime,
  legacy: { id: string; weight: number }[],
  legacyCards: Map<string, FullArtCardData & { id: string }>
): Promise<FullArtCardData | null> {
  if (config.bonus) {
    if (!bonusIsActive(config.bonus) || !rollBonusHit(config.bonus, rng)) return null;
    const picked = pickBonusEntry(config.bonus.entries, rng, (e) => runtime.cards.has(e.refId));
    const saved = picked ? runtime.cards.get(picked.refId) : undefined;
    return picked && saved ? applyVariant(saved, picked.variant, runtime.styles) : null;
  }
  if (!isStandardPack(config) || legacy.length === 0) return null;
  if (rng() * 100 >= DEFAULT_BONUS_CHANCE_PCT) return null;
  const usable = legacy.filter((e) => legacyCards.has(e.id));
  const total = usable.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of usable) {
    if (r < e.weight) return legacyCards.get(e.id) ?? null;
    r -= e.weight;
  }
  return null;
}

async function loadLegacy(config: PackConfig) {
  if (!isStandardPack(config) || config.bonus) return { legacy: [], legacyCards: new Map<string, FullArtCardData & { id: string }>() };
  const legacy = await legacyBonus();
  return { legacy, legacyCards: await loadSetCards(legacy.map((e) => e.id)) };
}

/** Open one pack and return everything it gave, in the order a member would see it. */
export async function simulateOnePack(input: SimPackInput): Promise<SimSlot[]> {
  const { config } = input;
  const runtime = await loadRuntimeFor(config);
  const available = availability(config, runtime);
  const slots: SimSlot[] = [];

  for (let i = 0; i < slotsPerPack(input); i++) {
    const roll = rollPackCard(config, rng, available);
    const saved = roll.entry?.kind === "card" ? runtime.cards.get(roll.entry.refId) : undefined;
    if (saved) {
      slots.push({ kind: "set", card: applyVariant(saved, roll.entry?.variant, runtime.styles, roll.tier, rng) });
    } else {
      const style = roll.entry?.kind === "style" ? runtime.styles.get(roll.entry.refId) : undefined;
      slots.push({ kind: "drawn", tier: roll.tier, ...(style ? { styleId: style.id, styleName: style.name } : {}) });
    }
  }

  const { legacy, legacyCards } = await loadLegacy(config);
  const bonus = await rollBonus(config, runtime, legacy, legacyCards);
  if (bonus) slots.push({ kind: "bonus", card: { ...bonus, ...bonusPullCard(bonus) } });

  // The Standard Pack always gives one Crew card and one Repair Kit; a store pack gives as many as it is set to.
  const extras = await buildPackExtraCards({
    config: isStandardPack(config) ? { ...config, crewCards: 1, repairCards: 1 } : config,
    userId: "simulation",
    ownerName: "Simulation",
    createdAt: 0,
    rng,
    pack: { id: config.packId, name: "Simulation" },
  });
  for (const extra of extras) slots.push({ kind: extra.cardType === "crew" ? "crew" : "repair", card: extra });
  return slots;
}

export interface SimStats {
  packs: number;
  /** Cards rolled from the pack's rarities across all packs (not counting the bonus pull, Crew or Repair Kit cards). */
  rolledCards: number;
  byTier: Record<FullArtTier, number>;
  /** How many of those cards were fixed set cards, and how many opening would have drawn with AI. */
  setCards: number;
  drawnCards: number;
  /** Packs that had at least one AI-drawn card. */
  packsWithDrawn: number;
  /** Each set card that came up, with how many times (most first). */
  setCardHits: Array<{ name: string; tier: FullArtTier; count: number }>;
  /** Each style that took a card's place, with how many times (most first). */
  styleHits: Array<{ name: string; count: number }>;
  bonusHits: number;
  bonusCardHits: Array<{ name: string; count: number }>;
  /** Crew and Repair Kit cards given per pack. */
  crewPerPack: number;
  repairPerPack: number;
}

/** Open many packs and count what came out. Rolls only: no cards are built, so thousands of packs are quick. */
export async function simulateManyPacks(input: SimPackInput, packs: number): Promise<SimStats> {
  const { config } = input;
  const runtime = await loadRuntimeFor(config);
  const available = availability(config, runtime);
  const slots = slotsPerPack(input);
  const { legacy, legacyCards } = await loadLegacy(config);

  const byTier = Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<FullArtTier, number>;
  const setHits = new Map<string, { name: string; tier: FullArtTier; count: number }>();
  const styleHits = new Map<string, { name: string; count: number }>();
  const bonusHits = new Map<string, { name: string; count: number }>();
  let setCards = 0;
  let drawnCards = 0;
  let packsWithDrawn = 0;
  let bonusTotal = 0;

  for (let p = 0; p < packs; p++) {
    let drawnInPack = false;
    for (let i = 0; i < slots; i++) {
      const roll = rollPackCard(config, rng, available);
      byTier[roll.tier]++;
      const saved = roll.entry?.kind === "card" ? runtime.cards.get(roll.entry.refId) : undefined;
      if (saved && roll.entry) {
        setCards++;
        const hit = setHits.get(roll.entry.refId) ?? { name: saved.name, tier: roll.tier, count: 0 };
        hit.count++;
        setHits.set(roll.entry.refId, hit);
      } else {
        drawnCards++;
        drawnInPack = true;
        const style = roll.entry?.kind === "style" ? runtime.styles.get(roll.entry.refId) : undefined;
        if (style) {
          const hit = styleHits.get(style.id) ?? { name: style.name, count: 0 };
          hit.count++;
          styleHits.set(style.id, hit);
        }
      }
    }
    if (drawnInPack) packsWithDrawn++;
    const bonus = await rollBonus(config, runtime, legacy, legacyCards);
    if (bonus) {
      bonusTotal++;
      const key = bonus.id ?? bonus.name;
      const hit = bonusHits.get(key) ?? { name: bonus.name, count: 0 };
      hit.count++;
      bonusHits.set(key, hit);
    }
  }

  const { crew, repair } = isStandardPack(config) ? { crew: 1, repair: 1 } : packExtraCounts(config);
  return {
    packs,
    rolledCards: packs * slots,
    byTier,
    setCards,
    drawnCards,
    packsWithDrawn,
    setCardHits: [...setHits.values()].sort((a, b) => b.count - a.count),
    styleHits: [...styleHits.values()].sort((a, b) => b.count - a.count),
    bonusHits: bonusTotal,
    bonusCardHits: [...bonusHits.values()].sort((a, b) => b.count - a.count),
    crewPerPack: crew,
    repairPerPack: repair,
  };
}
