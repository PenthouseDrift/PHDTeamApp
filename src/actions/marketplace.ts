"use server";

import { redis } from "@/lib/redis";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { marketplaceListingSchema } from "@/lib/validators";
import type { ActionResult, MarketplaceListing } from "@/types";
import { randomUUID } from "crypto";

/**
 * Cache tag for all cached marketplace reads (public website feed + author
 * names). Any listing mutation calls revalidateTag(MARKETPLACE_TAG) so the
 * public feed refreshes immediately instead of waiting for the TTL.
 */
const MARKETPLACE_TAG = "marketplace";

/** Bust every cached marketplace read. Call after any listing mutation. */
function bustMarketplaceCache() {
  try {
    revalidateTag(MARKETPLACE_TAG, "max");
  } catch {
    // revalidateTag is only valid in request/render contexts; ignore otherwise.
  }
}

/** Sorted set of all listing IDs. Score encodes status + recency so a plain
 * ascending zrange yields: available (newest-first) then sold (newest-first).
 */
const MARKETPLACE_INDEX = "marketplace:all";

/**
 * Large constant added to a sold listing's score so every sold item sorts
 * AFTER every available item on a plain ascending zrange. Available scores are
 * -createdAt (negative, since createdAt is a ms timestamp), so adding a value
 * well above any possible timestamp guarantees sold items land strictly below.
 */
const SOLD_SCORE_OFFSET = 1e15;

/**
 * Index score for a listing: -createdAt keeps newest-first within a group, and
 * sold listings get bumped below all available ones. Within each group,
 * ordering stays by recency.
 */
function indexScore(createdAt: number, status: "available" | "sold"): number {
  const base = -createdAt;
  return status === "sold" ? base + SOLD_SCORE_OFFSET : base;
}

/**
 * Convert a raw Redis hash into a typed MarketplaceListing. Redis stores
 * everything as strings, so booleans/numbers/arrays are coerced here.
 */
function toListing(data: Record<string, unknown> | null): MarketplaceListing | null {
  if (!data || Object.keys(data).length === 0) return null;

  const images = Array.isArray(data.images)
    ? (data.images as string[])
    : typeof data.images === "string"
    ? safeParseArray(data.images)
    : [];

  const status = data.status === "sold" ? "sold" : "available";

  const allowedMethods = ["email", "phone", "facebook", "instagram", "other"] as const;
  const contactMethod = allowedMethods.includes(data.contactMethod as (typeof allowedMethods)[number])
    ? (data.contactMethod as MarketplaceListing["contactMethod"])
    : "other";

  // Redis (via the Upstash client) can auto-deserialize values that look like
  // numbers — e.g. an all-digit phone number comes back as a number, not a
  // Resolve quantity + sold count up front so dependent fields (soldAt) agree.
  // Quantity: a missing field defaults to 1 (legacy single-item listings), but
  // an explicit 0 is preserved — for ASBO-RC consignment, quantity is the live
  // available-stock count and may legitimately reach 0 (sold out).
  const qty =
    data.quantity === undefined || data.quantity === null || data.quantity === ""
      ? 1
      : Math.max(0, Math.floor(Number(data.quantity) || 0));
  const soldCountVal =
    data.soldCount === undefined || data.soldCount === null || data.soldCount === ""
      ? data.status === "sold"
        ? qty
        : 0
      : Math.min(qty, Math.max(0, Number(data.soldCount) || 0));

  // Per-unit sold timestamps (stored as a JSON array). Legacy listings have no
  // soldAt: synthesise from updatedAt/createdAt so existing sold units still
  // group under a date rather than appearing undated. Always length-match
  // soldCount (truncate extras, pad shortfalls with a best-effort timestamp).
  const soldAt: number[] = (() => {
    let arr: number[] = [];
    if (Array.isArray(data.soldAt)) {
      arr = (data.soldAt as unknown[]).map((n) => Number(n)).filter((n) => n > 0);
    } else if (typeof data.soldAt === "string" && data.soldAt) {
      try {
        const parsed = JSON.parse(data.soldAt);
        if (Array.isArray(parsed)) arr = parsed.map((n) => Number(n)).filter((n) => n > 0);
      } catch {
        /* ignore malformed */
      }
    }
    const fallback = Number(data.updatedAt) || Number(data.createdAt) || 0;
    if (arr.length > soldCountVal) return arr.slice(0, soldCountVal);
    while (arr.length < soldCountVal) arr.push(fallback);
    return arr;
  })();

  // string. Coerce every text field with asString() so the typed object never
  // lies and consumers can safely call string methods like .replace().
  return {
    listingId: asString(data.listingId),
    userId: asString(data.userId),
    title: asString(data.title),
    description: asString(data.description),
    price: Number(data.price) || 0,
    images,
    location: asString(data.location),
    contactName: asString(data.contactName),
    contactMethod,
    contactValue: asString(data.contactValue),
    atTrack: String(data.atTrack) === "true",
    meetAtTrack: String(data.meetAtTrack) === "true",
    status,
    showOnWebsite: String(data.showOnWebsite) === "true",
    quantity: qty,
    soldCount: soldCountVal,
    soldAt,
    soldByAsboRc: String(data.soldByAsboRc) === "true",
    soldByPhd: String(data.soldByPhd) === "true",
    penthouseCutPct:
      data.penthouseCutPct === null || data.penthouseCutPct === undefined || data.penthouseCutPct === ""
        ? 7
        : Number(data.penthouseCutPct),
    asboRcPaid: String(data.asboRcPaid) === "true",
    // Per-unit settlement count. Legacy records only had the asboRcPaid boolean;
    // if that was true, treat every sold unit as paid. Clamp to soldCount.
    asboRcPaidUnits: (() => {
      if (data.asboRcPaidUnits === undefined || data.asboRcPaidUnits === null || data.asboRcPaidUnits === "") {
        return String(data.asboRcPaid) === "true" ? soldCountVal : 0;
      }
      return Math.min(soldCountVal, Math.max(0, Number(data.asboRcPaidUnits) || 0));
    })(),
    asboRcPaidAt: Number(data.asboRcPaidAt) || undefined,
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
  };
}

