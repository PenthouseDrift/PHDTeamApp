import { redis } from "@/lib/redis";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { RARITY_RANK } from "@/lib/card-roll";
import { FEATURED_CARDS_KEY, MEMBER_CARD_ID_PATTERN } from "@/lib/member-card-store";
import {
  STANDARD_PACK_ID,
  applyVariant,
  bonusPullCard,
  bonusIsActive,
  effectivePcts,
  packExtraCounts,
  standardOddsPct,
  variantStatsMode,
  type PackConfig,
} from "@/lib/pack-config";
import { loadPackConfig, loadRuntimeFor, loadSetCards, type PackRuntime } from "@/lib/pack-config-store";
import { ALL_TIERS } from "@/lib/pack-styles";
import { hydrateCustomPacks, parseCustomPack, tcgCustomPackKey } from "@/tcg/storage";

/**
 * What a member is told about the cards in a pack. Built on the server from the pack's setup and sent to the browser, so it
 * holds only what a member should see: which cards can come out, never their odds and never a style's drawing instructions.
 * Odds are worked out here to decide what to include, and then left out of what is sent.
 */

export interface PackContentsCard {
  card: FullArtCardData;
  /** True when the card's stats are rolled again each time it is pulled, so the stats shown are only an example. */
  rerolled: boolean;
}

export interface PackContentsTier {
  tier: FullArtTier;
  /** The fixed cards that can be this rarity. */
  cards: PackContentsCard[];
  /** True when some cards of this rarity are drawn from a car when the pack is opened. */
  drawn: boolean;
}

export interface PackContents {
  packId: string;
  name: string;
  cardsPerPack: number;
  /** Plain-language lines about what every pack always includes. Only the Standard Pack has any. */
  includes: string[];
  tiers: PackContentsTier[];
  /** The cards the rare extra card can be. Null when the pack has none. */
  bonus: { cards: Array<{ card: FullArtCardData }> } | null;
}

/** Rarest first. */
const RAREST_FIRST = [...ALL_TIERS].reverse();

/** The rarity rows and bonus of a pack that opens by the per-rarity rules. */
function fromConfig(config: PackConfig, runtime: PackRuntime): Pick<PackContents, "tiers" | "bonus"> {
  const pcts = effectivePcts(config);
  const tiers: PackContentsTier[] = [];
  for (const tier of RAREST_FIRST) {
    if (pcts[tier] <= 0) continue;
    const cards: PackContentsCard[] = [];
    let fixedPct = 0;
    for (const entry of config.rarities[tier]) {
      if (entry.kind !== "card" || entry.chancePct <= 0) continue;
      const saved = runtime.cards.get(entry.refId);
      if (!saved) continue;
      fixedPct += entry.chancePct;
      cards.push({
        card: applyVariant(saved, entry.variant, runtime.styles, tier),
        rerolled: variantStatsMode(entry.variant) === "reroll",
      });
    }
    tiers.push({ tier, cards, drawn: fixedPct < 100 - 1e-4 });
  }

  let bonus: PackContents["bonus"] = null;
  const bonusConfig = config.bonus;
  if (bonusIsActive(bonusConfig)) {
    const list: Array<{ card: FullArtCardData }> = [];
    for (const entry of bonusConfig.entries) {
      const saved = runtime.cards.get(entry.refId);
      if (!saved) continue;
      // Shown as it is given out: Legend with lifted stats, or Mythic for a Mythic card.
      const shown = applyVariant(saved, entry.variant, runtime.styles);
      list.push({ card: { ...shown, ...bonusPullCard(shown) } });
    }
    if (list.length > 0) bonus = { cards: list };
  }
  return { tiers, bonus };
}

/** The Standard Pack's bonus when it still uses the old pullable list: a 1 in 100 chance, weighted by each card. */
async function legacyStandardBonus(): Promise<PackContents["bonus"]> {
  const raw = ((await redis.hgetall(FEATURED_CARDS_KEY)) ?? {}) as Record<string, unknown>;
  const entries = Object.entries(raw)
    .map(([id, w]) => ({ id, weight: Number(w) }))
    .filter((e) => MEMBER_CARD_ID_PATTERN.test(e.id) && Number.isFinite(e.weight) && e.weight > 0);
  if (entries.length === 0) return null;
  const cards = await loadSetCards(entries.map((e) => e.id));
  const list = entries
    .filter((e) => cards.has(e.id))
    .map((e) => {
      const saved = cards.get(e.id)!;
      return { card: { ...saved, ...bonusPullCard(saved) } };
    });
  return list.length > 0 ? { cards: list } : null;
}

