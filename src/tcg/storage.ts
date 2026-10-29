import { redis } from "@/lib/redis";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import {
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  UK_TRACK_CARD_SET,
  type CrewCardDefinition,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";
import { fullArtCardKey } from "@/lib/member-card-store";
import type { MemberCard } from "@/lib/card-roll";
import { DEFAULT_STANDARD_PACK_PRICE, P_CREDIT_BUNDLES, isOnSale } from "./config";
import type {
  PCreditBundle,
  TcgCustomPack,
  TcgCustomPackCardEntry,
  TcgCustomPackWithCards,
  TcgMarketListing,
  TcgStoreConfig,
} from "./types";

/**
 * Penthouse TCG — Redis Storage Layer
 *
 * Keys:
 *   member:<userId> (field: pCredits) — Member's P-Credits balance
 *   tcg:market:listing:<id>           — JSON of TcgMarketListing
 *   tcg:market:active                 — Sorted set of active listing IDs (score = createdAt)
 *   tcg:market:bycard                 — Hash mapping cardId -> listingId
 *   tcg:market:lock:<id>              — Short-lived mutex preventing concurrent buys/cancels
 *   tcg:store:config                  — JSON of TcgStoreConfig (standardPackPrice, etc.)
 *   tcg:pack:<id>                     — JSON of TcgCustomPack
 *   tcg:packs:index                   — Sorted set of custom pack IDs (score = createdAt)
 */

const P_CREDITS_FIELD = "pCredits";
const memberKey = (userId: string) => `member:${userId}`;

export const tcgMarketListingKey = (listingId: string) => `tcg:market:listing:${listingId}`;
export const TCG_MARKET_ACTIVE_KEY = "tcg:market:active";
export const TCG_MARKET_BY_CARD_KEY = "tcg:market:bycard";
export const tcgMarketLockKey = (id: string) => `tcg:market:lock:${id}`;

export const TCG_STORE_CONFIG_KEY = "tcg:store:config";
export const TCG_CLASH_CARDS_CONFIG_KEY = "tcg:clash:cards:config";
export const tcgCustomPackKey = (packId: string) => `tcg:pack:${packId}`;
export const TCG_CUSTOM_PACKS_INDEX_KEY = "tcg:packs:index";

export interface ClashGameCardsConfig {
  crewCards: CrewCardDefinition[];
  debuffCards: DebuffCardDefinition[];
  trackCards: TrackCardDefinition[];
  updatedAt?: number;
}

// ── P-Credits Ledger ────────────────────────────────────────────────────────

/** Read a member's current P-Credits balance. */
export async function getPCredits(userId: string): Promise<number> {
  if (!userId) return 0;
  const raw = await redis.hget(memberKey(userId), P_CREDITS_FIELD);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Add P-Credits to a member's balance. Returns the new balance. */
export async function grantPCredits(userId: string, amount: number): Promise<number> {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!userId || n <= 0) return getPCredits(userId);
  const next = await redis.hincrby(memberKey(userId), P_CREDITS_FIELD, n);
  return Math.max(0, next);
}

/**
 * Atomically spend P-Credits from a member's balance.
 * If the member doesn't have enough P-Credits, rolls back the deduction immediately
 * and returns `{ ok: false, balance }`.
 */
export async function spendPCredits(
  userId: string,
  amount: number
): Promise<{ ok: boolean; balance: number }> {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (!userId) return { ok: false, balance: 0 };
  if (cost === 0) return { ok: true, balance: await getPCredits(userId) };

  const after = await redis.hincrby(memberKey(userId), P_CREDITS_FIELD, -cost);
  if (after < 0) {
    const restored = await redis.hincrby(memberKey(userId), P_CREDITS_FIELD, cost);
    return { ok: false, balance: Math.max(0, restored) };
  }
  return { ok: true, balance: after };
}

/**
 * Atomically transfer P-Credits from buyer to seller.
 */
export async function transferPCredits(
  fromUserId: string,
  toUserId: string,
  amount: number
): Promise<{ ok: boolean; buyerBalance: number }> {
  const spent = await spendPCredits(fromUserId, amount);
  if (!spent.ok) return { ok: false, buyerBalance: spent.balance };
  await grantPCredits(toUserId, amount);
  return { ok: true, buyerBalance: spent.balance };
}

// ── Marketplace Storage ─────────────────────────────────────────────────────

export function parseMarketListing(raw: unknown): TcgMarketListing | null {
  try {
    const val = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!val || typeof val !== "object") return null;
    const l = val as TcgMarketListing;
    if (
      typeof l.id !== "string" ||
      typeof l.cardId !== "string" ||
      typeof l.sellerId !== "string" ||
      typeof l.price !== "number" ||
      !l.card
    ) {
      return null;
    }
    return l;
  } catch {
    return null;
  }
}