/** Coerce an unknown Redis value to a trimmed-safe string (empty when null). */
function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function safeParseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Create a new marketplace listing owned by `userId`. Validates with
 * marketplaceListingSchema, writes the listing hash and indexes it for
 * newest-first retrieval.
 */
export async function createListing(
  userId: string,
  data: {
    title: string;
    description?: string;
    price: number;
    images: string[];
    location?: string;
    contactName?: string;
    contactMethod?: "email" | "phone" | "facebook" | "instagram" | "other";
    contactValue?: string;
    atTrack?: boolean;
    meetAtTrack?: boolean;
    quantity?: number;
    soldByAsboRc?: boolean;
    soldByPhd?: boolean;
    penthouseCutPct?: number;
  }
): Promise<ActionResult<MarketplaceListing>> {
  const parsed = marketplaceListingSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
  }

  if (!userId) {
    return { success: false, error: "You must be logged in to post a listing" };
  }

  try {
    const session = await auth();
    const role = session?.user?.role;
    // Only admins or ASBO-RC partners may flag a listing as ASBO-RC consignment.
    const canSellForAsboRc = role === "admin" || role === "asbo-rc";
    const soldByAsboRc = Boolean(parsed.data.soldByAsboRc) && canSellForAsboRc;
    // "Sold by PHD" is a display badge admins can set on first-party items. It
    // is ALSO implied by ASBO consignment (PHD sells it on their behalf), so an
    // ASBO item always carries the badge. Only admins may set it standalone.
    const soldByPhd = soldByAsboRc || (role === "admin" && Boolean(parsed.data.soldByPhd));

    const listingId = randomUUID();
    const now = Date.now();

    const listing: MarketplaceListing = {
      listingId,
      userId,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      price: parsed.data.price,
      images: parsed.data.images,
      location: parsed.data.location.trim(),
      contactName: parsed.data.contactName.trim(),
      contactMethod: parsed.data.contactMethod,
      contactValue: parsed.data.contactValue.trim(),
      atTrack: parsed.data.atTrack,
      meetAtTrack: parsed.data.meetAtTrack,
      status: "available",
      showOnWebsite: true,
      quantity: parsed.data.quantity,
      soldCount: 0,
      soldAt: [],
      soldByAsboRc,
      soldByPhd,
      penthouseCutPct: parsed.data.penthouseCutPct,
      asboRcPaid: false,
      asboRcPaidUnits: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Explicit string-safe hash (no spreading the typed object) so optional
    // fields can never write null/undefined, which Redis rejects.
    const hash: Record<string, string> = {
      listingId: listing.listingId,
      userId: listing.userId,
      title: listing.title,
      description: listing.description,
      price: String(listing.price),
      images: JSON.stringify(listing.images),
      location: listing.location,
      contactName: listing.contactName,
      contactMethod: listing.contactMethod,
      contactValue: listing.contactValue,
      status: listing.status,
      showOnWebsite: String(listing.showOnWebsite),
      atTrack: String(listing.atTrack),
      meetAtTrack: String(listing.meetAtTrack),
      quantity: String(listing.quantity),
      soldCount: String(listing.soldCount),
      soldAt: JSON.stringify(listing.soldAt),
      soldByAsboRc: String(listing.soldByAsboRc),
      soldByPhd: String(listing.soldByPhd),
      penthouseCutPct: String(listing.penthouseCutPct),
      asboRcPaid: String(listing.asboRcPaid),
      asboRcPaidUnits: String(listing.asboRcPaidUnits),
      createdAt: String(listing.createdAt),
      updatedAt: String(listing.updatedAt),
    };

    await redis
      .multi()
      .hset(`listing:${listingId}`, hash)
      // New listings are always available => scored by -createdAt (newest first).
      .zadd(MARKETPLACE_INDEX, { score: indexScore(now, "available"), member: listingId })
      .exec();

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath("/admin/asbo-rc");
    return { success: true, data: listing };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create listing",
    };
  }
}

