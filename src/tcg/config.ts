import type { FullArtTier } from "@/lib/full-art-card";
import type { PCreditBundle, QuickSellRateTable } from "./types";

/**
 * Penthouse TCG — Configuration & Economy Constants
 */

/**
 * Fixed Quick Sell payouts in P-Credits per card rarity tier.
 * Quick selling permanently deletes the card and immediately credits the owner.
 */
export const QUICK_SELL_PRICES: QuickSellRateTable = {
  bronze: 10,
  silver: 25,
  gold: 50,
  legend: 100,
  mythic: 250,
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

export function getQuickSellPrice(tier: FullArtTier): number {
  return QUICK_SELL_PRICES[tier] ?? QUICK_SELL_PRICES.bronze;
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
