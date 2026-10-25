"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { getListingById } from "@/actions/marketplace";
import { getMemberRoster } from "@/lib/member-roster";
import { variantBuyable } from "@/lib/marketplace-reserved";
import {
  adjustHeldStock,
  bustMarketplaceTag,
  closeReservation,
  getReservation,
  insertReservation,
  listActiveForUser,
  listAllActive,
  type ReservationRecord,
} from "@/lib/marketplace-reservations";

/**
 * A reservation as the browser sees it. `holderId` / `holderName` are filled in
 * ONLY for admins; a member's own view never carries anyone else's data, and a
 * member only ever receives their own reservations.
 */
export interface ReservationView {
  id: string;
  listingId: string;
  variantId?: string;
  variantName?: string;
  title: string;
  image?: string;
  quantity: number;
  createdAt: number;
  holderId?: string;
  holderName?: string;
  /** Own-reservation view only: price per unit and whether it can be paid for online right now. */
  unitPrice?: number;
  canPay?: boolean;
}

function toView(r: ReservationRecord, holderName?: string): ReservationView {
  return {
    id: r.id,
    listingId: r.listingId,
    variantId: r.variantId,
    variantName: r.variantName,
    title: r.title,
    image: r.image,
    quantity: r.quantity,
    createdAt: r.createdAt,
    ...(holderName !== undefined ? { holderId: r.userId, holderName } : {}),
  };
}

function refreshPaths(listingId: string) {
  revalidatePath("/marketplace");
  revalidatePath(`/marketplace/${listingId}`);
  revalidatePath("/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/click-collect");
  bustMarketplaceTag();
}

async function memberName(userId: string): Promise<string> {
  return ((await redis.hget(`member:${userId}`, "name")) as string | null) || "Member";
}

/** Slim member list for the admin's "reserve for…" picker. Admin only. */
export async function listMembersForReservation(): Promise<
  ActionResult<Array<{ id: string; name: string; nickname: string | null; email: string }>>
> {
  const session = await auth();
  if (session?.user?.role !== "admin") return { success: false, error: "Only admins can reserve for a member" };
  // Cheap cached directory (no wallet / membership reads).
  const roster = await getMemberRoster();
  return {
    success: true,
    data: roster.map((m) => ({ id: m.id, name: m.name, nickname: m.nickname, email: m.email })),
  };
}

/** Admin: hold `quantity` units of a listing (or one variant) for a specific member. */
export async function reserveForMember(input: {
  listingId: string;
  variantId?: string;
  userId: string;
  quantity: number;
}): Promise<ActionResult<ReservationView>> {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") return { success: false, error: "Only admins can reserve for a member" };

    const quantity = Math.floor(Number(input.quantity) || 0);
    if (quantity < 1) return { success: false, error: "Choose at least 1 unit" };

    const listing = await getListingById(input.listingId);
    if (!listing) return { success: false, error: "Listing not found" };
    if (listing.isDraft) return { success: false, error: "Publish the listing before reserving it" };
    if (listing.status !== "available") return { success: false, error: "This item has sold" };

    let buyable: number;
    let variantName: string | undefined;
    if (listing.hasVariations) {
      const variant = listing.variants.find((v) => v.id === input.variantId);
      if (!variant) return { success: false, error: "Choose which option to reserve" };
      buyable = variantBuyable(variant);
      variantName = variant.name;
    } else {
      buyable = listing.quantity - listing.soldCount - Math.max(0, listing.reservedCount);
    }
    if (quantity > buyable) {
      return {
        success: false,
        error: buyable <= 0 ? "Nothing left to reserve" : `Only ${buyable} ${buyable === 1 ? "unit is" : "units are"} free to reserve`,
      };
    }

    const member = (await redis.hgetall(`member:${input.userId}`)) as Record<string, unknown> | null;
    if (!member || !member.email) return { success: false, error: "That member wasn't found" };

    const record: ReservationRecord = {
      id: randomUUID(),
      listingId: listing.listingId,
      variantId: listing.hasVariations ? input.variantId : undefined,
      variantName,
      title: listing.title,
      image: listing.images[0],
      userId: input.userId,
      quantity,
      status: "active",
      createdAt: Date.now(),
      createdBy: session.user.id,
    };

    // Stock first, then the record: if the second step failed we'd hold stock
    // with no owner, which an admin can still release, rather than a record
    // with no actual hold.
    await adjustHeldStock(record.listingId, record.variantId, quantity);
    await insertReservation(record);

    refreshPaths(record.listingId);
    return { success: true, data: toView(record, (member.name as string) || "Member") };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not reserve" };
  }
}

/**
 * Cancel a reservation. Admins can cancel any; a member can cancel only their
 * own. Cancelling releases the units back to everyone. Members cannot create a
 * reservation themselves, so re-reserving means contacting an admin.
 */
export async function cancelReservation(reservationId: string): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Please sign in" };

    const record = await getReservation(reservationId);
    if (!record || record.status !== "active") return { success: false, error: "That reservation is no longer active" };

    const isAdmin = session.user.role === "admin";
    if (!isAdmin && record.userId !== session.user.id) {
      return { success: false, error: "That reservation isn't yours" };
    }

    await adjustHeldStock(record.listingId, record.variantId, -record.quantity);
    await closeReservation(record, "cancelled");

    refreshPaths(record.listingId);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not cancel" };
  }
}

/** The signed-in member's own active reservations (for /orders). */
export async function getMyReservations(): Promise<ReservationView[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const mine = await listActiveForUser(session.user.id);
  const views = await Promise.all(
    mine.map(async (r) => {
      const view = toView(r);
      const listing = await getListingById(r.listingId);
      if (!listing) return view;
      const variant = r.variantId ? listing.variants.find((v) => v.id === r.variantId) : undefined;
      const unitPrice = variant ? variant.price : listing.price;
      return {
        ...view,
        unitPrice,
        canPay: listing.status === "available" && listing.atTrack && !listing.isDraft && unitPrice > 0,
      };
    })
  );
  return views.sort((a, b) => b.createdAt - a.createdAt);
}

export interface ReservationContext {
  /** The viewer's own reservations, keyed by listing id. */
  mine: Record<string, ReservationView[]>;
  /** Admin only: every active reservation with its holder, keyed by listing id. */
  all: Record<string, ReservationView[]>;
}

/**
 * Viewer-specific reservation info for the marketplace pages. Never cached and
 * never shared: a member gets only their own, an admin also gets the holders.
 */
export async function getReservationContext(): Promise<ReservationContext> {
  const empty: ReservationContext = { mine: {}, all: {} };
  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return empty;

  const group = (views: ReservationView[]) => {
    const out: Record<string, ReservationView[]> = {};
    for (const v of views) (out[v.listingId] ??= []).push(v);
    return out;
  };

  if (session.user.role === "admin") {
    const active = await listAllActive();
    const ids = [...new Set(active.map((r) => r.userId))];
    const names = new Map<string, string>();
    await Promise.all(ids.map(async (id) => names.set(id, await memberName(id))));
    const views = active.map((r) => toView(r, names.get(r.userId) ?? "Member"));
    return {
      mine: group(views.filter((v) => v.holderId === viewerId)),
      all: group(views),
    };
  }

  const mine = await listActiveForUser(viewerId);
  return { mine: group(mine.map((r) => toView(r))), all: {} };
}