/**
 * Fetch listings newest-first. Sold items are INCLUDED by default so the
 * in-app marketplace keeps showing them (greyed out) rather than making them
 * vanish. Pass includeSold: false to hide sold ones (used by the public
 * website feed, which stays clean).
 */
export async function getListings(
  limit = 60,
  options: { includeSold?: boolean } = {}
): Promise<MarketplaceListing[]> {
  try {
    const ids = await redis.zrange(MARKETPLACE_INDEX, 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const id of ids) {
      pipeline.hgetall(`listing:${id as string}`);
    }
    const rawResults = await pipeline.exec();

    const listings = rawResults
      .map((raw) => toListing(raw as Record<string, unknown> | null))
      .filter((l): l is MarketplaceListing => l !== null);

    // Default: include sold items (so they stay visible in the app). Callers
    // opt out with includeSold: false (the public website feed).
    return options.includeSold === false
      ? listings.filter((l) => l.status === "available")
      : listings;
  } catch (error) {
    console.error("Failed to get marketplace listings:", error);
    return [];
  }
}

export interface MarketplacePage {
  listings: MarketplaceListing[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Fetch one page of marketplace listings. The index is pre-sorted so a plain
 * ascending zrange gives available listings (newest-first) followed by sold
 * ones — so we only read the hashes for the requested page, not the whole set.
 * This keeps DB work proportional to the page size, not the catalogue size.
 */
export async function getListingsPage(
  page = 1,
  perPage = 14,
  options: { query?: string } = {}
): Promise<MarketplacePage> {
  const safePerPage = Math.max(1, Math.min(60, Math.floor(perPage) || 14));
  const query = (options.query ?? "").trim().toLowerCase();

  try {
    // --- Search path: match across the whole catalogue, then paginate. ---
    if (query) {
      const ids = await redis.zrange(MARKETPLACE_INDEX, 0, -1);
      if (!ids || ids.length === 0) {
        return { listings: [], total: 0, page: 1, perPage: safePerPage, totalPages: 0 };
      }

      const pipeline = redis.pipeline();
      for (const id of ids) pipeline.hgetall(`listing:${id as string}`);
      const raws = await pipeline.exec();

      // Keep index order (available-first, newest-first) and filter by match.
      const matches = raws
        .map((raw) => toListing(raw as Record<string, unknown> | null))
        .filter((l): l is MarketplaceListing => l !== null)
        .filter((l) =>
          [l.title, l.description, l.location]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(query))
        );

      const total = matches.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / safePerPage);
      const safePage = Math.max(1, Math.min(Math.max(1, totalPages), Math.floor(page) || 1));
      const startIdx = (safePage - 1) * safePerPage;
      const listings = matches.slice(startIdx, startIdx + safePerPage);

      return { listings, total, page: safePage, perPage: safePerPage, totalPages };
    }

    // --- Default path: page-slice only (no full scan). ---
    // One cheap call for the total (used for page controls).
    const total = await redis.zcard(MARKETPLACE_INDEX);
    if (!total) {
      return { listings: [], total: 0, page: 1, perPage: safePerPage, totalPages: 0 };
    }

    const totalPages = Math.max(1, Math.ceil(total / safePerPage));
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(page) || 1));
    const start = (safePage - 1) * safePerPage;
    const end = start + safePerPage - 1;

    const ids = await redis.zrange(MARKETPLACE_INDEX, start, end);
    if (!ids || ids.length === 0) {
      return { listings: [], total, page: safePage, perPage: safePerPage, totalPages };
    }

    // Only hgetall the page's worth of listings.
    const pipeline = redis.pipeline();
    for (const id of ids) {
      pipeline.hgetall(`listing:${id as string}`);
    }
    const rawResults = await pipeline.exec();

    const listings = rawResults
      .map((raw) => toListing(raw as Record<string, unknown> | null))
      .filter((l): l is MarketplaceListing => l !== null);

    return { listings, total, page: safePage, perPage: safePerPage, totalPages };
  } catch (error) {
    console.error("Failed to get marketplace page:", error);
    return { listings: [], total: 0, page: 1, perPage: safePerPage, totalPages: 0 };
  }
}

