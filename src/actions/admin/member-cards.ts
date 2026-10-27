"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import type { MemberCard } from "@/lib/card-roll";
import {
  ALL_MEMBER_CARDS_INDEX,
  MEMBER_CARD_ID_PATTERN,
  memberCardKey,
  memberCardsIndexKey,
  parseStoredCard,
  rebuildCommunityPool,
  removeFromCommunityPool,
} from "@/lib/member-card-store";
import { deleteImage } from "@/lib/blob";
import { isBlobUrl } from "@/lib/card-art-generate";
import type { ActionResult } from "@/types";

/**
 * Admin view of every card members have opened (including ones they re-rolled away, which are kept
 * as archived copies). This is a management view with owner details; the cards themselves are
 * community cards and look the same whoever holds them. Only admins can list or delete them.
 */

/** Most cards loaded at once. */
const MAX_LISTED = 500;

export interface AdminMemberCard extends MemberCard {
  /** The member's name, from the card or their profile. */
  owner: string;
  ownerEmail: string;
}

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Newest first. Each card is returned with who owns it. */
export async function listAllMemberCards(limit = MAX_LISTED): Promise<{ cards: AdminMemberCard[]; total: number }> {
  if (!(await requireAdmin())) return { cards: [], total: 0 };

  const total = Number(await redis.zcard(ALL_MEMBER_CARDS_INDEX)) || 0;
  const ids = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, Math.min(limit, MAX_LISTED) - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return { cards: [], total };

  const rows = await redis.mget(...ids.map((id) => `usercard:${String(id)}`));
  const stored = rows.map(parseStoredCard).filter((c): c is NonNullable<typeof c> => c !== null);

  // Who each card belongs to: one profile lookup per member, not per card.
  const userIds = [...new Set(stored.map((c) => c.userId))];
  const profiles = new Map<string, { name: string; email: string }>();
  await Promise.all(
    userIds.map(async (id) => {
      const p = await redis.hmget<Record<string, unknown>>(`member:${id}`, "nickname", "name", "email");
      profiles.set(id, { name: text(p?.nickname) || text(p?.name), email: text(p?.email) });
    })
  );

  const cards = stored.map((s) => {
    // Never send the stored car-photo address to the browser.
    const { referenceUrl, ...card } = s;
    void referenceUrl;
    const profile = profiles.get(s.userId);
    return { ...card, owner: profile?.name || s.ownerName || "Unknown member", ownerEmail: profile?.email ?? "" };
  });
  return { cards, total };
}

/**
 * Delete a card for good. Admins only (members cannot delete cards, not even their own). A card is
 * one record that is both in its owner's collection and in the community pool that second-slot
 * cards are built from, so deleting it removes it from both. Its artwork is deleted too.
 */
export async function deleteMemberCard(cardId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only an admin can delete cards" };
    const id = text(cardId);
    if (!MEMBER_CARD_ID_PATTERN.test(id)) return { success: false, error: "Invalid card" };

    const card = parseStoredCard(await redis.get(memberCardKey(id)));

    // The record and both lists in one go. The lists are cleaned even if the record is already gone,
    // so a stray entry can't linger in the pool.
    const tx = redis.multi().del(memberCardKey(id)).zrem(ALL_MEMBER_CARDS_INDEX, id);
    if (card) tx.zrem(memberCardsIndexKey(card.userId), id);
    await tx.exec();
    // If it stood in the community pool for its driver and car, another of theirs takes over (or they leave the pool).
    if (card) await removeFromCommunityPool(card);

    // Best-effort: the artwork file is only used by this card (the member's own car photo is not touched).
    if (card && isBlobUrl(card.imageUrl)) {
      try {
        await deleteImage(card.imageUrl);
      } catch {
        /* the card is already gone; a leftover file is harmless */
      }
    }

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");
    return { success: true, data: { id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not delete the card" };
  }
}

/**
 * Add any stored card that is missing from the admin list (and from its member's own list). Needed
 * once for cards opened before the admin list existed. Safe to run again: it never changes a card
 * that is already listed.
 */
export async function rebuildMemberCardIndex(): Promise<ActionResult<{ scanned: number; listed: number; pool: number }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can do this" };

    let cursor: string | number = 0;
    let scanned = 0;
    let listed = 0;
    for (let round = 0; round < 100; round++) {
      const [next, keys] = (await redis.scan(cursor, { match: "usercard:*", count: 200 })) as [string | number, string[]];
      cursor = next;
      if (keys.length > 0) {
        const rows = await redis.mget(...keys);
        for (const row of rows) {
          const card = parseStoredCard(row);
          if (!card) continue;
          scanned++;
          const added = await redis.zadd(
            ALL_MEMBER_CARDS_INDEX,
            { nx: true },
            { score: card.archived ? card.createdAt - 1 : card.createdAt, member: card.id }
          );
          if (added) listed++;
          if (!card.archived) {
            await redis.zadd(memberCardsIndexKey(card.userId), { nx: true }, { score: card.createdAt, member: card.id });
          }
        }
      }
      if (String(cursor) === "0") break;
    }

    // Also rebuild the community pool (one card per driver and car) from the cards as they are now.
    const pool = await rebuildCommunityPool();

    revalidatePath("/admin/member-cards");
    return { success: true, data: { scanned, listed, pool } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not rebuild the card list" };
  }
}
