/**
 * Member card packs: what a pack can contain and how it is rolled. Pure (no server imports) so the
 * server action that rolls, the wizard that shows the odds, and the collection page share one
 * definition. The roll itself only ever runs on the server.
 */

import { ART_STYLES } from "@/lib/card-maker";
import { FULL_ART_TIERS, MAX_ART_STYLES, type FullArtCardData, type FullArtTier } from "@/lib/full-art-card";

/** A function returning a number in [0, 1). The server passes a crypto-based one; tests pass a fixed one. */
export type Rng = () => number;

// ── Rarity & Stats (1–25 per stat -> Total /100 determines Rarity) ──────────

/**
 * Each of the 4 stats (DRIFT, ACCEL, GRIP, STEER) is rolled independently from 1 to 25 (total 4–100).
 * The card's rarity tier is derived directly from its total /100 score:
 *   - Bronze:  4 – 59  (~69.2%, ~1 in 1.4)
 *   - Silver: 60 – 74  (~24.7%, ~1 in 4)
 *   - Gold:   75 – 84  (~5.09%, ~1 in 20)
 *   - Legend: 85 – 99  (~0.99%, ~1 in 101)
 *   - Mythic: 100/100  (1 in 390,625 jackpot roll, or admin created)
 */
export const RARITY_STAT_BRACKETS: Array<{
  tier: FullArtTier;
  minTotal: number;
  maxTotal: number;
  oneIn: number;
  chance: number;
}> = [
  { tier: "mythic", minTotal: 100, maxTotal: 100, oneIn: 390625, chance: 1 / 390625 },
  { tier: "legend", minTotal: 85, maxTotal: 99, oneIn: 101, chance: 3875 / 390625 },
  { tier: "gold", minTotal: 75, maxTotal: 84, oneIn: 20, chance: 19871 / 390625 },
  { tier: "silver", minTotal: 60, maxTotal: 74, oneIn: 4, chance: 96500 / 390625 },
  { tier: "bronze", minTotal: 4, maxTotal: 59, oneIn: 1, chance: 270378 / 390625 },
];

export const RARITY_ODDS: Array<{ tier: FullArtTier; oneIn: number; chance: number }> =
  RARITY_STAT_BRACKETS.map(({ tier, oneIn, chance }) => ({ tier, oneIn, chance }));

export function statTotal(stats: FullArtCardData["stats"]): number {
  return (
    (Number(stats.drift) || 0) +
    (Number(stats.accel) || 0) +
    (Number(stats.grip) || 0) +
    (Number(stats.steer) || 0)
  );
}

/** Determine a pack card's rarity tier from its 4 rolled stats (total 4–100). Perfect 100 awards Mythic! */
export function tierFromStats(stats: FullArtCardData["stats"]): FullArtTier {
  const total = statTotal(stats);
  if (total >= 100) return "mythic";
  if (total >= 85) return "legend";
  if (total >= 75) return "gold";
  if (total >= 60) return "silver";
  return "bronze";
}

/** Roll all 4 stats independently from 1 to 25. */
export function rollStats(tierOrRng: FullArtTier | Rng, maybeRng?: Rng): FullArtCardData["stats"] {
  const rng = typeof tierOrRng === "function" ? tierOrRng : (maybeRng as Rng);
  const one = () => String(1 + Math.floor(rng() * 25));
  return { drift: one(), accel: one(), grip: one(), steer: one() };
}

/** Roll all 4 stats (1–25 each) and derive the corresponding rarity tier from their sum (/100). */
export function rollStatsAndRarity(rng: Rng): {
  stats: FullArtCardData["stats"];
  tier: FullArtTier;
  total: number;
} {
  const stats = rollStats(rng);
  const total = statTotal(stats);
  const tier = tierFromStats(stats);
  return { stats, tier, total };
}

export function rollRarity(rng: Rng): FullArtTier {
  return rollStatsAndRarity(rng).tier;
}

/** Rarity order for sorting, lowest first. */
export const RARITY_RANK: Record<FullArtTier, number> = { bronze: 0, silver: 1, gold: 2, legend: 3, mythic: 4 };

// ── Art styles ──────────────────────────────────────────────────────────────

/** How many art styles a pack picks: one 50%, two 33%, three 17%. Every card gets at least one. */
const STYLE_COUNT_WEIGHTS = [0, 0.5, 0.33, 0.17];

/** A random set of 1 to MAX_ART_STYLES different art styles from every style the card maker has. */
export function rollStyleIds(rng: Rng): string[] {
  let r = rng();
  let count = 1;
  for (let i = 0; i < STYLE_COUNT_WEIGHTS.length; i++) {
    if (r < STYLE_COUNT_WEIGHTS[i]) {
      count = i;
      break;
    }
    r -= STYLE_COUNT_WEIGHTS[i];
    count = i;
  }
  count = Math.max(1, Math.min(count, MAX_ART_STYLES));
  const pool = ART_STYLES.map((s) => s.id);
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picked;
}

// ── Member cards ────────────────────────────────────────────────────────────