/**
 * Listings flagged to show on the public website. Includes sold items (shown
 * greyed/marked "Sold" on the site); the index ordering already places sold
 * ones after available ones. No auth guard — used by the public aggregate API.
 */
async function _getWebsiteListings(limit = 60): Promise<MarketplaceListing[]> {
  const all = await getListings(limit, { includeSold: true });
  return all.filter((l) => l.showOnWebsite);
}

/**
 * Cached public website feed. This is a public, high-traffic endpoint that
 * otherwise fans out to a zrange + many hgetall on every request. Caching it
 * for 60s collapses that to one Redis read per minute regardless of traffic;
 * listing mutations bust the cache immediately via the marketplace tag.
 */
export const getWebsiteListings = unstable_cache(
  async (limit = 60) => _getWebsiteListings(limit),
  ["marketplace-website-listings"],
  { revalidate: 60, tags: [MARKETPLACE_TAG] }
);

export async function getListingById(listingId: string): Promise<MarketplaceListing | null> {
  try {
    const data = await redis.hgetall(`listing:${listingId}`);
    return toListing(data as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

/**
 * Mark a listing sold/available. Only the owner (or staff) can change it.
 */
export async function setListingStatus(
  listingId: string,
  status: "available" | "sold"
): Promise<ActionResult<{ status: "available" | "sold" }>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    // Keep per-unit stock consistent with the whole-listing flag: marking sold
    // sells out every unit; marking available restocks all of them.
    const soldCount = status === "sold" ? listing.quantity : 0;
    const now = Date.now();
    // Sync the per-unit sold timestamps to the new count: fill with "now" for
    // the remaining unsold units when marking sold; clear when restocking.
    const soldAt = [...listing.soldAt];
    if (soldCount > soldAt.length) {
      while (soldAt.length < soldCount) soldAt.push(now);
    } else {
      soldAt.length = soldCount;
    }
    // Settled units can't exceed sold units.
    const paidUnits = Math.min(listing.asboRcPaidUnits, soldCount);
    const soldDelta = soldCount - listing.soldCount;

    await redis.hset(`listing:${listingId}`, {
      status,
      soldCount: String(soldCount),
      soldAt: JSON.stringify(soldAt),
      asboRcPaidUnits: String(paidUnits),
      updatedAt: now,
    });

    // ASBO-RC consignment: log each newly-sold unit to the permanent ledger.
    // "Restock" (marking available) does not remove existing ledger sales.
    if (listing.soldByAsboRc && soldDelta > 0) {
      const { createAsboRcSales } = await import("@/actions/asbo-rc");
      await createAsboRcSales(listing, soldDelta);
    }
    // Rescore in the index so sold items drop to the bottom (and back up when
    // restocked), keeping the browse ordering correct without reading hashes.
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, status),
      member: listingId,
    });

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: { status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update listing",
    };
  }
}

