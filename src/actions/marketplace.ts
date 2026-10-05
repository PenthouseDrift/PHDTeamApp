"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { marketplaceListingSchema } from "@/lib/validators";
import type { ActionResult, MarketplaceListing } from "@/types";
import { randomUUID } from "crypto";

/** Sorted set of all listing IDs, scored by -createdAt so newest sorts first. */
const MARKETPLACE_INDEX = "marketplace:all";

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
    status,
    showOnWebsite: String(data.showOnWebsite) === "true",
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
    contactValue: string;
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
      status: "available",
      showOnWebsite: true,
      createdAt: now,
      updatedAt: now,
    };

    await redis
      .multi()
      .hset(`listing:${listingId}`, {
        ...listing,
        images: JSON.stringify(listing.images),
        showOnWebsite: String(listing.showOnWebsite),
      })
      // Negative timestamp => newest first on a plain zrange.
      .zadd(MARKETPLACE_INDEX, { score: -now, member: listingId })
      .exec();

    revalidatePath("/marketplace");
    return { success: true, data: listing };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create listing",
    };
  }
}

/**
 * Fetch listings newest-first. By default only "available" listings are
 * returned; pass includeSold to include sold ones (e.g. the owner's view).
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

    return options.includeSold
      ? listings
      : listings.filter((l) => l.status === "available");
  } catch (error) {
    console.error("Failed to get marketplace listings:", error);
    return [];
  }
}

/**
 * Listings flagged to show on the public website AND still available.
 * Used by the public aggregate API — no auth guard.
 */
export async function getWebsiteListings(limit = 60): Promise<MarketplaceListing[]> {
  const all = await getListings(limit);
  return all.filter((l) => l.showOnWebsite);
}

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

    await redis.hset(`listing:${listingId}`, {
      status,
      updatedAt: Date.now(),
    });

    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listingId}`);
    return { success: true, data: { status } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update listing",
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
    contactValue: string;
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
      updatedAt: Date.now(),
    };

    await redis.hset(`listing:${listingId}`, {
      ...updated,
      images: JSON.stringify(updated.images),
      showOnWebsite: String(updated.showOnWebsite),
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
    revalidatePath(`/marketplace/${listingId}`);
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
    return { success: true, data: { showOnWebsite: next } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update listing",
    };
  }
}

/** Resolve a member's display name for showing on a listing. */
export async function getListingAuthorName(userId: string): Promise<string> {
  try {
    const member = await redis.hgetall(`member:${userId}`);
    const name = (member?.nickname as string)?.trim() || (member?.name as string);
    return name || "Member";
  } catch {
    return "Member";
  }
}
