"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { MEMBER_CARD_ID_PATTERN } from "@/lib/member-card-store";
import {
  STANDARD_PACK_ID,
  configFromLegacyPack,
  effectivePcts,
  emptyPackConfig,
  entryOverallPct,
  sanitizePackConfig,
  validatePackConfig,
  type PackConfig,
} from "@/lib/pack-config";
import { loadPackConfig, loadRuntimeFor, savePackConfig, deletePackConfig } from "@/lib/pack-config-store";
import { ALL_TIERS } from "@/lib/pack-styles";
import {
  TCG_CUSTOM_PACKS_INDEX_KEY,
  hydrateCustomPacks,
  parseCustomPack,
  tcgCustomPackKey,
} from "@/tcg/storage";
import { DEFAULT_STANDARD_PACK_PRICE, isOnSale } from "@/tcg/config";
import type { TcgCustomPack, TcgCustomPackWithCards, TcgPackStatus } from "@/tcg/types";
import type { ActionResult } from "@/types";

/**
 * Admin actions for the DriftClash Card packs page: each pack's per-rarity setup (rarity odds, and the
 * styles and set cards that can take the place of the normal generated card), and creating packs.
 * The style library itself is in pack-styles.ts.
 */

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function revalidate() {
  revalidatePath("/admin/driftclash/packs");
  revalidatePath("/cards");
}

/**
 * Check that everything a config points at exists, and that a set card sits on its own rarity.
 * Returns a message for the first problem, or null.
 */
async function checkReferences(config: PackConfig): Promise<string | null> {
  const runtime = await loadRuntimeFor(config);
  for (const tier of ALL_TIERS) {
    for (const entry of config.rarities[tier]) {
      if (entry.kind === "style") {
        if (!runtime.styles.has(entry.refId)) return "One of the styles no longer exists. Remove it and try again.";
      } else {
        const card = runtime.cards.get(entry.refId);
        if (!card) return "One of the set cards no longer exists or has no picture. Remove it and try again.";
        if (card.tier !== tier) {
          return `"${card.name}" is a ${card.tier} card, so it can only go on the ${card.tier} rarity.`;
        }
      }
    }
  }
  return null;
}

/** The Standard Pack's saved setup, or a switched-off default if none has been saved. */
export async function getStandardPackConfig(): Promise<PackConfig> {
  try {
    if (!(await requireAdmin())) return emptyPackConfig(STANDARD_PACK_ID);
    return (await loadPackConfig(STANDARD_PACK_ID)) ?? emptyPackConfig(STANDARD_PACK_ID);
  } catch (error) {
    console.error("[driftclash-packs] could not read the Standard Pack config:", error);
    return emptyPackConfig(STANDARD_PACK_ID);
  }
}

/** Save a pack's per-rarity setup. The pack must be the Standard Pack or an existing custom pack. */
export async function savePackConfigAction(input: PackConfig): Promise<ActionResult<PackConfig>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };

    const config = sanitizePackConfig(input);
    if (!config) return { success: false, error: "That pack setup isn't valid" };

    if (config.packId !== STANDARD_PACK_ID) {
      if (!parseCustomPack(await redis.get(tcgCustomPackKey(config.packId)))) {
        return { success: false, error: "That pack no longer exists" };
      }
    }

    const problem = validatePackConfig(config) ?? (await checkReferences(config));
    if (problem) return { success: false, error: problem };

    const saved = await savePackConfig(config);
    revalidate();
    return { success: true, data: saved };
  } catch (error) {
    console.error("[driftclash-packs] save config failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not save the pack" };
  }
}

/** The Standard Pack's master switch. Off, it rolls exactly as it always has. */
export async function setStandardPackEnabledAction(enabled: boolean): Promise<ActionResult<PackConfig>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    const current = (await loadPackConfig(STANDARD_PACK_ID)) ?? emptyPackConfig(STANDARD_PACK_ID);
    const saved = await savePackConfig({ ...current, enabled: enabled === true });
    revalidate();
    return { success: true, data: saved };
  } catch (error) {
    console.error("[driftclash-packs] switch failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change the switch" };
  }
}

export interface SavePackInput {
  id?: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number | null;
  status: TcgPackStatus;
  cardsPerPack?: number;
  config: PackConfig;
}

