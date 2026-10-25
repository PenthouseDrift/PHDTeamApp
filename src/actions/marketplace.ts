"use server";

import { redis } from "@/lib/redis";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { marketplaceListingSchema } from "@/lib/validators";
import type { ActionResult, MarketplaceListing } from "@/types";
import { MARKETPLACE_CATEGORIES } from "@/types";
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
 * Separate sorted set holding DRAFT listing IDs (stocked but not yet
 * published). Drafts are deliberately kept out of MARKETPLACE_INDEX so every
 * public/member read (which funnels through that index) fails safe and never
 * sees a draft. Score is -createdAt (newest-first). On publish, the id moves
 * from here into MARKETPLACE_INDEX.
 */
const MARKETPLACE_DRAFTS_INDEX = "marketplace:drafts";

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
 * Parse the stored variants array (JSON string or already-array) into typed
 * ListingVariant records, coercing numbers and clamping soldCount to quantity.
 */
function parseVariants(raw: unknown): import("@/types").ListingVariant[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) arr = p;
    } catch {
      /* ignore malformed */
    }
  }
  return arr
    .map((v) => {
      const o = (v ?? {}) as Record<string, unknown>;
      const quantity = Math.max(0, Math.floor(Number(o.quantity) || 0));
      const soldCount = Math.min(quantity, Math.max(0, Math.floor(Number(o.soldCount) || 0)));
      const cp =
        o.consignmentPrice === undefined || o.consignmentPrice === null || o.consignmentPrice === ""
          ? undefined
          : Math.max(0, Number(o.consignmentPrice) || 0);
      const op =
        o.ownerPayoutPrice === undefined || o.ownerPayoutPrice === null || o.ownerPayoutPrice === ""
          ? undefined
          : Math.max(0, Number(o.ownerPayoutPrice) || 0);
      // Reserved units: prefer the numeric reservedCount; migrate a legacy
      // boolean reserved:true to "all currently-available units held".
      const available = Math.max(0, quantity - soldCount);
      const legacyReserved = o.reserved === true || o.reserved === "true";
      const reservedCount =
        o.reservedCount === undefined || o.reservedCount === null || o.reservedCount === ""
          ? legacyReserved
            ? available
            : 0
          : Math.min(available, Math.max(0, Math.floor(Number(o.reservedCount) || 0)));
      return {
        id: o.id ? String(o.id) : randomUUID(),
        name: String(o.name ?? "").trim(),
        price: Math.max(0, Number(o.price) || 0),
        consignmentPrice: cp,
        ownerPayoutPrice: op,
        quantity,
        soldCount,
        reservedCount,
      };
    })
    .filter((v) => v.name.length > 0);
}

/**
 * Derive listing-level price/quantity/soldCount/status from a set of variants.
 * price = min variant price; quantity/soldCount = sums; status = "sold" only
 * when every unit across all variants is gone. Falsy/empty variants yield a
 * zeroed derivation (caller should only use this when hasVariations is true).
 */
