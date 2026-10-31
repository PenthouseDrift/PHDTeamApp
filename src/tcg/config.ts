import type { FullArtTier } from "@/lib/full-art-card";
import type { PCreditBundle, QuickSellRateTable } from "./types";
import { isCarBroken } from "@/lib/mechanical-faults";
import type { MemberCard } from "@/lib/card-roll";

/**
 * Penthouse TCG — Configuration & Economy Constants
 */

/**
 * Fixed Quick Sell payouts in P-Credits per card rarity tier (healthy state).
 * Quick selling permanently deletes the card and immediately credits the owner.
 */
export const QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 10,
  silver: 25,
  gold: 50,
  legend: 100,
  mythic: 250,
};

/**
 * Reduced Quick Sell payouts in P-Credits if a car is in a state of needing repair:
 * Legend: 25p, Gold: 15p, Silver: 5p, Bronze: 2p, Mythic: 50p.
 */
export const BROKEN_QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 2,
  silver: 5,
  gold: 15,
  legend: 25,
  mythic: 50,
};

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
  const broken = isBroken !== undefined ? isBroken : isCarBroken(tierOrCard);
  const table = broken ? BROKEN_QUICK_SELL_PRICES : QUICK_SELL_PRICES;
  return table[tier] ?? table.bronze;
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