/** Return the active listing ID for a card, or null if not listed. */
export async function getListingIdForCard(cardId: string): Promise<string | null> {
  if (!cardId) return null;
  const id = await redis.hget<string>(TCG_MARKET_BY_CARD_KEY, cardId);
  return id ? String(id) : null;
}

/** Remove a marketplace listing and clean up its indices. */
export async function removeMarketListingRecord(listingId: string, cardId?: string): Promise<void> {
  let resolvedCardId = cardId;
  if (!resolvedCardId) {
    const existing = parseMarketListing(await redis.get(tcgMarketListingKey(listingId)));
    resolvedCardId = existing?.cardId;
  }
  const tx = redis.multi().del(tcgMarketListingKey(listingId)).zrem(TCG_MARKET_ACTIVE_KEY, listingId);
  if (resolvedCardId) {
    tx.hdel(TCG_MARKET_BY_CARD_KEY, resolvedCardId);
  }
  await tx.exec();
}

/** List all active marketplace listings, newest first. */
export async function listActiveMarketListings(limit = 200): Promise<TcgMarketListing[]> {
  const ids = (await redis.zrange(TCG_MARKET_ACTIVE_KEY, 0, limit - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => tcgMarketListingKey(String(id))));
  const out: TcgMarketListing[] = [];
  for (let i = 0; i < ids.length; i++) {
    const parsed = parseMarketListing(rows[i]);
    if (parsed) {
      out.push(parsed);
    } else {
      // Clean up stale index entry
      await redis.zrem(TCG_MARKET_ACTIVE_KEY, String(ids[i])).catch(() => {});
    }
  }
  return out;
}

/** Attach `listingId` and `listedPrice` to any cards currently listed on the Marketplace. */
export async function attachListingStateToCards(cards: MemberCard[]): Promise<MemberCard[]> {
  if (cards.length === 0) return cards;
  const byCard = (await redis.hgetall<Record<string, string>>(TCG_MARKET_BY_CARD_KEY)) ?? {};
  const listedCardIds = cards.filter((c) => Boolean(byCard[c.id])).map((c) => c.id);
  if (listedCardIds.length === 0) return cards;

  const listingIds = listedCardIds.map((cId) => String(byCard[cId]));
  const rows = await redis.mget(...listingIds.map((lId) => tcgMarketListingKey(lId)));
  const priceByCardId = new Map<string, { listingId: string; price: number }>();

  for (let i = 0; i < listingIds.length; i++) {
    const parsed = parseMarketListing(rows[i]);
    if (parsed) {
      priceByCardId.set(parsed.cardId, { listingId: parsed.id, price: parsed.price });
    }
  }

  return cards.map((c) => {
    const info = priceByCardId.get(c.id);
    return info ? { ...c, listingId: info.listingId, listedPrice: info.price } : c;
  });
}

// ── Pack Store & Custom Packs Storage ───────────────────────────────────────

function sanitizePCreditBundles(rawBundles: unknown): PCreditBundle[] {
  if (!Array.isArray(rawBundles) || rawBundles.length === 0) {
    return P_CREDIT_BUNDLES.map((b) => ({ ...b }));
  }
  const byId = new Map<string, Partial<PCreditBundle>>();
  for (const item of rawBundles) {
    if (item && typeof item === "object" && typeof (item as PCreditBundle).id === "string") {
      byId.set((item as PCreditBundle).id, item as Partial<PCreditBundle>);
    }
  }
  return P_CREDIT_BUNDLES.map((def) => {
    const custom = byId.get(def.id);
    if (!custom) return { ...def };
    const pCredits = Math.max(10, Math.min(1_000_000, Math.round(Number(custom.pCredits) || def.pCredits)));
    const priceGbpRaw = Number(custom.priceGbp);
    const priceGbp =
      Number.isFinite(priceGbpRaw) && priceGbpRaw >= 0.5
        ? Math.round(priceGbpRaw * 100) / 100
        : def.priceGbp;
    const saleRaw =
      custom.salePriceGbp !== null && custom.salePriceGbp !== undefined && String(custom.salePriceGbp) !== ""
        ? Number(custom.salePriceGbp)
        : null;
    const salePriceGbp =
      saleRaw !== null && Number.isFinite(saleRaw) && saleRaw >= 0.5 && saleRaw < priceGbp
        ? Math.round(saleRaw * 100) / 100
        : null;
    return {
      id: def.id,
      name: typeof custom.name === "string" && custom.name.trim() ? custom.name.trim().slice(0, 40) : def.name,
      pCredits,
      priceGbp,
      salePriceGbp,
      badge: typeof custom.badge === "string" ? custom.badge.trim().slice(0, 24) || undefined : def.badge,
      description:
        typeof custom.description === "string" && custom.description.trim()
          ? custom.description.trim().slice(0, 140)
          : def.description,
    };
  });
}

