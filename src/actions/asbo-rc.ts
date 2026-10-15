"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getListings, getDraftListings } from "@/actions/marketplace";
import { logActivity } from "@/lib/activity";
import {
  DEFAULT_PENTHOUSE_CUT_PCT,
  round2,
  type AsboRcReport,
  type AsboRcReportItem,
  type AsboRcSale,
  type AsboRcTotals,
} from "@/lib/asbo-rc";
import type { ActionResult, MarketplaceListing } from "@/types";
import { randomUUID } from "crypto";

/** Sorted set of all ASBO-RC sale IDs, scored by -soldAt (newest first). */
const SALES_INDEX = "asbo-rc:sales";
const saleKey = (id: string) => `asbo-rc:sale:${id}`;

/* ------------------------------------------------------------------ */
/* Ledger primitives                                                  */
/* ------------------------------------------------------------------ */

/** Coerce a raw Redis hash into a typed AsboRcSale. */
function toSale(data: Record<string, unknown> | null): AsboRcSale | null {
  if (!data || Object.keys(data).length === 0) return null;
  const num = (v: unknown) => Number(v) || 0;
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    saleId: str(data.saleId),
    listingId: str(data.listingId),
    title: str(data.title),
    image: data.image ? str(data.image) : null,
    rrp: num(data.rrp),
    // Legacy sales have no separate sellPrice/uplift: treat sell = consignment,
    // uplift = 0 so historical records read correctly.
    sellPrice:
      data.sellPrice === "" || data.sellPrice === undefined || data.sellPrice === null
        ? num(data.rrp)
        : num(data.sellPrice),
    uplift: data.uplift === "" || data.uplift === undefined || data.uplift === null ? 0 : num(data.uplift),
    cutPct: data.cutPct === "" || data.cutPct === undefined ? DEFAULT_PENTHOUSE_CUT_PCT : num(data.cutPct),
    penthouseCut: num(data.penthouseCut),
    owedToAsboRc: num(data.owedToAsboRc),
    soldAt: num(data.soldAt),
    paid: String(data.paid) === "true",
    paidAt: num(data.paidAt) || undefined,
  };
}

function saleHash(sale: AsboRcSale): Record<string, string> {
  const hash: Record<string, string> = {
    saleId: sale.saleId,
    listingId: sale.listingId,
    title: sale.title,
    image: sale.image ?? "",
    rrp: String(sale.rrp),
    sellPrice: String(sale.sellPrice ?? sale.rrp),
    uplift: String(sale.uplift ?? 0),
    cutPct: String(sale.cutPct),
    penthouseCut: String(sale.penthouseCut),
    owedToAsboRc: String(sale.owedToAsboRc),
    soldAt: String(sale.soldAt),
    paid: String(sale.paid),
  };
  if (sale.paidAt) hash.paidAt = String(sale.paidAt);
  return hash;
}

/**
 * Append `count` new sale records for an ASBO-RC listing. Called when units are
 * marked sold. Money/title/image are snapshotted from the listing. Each sale
 * starts unpaid. This is additive only — restocking never removes sales.
 * No auth guard here: callers (the sell actions) are already authorised.
 */
