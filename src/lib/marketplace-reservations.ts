import { redis } from "@/lib/redis";
import { revalidateTag } from "next/cache";

/**
 * Member-linked marketplace reservations (server-only storage layer).
 *
 * The stock effect of a reservation reuses the existing `reservedCount` on the
 * listing (or variant): it is the TOTAL held, so every existing "buyable"
 * calculation (cards, detail page, checkout, public feed) keeps working for
 * everyone else unchanged. This module adds WHO the hold is for.
 *
 * Holder data lives only here, in separate keys, and is deliberately NOT part
 * of MarketplaceListing / toListing / the public API / any shared cache, so it
 * can only reach the browser through actions that check "admin or the holder".
 *
 * Keys:
 *   reservation:<id>             hash  the record
 *   reservations:active          set   all active ids
 *   reservations:user:<userId>   set   a member's active ids
 *   reservations:listing:<id>    set   a listing's active ids
 */

export interface ReservationRecord {
  id: string;
  listingId: string;
  variantId?: string;
  variantName?: string;
  /** Snapshots so the member can still see what they reserved if the listing changes. */
  title: string;
  image?: string;
  userId: string;
  quantity: number;
  status: "active" | "cancelled" | "purchased";
  createdAt: number;
  createdBy: string;
  resolvedAt?: number;
  orderId?: string;
}

const rKey = (id: string) => `reservation:${id}`;
const ACTIVE = "reservations:active";
const userSet = (userId: string) => `reservations:user:${userId}`;
const listingSet = (listingId: string) => `reservations:listing:${listingId}`;

function parseRecord(raw: Record<string, unknown> | null): ReservationRecord | null {
  if (!raw || !raw.id) return null;
  const status = String(raw.status);
  return {
    id: String(raw.id),
    listingId: String(raw.listingId),
    variantId: raw.variantId ? String(raw.variantId) : undefined,
    variantName: raw.variantName ? String(raw.variantName) : undefined,
    title: String(raw.title ?? "Marketplace item"),
    image: raw.image ? String(raw.image) : undefined,
    userId: String(raw.userId),
    quantity: Math.max(0, Math.floor(Number(raw.quantity) || 0)),
    status: status === "cancelled" || status === "purchased" ? status : "active",
    createdAt: Number(raw.createdAt) || 0,
    createdBy: String(raw.createdBy ?? ""),
    resolvedAt: raw.resolvedAt ? Number(raw.resolvedAt) : undefined,
    orderId: raw.orderId ? String(raw.orderId) : undefined,
  };
}

async function loadRecords(ids: string[]): Promise<ReservationRecord[]> {
  if (ids.length === 0) return [];
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.hgetall(rKey(id)));
  const rows = (await pipeline.exec()) as Array<Record<string, unknown> | null>;
  return rows
    .map(parseRecord)
    .filter((r): r is ReservationRecord => r !== null && r.status === "active")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getReservation(id: string): Promise<ReservationRecord | null> {
  return parseRecord((await redis.hgetall(rKey(id))) as Record<string, unknown> | null);
}

export async function listActiveForUser(userId: string): Promise<ReservationRecord[]> {
  const ids = (await redis.smembers(userSet(userId))) as string[];
  return loadRecords(ids.map(String));
}

export async function listActiveForListing(listingId: string): Promise<ReservationRecord[]> {
  const ids = (await redis.smembers(listingSet(listingId))) as string[];
  return loadRecords(ids.map(String));
}

export async function listAllActive(): Promise<ReservationRecord[]> {
  const ids = (await redis.smembers(ACTIVE)) as string[];
  return loadRecords(ids.map(String));
}

