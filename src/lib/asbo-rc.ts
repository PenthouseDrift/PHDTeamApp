/**
 * Shared ASBO-RC consignment types and pure helpers. Kept out of the
 * "use server" actions module because that module may only export async
 * functions. Safe to import from both server and client components.
 */

/** Default Penthouse Drift commission on ASBO-RC consignment sales. */
export const DEFAULT_PENTHOUSE_CUT_PCT = 7;

/**
 * A single ASBO-RC consignment SALE, stored in its own ledger object
 * (`asbo-rc:sale:{saleId}`) decoupled from the marketplace listing. One record
 * per unit sold. Money/title/image are snapshotted at sale time so later edits
 * to the listing don't rewrite history, and restocking never affects these.
 */
export interface AsboRcSale {
  saleId: string;
  /** The marketplace listing this sale came from (for grouping/labelling). */
  listingId: string;
  /** Product name at the time of sale. */
  title: string;
  image: string | null;
  /** Per-unit RRP at the time of sale. */
  rrp: number;
  /** Penthouse Drift commission % applied to this sale. */
  cutPct: number;
  /** Penthouse Drift's cut in £ (rrp * cutPct/100). */
  penthouseCut: number;
  /** Owed to ASBO-RC in £ (rrp - penthouseCut). */
  owedToAsboRc: number;
  /** When the unit was marked sold (ms). */
  soldAt: number;
  /** Whether Penthouse Drift has paid ASBO-RC for this sale. */
  paid: boolean;
  /** When it was marked paid (ms), if paid. */
  paidAt?: number;
}

/**
 * A single ASBO-RC consignment line with the money split pre-computed. The RRP
 * is the per-unit price; totals are multiplied by quantity so a listing of 3
 * items at £100 RRP shows £300 RRP, £21 Penthouse cut, £279 owed to ASBO-RC.
 */
export interface AsboRcReportItem {
  listingId: string;
  title: string;
  image: string | null;
  quantity: number;
  /** Per-unit recommended retail price (the listing price). */
  rrp: number;
  /** Commission percentage Penthouse Drift keeps on this item. */
  cutPct: number;
  /** Total RRP across all units in this line (rrp * quantity). */
  totalRrp: number;
  /** Total Penthouse Drift commission across all units in this line. */
  penthouseCut: number;
  /** Total owed to ASBO-RC across all units in this line (totalRrp - penthouseCut). */
  owedToAsboRc: number;
  status: "available" | "sold";
  /** Whether Penthouse Drift has settled (paid) ASBO-RC for this line. */
  paid: boolean;
  paidAt?: number;
  createdAt: number;
  /**
   * Ledger sale id for individual sold-unit rows. Settlement + delete operate
   * on this. Undefined for aggregated in-stock lines.
   */
  saleId?: string;
  /** Timestamp (ms) this unit was marked sold (sold rows only). */
  soldAt?: number;
  /** In-stock rows only: the listing's total quantity (for quick stock edits). */
  totalQuantity?: number;
  /** In-stock rows only: units sold so far (remaining = totalQuantity - soldCount). */
  soldCount?: number;
  /**
   * Stable key for React lists. For sold rows this is the saleId; for in-stock
   * lines it's the listingId.
   */
  rowKey: string;
}

export interface AsboRcTotals {
  itemCount: number;
  unitCount: number;
  totalRrp: number;
  penthouseCut: number;
  owedToAsboRc: number;
}

export interface AsboRcReport {
  /** Available (in-stock) consignment items. */
  inStock: AsboRcReportItem[];
  /** Sold consignment items (the settlement list). */
  sold: AsboRcReportItem[];
  /** Totals for every ASBO-RC item regardless of status. */
  overall: AsboRcTotals;
  /** Totals for in-stock items only. */
  inStockTotals: AsboRcTotals;
  /** Totals for sold items only. */
  soldTotals: AsboRcTotals;
  /** Owed to ASBO-RC for sold items that have NOT been paid yet. */
  outstandingToAsboRc: number;
  /** Owed to ASBO-RC for sold items already paid. */
  paidToAsboRc: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