async function buildStandard(): Promise<PackContents> {
  const config = await loadPackConfig(STANDARD_PACK_ID).catch(() => null);
  const includes = [
    "1 Custom AI Card of your car",
    "1 Community Car Card",
    "1 Tactical Crew Card for Clash Arena",
    "1 Repair Kit",
    "A chance at a rare Bonus Set Card",
  ];

  // The set cards and styles only count once the Standard Pack's custom setup is switched on.
  const customOn = Boolean(config?.enabled && (config.oddsOverride || Object.values(config.rarities).some((e) => e.length > 0)));
  let tiers: PackContentsTier[];
  let bonus: PackContents["bonus"] = null;

  if (config && customOn) {
    const runtime = await loadRuntimeFor(config);
    ({ tiers, bonus } = fromConfig(config, runtime));
  } else {
    const pcts = effectivePcts({ oddsOverride: false, oddsPct: standardOddsPct() });
    tiers = RAREST_FIRST.filter((tier) => pcts[tier] > 0).map((tier) => ({ tier, cards: [], drawn: true }));
  }

  // The bonus pull works whether or not the setup above is on. Once it has been set up in the pack maker, that is what counts.
  if (config?.bonus) {
    if (!customOn && bonusIsActive(config.bonus)) {
      const runtime = await loadRuntimeFor(config);
      bonus = fromConfig(config, runtime).bonus;
    }
  } else {
    bonus = await legacyStandardBonus();
  }

  return { packId: STANDARD_PACK_ID, name: "Penthouse Standard Pack", cardsPerPack: 4, includes, tiers, bonus };
}

/**
 * The contents of the Standard Pack (id "standard") or of a store pack. A store pack must be live to be seen unless the
 * person looking is an admin. Returns null when there is no such pack.
 */
export async function buildPackContents(packId: string, options: { isAdmin?: boolean } = {}): Promise<PackContents | null> {
  if (packId === STANDARD_PACK_ID) return buildStandard();
  if (!MEMBER_CARD_ID_PATTERN.test(packId)) return null;

  const raw = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
  if (!raw || (raw.status !== "live" && !options.isAdmin)) return null;
  const [pack] = await hydrateCustomPacks([raw]);
  if (!pack) return null;

  const base = { packId: pack.id, name: pack.name, cardsPerPack: pack.cardsPerPack, includes: [] as string[] };

  if (pack.config) {
    const runtime = await loadRuntimeFor(pack.config);
    const { tiers, bonus } = fromConfig(pack.config, runtime);
    const { crew, repair } = packExtraCounts(pack.config);
    const includes = [
      `${pack.cardsPerPack} card${pack.cardsPerPack === 1 ? "" : "s"} from this pack`,
      ...(crew > 0 ? [`${crew} Tactical Crew Card${crew === 1 ? "" : "s"} for Clash Arena`] : []),
      ...(repair > 0 ? [`${repair} Repair Kit${repair === 1 ? "" : "s"}`] : []),
      ...(bonus ? ["A chance at a rare Bonus Set Card"] : []),
    ];
    return { ...base, includes, tiers, bonus };
  }

  // An old pack: one weighted list of cards. Group it by the rarity each card was saved as.
  const byTier = new Map<FullArtTier, PackContentsCard[]>();
  for (const { card } of pack.setList) {
    const list = byTier.get(card.tier) ?? [];
    list.push({ card, rerolled: false });
    byTier.set(card.tier, list);
  }
  const tiers = [...byTier.entries()]
    .sort((a, b) => RARITY_RANK[b[0]] - RARITY_RANK[a[0]])
    .map(([tier, cards]) => ({ tier, cards, drawn: false }));
  return { ...base, tiers, bonus: null };
}
