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
  soldAtTimestamps?: number[]
): Promise<void> {
  if (!listing.soldByAsboRc || count <= 0) return;

  const rrp = listing.price || 0;
  const cutPct = listing.penthouseCutPct ?? DEFAULT_PENTHOUSE_CUT_PCT;
  const penthouseCut = round2(rrp * (cutPct / 100));
  const owedToAsboRc = round2(rrp - penthouseCut);

  const pipeline = redis.pipeline();
  for (let i = 0; i < count; i += 1) {
    const saleId = randomUUID();
    const soldAt = soldAtTimestamps?.[i] ?? Date.now();
    const sale: AsboRcSale = {
      saleId,
      listingId: listing.listingId,
      title: listing.title,
      image: listing.images[0] ?? null,
      rrp,
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
    }),
    { itemCount: 0, unitCount: 0, totalRrp: 0, penthouseCut: 0, owedToAsboRc: 0 }
  );
}

/** In-stock line (remaining units) for a listing, aggregated. */
function stockLine(l: MarketplaceListing): AsboRcReportItem | null {
  const quantity = Math.max(1, l.quantity || 1);
  const soldCount = Math.min(quantity, Math.max(0, l.soldCount || 0));
  const stockUnits = quantity - soldCount;
  if (stockUnits <= 0) return null;
  const rrp = l.price || 0;
  const cutPct = l.penthouseCutPct ?? DEFAULT_PENTHOUSE_CUT_PCT;
  const penthouseCut = round2(rrp * (cutPct / 100));
  const owedToAsboRc = round2(rrp - penthouseCut);
  return {
    listingId: l.listingId,
    title: l.title,
    image: l.images[0] ?? null,
    quantity: stockUnits,
    rrp,
    cutPct,
    totalRrp: round2(rrp * stockUnits),
    penthouseCut: round2(penthouseCut * stockUnits),
    owedToAsboRc: round2(owedToAsboRc * stockUnits),
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
    rrp: s.rrp,
    cutPct: s.cutPct,
    totalRrp: s.rrp,
    penthouseCut: s.penthouseCut,
    owedToAsboRc: s.owedToAsboRc,
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