export async function getTcgStoreConfig(): Promise<TcgStoreConfig> {
  try {
    const raw = await redis.get(TCG_STORE_CONFIG_KEY);
    if (!raw) {
      return {
        standardPackPrice: DEFAULT_STANDARD_PACK_PRICE,
        standardPackSalePrice: null,
        pCreditBundles: P_CREDIT_BUNDLES.map((b) => ({ ...b })),
        updatedAt: 0,
      };
    }
    const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as Partial<TcgStoreConfig>);
    const price = Number(parsed?.standardPackPrice);
    const standardPackPrice =
      Number.isFinite(price) && price >= 1 ? Math.floor(price) : DEFAULT_STANDARD_PACK_PRICE;
    const saleRaw =
      parsed?.standardPackSalePrice !== null && parsed?.standardPackSalePrice !== undefined
        ? Math.floor(Number(parsed.standardPackSalePrice))
        : null;
    const standardPackSalePrice = isOnSale(standardPackPrice, saleRaw) ? saleRaw : null;

    return {
      standardPackPrice,
      standardPackSalePrice,
      pCreditBundles: sanitizePCreditBundles(parsed?.pCreditBundles),
      updatedAt: Number(parsed?.updatedAt) || 0,
    };
  } catch {
    return {
      standardPackPrice: DEFAULT_STANDARD_PACK_PRICE,
      standardPackSalePrice: null,
      pCreditBundles: P_CREDIT_BUNDLES.map((b) => ({ ...b })),
      updatedAt: 0,
    };
  }
}

