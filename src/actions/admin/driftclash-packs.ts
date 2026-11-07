"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { deleteImage } from "@/lib/blob";
import { CardArtError, generateArtImage, isBlobUrl } from "@/lib/card-art-generate";
import { tierFromStats } from "@/lib/card-roll";
import { compressToWebp } from "@/lib/image-compress";
import { FULL_ART_TIERS, sanitizeFullArtCard, type FullArtCardData, type FullArtTier } from "@/lib/full-art-card";
import {
  ALL_MEMBER_CARDS_INDEX,
  MEMBER_CARD_ID_PATTERN,
  fullArtCardKey,
  isCommunityCard,
  memberCardKey,
  parseStoredCard,
} from "@/lib/member-card-store";
import {
  STANDARD_PACK_ID,
  configFromLegacyPack,
  effectivePcts,
  emptyPackConfig,
  cleanVariant,
  entryOverallPct,
  rollStatsForTier,
  sanitizePackConfig,
  validatePackConfig,
  variantStatsMode,
  type EntryVariant,
  type PackConfig,
} from "@/lib/pack-config";
import { loadPackConfig, loadRuntimeFor, savePackConfig, deletePackConfig } from "@/lib/pack-config-store";
import { ALL_TIERS, ID_PATTERN, frameFieldsFor, stylePrompt, type PackStyle } from "@/lib/pack-styles";
import { loadPackStyle } from "@/lib/pack-styles-store";
import {
  TCG_CUSTOM_PACKS_INDEX_KEY,
  hydrateCustomPacks,
  parseCustomPack,
  tcgCustomPackKey,
  clearPackCaches,
} from "@/tcg/storage";
import { DEFAULT_STANDARD_PACK_PRICE, isOnSale } from "@/tcg/config";
import { simulateManyPacks, simulateOnePack, type SimSlot, type SimStats } from "@/tcg/pack-simulate";
import type { TcgCustomPack, TcgCustomPackWithCards, TcgPackStatus } from "@/tcg/types";
import type { ActionResult } from "@/types";
import { saveFullArtCard } from "@/actions/admin/full-art-cards";

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
        const mode = variantStatsMode(entry.variant);
        if (mode === "custom") {
          // Stats set by hand: they have to make a card of this rarity.
          if (entry.variant?.stats && tierFromStats(entry.variant.stats) !== tier) {
            return `The stats set for "${card.name}" make a ${tierFromStats(entry.variant.stats)} card, not ${tier}. Change them and try again.`;
          }
        } else if (mode === "keep" && card.tier !== tier) {
          // Rerolled at the pull always fits the rarity; kept stats only fit the rarity the card was saved on.
          return `"${card.name}" is a ${card.tier} card, so it can only keep its stats on the ${card.tier} rarity. Reroll them at the pull or set new stats.`;
        }
      }
    }
  }
  // A bonus pull's cards can be any rarity (they are given out as Legend cards), but each must exist and have a picture.
  for (const entry of config.bonus?.entries ?? []) {
    if (!runtime.cards.has(entry.refId)) return "One of the bonus pull's cards no longer exists or has no picture. Remove it and try again.";
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
    clearPackCaches();

    const config = sanitizePackConfig(input);
    if (!config) return { success: false, error: "That pack setup isn't valid" };

    if (config.packId !== STANDARD_PACK_ID) {
      if (!parseCustomPack(await redis.get(tcgCustomPackKey(config.packId)))) {
        return { success: false, error: "That pack no longer exists" };
      }
    }

    const problem = validatePackConfig(config) ?? (await checkReferences(config));
    if (problem) return { success: false, error: problem };

    if (config.packId === STANDARD_PACK_ID) {
      // The pack credit setting has its own switch, so saving the setup never changes it (a stale editor can't undo it).
      const current = await loadPackConfig(STANDARD_PACK_ID).catch(() => null);
      if (current?.allowCardCredits === false) config.allowCardCredits = false;
      else delete config.allowCardCredits;
    }

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
    clearPackCaches();
    const current = (await loadPackConfig(STANDARD_PACK_ID)) ?? emptyPackConfig(STANDARD_PACK_ID);
    const saved = await savePackConfig({ ...current, enabled: enabled === true });
    revalidate();
    return { success: true, data: saved };
  } catch (error) {
    console.error("[driftclash-packs] switch failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change the switch" };
  }
}

