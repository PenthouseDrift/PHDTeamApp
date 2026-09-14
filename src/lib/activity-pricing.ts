/**
 * Pure, client-safe pricing helpers for the activity log / revenue views.
 *
 * This module intentionally has NO server-only imports (no redis) so it can be
 * imported from client components (e.g. the activity table) as well as server
 * code. `src/lib/pricing.ts` re-exports these so there is still a single import
 * surface for pricing, while keeping the redis-backed helpers server-only.
 */

export const CURRENCY = "GBP";

/** Base prices in GBP. Single source of truth for all purchase flows. */
export const BASE_PRICES = {
  membership: 40.0,
  daypass: 10.0,
  rental: 10.0,
} as const;

export type DiscountItem = "membership" | "daypass" | "rental";

/** Format a GBP amount for display, e.g. 40 -> "£40.00". */
export function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/**
 * Maps a check-in method to the priced item it represents, but ONLY for
 * in-person/cash check-ins. Wallet redemptions and free manual/QR check-ins
 * return null because they should not count as new (door) revenue.
 */
export function checkInMethodToItem(method: string | undefined): DiscountItem | null {
  switch (method) {
    case "day_pass_cash":
      return "daypass";
    case "rental_cash":
      return "rental";
    case "membership_cash":
      return "membership";
    default:
      return null;
  }
}

/** Minimal shape of an activity entry needed to resolve its revenue amount. */
export interface ActivityAmountInput {
  type: "purchase" | "checkin";
  description?: string;
  method?: string;
  amount?: number;
  isDev?: boolean;
}

/** An inferred priced item and its quantity, derived from an entry. */
export interface ActivityItem {
  item: DiscountItem;
  qty: number;
}

/** Determine the priced item + quantity for a "purchase" entry from its description. */
function purchaseItemFromDescription(description: string): ActivityItem | null {
  const desc = description.toLowerCase();

  // Quantity, if present, e.g. "Purchased 3x Day Pass".
  const qtyMatch = desc.match(/(\d+)\s*x/);
  const qty = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;

  // Membership activation / purchase.
  if (desc.includes("membership")) {
    // Reversals / config actions are not revenue.
    if (
      desc.includes("revok") ||
      desc.includes("clear") ||
      desc.includes("cancel") ||
      desc.includes("expired")
    ) {
      return null;
    }
    if (desc.includes("activ") || desc.includes("purchas") || desc.includes("28-day")) {
      return { item: "membership", qty };
    }
    return null;
  }

  if (desc.includes("day pass") || desc.includes("daypass")) {
    if (desc.includes("remov")) return null; // admin wallet removals aren't revenue
    return { item: "daypass", qty };
  }

  if (desc.includes("rental")) {
    if (desc.includes("remov")) return null;
    return { item: "rental", qty };
  }

  return null;
}

/**
 * Determine the priced item + quantity an entry represents WITHOUT a stored
 * amount, so callers can apply the correct (possibly discounted) price.
 * Returns null when the entry is not inferable revenue (wallet redemptions,
 * free manual/QR check-ins, admin reversals/config actions).
 *
 * Note: entries with a real stored `amount` are handled separately by callers
 * (that amount already reflects the actual charge, including any discount).
 */
export function resolveActivityItem(entry: ActivityAmountInput): ActivityItem | null {
  if (entry.isDev) return null;

  if (entry.type === "checkin") {
    const item = checkInMethodToItem(entry.method);
    if (item) return { item, qty: 1 };

    const wallet = entry.method === "day_pass_wallet" || entry.method === "rental_wallet";
    const freeMethod =
      entry.method === "manual" ||
      entry.method === "qr" ||
      entry.method === "membership" ||
      entry.method === "self_checkin";
    if (wallet || freeMethod) return null;

    if (entry.description) {
      const desc = entry.description.toLowerCase();
      if (
        desc.includes("manual override") ||
        desc.includes("redeem") ||
        desc.includes("from wallet") ||
        desc.includes("rental started") ||
        desc.includes("28-day membership")
      ) {
        return null;
      }
      if (desc.includes("(day_pass)") || desc.includes("day pass")) return { item: "daypass", qty: 1 };
      if (desc.includes("(rental)")) return { item: "rental", qty: 1 };
    }
    return null;
  }

  // Purchase entries.
  if (entry.description) return purchaseItemFromDescription(entry.description);
  return null;
}

/**
 * Resolve the revenue amount to DISPLAY for an activity entry by
 * cross-referencing the pricing config. Single source of truth for the activity
 * table and the revenue report; self-healing for older entries logged with
 * amount: 0 or no amount.
 *
 * Resolution order:
 *   1. Dev/test entries -> null (never counted).
 *   2. A stored positive amount -> trust it (real charged amount, incl. discounts).
 *   3. Check-ins: cash/in-person method -> priced item; else the description tag
 *      (e.g. "(day_pass)") for guest cash check-ins predating method logging.
 *      Wallet redemptions and free manual/QR check-ins -> null.
 *   4. Purchases: derive from the description. Admin reversals/config -> null.
 *
 * Uses BASE_PRICES (undiscounted) for derived amounts; entries where a discount
 * actually applied already carry a stored amount and are handled by step 2.
 */
export function resolveActivityAmount(entry: ActivityAmountInput): number | null {
  if (entry.isDev) return null;

  // A real charged amount already reflects any discount applied at the time.
  if (typeof entry.amount === "number" && entry.amount > 0) {
    return entry.amount;
  }

  // Otherwise infer the item and price it at base rate. This is a display hint
  // only; the revenue report applies the member's actual discount server-side
  // (see resolveActivityItem + getMemberDiscounts).
  const resolved = resolveActivityItem(entry);
  if (!resolved) return null;
  return BASE_PRICES[resolved.item] * resolved.qty;
}
