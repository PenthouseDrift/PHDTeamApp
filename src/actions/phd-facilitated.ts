"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getListings } from "@/actions/marketplace";
import {
  round2,
  ownerPayoutOf,
  type FacilitatedPayoutReport,
  type FacilitatedSaleRow,
  type FacilitatedTotals,
  type OwnerPayoutGroup,
  type PhdFacilitatedSale,
} from "@/lib/phd-facilitated";
import type { ActionResult, MarketplaceListing } from "@/types";
import { randomUUID } from "crypto";

/**
 * Server actions for the "Facilitated by PHD" owner-payout ledger. This is
 * deliberately SEPARATE from the ASBO-RC ledger (src/actions/asbo-rc.ts) and
 * never reads or writes ASBO-RC data. It records, per sold unit, how much PHD
 * owes the ORIGINAL OWNER (the listing's userId) so admins can settle payouts.
 */

/** Sorted set of all facilitated-sale IDs, scored by -soldAt (newest first). */
const SALES_INDEX = "phd-facilitated:sales";
const saleKey = (id: string) => `phd-facilitated:sale:${id}`;

/* ------------------------------------------------------------------ */
/* Ledger primitives                                                  */
/* ------------------------------------------------------------------ */

/** Coerce a raw Redis hash into a typed PhdFacilitatedSale. */
function toSale(data: Record<string, unknown> | null): PhdFacilitatedSale | null {
  if (!data || Object.keys(data).length === 0) return null;
  const num = (v: unknown) => Number(v) || 0;
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const sellPrice = num(data.sellPrice);
  // Legacy-safe: if ownerPayout wasn't stored, fall back to the sell price.
  const ownerPayout =
    data.ownerPayout === "" || data.ownerPayout === undefined || data.ownerPayout === null
      ? sellPrice
      : num(data.ownerPayout);
  return {
    saleId: str(data.saleId),
    listingId: str(data.listingId),
    ownerId: str(data.ownerId),
    ownerName: str(data.ownerName) || "Member",
    title: str(data.title),
    image: data.image ? str(data.image) : null,
    sellPrice,
    ownerPayout,
    clubCut: round2(Math.max(0, sellPrice - ownerPayout)),
    soldAt: num(data.soldAt),
    paid: String(data.paid) === "true",
    paidAt: num(data.paidAt) || undefined,
  };
}

function saleHash(sale: PhdFacilitatedSale): Record<string, string> {
  const hash: Record<string, string> = {
    saleId: sale.saleId,
    listingId: sale.listingId,
    ownerId: sale.ownerId,
    ownerName: sale.ownerName,
    title: sale.title,
    image: sale.image ?? "",
    sellPrice: String(sale.sellPrice),
    ownerPayout: String(sale.ownerPayout),
    clubCut: String(sale.clubCut),
    soldAt: String(sale.soldAt),
    paid: String(sale.paid),
  };
  if (sale.paidAt) hash.paidAt = String(sale.paidAt);
  return hash;
}

/** Resolve a member's display name (same logic as the marketplace author name). */
async function resolveOwnerName(userId: string): Promise<string> {
  try {
    const member = await redis.hgetall(`member:${userId}`);
    const name = (member?.nickname as string)?.trim() || (member?.name as string);
    return name || "Member";
  } catch {
    return "Member";
  }
}

/**
 * Append `count` new facilitated-sale records for a listing. Called when units
 * of a `facilitatedByPhd` listing are marked sold. Money/title/image/owner are
 * snapshotted so later edits don't rewrite history and restocking never removes
 * sales. Each sale starts unpaid. No auth guard: callers (the sell paths) are
 * already authorised. A no-op unless the listing is facilitatedByPhd.
 */
