/** Small display helpers for the admin "Reserved items" lists (pure, so server and client components can share them). */

/** Money in GBP: whole pounds when there are no pence ("£120"), otherwise two decimals ("£120.50"). */
export function formatGbp(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Who a listing's reserved units are held for: "Sam ×1, Alex ×2 (Black)". `variantName` is shown after a hold on a
 * variant. Units held with no member linked (older holds) are added as "no member ×N". Empty when nothing is held.
 */
export function heldForText(
  reservations: Array<{ holderName?: string; quantity: number; variantName?: string }> | undefined,
  totalHeld: number
): string {
  const named = reservations ?? [];
  const namedQty = named.reduce((s, r) => s + r.quantity, 0);
  const parts = named.map((r) => `${r.holderName ?? "Member"} ×${r.quantity}${r.variantName ? ` (${r.variantName})` : ""}`);
  if (totalHeld > namedQty) parts.push(`no member ×${totalHeld - namedQty}`);
  return parts.join(", ");
}