/**
 * Let members open the Standard Pack with a pack credit as well as with P-Credits (the default), or stop letting them.
 * Switched off, the Standard Pack can only be opened by paying its price in P-Credits. Nothing else about it changes.
 */
export async function setStandardPackCardCreditsAction(allow: boolean): Promise<ActionResult<PackConfig>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    clearPackCaches();
    const current = (await loadPackConfig(STANDARD_PACK_ID)) ?? emptyPackConfig(STANDARD_PACK_ID);
    const next: PackConfig = { ...current };
    if (allow === false) next.allowCardCredits = false;
    else delete next.allowCardCredits;
    const saved = await savePackConfig(next);
    revalidate();
    revalidatePath("/cards/new");
    return { success: true, data: saved };
  } catch (error) {
    console.error("[driftclash-packs] standard pack credit setting failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change the pack credit setting" };
  }
}

export interface SavePackInput {
  id?: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number | null;
  status: TcgPackStatus;
  /** Whether a live pack can be bought. Defaults to the pack's current setting, or yes for a new pack. */
  purchasable?: boolean;
  /** Whether a pack credit can open this pack. Defaults to the pack's current setting, or yes for a new pack. */
  allowCardCredits?: boolean;
  cardsPerPack?: number;
  config: PackConfig;
}

/** Create a pack, or update one. Saves both the pack (name, price, status) and its per-rarity setup. */
export async function savePackAction(input: SavePackInput): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can create or edit packs" };
    clearPackCaches();

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
      purchasable: input.purchasable ?? existing?.purchasable ?? true,
      allowCardCredits: input.allowCardCredits ?? existing?.allowCardCredits ?? true,
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
    clearPackCaches();
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
    clearPackCaches();
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

/**
 * Turn buying on or off for a pack, without changing whether it is live. A live pack that is not purchasable stays in the
 * store so members can see what is in it, but it can't be bought or opened. Changes nothing else about the pack.
 */
export async function setPackPurchasableAction(packId: string, purchasable: boolean): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    clearPackCaches();
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack" };

    const pack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!pack) return { success: false, error: "That pack no longer exists" };

    // The edit time is left alone so the editor isn't reset mid-edit.
    const updated: TcgCustomPack = { ...pack, purchasable: purchasable !== false };
    await redis.set(tcgCustomPackKey(packId), JSON.stringify(updated));

    const [hydrated] = await hydrateCustomPacks([updated]);
    revalidate();
    return { success: true, data: hydrated };
  } catch (error) {
    console.error("[driftclash-packs] purchasable change failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change whether the pack can be bought" };
  }
}

/** The most packs one simulation covers. */
const MAX_SIMULATED_PACKS = 5000;

/** A pack setup sent from the editor (saved or not) cleaned for simulating, or null if it isn't one. */
function configForSimulation(config: PackConfig): PackConfig | null {
  const isStandard = config?.packId === STANDARD_PACK_ID;
  return sanitizePackConfig({ ...config, packId: isStandard ? STANDARD_PACK_ID : randomUUID() });
}

/**
 * Open one pack on paper, using the setup as it is in the editor right now (no need to save first). Nobody is charged,
 * nothing is saved and no AI picture is made: a card opening would draw with AI comes back as a placeholder showing its
 * rarity and style. Admin only.
 */