function deriveFromVariants(variants: import("@/types").ListingVariant[]): {
  price: number;
  quantity: number;
  soldCount: number;
  status: "available" | "sold";
} {
  if (!variants.length) return { price: 0, quantity: 0, soldCount: 0, status: "sold" };
  const price = Math.min(...variants.map((v) => v.price));
  const quantity = variants.reduce((s, v) => s + v.quantity, 0);
  const soldCount = variants.reduce((s, v) => s + v.soldCount, 0);
  const status: "available" | "sold" = quantity - soldCount <= 0 ? "sold" : "available";
  return { price, quantity, soldCount, status };
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
  // Variants. When present, the listing's price/quantity/soldCount/status are
  // DERIVED from them (overriding the stored scalar fields) so a single source
  // of truth drives both the variant UI and the aggregate listing figures.
  const hasVariations = String(data.hasVariations) === "true";
  const variants = hasVariations ? parseVariants(data.variants) : [];
  const derived = hasVariations ? deriveFromVariants(variants) : null;

  return {
    listingId: asString(data.listingId),
    userId: asString(data.userId),
    title: asString(data.title),
    description: asString(data.description),
    category: (MARKETPLACE_CATEGORIES as readonly string[]).includes(asString(data.category))
      ? (asString(data.category) as import("@/types").MarketplaceCategory)
      : "",
    price: derived ? derived.price : Number(data.price) || 0,
    consignmentPrice:
      data.consignmentPrice === undefined || data.consignmentPrice === null || data.consignmentPrice === ""
        ? undefined
        : Math.max(0, Number(data.consignmentPrice) || 0),
    images,
    location: asString(data.location),
    contactName: asString(data.contactName),
    contactMethod,
    contactValue: asString(data.contactValue),
    atTrack: String(data.atTrack) === "true",
    meetAtTrack: String(data.meetAtTrack) === "true",
    status: derived ? derived.status : status,
    showOnWebsite: String(data.showOnWebsite) === "true",
    quantity: derived ? derived.quantity : qty,
    soldCount: derived ? derived.soldCount : soldCountVal,
    soldAt,
    soldByAsboRc: String(data.soldByAsboRc) === "true",
    soldByPhd: String(data.soldByPhd) === "true",
    // "Facilitated by PHD" (available to all sellers). Legacy records default
    // to false / undefined so they behave exactly as before.
    facilitatedByPhd: String(data.facilitatedByPhd) === "true",
    ownerPayoutPrice:
      data.ownerPayoutPrice === undefined || data.ownerPayoutPrice === null || data.ownerPayoutPrice === ""
        ? undefined
        : Math.max(0, Number(data.ownerPayoutPrice) || 0),
    // Reserved units (non-variant). Prefer numeric reservedCount; migrate a
    // legacy boolean reserved:true to "all currently-available units held".
    reservedCount: (() => {
      const avail = Math.max(0, (derived ? derived.quantity : qty) - (derived ? derived.soldCount : soldCountVal));
      if (data.reservedCount === undefined || data.reservedCount === null || data.reservedCount === "") {
        return String(data.reserved) === "true" ? avail : 0;
      }
      return Math.min(avail, Math.max(0, Math.floor(Number(data.reservedCount) || 0)));
    })(),
    isDraft: String(data.isDraft) === "true",
    hasVariations,
    variationLabel: asString(data.variationLabel),
    variants,
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
    category: import("@/types").MarketplaceCategory;
    price: number;
    consignmentPrice?: number;
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
    facilitatedByPhd?: boolean;
    ownerPayoutPrice?: number;
    isDraft?: boolean;
    hasVariations?: boolean;
    variationLabel?: string;
    variants?: { id?: string; name: string; price: number; consignmentPrice?: number; ownerPayoutPrice?: number; quantity: number; soldCount?: number }[];
    penthouseCutPct?: number;
    /**
     * Admin-only: create this listing ON BEHALF OF another member. When set (and
     * the creator is an admin, and it names a real member), the listing is owned
     * by this member — it appears under THEIR profile and "My Listings", and any
     * facilitated owner-payout is owed to them. Ignored for non-admins and the
     * creator stays the owner.
     */
    onBehalfOfUserId?: string;
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

    // Resolve the OWNER of the listing. By default it's the creator (`userId`).
    // Admins may sell on behalf of another member: if `onBehalfOfUserId` is set
    // and names a real member, that member becomes the owner so the listing
    // shows under their profile. Non-admins can never set a different owner.
    let ownerId = userId;
    if (
      data.onBehalfOfUserId &&
      data.onBehalfOfUserId !== userId &&
      role === "admin"
    ) {
      const target = await redis.hgetall(`member:${data.onBehalfOfUserId}`);
      if (!target || Object.keys(target).length === 0 || !target.email) {
        return { success: false, error: "That member could not be found" };
      }
      ownerId = data.onBehalfOfUserId;
    }

    // Only admins or ASBO-RC partners may flag a listing as ASBO-RC consignment.
    const canSellForAsboRc = role === "admin" || role === "asbo-rc";
    const soldByAsboRc = Boolean(parsed.data.soldByAsboRc) && canSellForAsboRc;
    // "Sold by PHD" is a display badge admins can set on first-party items. It
    // is ALSO implied by ASBO consignment (PHD sells it on their behalf), so an
    // ASBO item always carries the badge. Only admins may set it standalone.
    const soldByPhd = soldByAsboRc || (role === "admin" && Boolean(parsed.data.soldByPhd));
    // Draft ("stock first, publish later"): admins and ASBO-RC users only.
    // Anyone else always creates a live listing regardless of the flag.
    const isDraft = canSellForAsboRc && Boolean(parsed.data.isDraft);

    // Variants (available to all sellers). When present, listing price/quantity/
    // soldCount/status are derived from them.
    const hasVariations = Boolean(parsed.data.hasVariations) && (parsed.data.variants?.length ?? 0) > 0;
    const variants: import("@/types").ListingVariant[] = hasVariations
      ? parsed.data.variants!.map((v) => ({
          id: v.id || randomUUID(),
          name: v.name.trim(),
          price: v.price,
          consignmentPrice: v.consignmentPrice,
          ownerPayoutPrice: v.ownerPayoutPrice,
          quantity: v.quantity,
          soldCount: Math.min(v.quantity, Math.max(0, v.soldCount ?? 0)),
        }))
      : [];
    const derived = hasVariations ? deriveFromVariants(variants) : null;

    // "Facilitated by PHD" is available to EVERY seller (no role clamp). The
    // per-owner payout is only meaningful for non-variant listings at the
    // listing level; variant listings carry per-variant payouts.
    const facilitatedByPhd = Boolean(parsed.data.facilitatedByPhd);
    const ownerPayoutPrice = hasVariations ? undefined : parsed.data.ownerPayoutPrice;

    const listingId = randomUUID();
    const now = Date.now();

    const listing: MarketplaceListing = {
      listingId,
      userId: ownerId,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category,
      price: derived ? derived.price : parsed.data.price,
      // Only meaningful for ASBO items; stored for everyone but ignored unless
      // soldByAsboRc. For variant listings the per-variant consignment prices
      // drive the ledger, so the listing-level value is left unset there.
      consignmentPrice: hasVariations ? undefined : parsed.data.consignmentPrice,
      images: parsed.data.images,
      location: parsed.data.location.trim(),
      contactName: parsed.data.contactName.trim(),
      contactMethod: parsed.data.contactMethod,
      contactValue: parsed.data.contactValue.trim(),
      atTrack: parsed.data.atTrack,
      meetAtTrack: parsed.data.meetAtTrack,
      status: derived ? derived.status : "available",
      isDraft,
      hasVariations,
      variationLabel: hasVariations ? parsed.data.variationLabel.trim() : "",
      variants,
      showOnWebsite: true,
      quantity: derived ? derived.quantity : parsed.data.quantity,
      soldCount: derived ? derived.soldCount : 0,
      soldAt: [],
      soldByAsboRc,
      soldByPhd,
      facilitatedByPhd,
      ownerPayoutPrice,
      reservedCount: 0,
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
      category: listing.category,
      price: String(listing.price),
      consignmentPrice: listing.consignmentPrice != null ? String(listing.consignmentPrice) : "",
      images: JSON.stringify(listing.images),
      location: listing.location,
      contactName: listing.contactName,
      contactMethod: listing.contactMethod,
      contactValue: listing.contactValue,
      status: listing.status,
      isDraft: String(listing.isDraft),
      hasVariations: String(listing.hasVariations),
      variationLabel: listing.variationLabel,
      variants: JSON.stringify(listing.variants),
      showOnWebsite: String(listing.showOnWebsite),
      atTrack: String(listing.atTrack),
      meetAtTrack: String(listing.meetAtTrack),
      quantity: String(listing.quantity),
      soldCount: String(listing.soldCount),
      soldAt: JSON.stringify(listing.soldAt),
      soldByAsboRc: String(listing.soldByAsboRc),
      soldByPhd: String(listing.soldByPhd),
      facilitatedByPhd: String(listing.facilitatedByPhd),
      ownerPayoutPrice: listing.ownerPayoutPrice != null ? String(listing.ownerPayoutPrice) : "",
      reservedCount: String(listing.reservedCount),
      penthouseCutPct: String(listing.penthouseCutPct),
      asboRcPaid: String(listing.asboRcPaid),
      asboRcPaidUnits: String(listing.asboRcPaidUnits),
      createdAt: String(listing.createdAt),
      updatedAt: String(listing.updatedAt),
    };

    // Drafts go into the separate drafts index ONLY, so they never surface in
    // any public/member read (all of which go through MARKETPLACE_INDEX). Live
    // listings go into the public index as before.
    const writeMulti = redis.multi().hset(`listing:${listingId}`, hash);
    if (isDraft) {
      writeMulti.zadd(MARKETPLACE_DRAFTS_INDEX, { score: -now, member: listingId });
    } else {
      // New live listings are always available => scored by -createdAt (newest first).
      writeMulti.zadd(MARKETPLACE_INDEX, { score: indexScore(now, "available"), member: listingId });
    }
    await writeMulti.exec();

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/admin/facilitated-sales");
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
async function loadListings(
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
    // Rethrow so a Redis hiccup is never cached as "no listings".
    throw error;
  }
}

// Reading listings costs one HGETALL each, and the data is the same for every
// viewer, so it is cached until the marketplace changes (all listing / stock /
// reservation mutations bust the "marketplace" tag).
const getListingsCached = unstable_cache(loadListings, ["marketplace-listings"], {
  revalidate: 600,
  tags: [MARKETPLACE_TAG],
});

export async function getListings(
  limit = 60,
  options: { includeSold?: boolean } = {}
): Promise<MarketplaceListing[]> {
  try {
    return await getListingsCached(limit, options);
  } catch {
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
async function loadListingsPage(
  page = 1,
  perPage = 14,
  options: { query?: string; category?: string } = {}
): Promise<MarketplacePage> {
  const safePerPage = Math.max(1, Math.min(60, Math.floor(perPage) || 14));
  const query = (options.query ?? "").trim().toLowerCase();
  const category = (options.category ?? "").trim();
  const hasCategory = (MARKETPLACE_CATEGORIES as readonly string[]).includes(category);

  try {
    // --- Filter path: a search query and/or a category both require scanning
    // the whole catalogue (the fast page-slice below can't filter). ---
    if (query || hasCategory) {
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
        .filter((l) => !hasCategory || l.category === category)
        .filter(
          (l) =>
            !query ||
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
    throw error;
  }
}

// One browse page (or one search / category result) is up to 14 HGETALLs, or
// EVERY listing when filtering. Same for all viewers, so cache it per
// page/query/category until the marketplace changes.
const getListingsPageCached = unstable_cache(loadListingsPage, ["marketplace-page"], {
  revalidate: 600,
  tags: [MARKETPLACE_TAG],
});

export async function getListingsPage(
  page = 1,
  perPage = 14,
  options: { query?: string; category?: string } = {}
): Promise<MarketplacePage> {
  try {
    return await getListingsPageCached(page, perPage, options);
  } catch {
    const safePerPage = Math.max(1, Math.min(60, Math.floor(perPage) || 14));
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
 * Whether the current viewer is allowed to see a given draft listing.
 * Admins may see any draft; an ASBO-RC user may see only their own. Everyone
 * else (members, logged-out, public) must never see a draft. Live listings are
 * always visible — this guard only applies to drafts.
 */
export async function canViewDraft(listing: MarketplaceListing): Promise<boolean> {
  if (!listing.isDraft) return true;
  const session = await auth();
  const role = session?.user?.role;
  if (role === "admin") return true;
  if (role === "asbo-rc" && session?.user?.id === listing.userId) return true;
  return false;
}

/**
 * Draft listings the current viewer may manage: admins see ALL drafts, ASBO-RC
 * users see only their own. Any other role gets an empty list. Newest-first.
 */
// All drafts, read once and cached until the marketplace changes. Who may SEE
// them is decided per viewer in getDraftListings, never inside the cache.
const loadAllDrafts = unstable_cache(
  async (limit: number): Promise<MarketplaceListing[]> => {
    const ids = await redis.zrange(MARKETPLACE_DRAFTS_INDEX, 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.hgetall(`listing:${id as string}`);
    const rawResults = await pipeline.exec();

    return rawResults
      .map((raw) => toListing(raw as Record<string, unknown> | null))
      .filter((l): l is MarketplaceListing => l !== null && l.isDraft);
  },
  ["marketplace-drafts"],
  { revalidate: 600, tags: [MARKETPLACE_TAG] }
);

export async function getDraftListings(limit = 60): Promise<MarketplaceListing[]> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    const isAdmin = role === "admin";
    const isAsboRc = role === "asbo-rc";
    if (!isAdmin && !isAsboRc) return [];

    const drafts = await loadAllDrafts(limit);

    // ASBO-RC users only see their own drafts; admins see everyone's.
    return isAdmin ? drafts : drafts.filter((l) => l.userId === session?.user?.id);
  } catch (error) {
    console.error("Failed to get draft listings:", error);
    return [];
  }
}

/**
 * Draft listings flagged as ASBO-RC consignment (`soldByAsboRc`), regardless of
 * which account created them. Used by the ASBO-RC report so a partner sees ALL
 * their consignment drafts — these are typically created by admin/staff on
 * ASBO's behalf, so the per-owner scoping of getDraftListings would wrongly
 * hide them. Gated to admin + asbo-rc. Newest-first.
 */
export async function getAsboRcDraftListings(limit = 1000): Promise<MarketplaceListing[]> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (role !== "admin" && role !== "asbo-rc") return [];

    const ids = await redis.zrange(MARKETPLACE_DRAFTS_INDEX, 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.hgetall(`listing:${id as string}`);
    const rawResults = await pipeline.exec();

    return rawResults
      .map((raw) => toListing(raw as Record<string, unknown> | null))
      .filter((l): l is MarketplaceListing => l !== null && l.isDraft && l.soldByAsboRc);
  } catch (error) {
    console.error("Failed to get ASBO-RC draft listings:", error);
    return [];
  }
}

/**
 * Publish a draft: clear the draft flag, move it from the drafts index into the
 * public browse index, and refresh all surfaces. Admins may publish any draft;
 * ASBO-RC users may publish only their own. No-op if the listing isn't a draft.
 */
export async function publishListing(
  listingId: string
): Promise<ActionResult<{ isDraft: false }>> {
  try {
    const session = await auth();
    const role = session?.user?.role;
    const isAdmin = role === "admin";
    const isAsboRc = role === "asbo-rc";
    if (!isAdmin && !isAsboRc) {
      return { success: false, error: "Only admins and ASBO-RC users can publish listings" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }
    // ASBO-RC may only publish their own drafts.
    if (!isAdmin && listing.userId !== session?.user?.id) {
      return { success: false, error: "You can only publish your own drafts" };
    }
    if (!listing.isDraft) {
      // Already live — treat as success (idempotent).
      return { success: true, data: { isDraft: false } };
    }

    // Score the listing into the public index by its CURRENT status so sold-out
    // stock still sorts correctly, then drop it from the drafts index.
    await redis
      .multi()
      .hset(`listing:${listingId}`, { isDraft: "false", updatedAt: String(Date.now()) })
      .zadd(MARKETPLACE_INDEX, {
        score: indexScore(listing.createdAt, listing.status),
        member: listingId,
      })
      .zrem(MARKETPLACE_DRAFTS_INDEX, listingId)
      .exec();

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listingId}`);
    bustMarketplaceCache();
    revalidatePath("/admin/asbo-rc");
    return { success: true, data: { isDraft: false } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish listing",
    };
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

    // Variant listings track stock per-variant; use adjustVariantSold instead.
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — manage stock per variation." };
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

    // Variant listings track stock per-variant; use adjustVariantSold instead.
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — manage stock per variation." };
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
    // "Facilitated by PHD" (separate from ASBO-RC): each newly-sold unit logs an
    // owner-payout ledger record so the admin payouts report knows what PHD
    // owes the original owner. Un-selling never removes ledger history.
    if (listing.facilitatedByPhd && soldDelta > 0) {
      const { createPhdFacilitatedSales } = await import("@/actions/phd-facilitated");
      const stamps = soldAt.slice(listing.soldCount, clamped);
      await createPhdFacilitatedSales(listing, soldDelta, stamps);
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
    revalidatePath("/admin/facilitated-sales");
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

    // Variant listings track stock per-variant; edit quantities via the listing
    // editor (per variant) rather than this whole-listing quantity setter.
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — edit stock per variation." };
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

    // Variant listings sell per-variant via adjustVariantSold.
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — record sales per variation." };
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
 * Adjust the sold count of ONE variant of a variant listing by `delta`
 * (+1 sells one, -1 un-sells one), clamped to 0..variant.quantity. Recomputes
 * the listing's derived totals/status, re-persists the variants, and keeps the
 * browse index ordered. For ASBO-RC listings, a positive delta appends ledger
 * sales snapshotting THAT variant's price + name; a negative delta does not
 * remove ledger history (corrections are made in the ASBO report). Owner or
 * staff only. This is the variant counterpart to setListingSoldCount.
 */
export async function adjustVariantSold(
  listingId: string,
  variantId: string,
  delta: number
): Promise<ActionResult<{ variantSoldCount: number; status: "available" | "sold" }>> {
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
    if (!listing.hasVariations) {
      return { success: false, error: "This listing does not use variations" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    const idx = listing.variants.findIndex((v) => v.id === variantId);
    if (idx < 0) {
      return { success: false, error: "Variation not found" };
    }

    const variant = listing.variants[idx];
    const target = Math.min(variant.quantity, Math.max(0, variant.soldCount + Math.trunc(delta)));
    const soldDelta = target - variant.soldCount;
    if (soldDelta === 0) {
      return { success: true, data: { variantSoldCount: variant.soldCount, status: listing.status } };
    }

    const nextVariants = listing.variants.map((v, i) =>
      i === idx ? { ...v, soldCount: target } : v
    );
    const derived = deriveFromVariants(nextVariants);
    const now = Date.now();

    await redis.hset(`listing:${listingId}`, {
      variants: JSON.stringify(nextVariants),
      // Keep the derived scalar fields in the hash in sync (toListing re-derives
      // anyway, but storing them keeps the hash internally consistent).
      price: String(derived.price),
      quantity: String(derived.quantity),
      soldCount: String(derived.soldCount),
      status: derived.status,
      updatedAt: now,
    });
    // Draft listings live in the drafts index; live ones in the public index.
    if (listing.isDraft) {
      await redis.zadd(MARKETPLACE_DRAFTS_INDEX, { score: -listing.createdAt, member: listingId });
    } else {
      await redis.zadd(MARKETPLACE_INDEX, {
        score: indexScore(listing.createdAt, derived.status),
        member: listingId,
      });
    }

    // ASBO-RC: a positive delta logs ledger sales for that variant. Un-selling
    // does not delete ledger history.
    if (listing.soldByAsboRc && soldDelta > 0) {
      const { createAsboRcSales } = await import("@/actions/asbo-rc");
      await createAsboRcSales(listing, soldDelta, undefined, {
        price: variant.price,
        consignmentPrice: variant.consignmentPrice,
        name: variant.name,
      });
    }
    // "Facilitated by PHD": log owner-payout ledger records for that variant.
    if (listing.facilitatedByPhd && soldDelta > 0) {
      const { createPhdFacilitatedSales } = await import("@/actions/phd-facilitated");
      await createPhdFacilitatedSales(listing, soldDelta, undefined, {
        price: variant.price,
        ownerPayoutPrice: variant.ownerPayoutPrice,
        name: variant.name,
      });
    }

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    revalidatePath("/admin/facilitated-sales");
    revalidatePath("/dashboard");
    return { success: true, data: { variantSoldCount: target, status: derived.status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update variation stock",
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
    category: import("@/types").MarketplaceCategory;
    price: number;
    consignmentPrice?: number;
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
    facilitatedByPhd?: boolean;
    ownerPayoutPrice?: number;
    hasVariations?: boolean;
    variationLabel?: string;
    variants?: { id?: string; name: string; price: number; consignmentPrice?: number; ownerPayoutPrice?: number; quantity: number; soldCount?: number }[];
    penthouseCutPct?: number;
    /**
     * Admin-only: reassign this listing to another member (change the owner).
     * When set to a real member's id by an admin, the listing moves under that
     * member's profile and any facilitated payout is owed to them. Ignored for
     * non-admins and for the no-op case (same owner).
     */
    onBehalfOfUserId?: string;
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

    // Owner reassignment (admins only). Default: keep the current owner. If an
    // admin picked a different member and that member exists, move the listing
    // to them so it shows under their profile.
    let nextOwnerId = existing.userId;
    if (
      data.onBehalfOfUserId &&
      data.onBehalfOfUserId !== existing.userId &&
      session.user.role === "admin"
    ) {
      const target = await redis.hgetall(`member:${data.onBehalfOfUserId}`);
      if (!target || Object.keys(target).length === 0 || !target.email) {
        return { success: false, error: "That member could not be found" };
      }
      nextOwnerId = data.onBehalfOfUserId;
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

    // Variants. Editing may add/remove/retitle/reprice variants or change their
    // quantity, but must NOT un-sell: preserve each variant's soldCount by
    // matching on id (clamped to the possibly-reduced quantity). New variants
    // start at soldCount 0.
    const hasVariations = Boolean(parsed.data.hasVariations) && (parsed.data.variants?.length ?? 0) > 0;
    const existingVariantById = new Map(existing.variants.map((v) => [v.id, v]));
    const nextVariants: import("@/types").ListingVariant[] = hasVariations
      ? parsed.data.variants!.map((v) => {
          const prior = v.id ? existingVariantById.get(v.id) : undefined;
          const priorSold = prior ? prior.soldCount : 0;
          const soldCount = Math.min(v.quantity, Math.max(0, priorSold));
          // Preserve any reserved hold, clamped to the new buyable availability.
          const priorReserved = prior ? prior.reservedCount ?? 0 : 0;
          const reservedCount = Math.min(Math.max(0, v.quantity - soldCount), Math.max(0, priorReserved));
          return {
            id: v.id || randomUUID(),
            name: v.name.trim(),
            price: v.price,
            consignmentPrice: v.consignmentPrice,
            ownerPayoutPrice: v.ownerPayoutPrice,
            quantity: v.quantity,
            soldCount,
            reservedCount,
          };
        })
      : [];
    const derivedV = hasVariations ? deriveFromVariants(nextVariants) : null;

    // "Facilitated by PHD" can be toggled by any owner/staff editing their own
    // listing (no role clamp, matching creation).
    const facilitatedByPhd = Boolean(parsed.data.facilitatedByPhd);
    const ownerPayoutPrice = hasVariations ? undefined : parsed.data.ownerPayoutPrice;

    // Non-variant path: editing quantity can't un-sell units — clamp existing
    // soldCount to the new quantity and keep status consistent.
    const nextQuantity = derivedV ? derivedV.quantity : parsed.data.quantity;
    const nextSoldCount = derivedV ? derivedV.soldCount : Math.min(existing.soldCount, nextQuantity);
    const nextStatus: "available" | "sold" = derivedV
      ? derivedV.status
      : nextQuantity - nextSoldCount <= 0
      ? "sold"
      : "available";
    // Settled units can never exceed sold units.
    const nextPaidUnits = Math.min(existing.asboRcPaidUnits, nextSoldCount);
    // Clamp the sold-timestamp list to the (possibly reduced) sold count.
    const nextSoldAt = existing.soldAt.slice(0, nextSoldCount);

    // Editing never changes draft/live status (publishing is a separate action),
    // so preserve the existing isDraft value.
    const updated: MarketplaceListing = {
      ...existing,
      userId: nextOwnerId,
      isDraft: existing.isDraft,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      category: parsed.data.category,
      price: derivedV ? derivedV.price : parsed.data.price,
      consignmentPrice: hasVariations ? undefined : parsed.data.consignmentPrice,
      images: parsed.data.images,
      location: parsed.data.location.trim(),
      contactName: parsed.data.contactName.trim(),
      contactMethod: parsed.data.contactMethod,
      contactValue: parsed.data.contactValue.trim(),
      atTrack: parsed.data.atTrack,
      meetAtTrack: parsed.data.meetAtTrack,
      hasVariations,
      variationLabel: hasVariations ? parsed.data.variationLabel.trim() : "",
      variants: nextVariants,
      quantity: nextQuantity,
      soldCount: nextSoldCount,
      soldAt: nextSoldAt,
      status: nextStatus,
      soldByAsboRc,
      soldByPhd,
      facilitatedByPhd,
      ownerPayoutPrice,
      // Preserve the listing-level hold, clamped to the new buyable availability
      // (variant holds live on each variant's reservedCount).
      reservedCount: hasVariations
        ? 0
        : Math.min(Math.max(0, nextQuantity - nextSoldCount), Math.max(0, existing.reservedCount)),
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
      category: updated.category,
      price: String(updated.price),
      consignmentPrice: updated.consignmentPrice != null ? String(updated.consignmentPrice) : "",
      images: JSON.stringify(updated.images),
      location: updated.location,
      contactName: updated.contactName,
      contactMethod: updated.contactMethod,
      contactValue: updated.contactValue,
      status: updated.status,
      isDraft: String(updated.isDraft),
      hasVariations: String(updated.hasVariations),
      variationLabel: updated.variationLabel,
      variants: JSON.stringify(updated.variants),
      showOnWebsite: String(updated.showOnWebsite),
      atTrack: String(updated.atTrack),
      meetAtTrack: String(updated.meetAtTrack),
      quantity: String(updated.quantity),
      soldCount: String(updated.soldCount),
      soldAt: JSON.stringify(updated.soldAt),
      soldByAsboRc: String(updated.soldByAsboRc),
      soldByPhd: String(updated.soldByPhd),
      facilitatedByPhd: String(updated.facilitatedByPhd),
      ownerPayoutPrice: updated.ownerPayoutPrice != null ? String(updated.ownerPayoutPrice) : "",
      reservedCount: String(updated.reservedCount),
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
    // Keep index membership correct. A draft must stay ONLY in the drafts index
    // (never the public browse index); a live listing's score is kept in sync
    // with its (possibly changed) status.
    if (updated.isDraft) {
      await redis.zadd(MARKETPLACE_DRAFTS_INDEX, {
        score: -updated.createdAt,
        member: listingId,
      });
    } else {
      await redis.zadd(MARKETPLACE_INDEX, {
        score: indexScore(updated.createdAt, updated.status),
        member: listingId,
      });
    }

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

    await redis
      .multi()
      .del(`listing:${listingId}`)
      .zrem(MARKETPLACE_INDEX, listingId)
      .zrem(MARKETPLACE_DRAFTS_INDEX, listingId)
      .exec();

    // A deleted item can't stay reserved: close any member reservations on it so
    // they don't linger in someone's orders with nothing to buy.
    try {
      const { listActiveForListing, closeReservation } = await import("@/lib/marketplace-reservations");
      for (const rec of await listActiveForListing(listingId)) await closeReservation(rec, "cancelled");
    } catch (e) {
      console.error("Closing reservations for deleted listing failed:", e);
    }
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

/**
 * Decrement stock for a listing because `quantity` units were paid for online
 * (SumUp Click & Collect). This is the INTERNAL, non-session sell path used by
 * the payment finalizer, which runs in the webhook/cron with no user session.
 *
 * It is exported from this `"use server"` module, so to stop it being a
 * client-callable unauthenticated stock mutation it requires `internalSecret`
 * to equal `CRON_SECRET` (the same server-to-server secret the reconcile cron
 * uses). Clients never hold that secret.
 *
 * Mirrors the three stock paths of the manual flows and PRESERVES the ASBO-RC
 * ledger: variant listings bump the chosen variant's soldCount; ASBO-RC
 * non-variant listings decrement `quantity` and append ledger sales via
 * `createAsboRcSales`; normal listings bump `soldCount`.
 */
export async function recordOnlineSale(
  internalSecret: string,
  listingId: string,
  quantity: number,
  variantId?: string
): Promise<ActionResult<{ status: "available" | "sold" }>> {
  if (!internalSecret || internalSecret !== process.env.CRON_SECRET) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) return { success: false, error: "Listing not found" };

    const now = Date.now();

    // ── Variant listing: bump the chosen variant's soldCount ────────────────
    if (listing.hasVariations) {
      const idx = listing.variants.findIndex((v) => v.id === variantId);
      if (idx < 0) return { success: false, error: "Variation not found" };
      const variant = listing.variants[idx];
      const target = Math.min(variant.quantity, variant.soldCount + qty);
      const soldDelta = target - variant.soldCount;

      const nextVariants = listing.variants.map((v, i) =>
        i === idx ? { ...v, soldCount: target } : v
      );
      const derived = deriveFromVariants(nextVariants);

      await redis.hset(`listing:${listingId}`, {
        variants: JSON.stringify(nextVariants),
        price: String(derived.price),
        quantity: String(derived.quantity),
        soldCount: String(derived.soldCount),
        status: derived.status,
        updatedAt: now,
      });
      await redis.zadd(MARKETPLACE_INDEX, {
        score: indexScore(listing.createdAt, derived.status),
        member: listingId,
      });

      if (listing.soldByAsboRc && soldDelta > 0) {
        const { createAsboRcSales } = await import("@/actions/asbo-rc");
        await createAsboRcSales(listing, soldDelta, undefined, {
          price: variant.price,
          consignmentPrice: variant.consignmentPrice,
          name: variant.name,
        });
      }
      if (listing.facilitatedByPhd && soldDelta > 0) {
        const { createPhdFacilitatedSales } = await import("@/actions/phd-facilitated");
        await createPhdFacilitatedSales(listing, soldDelta, undefined, {
          price: variant.price,
          ownerPayoutPrice: variant.ownerPayoutPrice,
          name: variant.name,
        });
      }

      revalidatePath("/marketplace");
      bustMarketplaceCache();
      revalidatePath(`/marketplace/${listingId}`);
      revalidatePath("/admin/asbo-rc");
      revalidatePath("/asbo-rc");
      revalidatePath("/admin/facilitated-sales");
      return { success: true, data: { status: derived.status } };
    }

    // ── ASBO-RC non-variant: decrement quantity + append ledger sales ───────
    if (listing.soldByAsboRc) {
      const available = listing.quantity; // ASBO: quantity == available stock
      const toSell = Math.min(available, qty);
      const nextAvailable = Math.max(0, available - toSell);
      const status: "available" | "sold" = nextAvailable <= 0 ? "sold" : "available";

      await redis.hset(`listing:${listingId}`, {
        quantity: String(nextAvailable),
        status,
        updatedAt: now,
      });
      await redis.zadd(MARKETPLACE_INDEX, {
        score: indexScore(listing.createdAt, status),
        member: listingId,
      });

      if (toSell > 0) {
        const { createAsboRcSales } = await import("@/actions/asbo-rc");
        await createAsboRcSales(listing, toSell);
      }

      revalidatePath("/marketplace");
      bustMarketplaceCache();
      revalidatePath(`/marketplace/${listingId}`);
      revalidatePath("/admin/asbo-rc");
      revalidatePath("/asbo-rc");
      return { success: true, data: { status } };
    }

    // ── Normal listing: bump soldCount ──────────────────────────────────────
    const clamped = Math.min(listing.quantity, listing.soldCount + qty);
    const soldDelta = clamped - listing.soldCount;
    const status: "available" | "sold" = listing.quantity - clamped <= 0 ? "sold" : "available";
    const soldAt = [...listing.soldAt];
    while (soldAt.length < clamped) soldAt.push(now);
    if (soldAt.length > clamped) soldAt.length = clamped;

    await redis.hset(`listing:${listingId}`, {
      soldCount: String(clamped),
      soldAt: JSON.stringify(soldAt),
      status,
      updatedAt: now,
    });
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, status),
      member: listingId,
    });

    // "Facilitated by PHD": log owner-payout ledger records for the newly-sold
    // units. (Facilitated items are never soldByAsboRc, so they land here.)
    if (listing.facilitatedByPhd && soldDelta > 0) {
      const { createPhdFacilitatedSales } = await import("@/actions/phd-facilitated");
      const stamps = soldAt.slice(listing.soldCount, clamped);
      await createPhdFacilitatedSales(listing, soldDelta, stamps);
    }

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/facilitated-sales");
    return { success: true, data: { status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record online sale",
    };
  }
}

/**
 * A listing that currently has one or more units reserved (admin hold), shaped
 * for the admin Click & Collect view so staff can see what's being held for a
 * buyer alongside paid orders awaiting collection. Reservations are a pure
 * quantity hold — they don't record who the item is held for — so this just
 * surfaces the product, how many units are held, and the stock context.
 */
export interface ReservedListingSummary {
  listingId: string;
  title: string;
  image: string | null;
  /** Total units currently held across the listing (sum of variant holds). */
  reservedCount: number;
  /** Units still buyable right now (after holds + sold). */
  buyable: number;
  /** Total physical units in stock (quantity - soldCount). */
  inStock: number;
  /** True when nothing is buyable because the remaining stock is all held. */
  fullyReserved: boolean;
  soldByPhd: boolean;
  soldByAsboRc: boolean;
  facilitatedByPhd: boolean;
  updatedAt: number;
  /** Per-variant hold breakdown (empty for non-variant listings). */
  variants: { id: string; name: string; reservedCount: number; buyable: number }[];
}

/**
 * Admin-only: every live listing that currently has reserved (held) units, for
 * the Click & Collect page. Sorted most-recently-updated first. Returns [] for
 * non-admins. Reservations never touch stock or the ASBO-RC ledger.
 */
async function loadReservedListings(): Promise<ReservedListingSummary[]> {
  try {
    // Live listings only (drafts live in a separate index and aren't buyable).
    const listings = await getListings(1000, { includeSold: false });

    const summaries: ReservedListingSummary[] = [];
    for (const l of listings) {
      if (l.hasVariations) {
        const heldVariants = l.variants.filter((v) => Math.max(0, v.reservedCount ?? 0) > 0);
        const reservedCount = heldVariants.reduce((s, v) => s + Math.max(0, v.reservedCount ?? 0), 0);
        if (reservedCount <= 0) continue;
        const buyable = l.variants.reduce(
          (s, v) => s + Math.max(0, v.quantity - v.soldCount - Math.max(0, v.reservedCount ?? 0)),
          0
        );
        const inStock = l.variants.reduce((s, v) => s + Math.max(0, v.quantity - v.soldCount), 0);
        summaries.push({
          listingId: l.listingId,
          title: l.title,
          image: l.images[0] ?? null,
          reservedCount,
          buyable,
          inStock,
          fullyReserved: buyable <= 0 && inStock > 0,
          soldByPhd: l.soldByPhd,
          soldByAsboRc: l.soldByAsboRc,
          facilitatedByPhd: l.facilitatedByPhd,
          updatedAt: l.updatedAt,
          variants: heldVariants.map((v) => ({
            id: v.id,
            name: v.name,
            reservedCount: Math.max(0, v.reservedCount ?? 0),
            buyable: Math.max(0, v.quantity - v.soldCount - Math.max(0, v.reservedCount ?? 0)),
          })),
        });
      } else {
        const reservedCount = Math.max(0, l.reservedCount || 0);
        if (reservedCount <= 0) continue;
        const inStock = Math.max(0, l.quantity - l.soldCount);
        const buyable = Math.max(0, inStock - reservedCount);
        summaries.push({
          listingId: l.listingId,
          title: l.title,
          image: l.images[0] ?? null,
          reservedCount,
          buyable,
          inStock,
          fullyReserved: buyable <= 0 && inStock > 0,
          soldByPhd: l.soldByPhd,
          soldByAsboRc: l.soldByAsboRc,
          facilitatedByPhd: l.facilitatedByPhd,
          updatedAt: l.updatedAt,
          variants: [],
        });
      }
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("Failed to get reserved listings:", error);
    return [];
  }
}

// Building this reads every live listing, so it is cached and rebuilt only when
// the marketplace changes (every listing / reservation / sale mutation busts the
// "marketplace" tag) rather than on each admin page view.
const getReservedListingsCached = unstable_cache(loadReservedListings, ["reserved-listings"], {
  revalidate: 3600,
  tags: [MARKETPLACE_TAG],
});

export async function getReservedListings(): Promise<ReservedListingSummary[]> {
  const session = await auth();
  if (session?.user?.role !== "admin") return [];
  return getReservedListingsCached();
}

/**
 * Admin-only hold: set how many units of a NON-VARIANT listing are reserved for
 * a buyer. Reserved units are held out of the buyable pool
 * (buyable = quantity - soldCount - reservedCount) but are NOT sold. Pass 0 to
 * release the hold. This is purely a display/purchase gate — it does NOT change
 * status, quantity, soldCount, or the browse index, and it NEVER writes to the
 * ASBO-RC ledger. Only an actual sale does. When nothing buyable remains the
 * item shows a "Reserved" badge and buying is blocked.
 */
export async function setListingReservedCount(
  listingId: string,
  reservedCount: number
): Promise<ActionResult<{ reservedCount: number; available: number }>> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Only admins can reserve listings" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) {
      return { success: false, error: "Listing not found" };
    }
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — reserve per variation." };
    }

    // `reservedCount` here is the units held WITHOUT a named member (the legacy
    // anonymous hold). Holds linked to a member account are kept on top of it,
    // so releasing/adjusting this never drops someone's reservation.
    const { memberHeldQty } = await import("@/lib/marketplace-reservations");
    const memberHeld = await memberHeldQty(listingId);

    // Can't reserve more than what's currently available to sell.
    const sellable = Math.max(0, listing.quantity - listing.soldCount);
    const next = Math.min(sellable, Math.max(0, Math.floor(Number(reservedCount) || 0)) + memberHeld);

    await redis.hset(`listing:${listingId}`, {
      reservedCount: String(next),
      updatedAt: Date.now(),
    });

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listingId}`);
    bustMarketplaceCache();
    return { success: true, data: { reservedCount: next, available: Math.max(0, sellable - next) } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update reservation",
    };
  }
}

/**
 * Admin-only hold on ONE variant of a variant listing. Sets how many units of
 * that variant are reserved (0 releases), re-persisting the variants array.
 * Like setListingReservedCount it is a pure display/purchase gate: it does NOT
 * change stock, soldCount, derived status, or the browse index, and it NEVER
 * writes to the ASBO-RC ledger.
 */
export async function setVariantReservedCount(
  listingId: string,
  variantId: string,
  reservedCount: number
): Promise<ActionResult<{ reservedCount: number; variantAvailable: number }>> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Only admins can reserve listings" };
    }

    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) return { success: false, error: "Listing not found" };
    if (!listing.hasVariations) {
      return { success: false, error: "This listing does not use variations" };
    }

    const idx = listing.variants.findIndex((v) => v.id === variantId);
    if (idx < 0) return { success: false, error: "Variation not found" };

    // `reservedCount` is the units held WITHOUT a named member; member-linked
    // holds stay on top of it (see setListingReservedCount).
    const { memberHeldQty } = await import("@/lib/marketplace-reservations");
    const memberHeld = await memberHeldQty(listingId, variantId);

    const variant = listing.variants[idx];
    const sellable = Math.max(0, variant.quantity - variant.soldCount);
    const next = Math.min(sellable, Math.max(0, Math.floor(Number(reservedCount) || 0)) + memberHeld);

    const nextVariants = listing.variants.map((v, i) =>
      i === idx ? { ...v, reservedCount: next } : v
    );

    await redis.hset(`listing:${listingId}`, {
      variants: JSON.stringify(nextVariants),
      updatedAt: Date.now(),
    });

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listingId}`);
    bustMarketplaceCache();
    return { success: true, data: { reservedCount: next, variantAvailable: Math.max(0, sellable - next) } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update reservation",
    };
  }
}

/**
 * Add `add` units of stock to a NON-VARIANT listing. This raises the listing's
 * total quantity (so available = quantity - soldCount goes up by `add`), which
 * also re-activates a sold-out listing. It NEVER changes soldCount and NEVER
 * writes to the ASBO-RC ledger — only a sale does that. Owner or staff only.
 *
 * Note: for ASBO-RC non-variant listings `quantity` already represents live
 * available stock (sold units live in the ledger), so adding to quantity is the
 * correct way to restock there too.
 */
export async function addListingStock(
  listingId: string,
  add: number
): Promise<ActionResult<{ quantity: number; available: number; status: "available" | "sold" }>> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "You must be logged in" };

    const toAdd = Math.max(1, Math.floor(Number(add) || 0));
    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) return { success: false, error: "Listing not found" };

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }
    if (listing.hasVariations) {
      return { success: false, error: "This listing uses variations — add stock per variation." };
    }

    const nextQuantity = listing.quantity + toAdd;
    // ASBO-RC: quantity == available. Normal: available = quantity - soldCount.
    const available = listing.soldByAsboRc ? nextQuantity : nextQuantity - listing.soldCount;
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
    return { success: true, data: { quantity: nextQuantity, available: Math.max(0, available), status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add stock",
    };
  }
}

/**
 * Add `add` units of stock to ONE variant of a variant listing. Raises that
 * variant's quantity (available = quantity - soldCount rises by `add`), which
 * re-activates a sold-out variant. Re-derives the listing's totals/status and
 * re-persists the variants array. NEVER changes soldCount or the ASBO-RC
 * ledger. Owner or staff only.
 */
export async function addVariantStock(
  listingId: string,
  variantId: string,
  add: number
): Promise<ActionResult<{ variantQuantity: number; variantAvailable: number; status: "available" | "sold" }>> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "You must be logged in" };

    const toAdd = Math.max(1, Math.floor(Number(add) || 0));
    const data = await redis.hgetall(`listing:${listingId}`);
    const listing = toListing(data as Record<string, unknown> | null);
    if (!listing) return { success: false, error: "Listing not found" };
    if (!listing.hasVariations) {
      return { success: false, error: "This listing does not use variations" };
    }

    const isOwner = listing.userId === session.user.id;
    const isStaff = session.user.role === "admin" || session.user.role === "moderator";
    if (!isOwner && !isStaff) {
      return { success: false, error: "You can only update your own listings" };
    }

    const idx = listing.variants.findIndex((v) => v.id === variantId);
    if (idx < 0) return { success: false, error: "Variation not found" };

    const variant = listing.variants[idx];
    const nextVariantQty = variant.quantity + toAdd;
    const nextVariants = listing.variants.map((v, i) =>
      i === idx ? { ...v, quantity: nextVariantQty } : v
    );
    const derived = deriveFromVariants(nextVariants);
    const now = Date.now();

    await redis.hset(`listing:${listingId}`, {
      variants: JSON.stringify(nextVariants),
      price: String(derived.price),
      quantity: String(derived.quantity),
      soldCount: String(derived.soldCount),
      status: derived.status,
      updatedAt: now,
    });
    await redis.zadd(MARKETPLACE_INDEX, {
      score: indexScore(listing.createdAt, derived.status),
      member: listingId,
    });

    revalidatePath("/marketplace");
    bustMarketplaceCache();
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath("/admin/asbo-rc");
    revalidatePath("/asbo-rc");
    return {
      success: true,
      data: {
        variantQuantity: nextVariantQty,
        variantAvailable: Math.max(0, nextVariantQty - variant.soldCount),
        status: derived.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add stock",
    };
  }
}
