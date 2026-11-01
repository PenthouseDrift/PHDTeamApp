"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { fullArtCardKey } from "@/lib/member-card-store";
import { packStyleKey } from "@/lib/pack-styles-store";
import { loadComingSoonItems, saveComingSoonItems } from "@/lib/coming-soon-store";
import { sanitizeComingSoonList, type ComingSoonItem } from "@/lib/coming-soon";
import type { ActionResult } from "@/types";

/**
 * The "Coming soon" row on the game's Home page (see lib/coming-soon.ts). The admin picks saved full art
 * cards and library styles on the Card packs page; the whole ordered list is saved in one go.
 */
async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function listComingSoonItems(): Promise<ComingSoonItem[]> {
  try {
    if (!(await requireAdmin())) return [];
    return await loadComingSoonItems();
  } catch (error) {
    console.error("[coming-soon] list failed:", error);
    return [];
  }
}

/** Replace the list. Anything that points at a card or style that no longer exists is dropped. */
export async function saveComingSoonAction(items: ComingSoonItem[]): Promise<ActionResult<ComingSoonItem[]>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change this" };
    const clean = sanitizeComingSoonList(items);
    const exists =
      clean.length === 0
        ? []
        : await redis.mget(...clean.map((i) => (i.source === "card" ? fullArtCardKey(i.refId) : packStyleKey(i.refId))));
    const kept = clean.filter((_, idx) => exists[idx] !== null && exists[idx] !== undefined);
    await saveComingSoonItems(kept);
    revalidatePath("/cards");
    revalidatePath("/admin/driftclash/packs");
    return { success: true, data: kept };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the Coming soon row" };
  }
}