export async function simulatePackOpeningAction(input: {
  config: PackConfig;
  cardsPerPack: number;
}): Promise<ActionResult<{ slots: SimSlot[] }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can simulate packs" };
    const config = configForSimulation(input?.config);
    if (!config) return { success: false, error: "That pack setup isn't valid" };
    return { success: true, data: { slots: await simulateOnePack({ config, cardsPerPack: Number(input.cardsPerPack) }) } };
  } catch (error) {
    console.error("[driftclash-packs] simulate failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not simulate the pack" };
  }
}

/** Open many packs on paper and count what comes out, to check a setup's odds. Same rules as simulatePackOpeningAction. */
export async function simulatePackStatsAction(input: {
  config: PackConfig;
  cardsPerPack: number;
  packs: number;
}): Promise<ActionResult<SimStats>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can simulate packs" };
    const config = configForSimulation(input?.config);
    if (!config) return { success: false, error: "That pack setup isn't valid" };
    const packs = Math.max(1, Math.min(MAX_SIMULATED_PACKS, Math.round(Number(input.packs)) || 1));
    return { success: true, data: await simulateManyPacks({ config, cardsPerPack: Number(input.cardsPerPack) }, packs) };
  } catch (error) {
    console.error("[driftclash-packs] simulate stats failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not simulate the packs" };
  }
}

/**
 * Let members open this pack with a pack credit instead of paying P-Credits (the default for every pack), or stop letting them. Doesn't change whether
 * the pack is live or buyable, or anything else about it.
 */
export async function setPackCardCreditsAction(packId: string, allow: boolean): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change packs" };
    clearPackCaches();
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack" };

    const pack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!pack) return { success: false, error: "That pack no longer exists" };

    // The edit time is left alone so the editor isn't reset mid-edit.
    const updated: TcgCustomPack = { ...pack, allowCardCredits: allow !== false };
    await redis.set(tcgCustomPackKey(packId), JSON.stringify(updated));

    const [hydrated] = await hydrateCustomPacks([updated]);
    revalidate();
    return { success: true, data: hydrated };
  } catch (error) {
    console.error("[driftclash-packs] pack credit setting failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not change the pack credit setting" };
  }
}

/** Delete a custom pack and its setup. */
export async function deletePackAction(packId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can delete packs" };
    clearPackCaches();
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

// ── Member cars as set cards ────────────────────────────────────────────────

/** A member's car card, as the pack editor's picker shows it. No ids of the owner, no email, no car-photo address. */
export interface MemberCarOption extends FullArtCardData {
  id: string;
  /** Whose card it is, from when they opened it. */
  owner: string;
}

export interface MemberCarPage {
  cards: MemberCarOption[];
  /** Pass back as `cursor` for the next page, or null when there are no more. */
  nextCursor: number | null;
}

const PICKER_PAGE = 24;
const PICKER_CHUNK = 150;
/** Most cards looked at in one request, so a search that matches little can't read the whole collection. */
const PICKER_MAX_SCAN = 1500;
const MAX_COPY_BYTES = 8 * 1024 * 1024;

/**
 * Members' car cards, newest first, for picking a set card from. Includes every car card members hold
 * (a member can hold several of the same car, each with its own art). Left out: Crew, Repair, Hazard and
 * Track cards, bonus cards (they are copies of someone else's car), cards that came from a set list, and
 * cards a member re-rolled away. Admin only.
 */
export async function listMemberCarCardsAction(input: {
  cursor?: number;
  search?: string;
  tier?: FullArtTier | null;
}): Promise<ActionResult<MemberCarPage>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can browse member cards" };

    const search = String(input?.search ?? "").trim().toLowerCase().slice(0, 60);
    const tier = ALL_TIERS.includes(input?.tier as FullArtTier) ? (input.tier as FullArtTier) : null;
    let cursor = Math.max(0, Math.floor(Number(input?.cursor) || 0));
    const total = Number(await redis.zcard(ALL_MEMBER_CARDS_INDEX)) || 0;

    const cards: MemberCarOption[] = [];
    let scanned = 0;
    while (cursor < total && cards.length < PICKER_PAGE && scanned < PICKER_MAX_SCAN) {
      const ids = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, cursor, cursor + PICKER_CHUNK - 1, { rev: true })) as string[];
      if (!ids || ids.length === 0) {
        cursor = total;
        break;
      }
      const rows = await redis.mget(...ids.map((id) => memberCardKey(String(id))));
      for (const row of rows) {
        cursor++;
        scanned++;
        const card = parseStoredCard(row);
        if (!card || !isCommunityCard(card)) continue;
        if (card.cardType && card.cardType !== "car") continue;
        if (!card.imageUrl || card.featured) continue;
        if (tier && card.tier !== tier) continue;
        const owner = (card.ownerName ?? "").trim() || card.driver;
        if (search && ![card.name, card.driver, card.team, card.ability, owner].some((v) => v.toLowerCase().includes(search))) continue;

        const base = sanitizeFullArtCard(card);
        cards.push({ ...base, id: card.id, owner });
        if (cards.length >= PICKER_PAGE) break;
      }
    }
    return { success: true, data: { cards, nextCursor: cursor < total ? cursor : null } };
  } catch (error) {
    console.error("[driftclash-packs] listing member cars failed:", error);
    return { success: false, error: "Could not load the members' cars" };
  }
}

