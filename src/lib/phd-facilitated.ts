/**
 * Shared "Facilitated by PHD" types and pure helpers. Kept out of the
 * "use server" actions module because that module may only export async
 * functions. Safe to import from both server and client components.
 *
 * This system is deliberately SEPARATE from the ASBO-RC consignment ledger
 * (src/lib/asbo-rc.ts). ASBO-RC tracks stock the CLUB owns and owes a partner,
 * keeping the uplift. "Facilitated by PHD" is the opposite direction: a MEMBER
 * lists their own item and asks PHD to sell it on their behalf, so when it
 * sells PHD owes the ORIGINAL OWNER an agreed payout and the club keeps the
 * rest of the sell price. Nothing here ever reads or writes ASBO-RC data.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A single "Facilitated by PHD" SALE, stored in its own ledger object
 * (`phd-facilitated:sale:{saleId}`), decoupled from the marketplace listing.
 * One record per unit sold. Money/title/image/owner are snapshotted at sale
 * time so later edits to the listing don't rewrite history and restocking
 * never affects these.
 */
export interface PhdFacilitatedSale {
  saleId: string;
  /** The marketplace listing this sale came from (for grouping/labelling). */
  listingId: string;
  /** The ORIGINAL OWNER: the listing's userId (who PHD must pay out). */
  ownerId: string;
  /** Owner's display name at the time of sale (best-effort snapshot). */
  ownerName: string;
  /** Product name at the time of sale. */
  title: string;
  image: string | null;
  /** The SELL price the customer actually paid for this unit. */
  sellPrice: number;
  /** The amount PHD owes the original owner for this unit (the payout). */
  ownerPayout: number;
  /** The club's cut for this unit (sellPrice − ownerPayout, clamped >= 0). */
  clubCut: number;
  /** When the unit was marked sold (ms). */
  soldAt: number;
  /** Whether PHD has paid the original owner for this sale. */
  paid: boolean;
  /** When it was marked paid (ms), if paid. */
  paidAt?: number;
}

/**
 * One row in the owner-payouts report: a single sold unit, with the money split
 * pre-computed. The report groups these by owner so admins can see exactly how
 * much is owed to each original owner.
 */
export interface FacilitatedSaleRow {
  saleId: string;
  listingId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  image: string | null;
  sellPrice: number;
  ownerPayout: number;
  clubCut: number;
  soldAt: number;
  paid: boolean;
  paidAt?: number;
}

/** Totals across a set of facilitated sales. */
export interface FacilitatedTotals {
  unitCount: number;
  /** Total sell value (what customers paid). */
  totalSell: number;
  /** Total owed to original owners. */
  totalOwnerPayout: number;
  /** Total kept by the club. */
  totalClubCut: number;
}

/**
 * All sold units belonging to one original owner, with the owed/paid split.
 * The report renders one of these per owner so payouts are clear.
 */
export interface OwnerPayoutGroup {
  ownerId: string;
  ownerName: string;
  rows: FacilitatedSaleRow[];
  /** Owed to this owner for UNPAID sold units. */
  outstanding: number;
  /** Already paid to this owner. */
  paid: number;
  totals: FacilitatedTotals;
}

export interface FacilitatedPayoutReport {
  /** Owner groups, sorted with the largest outstanding balance first. */
  owners: OwnerPayoutGroup[];
  /** Totals across every facilitated sale. */
  overall: FacilitatedTotals;
  /** Owed to owners for sold units NOT yet paid. */
  outstandingToOwners: number;
  /** Already paid out to owners. */
  paidToOwners: number;
}

/**
 * The amount PHD owes the owner for ONE unit of a listing/variant: the explicit
 * ownerPayoutPrice when set (and positive, and not above the sell price) else
 * the full sell price (club keeps £0). Pure so it can be shared by the form,
 * the ledger writer and the display.
 */
export function ownerPayoutOf(item: { price: number; ownerPayoutPrice?: number }): number {
  const sell = item.price || 0;
  if (item.ownerPayoutPrice == null || !(item.ownerPayoutPrice > 0)) return sell;
  return Math.min(sell, item.ownerPayoutPrice);
}
