"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import type { ActionResult } from "@/types";

/**
 * Saved full art cards (admin card maker, "Full art" tab). Stored apart from the original
 * cards so the two never mix: one string key per card (`fullart:<id>`, JSON) plus an entry
 * in a sorted set (`fullart:index`, scored by last edit). Listing is a ZRANGE and one MGET.
 */

const INDEX = "fullart:index";
const cardKey = (id: string) => `fullart:${id}`;

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function parseCard(raw: unknown): FullArtCardData | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const card = sanitizeFullArtCard(value as Partial<FullArtCardData>);
    return { ...card, id: (value as FullArtCardData).id, updatedAt: Number((value as FullArtCardData).updatedAt) || undefined };
  } catch {
    return null;
  }
}

/** Most recently edited first. */
export async function listFullArtCards(limit = 60): Promise<FullArtCardData[]> {
  if (!(await requireAdmin())) return [];
  const ids = (await redis.zrange(INDEX, 0, limit - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => cardKey(String(id))));
  return rows.map(parseCard).filter((c): c is FullArtCardData => c !== null && Boolean(c.id));
}

export async function saveFullArtCard(input: FullArtCardData): Promise<ActionResult<FullArtCardData>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can save cards" };

    const clean = sanitizeFullArtCard(input);
    if (!clean.name) return { success: false, error: "Give the card a name before saving" };

    const id = clean.id ?? randomUUID();
    const card: FullArtCardData = { ...clean, id, updatedAt: Date.now() };

    await redis.set(cardKey(id), JSON.stringify(card));
    await redis.zadd(INDEX, { score: card.updatedAt!, member: id });

    revalidatePath("/admin/card-maker");
    return { success: true, data: card };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the card" };
  }
}

export async function deleteFullArtCard(id: string): Promise<ActionResult<null>> {
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