/** A picture made for a set card lives under set-cards/ in our own file store (see generateArtImage and copyCardImage). */
function isSetCardArtUrl(value: string): boolean {
  if (!isBlobUrl(value)) return false;
  try {
    return new URL(value).pathname.startsWith("/set-cards/");
  } catch {
    return false;
  }
}

type StyleChoice = { ok: true; style: PackStyle | null; artUrl: string } | { ok: false; error: string };

/** Check the style (and redrawn picture) an admin chose. No style means the card keeps the look it has. */
async function resolveStyleChoice(styleId?: string, artUrl?: string): Promise<StyleChoice> {
  const id = String(styleId ?? "").trim();
  const url = String(artUrl ?? "").trim();
  if (!id) {
    return url ? { ok: false, error: "Choose a style before using redrawn artwork" } : { ok: true, style: null, artUrl: "" };
  }
  if (!ID_PATTERN.test(id)) return { ok: false, error: "Invalid style" };
  const style = await loadPackStyle(id);
  if (!style) return { ok: false, error: "That style no longer exists" };
  if (url && !isSetCardArtUrl(url)) return { ok: false, error: "That artwork can't be used. Redraw it and try again." };
  return { ok: true, style, artUrl: url };
}

/** A saved set card (from the Card maker) that has a picture, or null. */
async function loadSavedSetCard(id: string): Promise<FullArtCardData | null> {
  if (!MEMBER_CARD_ID_PATTERN.test(id)) return null;
  try {
    const raw = await redis.get(fullArtCardKey(id));
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const card = sanitizeFullArtCard(value as Partial<FullArtCardData>);
    return card.imageUrl ? { ...card, id } : null;
  } catch {
    return null;
  }
}

