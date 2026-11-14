/** Display name shown as the seller on items Penthouse Drift sells itself. */
export const PHD_SELLER_NAME = "Penthouse Drift";

/**
 * The seller name to show for a listing. Items marked "Sold by PHD" (including
 * ASBO-RC consignment, which always implies it) are sold by Penthouse Drift, not
 * the admin who happened to create the listing. Everything else shows the
 * member's own name. Pure and client-safe.
 */
export function listingSellerName(
  listing: { soldByPhd?: boolean; soldByAsboRc?: boolean },
  memberName: string
): string {
  return listing.soldByPhd || listing.soldByAsboRc ? PHD_SELLER_NAME : memberName;
}