/** A card in a member's collection: the full art card plus who owns it and where it is in the pack flow. */
export interface MemberCard extends Omit<FullArtCardData, "id" | "updatedAt"> {
  id: string;
  userId: string;
  createdAt: number;
  /** The art styles the pack picked, for display. */
  styleIds: string[];
  /** The member chose to keep it, so it can no longer be re-rolled. */
  kept: boolean;
  /** The one re-roll has been used. */
  rerolled: boolean;
  /** The member's name when they opened it, so admins can see whose it is. */
  ownerName?: string;
  /** A card that was re-rolled away. It is kept for the admin view only and is never shown to the member. */
  archived?: boolean;
  /**
   * A bonus card: it came in a pack alongside the member's own card and is built from another member's
   * card (their name, team and car details), drawn again with its own rarity, stats and art style.
   */
  bonus?: boolean;
  /** A set card from the admin's pullable list (a third card in a pack). Its picture is fixed, not drawn. */
  featured?: boolean;
  /** Custom pack ID if pulled from a custom set pack in the TCG store. */
  packId?: string;
  /** Custom pack name if pulled from a custom set pack in the TCG store. */
  packName?: string;
  /** Present when this card is currently listed for sale on the TCG Marketplace. */
  listingId?: string;
  /** Asking price in P-Credits when listed on the TCG Marketplace. */
  listedPrice?: number;
  /** Total battles before car breaks down (random 2..10 for fresh cars) */
  maxBattles?: number;
  /** Battles remaining before breakdown (counts down to 0) */
  battlesRemaining?: number;
  /** Active mechanical fault when durability reaches 0 */
  fault?: import("./mechanical-faults").MechanicalFault | null;
  /** If cardType === "maintenance", which fault it repairs */
  targetFault?: import("./mechanical-faults").MechanicalFaultType;
  /** If cardType === "maintenance", how many battles it reduces from cooldown */
  repairBattles?: number;
}

/** Server-side copy, which also remembers the car photo so a re-roll can use it again. */
export interface StoredMemberCard extends MemberCard {
  referenceUrl: string;
  /** For a bonus card: the card it was built from, so admins can trace it. */
  bonusFromCardId?: string;
}

/**
 * The chance a pack also holds a second card, built from a card someone has already made. 1 means
 * every pack has one (as long as there is an earlier card to build it from); lower it for a rarer extra.
 */
export const BONUS_CARD_CHANCE = 1;

/**
 * The chance a pack also holds a third card: one of the set cards an admin chose to make pullable
 * (see the admin card maker). 1 in 100. These are fixed card images, never redrawn.
 */
export const FEATURED_CARD_CHANCE = 1 / 100;

/**
 * Member cards are shown slightly zoomed in. If the AI still draws a border around its picture despite
 * the prompt, this trims most of it off, and it costs almost nothing when there is none.
 */
export const MEMBER_ART_ZOOM = 106;

/**
 * Master switch for re-rolling. While it is false nobody can re-roll: new cards are kept as soon as
 * they are opened, no re-roll buttons or prompts show, and the server refuses re-roll requests. All
 * the re-roll code is still here, so turning it back on is just changing this to true.
 */
export const REROLL_ENABLED = false;

/** A new card can be re-rolled once, until the member keeps it, and for a day after it was opened. */
export const REROLL_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canRerollCard(card: Pick<MemberCard, "kept" | "rerolled" | "createdAt">, now: number = Date.now()): boolean {
  return REROLL_ENABLED && !card.kept && !card.rerolled && now - card.createdAt < REROLL_WINDOW_MS;
}

/** What to print as the card's big name: the garage car's name, else the chassis, else the driver. */
export function cardTitle(parts: { carName?: string; chassis?: string; driver: string }): string {
  return (parts.carName?.trim() || parts.chassis?.trim() || parts.driver.trim() || "My car").slice(0, 40);
}

export const rarityLabel = (tier: FullArtTier) => FULL_ART_TIERS.find((t) => t.id === tier)?.label ?? "Bronze";

// ── Sorting the collection ──────────────────────────────────────────────────

export type CardSortKey = "newest" | "name" | "team" | "driver" | "rarity";
export type SortDirection = "asc" | "desc";

/** The direction that makes sense first for each sort: A to Z for text, best first for rarity, latest first for newest. */
export const DEFAULT_SORT_DIRECTION: Record<CardSortKey, SortDirection> = {
  newest: "desc",
  name: "asc",
  team: "asc",
  driver: "asc",
  rarity: "desc",
};

/**
 * A sorted copy of the cards. Text sorts ignore case, and cards with nothing in that field (for
 * example no team) always go last. Ties fall back to name, then newest first.
 */
export function sortCards<T extends Pick<MemberCard, "name" | "team" | "driver" | "tier" | "createdAt">>(
  cards: T[],
  key: CardSortKey,
  direction: SortDirection
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const field = (c: T): string | null => (key === "team" ? c.team : key === "driver" ? c.driver : key === "name" ? c.name : null);

  return [...cards].sort((a, b) => {
    let result = 0;
    if (key === "rarity") {
      result = (RARITY_RANK[a.tier] - RARITY_RANK[b.tier]) * sign;
    } else if (key === "newest") {
      result = (a.createdAt - b.createdAt) * sign;
    } else {
      const fa = field(a)?.trim() ?? "";
      const fb = field(b)?.trim() ?? "";
      if (!fa && fb) return 1;
      if (fa && !fb) return -1;
      result = text(fa, fb) * sign;
    }
    return result || text(a.name, b.name) || b.createdAt - a.createdAt;
  });
}