/** Copy a card's picture into its own file. A member's card can be deleted later, and that deletes its picture. */
async function copyCardImage(url: string): Promise<string> {
  if (!isBlobUrl(url)) throw new Error("This card's picture isn't stored in the app, so it can't be copied");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load the card's picture");
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("The card's picture must be a JPEG, PNG or WebP");
  let bytes: Buffer = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_COPY_BYTES) throw new Error("The card's picture is too large to copy");
  // Keep the copy small: a card is shown at about 900 pixels wide, so a larger PNG or JPEG is stored as a WebP of that size.
  let outMime = mime;
  const compressed = await compressToWebp(bytes);
  if (compressed && compressed.buffer.length < bytes.length) {
    bytes = compressed.buffer;
    outMime = compressed.mime;
  }
  const ext = outMime === "image/jpeg" ? "jpg" : outMime === "image/png" ? "png" : "webp";
  const blob = await put(`set-cards/${randomUUID()}.${ext}`, bytes, {
    access: "public",
    contentType: outMime,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

/** Which saved set card each member card was imported as, so choosing the same member card again reuses it. */
const IMPORTED_MEMBER_CARDS_KEY = "driftclash:setcards:from-member";

/**
 * Turn a member's car card into a saved set card, once. The set card is its own copy: the same name, car details, picture,
 * position, frame, rarity and stats as the member's card, with the picture copied so it survives the member's card being
 * deleted. Nothing about the member's card changes.
 *
 * Choosing the same member card again does NOT make another copy: the set card made the first time is returned (unless
 * it has since been deleted in the Card maker). Rerolled stats, a style and a redrawn picture are not part of this. They
 * belong to the pack entry that uses the card (see `EntryVariant`), so trying them out never adds cards. Admin only.
 */
export async function importMemberCardToPackAction(input: { memberCardId: string }): Promise<ActionResult<FullArtCardData>> {
  let copiedUrl = "";
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can create set cards" };
    clearPackCaches();

    const memberCardId = String(input?.memberCardId ?? "").trim();
    if (!MEMBER_CARD_ID_PATTERN.test(memberCardId)) return { success: false, error: "Invalid card" };

    // Already imported: use that one.
    const earlier = await redis.hget<string>(IMPORTED_MEMBER_CARDS_KEY, memberCardId);
    if (earlier) {
      const existing = await loadSavedSetCard(String(earlier));
      if (existing) return { success: true, data: existing };
    }

    const source = parseStoredCard(await redis.get(memberCardKey(memberCardId)));
    if (!source || !isCommunityCard(source) || (source.cardType && source.cardType !== "car") || !source.imageUrl) {
      return { success: false, error: "That card is no longer available" };
    }

    copiedUrl = await copyCardImage(source.imageUrl);

    // The card keeps its name exactly as it is. Two saved cards can share a name; nothing is added to it.
    const base = sanitizeFullArtCard(source);
    const card: FullArtCardData = { ...base, id: undefined, updatedAt: undefined, imageUrl: copiedUrl };

    const saved = await saveFullArtCard(card);
    if (!saved.success) {
      await deleteImage(copiedUrl).catch(() => {});
      return saved;
    }
    if (saved.data.id) await redis.hset(IMPORTED_MEMBER_CARDS_KEY, { [memberCardId]: saved.data.id }).catch(() => {});
    return { success: true, data: saved.data };
  } catch (error) {
    if (copiedUrl) await deleteImage(copiedUrl).catch(() => {});
    console.error("[driftclash-packs] importing a member card failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not create the set card" };
  }
}

// ── Restyling a card with a style from the style library ────────────────────

/**
 * Redraw a card's artwork in a style's art prompt, for the admin to look at before adding the card. This is the only
 * step that calls the image model: ONE image (the same cost as one generated card in a pack). The new picture is
 * saved on its own and its address returned; nothing about the card changes until it is added with that address.
 *
 * The rarity's scene is used the way packs use it (a "style" prompt goes on top of the rarity's scene, a "full" prompt
 * is sent as written). A member's card is redrawn from its original car photo, like a pack card; a saved set card is
 * redrawn from its current picture. A style with no prompt only changes the frame, so there is nothing to redraw.
 */
export async function restyleCardArtAction(input: {
  /** A member's card, a saved set card, or a picture the admin uploaded (an address in our own file store). */
  source: { kind: "member" | "saved"; id: string } | { kind: "upload"; url: string };
  styleId: string;
  tier: FullArtTier;
}): Promise<ActionResult<{ imageUrl: string }>> {
  let lockKey = "";
  try {
    const session = await auth();
    if (session?.user?.role !== "admin" || !session.user.id) {
      return { success: false, error: "Only admins can redraw cards" };
    }
    const tier = input?.tier;
    if (!ALL_TIERS.includes(tier)) return { success: false, error: "Invalid rarity" };

    const styled = await resolveStyleChoice(input?.styleId);
    if (!styled.ok) return { success: false, error: styled.error };
    const { style } = styled;
    if (!style) return { success: false, error: "Choose a style first" };
    if (!style.prompt.trim()) return { success: false, error: "This style only changes the frame, so there is no artwork to redraw." };

    let referenceUrl = "";
    if (input.source?.kind === "upload") {
      referenceUrl = String(input.source.url ?? "").trim();
      if (!isBlobUrl(referenceUrl)) return { success: false, error: "Upload the picture in the app first." };
    } else {
      const sourceId = String(input?.source?.id ?? "").trim();
      if (!MEMBER_CARD_ID_PATTERN.test(sourceId)) return { success: false, error: "Invalid card" };
      if (input.source.kind === "member") {
        const card = parseStoredCard(await redis.get(memberCardKey(sourceId)));
        if (!card || !isCommunityCard(card) || (card.cardType && card.cardType !== "car")) {
          return { success: false, error: "That card is no longer available" };
        }
        referenceUrl = isBlobUrl(card.referenceUrl) ? card.referenceUrl : card.imageUrl;
      } else if (input.source.kind === "saved") {
        const card = await loadSavedSetCard(sourceId);
        if (!card) return { success: false, error: "That card is no longer available" };
        referenceUrl = card.imageUrl;
      } else {
        return { success: false, error: "Invalid card" };
      }
      if (!isBlobUrl(referenceUrl)) return { success: false, error: "This card's picture isn't stored in the app, so it can't be redrawn." };
    }

    // One redraw at a time per admin, so a double click can't pay for two images.
    lockKey = `driftclash:restyle:lock:${session.user.id}`;
    const locked = await redis.set(lockKey, "1", { nx: true, ex: 120 });
    if (!locked) {
      lockKey = "";
      return { success: false, error: "A redraw is already running. Give it a moment." };
    }

    const { imageUrl } = await generateArtImage({
      referenceUrl,
      prompt: stylePrompt(style, tier),
      aspectRatio: "3:4",
      folder: "set-cards",
    });
    return { success: true, data: { imageUrl } };
  } catch (error) {
    console.error("[driftclash-packs] restyle redraw failed:", error);
    return {
      success: false,
      error: error instanceof CardArtError ? error.message : "The redraw didn't work this time. Please try again.",
    };
  } finally {
    if (lockKey) await redis.del(lockKey).catch(() => {});
  }
}


// ── Saving the finished card ────────────────────────────────────────────────

/**
 * Save the card as it will look in the pack as a NEW set card, so it shows in Saved set cards and the Card maker. This is
 * what to use when a member's car (or a saved card) has been redrawn, restyled or moved to another rarity and the result is
 * a card in its own right. Choosing a card in the pack editor never does this by itself; this is the explicit step.
 *
 * The new card is built from the source with the variant already applied: the style's frame, the redrawn picture (or the
 * source's own, copied for a member's car so it outlives their card), and the stats for `tier` (kept when the source is
 * already on `tier`, set by hand, or rolled once here). The source is not changed. For a member's car the member's own card
 * is NOT imported as well, so the library only gets the finished card.
 *
 * `entryVariant` is what the pack entry should keep after pointing at the new card: only "reroll at the pull" survives,
 * because everything else is now part of the card. Admin only.
 */
export async function createFinishedSetCardAction(input: {
  source: { kind: "member" | "saved"; id: string };
  tier: FullArtTier;
  variant?: EntryVariant;
}): Promise<ActionResult<{ card: FullArtCardData; entryVariant: EntryVariant | undefined }>> {
  let copiedUrl = "";
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can create set cards" };
    clearPackCaches();

    const tier = input?.tier;
    if (!ALL_TIERS.includes(tier)) return { success: false, error: "Invalid rarity" };
    const tierName = FULL_ART_TIERS.find((t) => t.id === tier)?.label ?? tier;

    const variant = cleanVariant(input?.variant);
    const styled = await resolveStyleChoice(variant?.styleId, variant?.artUrl);
    if (!styled.ok) return { success: false, error: styled.error };
    const { style, artUrl } = styled;

    const sourceId = String(input?.source?.id ?? "").trim();
    if (!MEMBER_CARD_ID_PATTERN.test(sourceId)) return { success: false, error: "Invalid card" };

    let base: FullArtCardData;
    let sourcePicture: string;
    if (input.source.kind === "member") {
      const member = parseStoredCard(await redis.get(memberCardKey(sourceId)));
      if (!member || !isCommunityCard(member) || (member.cardType && member.cardType !== "car") || !member.imageUrl) {
        return { success: false, error: "That card is no longer available" };
      }
      base = sanitizeFullArtCard(member);
      sourcePicture = member.imageUrl;
    } else if (input.source.kind === "saved") {
      const saved = await loadSavedSetCard(sourceId);
      if (!saved) return { success: false, error: "That card is no longer available" };
      base = saved;
      sourcePicture = saved.imageUrl;
    } else {
      return { success: false, error: "Invalid card" };
    }

    // Stats on the new rarity.
    const mode = variantStatsMode(variant);
    let stats = base.stats;
    if (mode === "custom" && variant?.stats) {
      stats = variant.stats;
      if (tierFromStats(stats) !== tier) return { success: false, error: `Those stats make a ${tierFromStats(stats)} card, not ${tierName}.` };
    } else if (mode === "reroll") {
      stats = rollStatsForTier(tier, () => randomInt(0, 2 ** 32) / 2 ** 32);
    } else if (base.tier !== tier) {
      return { success: false, error: `This is a ${base.tier} card, so it can't keep its stats on ${tierName}. Reroll them or set your own.` };
    }

    // The picture: the redrawn one, or the source's own (copied for a member's car so it outlives their card).
    let imageUrl = artUrl;
    if (!imageUrl) {
      if (input.source.kind === "member") {
        copiedUrl = await copyCardImage(sourcePicture);
        imageUrl = copiedUrl;
      } else {
        imageUrl = sourcePicture;
      }
    }

    const card: FullArtCardData = {
      // The name is left exactly as it was. No style or rarity is added to it.
      name: base.name,
      ability: base.ability,
      effect: base.effect,
      tier,
      stats,
      imageUrl,
      imageZoom: base.imageZoom,
      imageX: base.imageX,
      imageY: base.imageY,
      driver: base.driver,
      team: base.team,
      ...(style
        ? frameFieldsFor(style.frame)
        : {
            customBorderColor: base.customBorderColor,
            customStatLabelColor: base.customStatLabelColor,
            customStatValueColor: base.customStatValueColor,
            customBottomBarBgColor: base.customBottomBarBgColor,
            customBottomBarBorderColor: base.customBottomBarBorderColor,
            customFrameEffect: base.customFrameEffect,
            customFrameShine: base.customFrameShine,
            customFlameColor: base.customFlameColor,
          }),
    };

    // The pack's own edits (words, picture position, colours, frame effect) become part of the new card. saveFullArtCard
    // cleans them to the card's limits like any other field.
    const saved = await saveFullArtCard({ ...card, ...(variant?.edits ?? {}) });
    if (!saved.success) {
      if (copiedUrl) await deleteImage(copiedUrl).catch(() => {});
      return saved;
    }
    return { success: true, data: { card: saved.data, entryVariant: mode === "reroll" ? { rerollOnPull: true } : undefined } };
  } catch (error) {
    if (copiedUrl) await deleteImage(copiedUrl).catch(() => {});
    console.error("[driftclash-packs] saving the finished card failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not create the set card" };
  }
}