export async function createAsboRcSales(
  listing: MarketplaceListing,
  count: number,
  soldAtTimestamps?: number[],
  // For variant listings: snapshot the specific variant's sell price, consignment
  // base + name so the ledger records what was actually sold.
  variantOverride?: { price: number; consignmentPrice?: number; name: string }
): Promise<void> {
  if (!listing.soldByAsboRc || count <= 0) return;

  // Sell price = what the customer paid. Consignment base = what the 7% split
  // and the amount owed to ASBO are calculated on (falls back to sell price
  // when unset). Uplift = sell − consignment, kept entirely by Penthouse.
  const sellPrice = variantOverride ? variantOverride.price : listing.price || 0;
  const consignment =
    (variantOverride
      ? variantOverride.consignmentPrice != null && variantOverride.consignmentPrice > 0
        ? variantOverride.consignmentPrice
        : variantOverride.price
      : listing.consignmentPrice != null && listing.consignmentPrice > 0
      ? listing.consignmentPrice
      : listing.price) || 0;
  const cutPct = listing.penthouseCutPct ?? DEFAULT_PENTHOUSE_CUT_PCT;
  const baseCut = round2(consignment * (cutPct / 100));
  const uplift = round2(Math.max(0, sellPrice - consignment));
  const owedToAsboRc = round2(consignment - baseCut);
  const penthouseCut = round2(baseCut + uplift);
  const title = variantOverride
    ? `${listing.title} — ${variantOverride.name}`
    : listing.title;

  const pipeline = redis.pipeline();
  for (let i = 0; i < count; i += 1) {
    const saleId = randomUUID();
    const soldAt = soldAtTimestamps?.[i] ?? Date.now();
    const sale: AsboRcSale = {
      saleId,
      listingId: listing.listingId,
      title,
      image: listing.images[0] ?? null,
      rrp: consignment, // consignment base (ASBO-facing figure)
      sellPrice,
      uplift,
      cutPct,
      penthouseCut,
      owedToAsboRc,
      soldAt,
      paid: false,
    };
    pipeline.hset(saleKey(saleId), saleHash(sale));
    pipeline.zadd(SALES_INDEX, { score: -soldAt, member: saleId });
  }
  await pipeline.exec();

  revalidatePath("/admin/asbo-rc");
  revalidatePath("/asbo-rc");
  revalidatePath("/dashboard");
}

