/**
 * Pure, client-safe helpers for the "reserved" display/purchase rule.
 *
 * Reservations are a QUANTITY hold, not an all-or-nothing flag. Each listing
 * (or each variant of a variant listing) carries a `reservedCount`: that many
 * units are held for a buyer and therefore not buyable right now, but they are
 * NOT sold. Buyable stock is:
 *
 *     buyable = quantity - soldCount - reservedCount   (clamped ≥ 0)
 *
 * A listing is shown/treated as RESERVED (amber badge, buying blocked) only
 * when it still has physical stock but none of it is buyable because the
 * remaining units are all held. Sold always takes precedence — a sold-out
 * listing is "sold", not "reserved".
 *
 *   - Non-variant listing: driven by the listing-level `reservedCount`.
 *   - Variant listing: reserved only when every variant that still has physical
 *     stock has zero buyable units (all held), and at least one such variant
 *     exists. If any in-stock variant still has a buyable unit, the listing is
 *     partly buyable, so it is NOT shown as reserved.
 *
 * Reservation never affects stock counts or the ASBO-RC ledger.
 */

interface ReservedVariantLike {
  quantity: number;
  soldCount: number;
  reservedCount?: number;
}

interface ReservedListingLike {
  status: "available" | "sold";
  reservedCount?: number;
  quantity?: number;
  soldCount?: number;
  hasVariations?: boolean;
  variants?: ReservedVariantLike[];
}

/** Physical units still in stock for a variant (ignores holds). */
export function variantInStock(v: ReservedVariantLike): number {
  return Math.max(0, v.quantity - v.soldCount);
}

/** Units of a variant a customer can actually buy right now (after holds). */
export function variantBuyable(v: ReservedVariantLike): number {
  return Math.max(0, v.quantity - v.soldCount - Math.max(0, v.reservedCount ?? 0));
}

/** True when a variant still has stock but none of it is buyable (fully held). */
export function isVariantReserved(v: ReservedVariantLike): boolean {
  return variantInStock(v) > 0 && variantBuyable(v) <= 0;
}

/** True when a variant is still buyable (at least one un-held, in-stock unit). */
export function isVariantBuyable(v: ReservedVariantLike): boolean {
  return variantBuyable(v) > 0;
}

/**
 * Whether the listing should be shown/treated as reserved (physical stock
 * remains, but nothing is buyable because it's all held, and it isn't sold).
 */
export function isListingReserved(listing: ReservedListingLike): boolean {
  if (listing.status === "sold") return false;

  if (listing.hasVariations && listing.variants && listing.variants.length > 0) {
    const inStock = listing.variants.filter((v) => variantInStock(v) > 0);
    if (inStock.length === 0) return false; // nothing in stock → a stock state, not reserved
    // Reserved only when NONE of the in-stock variants have a buyable unit.
    return inStock.every((v) => variantBuyable(v) <= 0);
  }

  const quantity = Math.max(0, listing.quantity ?? 0);
  const soldCount = Math.max(0, listing.soldCount ?? 0);
  const reservedCount = Math.max(0, listing.reservedCount ?? 0);
  const inStock = Math.max(0, quantity - soldCount);
  if (inStock <= 0) return false;
  return inStock - reservedCount <= 0;
}