/** The words printed on a card made from an uploaded picture. */
export interface PictureCardDetails {
  name: string;
  /** The chassis / ability line. */
  ability: string;
  /** The effect / description text. */
  effect: string;
  driver: string;
  team: string;
}

/**
 * Make a set card from a picture the admin uploaded, in a style from the style library. The card has the style's frame and
 * either the uploaded picture as it is, or the redrawn picture (`variant.artUrl`, from `restyleCardArtAction`). Its name and
 * words are exactly what was typed. Stats for `tier`: set by hand (`variant.stats`) or rolled once here (reroll at the pull
 * keeps rolling at each pull; see `entryVariant`). There is no "keep" because a new card has no stats yet. Admin only.
 */
export async function createCardFromPictureAction(input: {
  /** The uploaded picture (an address in our own file store). */
  pictureUrl: string;
  details: PictureCardDetails;
  tier: FullArtTier;
  variant?: EntryVariant;
}): Promise<ActionResult<{ card: FullArtCardData; entryVariant: EntryVariant | undefined }>> {
  let copiedUrl = "";
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can create set cards" };
    clearPackCaches();

    const tier = input?.tier;
    if (!ALL_TIERS.includes(tier)) return { success: false, error: "Invalid rarity" };
    const tierName = FULL_ART_TIERS.find((t) => t.id === tier)?.label ?? tier;

    const variant = cleanVariant(input?.variant);
    const styled = await resolveStyleChoice(variant?.styleId, variant?.artUrl);
    if (!styled.ok) return { success: false, error: styled.error };
    const { style, artUrl } = styled;

    const details = sanitizeFullArtCard({
      name: input?.details?.name,
      ability: input?.details?.ability,
      effect: input?.details?.effect,
      driver: input?.details?.driver,
      team: input?.details?.team,
    });
    if (!details.name) return { success: false, error: "Give the card a name" };

    const pictureUrl = String(input?.pictureUrl ?? "").trim();
    if (!isBlobUrl(pictureUrl)) return { success: false, error: "Upload the picture in the app first." };

    const mode = variantStatsMode(variant);
    let stats;
    if (mode === "custom" && variant?.stats) {
      stats = variant.stats;
      if (tierFromStats(stats) !== tier) return { success: false, error: `Those stats make a ${tierFromStats(stats)} card, not ${tierName}.` };
    } else {
      // Rolled once for the saved card. With "reroll at the pull" they are rolled again at every pull.
      stats = rollStatsForTier(tier, () => randomInt(0, 2 ** 32) / 2 ** 32);
    }

    let imageUrl = artUrl;
    if (!imageUrl) {
      copiedUrl = await copyCardImage(pictureUrl);
      imageUrl = copiedUrl;
    }

    const card: FullArtCardData = {
      name: details.name,
      ability: details.ability,
      effect: details.effect,
      tier,
      stats,
      imageUrl,
      imageZoom: 100,
      imageX: 50,
      imageY: 50,
      driver: details.driver,
      team: details.team,
      ...(style ? frameFieldsFor(style.frame) : {}),
    };
    const saved = await saveFullArtCard(card);
    if (!saved.success) {
      if (copiedUrl) await deleteImage(copiedUrl).catch(() => {});
      return saved;
    }
    return { success: true, data: { card: saved.data, entryVariant: mode === "reroll" ? { rerollOnPull: true } : undefined } };
  } catch (error) {
    if (copiedUrl) await deleteImage(copiedUrl).catch(() => {});
    console.error("[driftclash-packs] creating a card from a picture failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not create the set card" };
  }
}

/**
 * Take a picture the admin uploaded, or a member card's picture, into the set cards' own file area so it can be used as a
 * card's artwork in a pack. (A pack only accepts pictures from there, so nothing else can be pointed at, and a member
 * deleting their card can't take the picture away.) Returns the new address. Admin only.
 */
export async function adoptPictureAction(input: { url: string }): Promise<ActionResult<{ imageUrl: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can change cards" };
    clearPackCaches();
    const url = String(input?.url ?? "").trim();
    if (!isBlobUrl(url)) return { success: false, error: "That picture isn't stored in the app." };
    return { success: true, data: { imageUrl: await copyCardImage(url) } };
  } catch (error) {
    console.error("[driftclash-packs] adopting a picture failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not use that picture" };
  }
}