export async function createPhdFacilitatedSales(
  listing: MarketplaceListing,
  count: number,
  soldAtTimestamps?: number[],
  // For variant listings: snapshot the specific variant's sell price, owner
  // payout + name so the ledger records what was actually sold.
  variantOverride?: { price: number; ownerPayoutPrice?: number; name: string }
): Promise<void> {
  if (!listing.facilitatedByPhd || count <= 0) return;

  const sellPrice = variantOverride ? variantOverride.price : listing.price || 0;
  const ownerPayout = variantOverride
    ? ownerPayoutOf({ price: variantOverride.price, ownerPayoutPrice: variantOverride.ownerPayoutPrice })
    : ownerPayoutOf({ price: listing.price || 0, ownerPayoutPrice: listing.ownerPayoutPrice });
  const clubCut = round2(Math.max(0, sellPrice - ownerPayout));
  const title = variantOverride ? `${listing.title} — ${variantOverride.name}` : listing.title;
  const ownerName = await resolveOwnerName(listing.userId);

  const pipeline = redis.pipeline();
  for (let i = 0; i < count; i += 1) {
    const saleId = randomUUID();
    const soldAt = soldAtTimestamps?.[i] ?? Date.now();
    const sale: PhdFacilitatedSale = {
      saleId,
      listingId: listing.listingId,
      ownerId: listing.userId,
      ownerName,
      title,
      image: listing.images[0] ?? null,
      sellPrice: round2(sellPrice),
      ownerPayout: round2(ownerPayout),
      clubCut,
      soldAt,
      paid: false,
    };
    pipeline.hset(saleKey(saleId), saleHash(sale));
    pipeline.zadd(SALES_INDEX, { score: -soldAt, member: saleId });
  }
  await pipeline.exec();

  revalidatePath("/admin/facilitated-sales");
  revalidatePath("/admin/click-collect");
  revalidatePath("/dashboard");
}

/**
 * One-time (re-runnable) BACKFILL: populate the owner-payout ledger from items
 * that were already marked "Facilitated by PHD" and sold BEFORE this ledger
 * existed (or via a path that didn't log it). Admin-only.
 *
 * Idempotent per listing: it counts how many ledger records already exist for
 * each listing and only creates records for the shortfall (expected sold units
 * minus already-logged), so running it twice never double-counts. Expected sold
 * units = soldCount (non-variant) or the sum of variant soldCounts (variant).
 * Pricing/owner are snapshotted from the listing's CURRENT values (the best
 * available signal for historical sales); sold timestamps use the listing's
 * recorded soldAt where present, else the listing's updatedAt/createdAt.
 */
export async function backfillFacilitatedPayouts(): Promise<
  ActionResult<{ listingsBackfilled: number; unitsCreated: number; skippedPartial: number }>
> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    // How many ledger records already exist per listingId, so we only top up
    // the shortfall and never duplicate on a re-run.
    const existing = await listAllSales();
    const loggedByListing = new Map<string, number>();
    for (const s of existing) {
      loggedByListing.set(s.listingId, (loggedByListing.get(s.listingId) ?? 0) + 1);
    }

    // Every listing (incl. sold) that is marked Facilitated by PHD.
    const all = await getListings(2000, { includeSold: true });
    const facilitated = all.filter((l) => l.facilitatedByPhd);

    let listingsBackfilled = 0;
    let unitsCreated = 0;
    let skippedPartial = 0;

    for (const listing of facilitated) {
      const expected = listing.hasVariations
        ? listing.variants.reduce((s, v) => s + Math.max(0, v.soldCount), 0)
        : Math.max(0, listing.soldCount);
      if (expected <= 0) continue;

      const alreadyLogged = loggedByListing.get(listing.listingId) ?? 0;
      const shortfall = expected - alreadyLogged;
      if (shortfall <= 0) continue; // fully logged already

      if (listing.hasVariations) {
        if (alreadyLogged > 0) {
          // Partially logged variant listing: we can't know which variants were
          // already recorded (the ledger has no variantId), so skip to avoid
          // mis-attributing. These are vanishingly rare (a backfill runs on a
          // ledger that's empty for old items).
          skippedPartial += 1;
          continue;
        }
        // Log each variant's sold units at that variant's own price/payout.
        let created = 0;
        for (const v of listing.variants) {
          const soldUnits = Math.max(0, v.soldCount);
          if (soldUnits <= 0) continue;
          await createPhdFacilitatedSales(listing, soldUnits, undefined, {
            price: v.price,
            ownerPayoutPrice: v.ownerPayoutPrice,
            name: v.name,
          });
          created += soldUnits;
        }
        if (created > 0) {
          unitsCreated += created;
          listingsBackfilled += 1;
        }
      } else {
        // Non-variant: create the shortfall using the listing's sold timestamps
        // where available (newest shortfall units take the most recent stamps).
        const stamps = listing.soldAt && listing.soldAt.length > 0
          ? listing.soldAt.slice(-shortfall)
          : undefined;
        await createPhdFacilitatedSales(listing, shortfall, stamps);
        unitsCreated += shortfall;
        listingsBackfilled += 1;
      }
    }

    if (unitsCreated > 0) {
      await logActivity({
        type: "purchase",
        memberId: session.user.id,
        memberName: session.user.name ?? "Admin",
        description: `[Facilitated] Backfilled ${unitsCreated} owner-payout record(s) across ${listingsBackfilled} listing(s)`,
        amount: 0,
        currency: "GBP",
        isDev: false,
      });
    }

    revalidatePath("/admin/facilitated-sales");
    revalidatePath("/admin/click-collect");
    revalidatePath("/dashboard");
    return { success: true, data: { listingsBackfilled, unitsCreated, skippedPartial } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to backfill owner payouts",
    };
  }
}