export async function setTcgStoreConfig(config: Partial<TcgStoreConfig>): Promise<TcgStoreConfig> {
  const current = await getTcgStoreConfig();
  const standardPackPrice =
    config.standardPackPrice !== undefined
      ? Math.max(1, Math.floor(Number(config.standardPackPrice) || DEFAULT_STANDARD_PACK_PRICE))
      : current.standardPackPrice;

  const rawSale =
    config.standardPackSalePrice !== undefined
      ? config.standardPackSalePrice === null
        ? null
        : Math.floor(Number(config.standardPackSalePrice))
      : current.standardPackSalePrice;

  const standardPackSalePrice = isOnSale(standardPackPrice, rawSale) ? rawSale : null;

  const pCreditBundles =
    config.pCreditBundles !== undefined
      ? sanitizePCreditBundles(config.pCreditBundles)
      : current.pCreditBundles;

  const next: TcgStoreConfig = {
    standardPackPrice,
    standardPackSalePrice,
    pCreditBundles,
    updatedAt: Date.now(),
  };
  await redis.set(TCG_STORE_CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function parseCustomPack(raw: unknown): TcgCustomPack | null {
  try {
    const val = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!val || typeof val !== "object") return null;
    const p = val as TcgCustomPack;
    if (typeof p.id !== "string" || typeof p.name !== "string") return null;
    const cards: TcgCustomPackCardEntry[] = Array.isArray(p.cards)
      ? p.cards
          .map((c) => ({
            cardId: String(c?.cardId || "").trim(),
            weight: Math.max(1, Math.min(100, Math.round(Number(c?.weight) || 10))),
          }))
          .filter((c) => Boolean(c.cardId))
      : [];
    const price = Math.max(1, Math.floor(Number(p.price) || DEFAULT_STANDARD_PACK_PRICE));
    const saleRaw =
      p.salePrice !== null && p.salePrice !== undefined && String(p.salePrice) !== ""
        ? Math.floor(Number(p.salePrice))
        : null;
    const salePrice = isOnSale(price, saleRaw) ? saleRaw : null;

    return {
      id: p.id,
      name: p.name.trim(),
      description: typeof p.description === "string" ? p.description.trim() : "",
      price,
      salePrice,
      status: p.status === "live" ? "live" : "draft",
      cardsPerPack: Math.max(1, Math.min(3, Math.floor(Number(p.cardsPerPack) || 1))),
      cards,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

/** Hydrate a list of custom packs with their actual `FullArtCardData` set list records. */
export async function hydrateCustomPacks(packs: TcgCustomPack[]): Promise<TcgCustomPackWithCards[]> {
  if (packs.length === 0) return [];
  const allCardIds = [...new Set(packs.flatMap((p) => p.cards.map((c) => c.cardId)))];
  const cardMap = new Map<string, FullArtCardData>();

  if (allCardIds.length > 0) {
    const rows = await redis.mget(...allCardIds.map((id) => fullArtCardKey(id)));
    for (let i = 0; i < allCardIds.length; i++) {
      const raw = rows[i];
      if (!raw) continue;
      try {
        const val = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (val && typeof val === "object") {
          const clean = sanitizeFullArtCard(val as Partial<FullArtCardData>);
          if (clean.imageUrl) {
            cardMap.set(allCardIds[i], { ...clean, id: allCardIds[i] });
          }
        }
      } catch {
        /* ignore malformed card */
      }
    }
  }

  return packs.map((pack) => {
    const validEntries = pack.cards
      .map((entry) => {
        const card = cardMap.get(entry.cardId);
        return card ? { card, weight: entry.weight } : null;
      })
      .filter((e): e is { card: FullArtCardData; weight: number } => e !== null);

    const totalWeight = validEntries.reduce((sum, e) => sum + e.weight, 0);
    const setList = validEntries.map((e) => ({
      card: e.card,
      weight: e.weight,
      chancePct: totalWeight > 0 ? Math.round((e.weight / totalWeight) * 1000) / 10 : 0,
    }));

    return {
      ...pack,
      cards: validEntries.map((e) => ({ cardId: e.card.id!, weight: e.weight })),
      setList,
    };
  });
}

/** List custom packs (either all for admin, or only `live` packs with at least 1 card for members). */
export async function listCustomPacks(options?: { onlyLive?: boolean }): Promise<TcgCustomPackWithCards[]> {
  const ids = (await redis.zrange(TCG_CUSTOM_PACKS_INDEX_KEY, 0, 99, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => tcgCustomPackKey(String(id))));
  const packs = rows.map(parseCustomPack).filter((p): p is TcgCustomPack => p !== null);
  const hydrated = await hydrateCustomPacks(packs);
  if (options?.onlyLive) {
    return hydrated.filter((p) => p.status === "live" && p.setList.length > 0);
  }
  return hydrated;
}

// ── Clash Game Cards Config (Crew Cards, Debuff Cards, UK Track Cards) ──────

function mergeCardPool<T extends { id: string }>(defaults: T[], saved?: T[]): T[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaults;
  const savedById = new Map<string, T>();
  for (const item of saved) {
    if (item && typeof item.id === "string") {
      savedById.set(item.id, item);
    }
  }
  const merged: T[] = defaults.map((def) => {
    const override = savedById.get(def.id);
    if (override) {
      savedById.delete(def.id);
      return { ...def, ...override };
    }
    return def;
  });
  for (const custom of savedById.values()) {
    merged.push(custom);
  }
  return merged;
}

/**
 * Load the active Crew Cards, Debuff Cards, and UK Track Cards (merging any admin edits or
 * bespoke cards stored in Redis with the built-in sets).
 */
export async function getClashGameCardsConfig(): Promise<ClashGameCardsConfig> {
  try {
    const raw = await redis.get(TCG_CLASH_CARDS_CONFIG_KEY);
    if (!raw) {
      return {
        crewCards: CREW_CARD_SET,
        debuffCards: DEBUFF_CARD_SET,
        trackCards: UK_TRACK_CARD_SET,
      };
    }
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<ClashGameCardsConfig>;
    return {
      crewCards: mergeCardPool(CREW_CARD_SET, parsed.crewCards),
      debuffCards: mergeCardPool(DEBUFF_CARD_SET, parsed.debuffCards),
      trackCards: mergeCardPool(UK_TRACK_CARD_SET, parsed.trackCards).map((t) => ({
        ...t,
        tier: "gold",
      })),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch (error) {
    console.error("[tcg] getClashGameCardsConfig error:", error);
    return {
      crewCards: CREW_CARD_SET,
      debuffCards: DEBUFF_CARD_SET,
      trackCards: UK_TRACK_CARD_SET,
    };
  }
}

export async function saveClashGameCardsConfig(
  config: ClashGameCardsConfig
): Promise<ClashGameCardsConfig> {
  const payload: ClashGameCardsConfig = {
    crewCards: config.crewCards,
    debuffCards: config.debuffCards,
    trackCards: config.trackCards,
    updatedAt: Date.now(),
  };
  await redis.set(TCG_CLASH_CARDS_CONFIG_KEY, JSON.stringify(payload));
  return payload;
}


