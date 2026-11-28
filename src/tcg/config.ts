import type { FullArtTier } from "@/lib/full-art-card";
import type { PCreditBundle, QuickSellRateTable } from "./types";
import { isCarBroken } from "@/lib/mechanical-faults";
import type { MemberCard } from "@/lib/card-roll";

/**
 * Penthouse TCG — Configuration & Economy Constants
 */

/**
 * Fixed Quick Sell payouts in P-Credits per car card rarity tier (healthy state).
 * Quick selling permanently deletes the card and immediately credits the owner.
 *
 * Tuned so that selling every card from an average pack returns a bit over half of what the pack cost (about 55% of a 100 P
 * pack), so quick selling clears cards but can't pay for the next pack. Gold and above are unchanged, so a good pull still pays well.
 */
export const QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 10,
  silver: 20,
  gold: 40,
  legend: 80,
  mythic: 250,
};

/**
 * Reduced Quick Sell payouts in P-Credits if a car is in a state of needing repair:
 * Legend: 25p, Gold: 15p, Silver: 5p, Bronze: 2p, Mythic: 50p.
 */
export const BROKEN_QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 5,
  silver: 8,
  gold: 20,
  legend: 45,
  mythic: 100,
};

/**
 * Quick Sell payouts for Crew and Repair Kit cards, about 40% of a car of the same rarity. Every pack gives these on top of its
 * cars, so they pay less than a car or selling a pack would pay for the next one.
 */
export const UTILITY_QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 5,
  silver: 8,
  gold: 20,
  legend: 40,
  mythic: 100,
};
/** True for the cards that come with a pack as extras (Crew and Repair Kit cards), which have their own Quick Sell prices. */
export function isUtilityCard(card: { cardType?: string }): boolean {
  return card.cardType === "crew" || card.cardType === "maintenance";
}
/** Default price in P-Credits for a Standard Pack in the Pack Store. */
export const DEFAULT_STANDARD_PACK_PRICE = 100;

/** Minimum and maximum asking price (in P-Credits) when listing a card on the Marketplace. */
export const MIN_MARKET_LISTING_PRICE = 5;
export const MAX_MARKET_LISTING_PRICE = 100_000;

/**
 * Default real-money (£ GBP) bundles for purchasing P-Credits via SumUp checkout.
 * Admins can edit the prices and set sale prices for these in the TCG Store settings.
 */
export const P_CREDIT_BUNDLES: PCreditBundle[] = [
  {
    id: "pcredits_100",
    name: "Starter Stack",
    pCredits: 100,
    priceGbp: 2.0,
    salePriceGbp: null,
    description: "Enough for 1 Standard Pack or trading on the marketplace.",
  },
  {
    id: "pcredits_250",
    name: "Drifter Bundle",
    pCredits: 250,
    priceGbp: 4.5,
    salePriceGbp: null,
    badge: "Popular",
    description: "250 P-Credits for custom set packs and marketplace pickups.",
  },
  {
    id: "pcredits_500",
    name: "Tandem Crate",
    pCredits: 500,
    priceGbp: 8.0,
    salePriceGbp: null,
    badge: "Great Value",
    description: "500 P-Credits to build out your collection or grab rare cards.",
  },
  {
    id: "pcredits_1000",
    name: "Podium Vault",
    pCredits: 1000,
    priceGbp: 15.0,
    salePriceGbp: null,
    badge: "Best Value",
    description: "1,000 P-Credits for serious collectors and Mythic hunters.",
  },
];

/** Ids of bundles the admin added. The four built-in bundles keep their own ids. */
export const CUSTOM_BUNDLE_ID = /^custom_[a-z0-9]{6,24}$/;
/** The most bundles the P-Credits shop can hold: the built-in ones plus the admin's own. */
export const MAX_CUSTOM_BUNDLES = 8;
/**
 * The default description of a bundle, with the P-Credit amount it really sells. The built-in text names the default amount
 * ("1,000 P-Credits for..."), so when an admin changes the amount in the TCG Store settings the text would otherwise still
 * show the old number.
 */
export function describeBundle(def: PCreditBundle, pCredits: number): string {
  const was = def.pCredits.toLocaleString("en-GB");
  const now = pCredits.toLocaleString("en-GB");
  return def.description.includes(was) ? def.description.replace(was, now) : def.description;
}

/**
 * Returns the Quick Sell payout in P-Credits.
 * Accepts either:
 * - A FullArtTier string (with optional isBroken boolean)
 * - A card object (automatically checks if the card is in a state of needing repair)
 */
export function getQuickSellPrice(
  tierOrCard: FullArtTier | (Pick<MemberCard, "tier"> & { fault?: any; battlesRemaining?: number; cardType?: string }),
  isBroken?: boolean
): number {
  if (typeof tierOrCard === "string") {
    const table = isBroken ? BROKEN_QUICK_SELL_PRICES : QUICK_SELL_PRICES;
    return table[tierOrCard] ?? table.bronze;
  }

  const tier = tierOrCard.tier;
  if (isUtilityCard(tierOrCard)) return UTILITY_QUICK_SELL_PRICES[tier] ?? UTILITY_QUICK_SELL_PRICES.bronze;
  const broken = isBroken !== undefined ? isBroken : isCarBroken(tierOrCard);
  const table = broken ? BROKEN_QUICK_SELL_PRICES : QUICK_SELL_PRICES;
  return table[tier] ?? table.bronze;
}

/**
 * The asking price the Marketplace forms start with: twice the Quick Sell value, so listing beats quick selling, but never less
 * than the lowest price a card can be listed at (a Bronze Crew card would otherwise start below it and be refused).
 */
export function suggestedListPrice(card: Parameters<typeof getQuickSellPrice>[0]): number {
  return Math.max(MIN_MARKET_LISTING_PRICE, getQuickSellPrice(card) * 2);
}
/** True when a sale price is valid and strictly lower than the regular price. */
export function isOnSale(regularPrice: number, salePrice?: number | null): salePrice is number {
  return (
    typeof salePrice === "number" &&
    Number.isFinite(salePrice) &&
    salePrice > 0 &&
    salePrice < regularPrice
  );
}

/** Return the active price to charge (salePrice if on sale, otherwise regularPrice). */
export function getEffectivePrice(regularPrice: number, salePrice?: number | null): number {
  return isOnSale(regularPrice, salePrice) ? salePrice : regularPrice;
}

/** Calculate integer percentage saved (e.g. 25 for 25% OFF), or 0 when not on sale. */
export function getSaleDiscountPct(regularPrice: number, salePrice?: number | null): number {
  if (!isOnSale(regularPrice, salePrice) || regularPrice <= 0) return 0;
  return Math.max(1, Math.min(99, Math.round(((regularPrice - salePrice) / regularPrice) * 100)));
}
