import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import type { MemberCard } from "@/lib/card-roll";
import type { PackConfig } from "@/lib/pack-config";

/**
 * DriftClash — Penthouse TCG Types
 *
 * Shares 100% of Redis storage keys and card structures with Penthouse Drift
 * while adding gamified progression, Clash Arena 3v3 battles, and Hall of Fame
 * leaderboards.
 */

export type TcgTab =
  | "home"
  | "tour"
  | "collection"
  | "store"
  | "marketplace"
  | "p-credits"
  | "leaderboard";

/** Fixed P-Credits payout when a member quick-sells (deletes) a card by tier. */
export type QuickSellRateTable = Record<FullArtTier, number>;

/** Purchasable P-Credits bundle via SumUp real-money checkout. */
export interface PCreditBundle {
  id: string;
  name: string;
  pCredits: number;
  priceGbp: number;
  /** Optional discounted sale price in GBP (active when > 0 and < priceGbp). */
  salePriceGbp?: number | null;
  badge?: string;
  description: string;
}

/** A member's card listed for sale on the TCG Marketplace. */
export interface TcgMarketListing {
  id: string;
  cardId: string;
  sellerId: string;
  sellerName: string;
  /** Asking price in P-Credits. */
  price: number;
  createdAt: number;
  /** Snapshot of the card for instant marketplace display & filtering. */
  card: MemberCard;
}

/** A card entry inside an admin-created Custom Pack set list. */
export interface TcgCustomPackCardEntry {
  /** ID of the saved Full-Art card (`fullart:<id>`). */
  cardId: string;
  /** Relative pull weight (1–100, default 10). */
  weight: number;
}

export type TcgPackStatus = "draft" | "live";

/** Admin-created custom pack backed by a set list of Full-Art cards. */
export interface TcgCustomPack {
  id: string;
  name: string;
  description: string;
  /** Regular price in P-Credits to purchase and open this pack. */
  price: number;
  /** Optional discounted sale price in P-Credits (active when > 0 and < price). */
  salePrice?: number | null;
  status: TcgPackStatus;
  /**
   * Whether a live pack can be bought and opened right now. A live pack that is not purchasable still shows in the store
   * (members can look at what is in it) but its buy button is off. Missing means yes, so existing packs are unchanged.
   */
  purchasable?: boolean;
  /**
   * Whether a pack credit (earned by checking in, or bought with a Standard Pack) can open this pack instead of paying
   * its price in P-Credits. On unless an admin turns it off for this pack; a pack that never had the setting is on.
   */
  allowCardCredits?: boolean;
  /** Number of cards pulled per pack opening (default 1). Not counting any Crew or Repair Kit cards it also gives. */
  cardsPerPack: number;
  /** Set list of saved Full-Art cards assigned to this pack. */
  cards: TcgCustomPackCardEntry[];
  createdAt: number;
  updatedAt: number;
}

/** Hydrated custom pack with full card details for the Pack Store and Admin Pack Manager. */
export interface TcgCustomPackWithCards extends TcgCustomPack {
  setList: Array<{
    card: FullArtCardData;
    weight: number;
    /** Chance that a card from this pack is this card (percent of all cards). */
    chancePct: number;
  }>;
  /**
   * Set on packs that open by the per-rarity rules (see lib/pack-config.ts). Old packs have none and
   * open exactly as before. For these, `setList` holds the fixed cards with their overall chance.
   */
  config?: PackConfig;
  /** True when some cards in the pack are drawn from a car, so opening it needs a car photo or community cars. */
  needsGeneration?: boolean;
  /** Set when the pack's bonus pull is on: the chance of a bonus card per pack, and how many cards it can be. */
  bonus?: { chancePct: number; count: number };
  /** The Crew and Repair Kit cards every opening also gives, on top of `cardsPerPack`. */
  extraCards?: { crew: number; repair: number };
}

/** Global store configuration for the TCG Pack Store & P-Credit Bundles. */
export interface TcgStoreConfig {
  /** Regular P-Credit cost for a Standard Pack (default 100 P-Credits). */
  standardPackPrice: number;
  /** Optional sale price in P-Credits for a Standard Pack (active when > 0 and < standardPackPrice). */
  standardPackSalePrice?: number | null;
  /** Admin-configurable P-Credit real-money bundles (falls back to P_CREDIT_BUNDLES). */
  pCreditBundles: PCreditBundle[];
  updatedAt: number;
}

/** Persistent player Clash Arena battle stats stored in `tcg:clash:stats:<userId>`. */
export interface ClashPlayerStats {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  dailyWinClaimed: boolean;
}

/** A 3-card rival car crew + 3 Crew Advantage Cards pulled from the shared community pool for Clash Arena. */
export interface ClashOpponent {
  id: string;
  driverName: string;
  teamName: string;
  title: string;
  crewPower: number;
  cards: MemberCard[];
  crewCard: MemberCard;
  crewCards?: [MemberCard, MemberCard, MemberCard];
  /**
   * Extra cars the rival may choose its three from once the track and debuffs are known. Challenge rivals
   * have these; the first three of `cards` are used if the AI can't run.
   */
  carPool?: MemberCard[];
  /** The Crew cards the rival owns (definition id and rarity), to choose its three from. */
  crewPoolSpecs?: Array<{ cardId: string; tier: FullArtTier }>;
  /** How well the rival plays, 0 to 1. Leave out for the default. */
  aiSkill?: number;
}

/** Hall of Fame Leaderboard entry computed from shared Redis member & card data. */
export interface DriftClashLeaderboardEntry {
  userId: string;
  driverName: string;
  avatarUrl: string | null;
  totalCards: number;
  mythicCount: number;
  legendCount: number;
  goldCount: number;
  collectorPower: number;
  level: number;
  rankTitle: string;
  rankIcon: string;
  packsOpened: number;
  clashWins: number;
  topCard: {
    carName: string;
    tier: FullArtTier;
    imageUrl: string;
  } | null;
}
