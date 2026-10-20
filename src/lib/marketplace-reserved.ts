/**
 * Pure, client-safe helper for the "reserved" display/purchase rule.
 *
 * A listing is treated as RESERVED (badge shown, buying blocked) only when it
 * still has stock but none of it is buyable because the remaining units are
 * held. Sold always takes precedence — a sold-out listing is "sold", not
 * "reserved".
 *
 *   - Non-variant listing: the listing-level `reserved` flag.
 *   - Variant listing: every variant that still has stock is reserved (and at
 *     least one such variant exists). If any in-stock variant is un-reserved,
 *     the listing is still partly buyable, so it is NOT shown as reserved.
 *
 * Reservation never affects stock counts or the ASBO-RC ledger.
 */

interface ReservedVariantLike {
  quantity: number;
  soldCount: number;
  reserved?: boolean;
}

interface ReservedListingLike {
  status: "available" | "sold";
  reserved?: boolean;
  hasVariations?: boolean;
  variants?: ReservedVariantLike[];
}

/** True when a single variant still has stock but is held. */
export function isVariantReserved(v: ReservedVariantLike): boolean {
  const inStock = v.quantity - v.soldCount > 0;
  return inStock && v.reserved === true;
}

/** True when a variant is still buyable (in stock and not reserved). */
export function isVariantBuyable(v: ReservedVariantLike): boolean {
  const inStock = v.quantity - v.soldCount > 0;
  return inStock && v.reserved !== true;
}

/**
 * Whether the listing should be shown/treated as reserved (nothing buyable
 * remains, but it isn't sold).
 */
export function isListingReserved(listing: ReservedListingLike): boolean {
  if (listing.status === "sold") return false;

  if (listing.hasVariations && listing.variants && listing.variants.length > 0) {
    const inStock = listing.variants.filter((v) => v.quantity - v.soldCount > 0);
    if (inStock.length === 0) return false; // nothing in stock → it's a stock state, not reserved
    // Reserved only when NONE of the in-stock variants are buyable.
    return inStock.every((v) => v.reserved === true);
  }

  return listing.reserved === true;
}