/** Create a pack, or update one. Saves both the pack (name, price, status) and its per-rarity setup. */
export async function savePackAction(input: SavePackInput): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can create or edit packs" };

    const name = String(input.name ?? "").trim().slice(0, 60);
    if (!name) return { success: false, error: "Give the pack a name", field: "name" };
    const description = String(input.description ?? "").trim().slice(0, 200);
    const price = Math.max(1, Math.min(100_000, Math.round(Number(input.price) || DEFAULT_STANDARD_PACK_PRICE)));

    let salePrice: number | null = null;
    if (input.salePrice !== null && input.salePrice !== undefined && Number(input.salePrice) > 0) {
      const parsed = Math.round(Number(input.salePrice));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed >= price) {
        return { success: false, error: "The sale price must be at least 1 and less than the price", field: "salePrice" };
      }
      salePrice = isOnSale(price, parsed) ? parsed : null;
    }
    const status: TcgPackStatus = input.status === "live" ? "live" : "draft";
    const cardsPerPack = Math.max(1, Math.min(3, Math.round(Number(input.cardsPerPack) || 1)));

    const id = input.id && MEMBER_CARD_ID_PATTERN.test(input.id) ? input.id : randomUUID();
    const existing = input.id ? parseCustomPack(await redis.get(tcgCustomPackKey(id))) : null;
    if (input.id && !existing) return { success: false, error: "That pack no longer exists" };

    const config = sanitizePackConfig({ ...input.config, packId: id });
    if (!config) return { success: false, error: "That pack setup isn't valid" };
    const problem = validatePackConfig(config) ?? (await checkReferences(config));
    if (problem) return { success: false, error: problem };

    if (status === "live") {
      const pcts = effectivePcts(config);
      const hasEntry = ALL_TIERS.some((tier) => pcts[tier] > 0 && config.rarities[tier].some((e) => e.chancePct > 0));
      if (!hasEntry) {
        return { success: false, error: "Add at least one style or set card to a rarity this pack can roll before setting it live" };
      }
    }

    const now = Date.now();
    // `cards` is the old list form. It is kept in step with the set cards so anything still reading it sees them.
    const pcts = effectivePcts(config);
    const mirror = ALL_TIERS.flatMap((tier) =>
      config.rarities[tier]
        .filter((e) => e.kind === "card")
        .map((e) => ({
          cardId: e.refId,
          weight: Math.max(1, Math.min(100, Math.round(entryOverallPct(pcts, tier, e)))),
        }))
    );
    const pack: TcgCustomPack = {
      id,
      name,
      description,
      price,
      salePrice,
      status,
      cardsPerPack,
      cards: mirror,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await savePackConfig(config);
    await redis
      .multi()
      .set(tcgCustomPackKey(id), JSON.stringify(pack))
      .zadd(TCG_CUSTOM_PACKS_INDEX_KEY, { score: pack.createdAt, member: id })
      .exec();

    const [hydrated] = await hydrateCustomPacks([pack]);
    revalidate();
    return { success: true, data: hydrated };
  } catch (error) {
    console.error("[driftclash-packs] save pack failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not save the pack" };
  }
}

/**
 * Move an old pack (one weighted card list) onto the per-rarity setup. Every card keeps exactly the
 * odds it had. Nothing changes for members except that pulled cards now keep their saved rarity.
 */
export async function convertLegacyPackAction(packId: string): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack" };

    const pack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!pack) return { success: false, error: "That pack no longer exists" };

    if (!(await loadPackConfig(packId))) {
      const [hydrated] = await hydrateCustomPacks([pack]);
      const config = configFromLegacyPack(
        packId,
        hydrated.setList.map((entry) => ({ cardId: entry.card.id!, weight: entry.weight, tier: entry.card.tier }))
      );
      await savePackConfig(config);
    }

    const [result] = await hydrateCustomPacks([pack]);
    revalidate();
    return { success: true, data: result };
  } catch (error) {
    console.error("[driftclash-packs] convert failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not convert the pack" };
  }
}

/**
 * Put a pack live in the store, or take it back to a draft. Works for both layouts and changes
 * nothing else about the pack. A pack can only go live when it has something in it to pull.
 */
export async function setPackStatusAction(packId: string, status: TcgPackStatus): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack" };

    const pack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!pack) return { success: false, error: "That pack no longer exists" };

    const next: TcgPackStatus = status === "live" ? "live" : "draft";
    if (next === "live") {
      const config = await loadPackConfig(packId);
      if (config) {
        const pcts = effectivePcts(config);
        const hasEntry = ALL_TIERS.some((tier) => pcts[tier] > 0 && config.rarities[tier].some((e) => e.chancePct > 0));
        if (!hasEntry) {
          return { success: false, error: "Add at least one style or set card to a rarity this pack can roll before setting it live" };
        }
      } else if ((await hydrateCustomPacks([pack]))[0].setList.length === 0) {
        return { success: false, error: "Add at least one card to the pack before setting it live" };
      }
    }

    // Only the status changes. The edit time is left alone so the editor isn't reset mid-edit.
    const updated: TcgCustomPack = { ...pack, status: next };
    await redis.set(tcgCustomPackKey(packId), JSON.stringify(updated));

    const [hydrated] = await hydrateCustomPacks([updated]);
    revalidate();
    return { success: true, data: hydrated };
  } catch (error) {
    console.error("[driftclash-packs] status change failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change the pack's status" };
  }
}

/** Delete a custom pack and its setup. */
export async function deletePackAction(packId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can delete packs" };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack" };
    await redis.multi().del(tcgCustomPackKey(packId)).zrem(TCG_CUSTOM_PACKS_INDEX_KEY, packId).exec();
    await deletePackConfig(packId);
    revalidate();
    return { success: true, data: { id: packId } };
  } catch (error) {
    console.error("[driftclash-packs] delete failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not delete the pack" };
  }
}