/** All sales in the ledger, newest first. */
async function listAllSales(limit = 2000): Promise<AsboRcSale[]> {
  const ids = await redis.zrange(SALES_INDEX, 0, limit - 1);
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.hgetall(saleKey(id as string));
  const raws = await pipeline.exec();
  return raws
    .map((raw) => toSale(raw as Record<string, unknown> | null))
    .filter((s): s is AsboRcSale => s !== null);
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

function sumTotals(items: AsboRcReportItem[]): AsboRcTotals {
  return items.reduce<AsboRcTotals>(
    (acc, i) => ({
      itemCount: acc.itemCount + 1,
      unitCount: acc.unitCount + i.quantity,
      totalRrp: round2(acc.totalRrp + i.totalRrp),
      penthouseCut: round2(acc.penthouseCut + i.penthouseCut),
      owedToAsboRc: round2(acc.owedToAsboRc + i.owedToAsboRc),
      totalSell: round2(acc.totalSell + (i.totalSell ?? i.totalRrp)),
      totalUplift: round2(acc.totalUplift + (i.totalUplift ?? 0)),
    }),
    { itemCount: 0, unitCount: 0, totalRrp: 0, penthouseCut: 0, owedToAsboRc: 0, totalSell: 0, totalUplift: 0 }
  );
}

/** Consignment base for a listing/variant: explicit consignmentPrice (when set
 *  and positive) else the sell price. Mirrors effectiveConsignmentPrice in the
 *  marketplace actions (inlined to keep this pure helper out of "use server"). */
function consignmentOf(item: { price: number; consignmentPrice?: number }): number {
  return item.consignmentPrice != null && item.consignmentPrice > 0
    ? item.consignmentPrice
    : item.price || 0;
}

/** In-stock line (remaining units) for a listing, aggregated. Figures are
 *  CONSIGNMENT-based (ASBO-facing); totalSell/totalUplift carry the admin-only
 *  sell-price view. */
function stockLine(l: MarketplaceListing): AsboRcReportItem | null {
  const cutPct = l.penthouseCutPct ?? DEFAULT_PENTHOUSE_CUT_PCT;

  // Variant listings: sum per-variant remaining units, consignment value and
  // sell value (each variant at its own prices).
  if (l.hasVariations && l.variants.length > 0) {
    let stockUnits = 0;
    let totalConsign = 0;
    let totalSell = 0;
    for (const v of l.variants) {
      const remaining = Math.max(0, v.quantity - v.soldCount);
      stockUnits += remaining;
      totalConsign += consignmentOf(v) * remaining;
      totalSell += v.price * remaining;
    }
    if (stockUnits <= 0) return null;
    totalConsign = round2(totalConsign);
    totalSell = round2(totalSell);
    const owedToAsboRc = round2(totalConsign * (1 - cutPct / 100));
    const totalUplift = round2(Math.max(0, totalSell - totalConsign));
    const penthouseCut = round2(totalConsign * (cutPct / 100) + totalUplift);
    return {
      listingId: l.listingId,
      title: l.title,
      image: l.images[0] ?? null,
      quantity: stockUnits,
      rrp: l.consignmentPrice != null && l.consignmentPrice > 0 ? l.consignmentPrice : l.price || 0,
      cutPct,
      totalRrp: totalConsign,
      penthouseCut,
      owedToAsboRc,
      totalSell,
      totalUplift,
      status: "available",
      paid: false,
      createdAt: l.createdAt,
      totalQuantity: l.variants.reduce((s, v) => s + v.quantity, 0),
      soldCount: l.variants.reduce((s, v) => s + v.soldCount, 0),
      rowKey: l.listingId,
    };
  }

  const quantity = Math.max(1, l.quantity || 1);
  const soldCount = Math.min(quantity, Math.max(0, l.soldCount || 0));
  const stockUnits = quantity - soldCount;
  if (stockUnits <= 0) return null;
  const consignment = consignmentOf(l);
  const sell = l.price || 0;
  const owedPerUnit = round2(consignment * (1 - cutPct / 100));
  const upliftPerUnit = round2(Math.max(0, sell - consignment));
  const cutPerUnit = round2(consignment * (cutPct / 100) + upliftPerUnit);
  return {
    listingId: l.listingId,
    title: l.title,
    image: l.images[0] ?? null,
    quantity: stockUnits,
    rrp: consignment,
    cutPct,
    totalRrp: round2(consignment * stockUnits),
    penthouseCut: round2(cutPerUnit * stockUnits),
    owedToAsboRc: round2(owedPerUnit * stockUnits),
    totalSell: round2(sell * stockUnits),
    totalUplift: round2(upliftPerUnit * stockUnits),
    status: "available",
    paid: false,
    createdAt: l.createdAt,
    totalQuantity: quantity,
    soldCount,
    rowKey: l.listingId,
  };
}

/** Turn a ledger sale into a settlement report row. */
function saleToRow(s: AsboRcSale): AsboRcReportItem {
  return {
    listingId: s.listingId,
    title: s.title,
    image: s.image,
    quantity: 1,
    rrp: s.rrp, // consignment base (ASBO-facing)
    cutPct: s.cutPct,
    totalRrp: s.rrp,
    penthouseCut: s.penthouseCut,
    owedToAsboRc: s.owedToAsboRc,
    totalSell: s.sellPrice ?? s.rrp,
    totalUplift: s.uplift ?? 0,
    status: "sold",
    paid: s.paid,
    paidAt: s.paidAt,
    createdAt: s.soldAt,
    saleId: s.saleId,
    soldAt: s.soldAt,
    rowKey: s.saleId,
  };
}

/**
 * Build the ASBO-RC consignment report. In-stock comes from current listing
 * stock; the sold/settlement list comes from the permanent sales ledger (so it
 * survives restocking). Accessible to admins and ASBO-RC partners.
 */
export async function getAsboRcReport(): Promise<AsboRcReport | null> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin" && role !== "asbo-rc") {
    return null;
  }

  const [all, drafts, sales] = await Promise.all([
    getListings(1000, { includeSold: true }),
    // Draft listings the viewer may see (admins: all; ASBO-RC: own). Scoped
    // server-side by getDraftListings. Drafts live outside marketplace:all, so
    // they must be fetched separately to appear in the report.
    getDraftListings(1000),
    listAllSales(),
  ]);
  const asboListings = all.filter((l) => l.soldByAsboRc);
  const asboDrafts = drafts.filter((l) => l.soldByAsboRc);

  const inStock: AsboRcReportItem[] = [];
  for (const l of asboListings) {
    const line = stockLine(l);
    if (line) inStock.push(line);
  }

  // Draft stock totals (units + RRP), kept separate from live figures. A fresh
  // draft has nothing sold, so stockLine yields its full quantity as units.
  const draftLines: AsboRcReportItem[] = [];
  for (const l of asboDrafts) {
    const line = stockLine(l);
    if (line) draftLines.push(line);
  }
  const draftTotals = sumTotals(draftLines);

  // Sold rows come from the ledger (newest first), independent of listings.
  const sold = sales.map(saleToRow);

  // Distinct products = listings currently flagged ASBO-RC, plus any listing
  // referenced only by historical sales (e.g. deleted/un-flagged listing).
  const productIds = new Set<string>(asboListings.map((l) => l.listingId));
  for (const s of sales) productIds.add(s.listingId);

  const overallItems = [...inStock, ...sold];
  const overall = { ...sumTotals(overallItems), itemCount: productIds.size };

  const outstandingToAsboRc = round2(
    sold.filter((i) => !i.paid).reduce((s, i) => s + i.owedToAsboRc, 0)
  );
  const paidToAsboRc = round2(
    sold.filter((i) => i.paid).reduce((s, i) => s + i.owedToAsboRc, 0)
  );

  return {
    inStock,
    sold,
    overall,
    inStockTotals: sumTotals(inStock),
    soldTotals: sumTotals(sold),
    outstandingToAsboRc,
    paidToAsboRc,
    draftTotals,
  };
}

