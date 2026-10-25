"use server";

import { randomUUID } from "crypto";
import { revalidatePath, unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { sanitizeCard, type CardData } from "@/lib/card-maker";
import type { ActionResult } from "@/types";

/**
 * Saved trading cards (admin card maker).
 *
 * Redis cost: each card is ONE string key (`card:<id>`, JSON) plus an entry in a
 * sorted set (`cards:index`, scored by last edit). Listing every card is a
 * ZRANGE plus a single MGET, so the cost doesn't grow with the number of cards.
 */

const INDEX = "cards:index";
const cardKey = (id: string) => `card:${id}`;

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function parseCard(raw: unknown): CardData | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const card = sanitizeCard(value as Partial<CardData>);
    return { ...card, id: (value as CardData).id, updatedAt: Number((value as CardData).updatedAt) || undefined };
  } catch {
    return null;
  }
}

/** Most recently edited first. */
export async function listSavedCards(limit = 60): Promise<CardData[]> {
  if (!(await requireAdmin())) return [];
  const ids = (await redis.zrange(INDEX, 0, limit - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => cardKey(String(id))));
  return rows.map(parseCard).filter((c): c is CardData => c !== null && Boolean(c.id));
}

export async function saveCard(input: CardData): Promise<ActionResult<CardData>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can save cards" };

    const clean = sanitizeCard(input);
    if (!clean.name) return { success: false, error: "Give the card a name before saving" };

    const id = clean.id ?? randomUUID();
    const card: CardData = { ...clean, id, updatedAt: Date.now() };

    await redis.set(cardKey(id), JSON.stringify(card));
    await redis.zadd(INDEX, { score: card.updatedAt!, member: id });

    revalidatePath("/admin/card-maker");
    return { success: true, data: card };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the card" };
  }
}

export async function deleteCard(id: string): Promise<ActionResult<null>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can delete cards" };
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) return { success: false, error: "Invalid card" };

    await redis.del(cardKey(id));
    await redis.zrem(INDEX, id);

    revalidatePath("/admin/card-maker");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not delete the card" };
  }
}

export interface ShowcaseImage {
  shellId: string;
  imageUrl: string;
  description: string;
}

// Loaded only when the admin opens the "Showcase" tab, and cached: reading the
// entries costs one HGETALL each and the list barely changes.
const loadShowcaseImages = unstable_cache(
  async (limit: number): Promise<ShowcaseImage[]> => {
    const { getShowcaseEntries } = await import("@/actions/showcase");
    const entries = await getShowcaseEntries(limit);
    return entries
      .filter((e) => /^https:\/\//i.test(e.imageUrl))
      .map((e) => ({ shellId: e.shellId, imageUrl: e.imageUrl, description: e.description }));
  },
  ["card-maker-showcase"],
  { revalidate: 600, tags: ["showcase"] }
);

/** Photos members have submitted to the Shell Showcase, newest first. Admin only. */
export async function listShowcaseImages(limit = 48): Promise<ShowcaseImage[]> {
  if (!(await requireAdmin())) return [];
  try {
    return await loadShowcaseImages(limit);
  } catch {
    return [];
  }
}
