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
  /**
   * Consignment base price at the time of sale — the figure the 7% split and
   * the amount owed to ASBO-RC are calculated on. (Historically this field held
   * "RRP"; for legacy sales with no separate consignment/sell prices it equals
   * both.) ASBO-facing reports use ONLY this, never the sell price.
   */
  rrp: number;
  /**
   * The SELL price the customer actually paid (admin-only figure). For legacy
   * sales this is absent and treated as equal to `rrp`.
   */
  sellPrice?: number;
  /**
   * Penthouse uplift kept on top of the 7% (sellPrice − rrp), admin-only. 0 for
   * legacy/no-uplift sales.
   */
  uplift?: number;
  /** Penthouse Drift commission % applied to this sale (of the consignment base). */
  cutPct: number;
  /** Penthouse Drift's TOTAL take in £ (rrp*cutPct/100 + uplift). */
  penthouseCut: number;
  /** Owed to ASBO-RC in £ (rrp − rrp*cutPct/100). */
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
  /**
   * Per-unit consignment base price (the ASBO-facing figure the 7% split runs
   * on). ASBO-facing views use this; it is NOT the customer sell price.
   */
  rrp: number;
  /** Commission percentage Penthouse Drift keeps on this item. */
  cutPct: number;
  /**
   * Total consignment value across all units in this line (consignment × qty).
   * This is the ASBO-facing "stock value" / sold value.
   */
  totalRrp: number;
  /** Total Penthouse Drift take across all units (7% of consignment + any uplift). */
  penthouseCut: number;
  /** Total owed to ASBO-RC across all units (consignment × 93%). */
  owedToAsboRc: number;
  /**
   * Admin-only: total SELL value across all units (sell price × qty). Equals
   * totalRrp when there's no uplift. Hidden from the ASBO partner view.
   */
  totalSell?: number;
  /** Admin-only: total Penthouse uplift across all units (sell − consignment). */
  totalUplift?: number;
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
  /** Consignment-based total (ASBO-facing). */
  totalRrp: number;
  penthouseCut: number;
  owedToAsboRc: number;
  /** Admin-only: total SELL value (sell price × qty). */
  totalSell: number;
  /** Admin-only: total Penthouse uplift (sell − consignment). */
  totalUplift: number;
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
  /**
   * Draft ("stocked but not yet published") consignment items. Kept separate
   * from the live in-stock/overall figures so those stay accurate; surfaced
   * inline on the Products and Total RRP cards. unitCount = draft units,
   * totalRrp = sum of price*quantity across draft ASBO-RC listings.
   */
  draftTotals: AsboRcTotals;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