export async function insertReservation(rec: ReservationRecord): Promise<void> {
  const fields: Record<string, string | number> = {
    id: rec.id,
    listingId: rec.listingId,
    title: rec.title,
    userId: rec.userId,
    quantity: rec.quantity,
    status: rec.status,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
  if (rec.variantId) fields.variantId = rec.variantId;
  if (rec.variantName) fields.variantName = rec.variantName;
  if (rec.image) fields.image = rec.image;
  await redis
    .multi()
    .hset(rKey(rec.id), fields)
    .sadd(ACTIVE, rec.id)
    .sadd(userSet(rec.userId), rec.id)
    .sadd(listingSet(rec.listingId), rec.id)
    .exec();
}

/** Close a reservation (cancelled or purchased) and drop it from every active index. */
export async function closeReservation(
  rec: ReservationRecord,
  status: "cancelled" | "purchased",
  orderId?: string
): Promise<void> {
  const fields: Record<string, string | number> = { status, resolvedAt: Date.now() };
  if (orderId) fields.orderId = orderId;
  await redis
    .multi()
    .hset(rKey(rec.id), fields)
    .srem(ACTIVE, rec.id)
    .srem(userSet(rec.userId), rec.id)
    .srem(listingSet(rec.listingId), rec.id)
    .exec();
}

export async function setReservationQuantity(id: string, quantity: number): Promise<void> {
  await redis.hset(rKey(id), { quantity });
}

const sameVariant = (a?: string, b?: string) => (a ?? "") === (b ?? "");

/** Units a specific member currently holds on a listing (or one variant of it). */
export async function heldQtyForBuyer(userId: string, listingId: string, variantId?: string): Promise<number> {
  if (!userId) return 0;
  const mine = await listActiveForUser(userId);
  return mine
    .filter((r) => r.listingId === listingId && sameVariant(r.variantId, variantId))
    .reduce((s, r) => s + r.quantity, 0);
}

/** Units held for named members on a listing / variant (the rest of reservedCount is a legacy anonymous hold). */
export async function memberHeldQty(listingId: string, variantId?: string): Promise<number> {
  const recs = await listActiveForListing(listingId);
  return recs.filter((r) => sameVariant(r.variantId, variantId)).reduce((s, r) => s + r.quantity, 0);
}

/**
 * Move the TOTAL held count on a listing / variant by `delta` (never below 0).
 * Non-variant: one atomic HINCRBY. Variant: the `variants` JSON is rewritten
 * (same pattern the existing stock paths use).
 */
export async function adjustHeldStock(listingId: string, variantId: string | undefined, delta: number): Promise<void> {
  const key = `listing:${listingId}`;
  if (!variantId) {
    const next = Number(await redis.hincrby(key, "reservedCount", delta));
    await redis.hset(key, { updatedAt: Date.now(), ...(next < 0 ? { reservedCount: "0" } : {}) });
    return;
  }
  const raw = await redis.hget(key, "variants");
  const list: Array<Record<string, unknown>> =
    typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const next = list.map((v) =>
    v.id === variantId ? { ...v, reservedCount: Math.max(0, (Number(v.reservedCount) || 0) + delta) } : v
  );
  await redis.hset(key, { variants: JSON.stringify(next), updatedAt: Date.now() });
}

export function bustMarketplaceTag(): void {
  try {
    revalidateTag("marketplace", "max");
  } catch {
    // Only valid in a request/render context.
  }
}

/**
 * Called by the payment finalizer once a marketplace checkout is paid and the
 * order exists. For each purchased line it converts the buyer's own active
 * reservation(s) into "purchased" (linked to the order) and releases the
 * matching units from the held total, because those units are now sold. If the
 * buyer bought fewer units than they held, the reservation shrinks instead of
 * closing.
 */
export async function consumeReservationsForPurchase(
  userId: string,
  lines: Array<{ listingId: string; variantId?: string; quantity: number }>,
  orderId: string
): Promise<void> {
  const mine = await listActiveForUser(userId);
  if (mine.length === 0) return;

  for (const line of lines) {
    let remaining = line.quantity;
    const matching = mine.filter((r) => r.listingId === line.listingId && sameVariant(r.variantId, line.variantId));
    for (const rec of matching) {
      if (remaining <= 0) break;
      const take = Math.min(rec.quantity, remaining);
      if (take <= 0) continue;
      await adjustHeldStock(rec.listingId, rec.variantId, -take);
      if (take >= rec.quantity) {
        await closeReservation(rec, "purchased", orderId);
        rec.quantity = 0;
      } else {
        await setReservationQuantity(rec.id, rec.quantity - take);
        rec.quantity -= take;
      }
      remaining -= take;
    }
  }
  bustMarketplaceTag();
}
