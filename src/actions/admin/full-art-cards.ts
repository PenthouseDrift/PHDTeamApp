"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import { FEATURED_CARDS_KEY, MAX_FEATURED_WEIGHT, MIN_FEATURED_WEIGHT } from "@/lib/member-card-store";
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
    // A deleted card can't stay pullable.
    await redis.hdel(FEATURED_CARDS_KEY, id);

    revalidatePath("/admin/card-maker");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not delete the card" };
  }
}

// ── Pullable cards ──────────────────────────────────────────────────────────

/** The saved cards that can be pulled as a pack's bonus third card, with each one's odds weight. */
export async function listFeaturedCards(): Promise<Record<string, number>> {
  if (!(await requireAdmin())) return {};
  const raw = (await redis.hgetall(FEATURED_CARDS_KEY)) ?? {};
  const out: Record<string, number> = {};
  for (const [id, weight] of Object.entries(raw)) {
    const n = Number(weight);
    if (Number.isFinite(n) && n > 0) out[id] = n;
  }
  return out;
}

/** Make a saved card pullable with this odds weight (1 to 100, higher = pulled more often), or pass null to stop it being pullable. */
export async function setCardPullable(id: string, weight: number | null): Promise<ActionResult<null>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change this" };
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) return { success: false, error: "Invalid card" };

    if (weight === null) {
      await redis.hdel(FEATURED_CARDS_KEY, id);
    } else {
      const n = Math.round(Number(weight));
      if (!Number.isFinite(n) || n < MIN_FEATURED_WEIGHT || n > MAX_FEATURED_WEIGHT) {
        return { success: false, error: `Odds must be a number from ${MIN_FEATURED_WEIGHT} to ${MAX_FEATURED_WEIGHT}` };
      }
      const saved = parseCard(await redis.get(cardKey(id)));
      if (!saved?.id) return { success: false, error: "Save the card first" };
      if (!saved.imageUrl) return { success: false, error: "The card needs a picture before it can be pulled" };
      await redis.hset(FEATURED_CARDS_KEY, { [id]: n });
    }
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update the card" };
  }
}