/**
 * Set how many units of a listing have been sold (absolute value, clamped to
 * 0..quantity). The listing status auto-flips to "sold" when no units remain
 * and back to "available" otherwise. Only the owner or staff can update.
 * Returns the clamped soldCount plus the derived remaining stock and status.
 */
export async function setListingSoldCount(
  listingId: string,
  soldCount: number
): Promise<ActionResult<{ soldCount: number; available: number; status: "available" | "sold" }>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    const clamped = Math.min(listing.quantity, Math.max(0, Math.floor(soldCount)));
    const available = listing.quantity - clamped;
    const status: "available" | "sold" = available <= 0 ? "sold" : "available";
    // Settled units can't exceed sold units (e.g. if units are un-sold).
    const paidUnits = Math.min(listing.asboRcPaidUnits, clamped);

    // Maintain the per-unit sold-timestamp list: appending "now" for each newly
    // sold unit, or dropping the most recent timestamps when units are un-sold.
    const now = Date.now();
    const soldAt = [...listing.soldAt];
    if (clamped > soldAt.length) {
      while (soldAt.length < clamped) soldAt.push(now);
    } else if (clamped < soldAt.length) {
      soldAt.length = clamped;
    }
    const soldDelta = clamped - listing.soldCount;

    await redis.hset(`listing:${listingId}`, {
      soldCount: String(clamped),
      soldAt: JSON.stringify(soldAt),
      status,
      asboRcPaidUnits: String(paidUnits),
      updatedAt: now,
    });

    // ASBO-RC consignment: each newly-sold unit becomes a permanent ledger sale
    // (decoupled from this listing's stock). Reducing soldCount does NOT remove
    // ledger sales — corrections are made by deleting a sale record directly.
    if (listing.soldByAsboRc && soldDelta > 0) {
      const { createAsboRcSales } = await import("@/actions/asbo-rc");
      await createAsboRcSales(listing, soldDelta);
    }
    // Keep the browse index ordered (sold items sink to the bottom).
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, status),
      member: listingId,
    });

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: { soldCount: clamped, available, status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update stock",
    };
  }
}

/**
 * Set a listing's TOTAL quantity (e.g. after receiving more consignment stock).
 * Quantity can't drop below the number already sold. Remaining/available stock
 * is derived as quantity - soldCount, and status auto-updates (sold out when
 * none remain). Does NOT touch the sales ledger. Owner or staff only.
 * This is the quick-edit used by the ASBO-RC Products & Stock tab, and it
 * propagates everywhere the listing is shown (marketplace, website, dashboard).
 */
export async function setListingQuantity(
  listingId: string,
  quantity: number
): Promise<
  ActionResult<{ quantity: number; soldCount: number; available: number; status: "available" | "sold" }>
> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    const requested = Math.max(0, Math.floor(Number(quantity) || 0));
    let nextQuantity: number;
    let available: number;
    if (listing.soldByAsboRc) {
      // ASBO-RC: quantity IS the available stock (sold units live in the ledger,
      // not in soldCount). May be 0 when sold out.
      nextQuantity = requested;
      available = requested;
    } else {
      // Normal listings: quantity is total; can't drop below units already sold.
      nextQuantity = Math.max(listing.soldCount, requested, 1);
      available = nextQuantity - listing.soldCount;
    }
    const status: "available" | "sold" = available <= 0 ? "sold" : "available";
    const now = Date.now();

    await redis.hset(`listing:${listingId}`, {
      quantity: String(nextQuantity),
      status,
      updatedAt: now,
    });
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, status),
      member: listingId,
    });

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return {
      success: true,
      data: { quantity: nextQuantity, soldCount: listing.soldCount, available, status },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update quantity",
    };
  }
}

/**
 * Record a sale of `count` units of an ASBO-RC consignment listing: decrements
 * the listing's available stock (its `quantity`) and appends `count` permanent
 * sale records to the ASBO-RC ledger. Clamped to the units currently available.
 * Sold-out listings flip to status "sold". Owner or staff only.
 *
 * This is the ASBO-RC counterpart to the normal "mark sold" flow — for
 * consignment items stock lives in `quantity` and sales live in the ledger, so
 * there is no soldCount accumulation.
 */
