/**
 * Pure, client-safe concessions helpers + types (no server-only imports).
 *
 * The server actions in `src/actions/admin/concessions.ts` are a `"use server"`
 * module, so every one of its exports must be an async server action. Shared
 * types and the synchronous margin math therefore live here, where both the
 * server actions and the client component can import them.
 *
 * Stock is bought by the CASE, so cost is entered as the case cost + the number
 * of units in a case; the per-unit cost is derived. Example:
 *   Red Bull 250ml, case of 24, case cost £22.39
 *   → cost/can £0.93, sell £2.20 → profit/can £1.27 (57.6%), case profit £30.41
 */

export type ConcessionCategory = "drink" | "snack" | "other";

/** A single concession stock line (drink/snack), priced by the case. */
export interface ConcessionItem {
  id: string;
  name: string;
  category: ConcessionCategory;
  /** What we pay for one full case, in GBP. */
  caseCost: number;
  /** Number of sellable units (cans/packs) in a case. */
  unitsPerCase: number;
  /** What we sell one unit for, in GBP. */
  sellPrice: number;
  createdAt: number;
  updatedAt: number;
}

/** Per-item derived figures. All money values are GBP, rounded to 2dp. */
export interface ConcessionMetrics {
  /** caseCost / unitsPerCase. 0 when unitsPerCase is 0. */
  costPerUnit: number;
  /** sellPrice - costPerUnit. */
  profitPerUnit: number;
  /** Profit as a % of sell price (gross margin). 0 when sellPrice is 0. */
  marginPct: number;
  /** Profit as a % of cost price (markup). 0 when costPerUnit is 0. */
  markupPct: number;
  /** sellPrice * unitsPerCase — revenue if a whole case sells through. */
  caseRevenue: number;
  /** profitPerUnit * unitsPerCase — profit if a whole case sells through. */
  caseProfit: number;
}

export interface ConcessionRow extends ConcessionItem {
  metrics: ConcessionMetrics;
}

export interface ConcessionOverview {
  items: ConcessionRow[];
  totals: {
    itemCount: number;
    /** Combined cost of one case of every item. */
    totalCaseCost: number;
    /** Combined profit if one case of every item sells through. */
    totalCaseProfit: number;
    /** Blended margin across one case of every item. */
    marginPct: number;
  };
}

export interface ConcessionInput {
  name: string;
  category: ConcessionCategory;
  caseCost: number;
  unitsPerCase: number;
  sellPrice: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Coerce an unknown money input to a non-negative 2dp number. */
export function money(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return round2(value);
}

/** Coerce an unknown count input to a non-negative integer. */
export function count(raw: unknown): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function normalizeCategory(raw: unknown): ConcessionCategory {
  return raw === "drink" || raw === "snack" || raw === "other" ? raw : "other";
}

/** Compute the derived margin/profit figures for a case-priced item. */
export function computeMetrics(item: ConcessionItem): ConcessionMetrics {
  const costPerUnit = item.unitsPerCase > 0 ? round2(item.caseCost / item.unitsPerCase) : 0;
  const profitPerUnit = round2(item.sellPrice - costPerUnit);
  const marginPct = item.sellPrice > 0 ? round2((profitPerUnit / item.sellPrice) * 100) : 0;
  const markupPct = costPerUnit > 0 ? round2((profitPerUnit / costPerUnit) * 100) : 0;
  return {
    costPerUnit,
    profitPerUnit,
    marginPct,
    markupPct,
    caseRevenue: round2(item.sellPrice * item.unitsPerCase),
    caseProfit: round2(profitPerUnit * item.unitsPerCase),
  };
}