/* ------------------------------------------------------------------ */
/* Settlement + corrections (operate on individual ledger sales)      */
/* ------------------------------------------------------------------ */

/**
 * Admin-only: mark (or unmark) a single ASBO-RC sale as paid to ASBO-RC.
 */
export async function setAsboRcSalePaid(
  saleId: string,
  paid: boolean
): Promise<ActionResult<{ paid: boolean }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const data = await redis.hgetall(saleKey(saleId));
    const sale = toSale(data as Record<string, unknown> | null);
    if (!sale) {
      return { success: false, error: "Sale record not found" };
    }

    const now = Date.now();
    await redis.hset(saleKey(saleId), {
      paid: String(paid),
      paidAt: paid ? String(now) : "",
    });

    await logActivity({
      type: "purchase",
      memberId: session.user.id,
      memberName: session.user.name ?? "Admin",
      description: `[ASBO-RC] Sale of "${sale.title}" marked ${paid ? "PAID" : "UNPAID"} to ASBO-RC`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: { paid } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update settlement status",
    };
  }
}

/**
 * Admin-only: permanently delete a sale record from the ledger. For correcting
 * a genuine mistake (e.g. a unit logged as sold that wasn't). This does NOT
 * change the marketplace listing's stock — adjust that separately if needed.
 */
export async function deleteAsboRcSale(saleId: string): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const data = await redis.hgetall(saleKey(saleId));
    const sale = toSale(data as Record<string, unknown> | null);
    if (!sale) {
      return { success: false, error: "Sale record not found" };
    }

    await redis.multi().del(saleKey(saleId)).zrem(SALES_INDEX, saleId).exec();

    await logActivity({
      type: "purchase",
      memberId: session.user.id,
      memberName: session.user.name ?? "Admin",
      description: `[ASBO-RC] Deleted sale record for "${sale.title}" (${sale.paid ? "was paid" : "was unpaid"})`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete sale record",
    };
  }
}