export async function sellAsboRcUnits(
  listingId: string,
  count = 1
): Promise<ActionResult<{ available: number; sold: number; status: "available" | "sold" }>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }
    if (!listing.soldByAsboRc) {
      return { success: false, error: "This item is not an ASBO-RC consignment listing" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    const available = listing.quantity; // ASBO: quantity == available stock
    const toSell = Math.min(available, Math.max(1, Math.floor(count)));
    if (toSell <= 0) {
      return { success: false, error: "No stock available to sell" };
    }

    const nextAvailable = available - toSell;
    const status: "available" | "sold" = nextAvailable <= 0 ? "sold" : "available";
    const now = Date.now();

    await redis.hset(`listing:${listingId}`, {
      quantity: String(nextAvailable),
      status,
      updatedAt: now,
    });
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, status),
      member: listingId,
    });

    // Append permanent ledger sales (snapshotted price/cut/title/image).
    const { createAsboRcSales } = await import("@/actions/asbo-rc");
    await createAsboRcSales(listing, toSell);

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: { available: nextAvailable, sold: toSell, status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record sale",
    };
  }
}

/**
 * Edit an existing listing. Only the owner (or staff) can edit. Preserves
 * ownership, status, website-visibility and createdAt; bumps updatedAt. Any
 * images removed from the listing are cleaned up from blob storage.
 */
export async function updateListing(
  listingId: string,
  data: {
    title: string;
    description?: string;
    price: number;
    images: string[];
    location?: string;
    contactName?: string;
    contactMethod?: "email" | "phone" | "facebook" | "instagram" | "other";
    contactValue?: string;
    atTrack?: boolean;
    meetAtTrack?: boolean;
    quantity?: number;
    soldByAsboRc?: boolean;
    soldByPhd?: boolean;
    penthouseCutPct?: number;
  }
): Promise<ActionResult<MarketplaceListing>> {
  const parsed = marketplaceListingSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
  }

  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const existingData = await redis.hgetall(`listing:${listingId}`);
    const existing = toListing(existingData as Record<string, unknown> | null);
    if (!existing) {
      return { success: false, error: "Listing not found" };
    }

    const isOwner = existing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only edit your own listings" };
    }

    // Only admins or ASBO-RC partners may toggle the ASBO-RC consignment flag.
    // For anyone else, preserve whatever the listing already had.
    const canSellForAsboRc =
      session.user.role === "admin" || session.user.role === "asbo-rc";
    const soldByAsboRc = canSellForAsboRc
      ? Boolean(parsed.data.soldByAsboRc)
      : existing.soldByAsboRc;
    // "Sold by PHD" badge: implied by ASBO consignment; otherwise only admins
    // may set it standalone. Non-admin/ASBO editors preserve the existing value.
    const soldByPhd = soldByAsboRc
      ? true
      : session.user.role === "admin"
      ? Boolean(parsed.data.soldByPhd)
      : existing.soldByPhd;

    // Editing quantity can't un-sell units: clamp the existing soldCount to the
    // new quantity. Status is then kept consistent (sold out when none remain).
    const nextQuantity = parsed.data.quantity;
    const nextSoldCount = Math.min(existing.soldCount, nextQuantity);
    const nextStatus: "available" | "sold" =
      nextQuantity - nextSoldCount <= 0 ? "sold" : "available";
    // Settled units can never exceed sold units.
    const nextPaidUnits = Math.min(existing.asboRcPaidUnits, nextSoldCount);
    // Clamp the sold-timestamp list to the (possibly reduced) sold count.
    const nextSoldAt = existing.soldAt.slice(0, nextSoldCount);

    const updated: MarketplaceListing = {
      ...existing,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      price: parsed.data.price,
      images: parsed.data.images,
      location: parsed.data.location.trim(),
      contactName: parsed.data.contactName.trim(),
      contactMethod: parsed.data.contactMethod,
      contactValue: parsed.data.contactValue.trim(),
      atTrack: parsed.data.atTrack,
      meetAtTrack: parsed.data.meetAtTrack,
      quantity: nextQuantity,
      soldCount: nextSoldCount,
      soldAt: nextSoldAt,
      status: nextStatus,
      soldByAsboRc,
      soldByPhd,
      penthouseCutPct: parsed.data.penthouseCutPct,
      asboRcPaidUnits: nextPaidUnits,
      updatedAt: Date.now(),
    };

    // Build an explicit hash with only string-safe values. We must NOT spread
    // the typed object directly because optional fields like asboRcPaidAt can
    // be `undefined`, and Redis rejects hset with null/undefined args.
    const hash: Record<string, string> = {
      listingId: updated.listingId,
      userId: updated.userId,
      title: updated.title,
      description: updated.description,
      price: String(updated.price),
      images: JSON.stringify(updated.images),
      location: updated.location,
      contactName: updated.contactName,
      contactMethod: updated.contactMethod,
      contactValue: updated.contactValue,
      status: updated.status,
      showOnWebsite: String(updated.showOnWebsite),
      atTrack: String(updated.atTrack),
      meetAtTrack: String(updated.meetAtTrack),
      quantity: String(updated.quantity),
      soldCount: String(updated.soldCount),
      soldAt: JSON.stringify(updated.soldAt),
      soldByAsboRc: String(updated.soldByAsboRc),
      soldByPhd: String(updated.soldByPhd),
      penthouseCutPct: String(updated.penthouseCutPct),
      asboRcPaid: String(updated.asboRcPaid),
      asboRcPaidUnits: String(updated.asboRcPaidUnits),
      createdAt: String(updated.createdAt),
      updatedAt: String(updated.updatedAt),
    };
    if (updated.asboRcPaidAt) {
      hash.asboRcPaidAt = String(updated.asboRcPaidAt);
    }
    await redis.hset(`listing:${listingId}`, hash);
    // Editing quantity can flip status (e.g. sold -> available), so keep the
    // browse index score in sync with the new status.
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(updated.createdAt, updated.status),
      member: listingId,
    });

    // Clean up any images that were removed during the edit (best-effort).
    const removed = existing.images.filter((url) => url && !updated.images.includes(url));
    for (const url of removed) {
      try {
        await deleteImage(url);
      } catch {
        /* ignore blob deletion errors */
      }
    }

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update listing",
    };
  }
}