/** All sales in the ledger, newest first. */
async function listAllSales(limit = 2000): Promise<PhdFacilitatedSale[]> {
  const ids = await redis.zrange(SALES_INDEX, 0, limit - 1);
  if (!ids || ids.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.hgetall(saleKey(id as string));
  const raws = await pipeline.exec();
  return raws
    .map((raw) => toSale(raw as Record<string, unknown> | null))
    .filter((s): s is PhdFacilitatedSale => s !== null);
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

function sumTotals(rows: FacilitatedSaleRow[]): FacilitatedTotals {
  return rows.reduce<FacilitatedTotals>(
    (acc, r) => ({
      unitCount: acc.unitCount + 1,
      totalSell: round2(acc.totalSell + r.sellPrice),
      totalOwnerPayout: round2(acc.totalOwnerPayout + r.ownerPayout),
      totalClubCut: round2(acc.totalClubCut + r.clubCut),
    }),
    { unitCount: 0, totalSell: 0, totalOwnerPayout: 0, totalClubCut: 0 }
  );
}

function saleToRow(s: PhdFacilitatedSale): FacilitatedSaleRow {
  return {
    saleId: s.saleId,
    listingId: s.listingId,
    ownerId: s.ownerId,
    ownerName: s.ownerName,
    title: s.title,
    image: s.image,
    sellPrice: s.sellPrice,
    ownerPayout: s.ownerPayout,
    clubCut: s.clubCut,
    soldAt: s.soldAt,
    paid: s.paid,
    paidAt: s.paidAt,
  };
}

/**
 * Build the "Facilitated by PHD" owner-payout report: every sold unit grouped
 * by original owner, so admins can see exactly how much PHD owes each owner.
 * Admin-only. Returns null for anyone else.
 */
export async function getFacilitatedPayoutReport(): Promise<FacilitatedPayoutReport | null> {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;

  const sales = await listAllSales();
  const rows = sales.map(saleToRow);

  // Group by owner; refresh the display name to the latest known value.
  const byOwner = new Map<string, FacilitatedSaleRow[]>();
  for (const r of rows) {
    const list = byOwner.get(r.ownerId) ?? [];
    list.push(r);
    byOwner.set(r.ownerId, list);
  }

  const owners: OwnerPayoutGroup[] = [];
  for (const [ownerId, ownerRows] of byOwner) {
    const latestName = await resolveOwnerName(ownerId);
    const normalisedRows = ownerRows.map((r) => ({ ...r, ownerName: latestName }));
    const outstanding = round2(
      normalisedRows.filter((r) => !r.paid).reduce((s, r) => s + r.ownerPayout, 0)
    );
    const paid = round2(
      normalisedRows.filter((r) => r.paid).reduce((s, r) => s + r.ownerPayout, 0)
    );
    owners.push({
      ownerId,
      ownerName: latestName,
      rows: normalisedRows.sort((a, b) => b.soldAt - a.soldAt),
      outstanding,
      paid,
      totals: sumTotals(normalisedRows),
    });
  }

  // Largest outstanding balance first; then alphabetical by owner name.
  owners.sort((a, b) => b.outstanding - a.outstanding || a.ownerName.localeCompare(b.ownerName));

  const overall = sumTotals(rows);
  const outstandingToOwners = round2(
    rows.filter((r) => !r.paid).reduce((s, r) => s + r.ownerPayout, 0)
  );
  const paidToOwners = round2(
    rows.filter((r) => r.paid).reduce((s, r) => s + r.ownerPayout, 0)
  );

  return { owners, overall, outstandingToOwners, paidToOwners };
}

/* ------------------------------------------------------------------ */
/* Settlement + corrections                                           */
/* ------------------------------------------------------------------ */

/** Admin-only: mark (or unmark) a single facilitated sale as paid to the owner. */
export async function setFacilitatedSalePaid(
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
      description: `[Facilitated] Payout to ${sale.ownerName} for "${sale.title}" marked ${
        paid ? "PAID" : "UNPAID"
      }`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/facilitated-sales");
    revalidatePath("/admin/click-collect");
    revalidatePath("/dashboard");
    return { success: true, data: { paid } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update payout status",
    };
  }
}

/**
 * Admin-only: mark EVERY unpaid sale for one owner as paid in a single action
 * (a "settle this owner" button). Returns how many sales were settled.
 */
export async function settleOwnerPayouts(
  ownerId: string
): Promise<ActionResult<{ settled: number }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }
    if (!ownerId) return { success: false, error: "Missing owner" };

    const sales = await listAllSales();
    const unpaid = sales.filter((s) => s.ownerId === ownerId && !s.paid);
    if (unpaid.length === 0) return { success: true, data: { settled: 0 } };

    const now = Date.now();
    const pipeline = redis.pipeline();
    for (const s of unpaid) {
      pipeline.hset(saleKey(s.saleId), { paid: "true", paidAt: String(now) });
    }
    await pipeline.exec();

    const ownerName = unpaid[0].ownerName || (await resolveOwnerName(ownerId));
    const total = round2(unpaid.reduce((sum, s) => sum + s.ownerPayout, 0));
    await logActivity({
      type: "purchase",
      memberId: session.user.id,
      memberName: session.user.name ?? "Admin",
      description: `[Facilitated] Settled ${unpaid.length} payout(s) to ${ownerName} (£${total})`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/facilitated-sales");
    revalidatePath("/admin/click-collect");
    revalidatePath("/dashboard");
    return { success: true, data: { settled: unpaid.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to settle payouts",
    };
  }
}

/**
 * Admin-only: permanently delete a facilitated-sale record (for correcting a
 * mistake). Does NOT change the listing's stock — adjust that separately.
 */
export async function deleteFacilitatedSale(saleId: string): Promise<ActionResult<null>> {
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
      description: `[Facilitated] Deleted payout record for "${sale.title}" (${
        sale.paid ? "was paid" : "was unpaid"
      })`,
      amount: 0,
      currency: "GBP",
      isDev: false,
    });

    revalidatePath("/admin/facilitated-sales");
    revalidatePath("/admin/click-collect");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete sale record",
    };
  }
}