/**
 * Delete a listing. Only the owner or staff (admin/moderator) can delete.
 * Associated blob images are removed on a best-effort basis.
 */
export async function deleteListing(listingId: string): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only delete your own listings" };
    }

    await redis.multi().del(`listing:${listingId}`).zrem(MARKETPLACE_INDEX, listingId).exec();
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/dashboard");

    // Best-effort blob cleanup; ignore failures so the record still deletes.
    for (const url of listing.images) {
      if (!url) continue;
      try {
        await deleteImage(url);
      } catch {
        /* ignore blob deletion errors */
      }
    }

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete listing",
    };
  }
}

/**
 * Admin-only: toggle whether a listing is visible on the public website.
 */
export async function toggleListingWebsiteVisibility(
  listingId: string
): Promise<ActionResult<{ showOnWebsite: boolean }>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    if (!data || Object.keys(data).length === 0) {
      return { success: false, error: "Listing not found" };
    }

    const next = String(data.showOnWebsite) !== "true";
    await redis.hset(`listing:${listingId}`, { showOnWebsite: String(next) });

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    return { success: true, data: { showOnWebsite: next } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update listing",
    };
  }
}

/** Resolve a member's display name for showing on a listing. */
async function _getListingAuthorName(userId: string): Promise<string> {
  try {
    const member = await redis.hgetall(`member:${userId}`);
    const name = (member?.nickname as string)?.trim() || (member?.name as string);
    return name || "Member";
  } catch {
    return "Member";
  }
}

/**
 * Cached seller display-name lookup. Called once per unique seller on the
 * marketplace list/feed — caching avoids an hgetall per seller on every render.
 * Member names change rarely, so a 5-minute TTL is plenty.
 */
export const getListingAuthorName = unstable_cache(
  async (userId: string) => _getListingAuthorName(userId),
  ["marketplace-author-name"],
  { revalidate: 300, tags: [MARKETPLACE_TAG] }
);
