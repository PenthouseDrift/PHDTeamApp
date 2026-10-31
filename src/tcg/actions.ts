"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { grantCardCredits, getCardCredits } from "@/lib/card-credits";
import { deleteImage } from "@/lib/blob";
import { isBlobUrl } from "@/lib/card-art-generate";
import {
  ALL_MEMBER_CARDS_INDEX,
  MEMBER_CARD_ID_PATTERN,
  memberCardKey,
  memberCardsIndexKey,
  parseStoredCard,
  removeFromCommunityPool,
} from "@/lib/member-card-store";
import type { MemberCard, StoredMemberCard } from "@/lib/card-roll";
import type { ActionResult } from "@/types";
import {
  DEFAULT_STANDARD_PACK_PRICE,
  MAX_MARKET_LISTING_PRICE,
  MIN_MARKET_LISTING_PRICE,
  getEffectivePrice,
  getQuickSellPrice,
  isOnSale,
} from "./config";
import {
  TCG_CUSTOM_PACKS_INDEX_KEY,
  TCG_MARKET_ACTIVE_KEY,
  TCG_MARKET_BY_CARD_KEY,
  getClashGameCardsConfig,
  getListingIdForCard,
  getPCredits,
  getTcgStoreConfig,
  grantPCredits,
  hydrateCustomPacks,
  listActiveMarketListings,
  listCustomPacks,
  parseCustomPack,
  parseMarketListing,
  removeMarketListingRecord,
  saveClashGameCardsConfig,
  setTcgStoreConfig,
  spendPCredits,
  tcgCustomPackKey,
  tcgMarketListingKey,
  tcgMarketLockKey,
  transferPCredits,
  type ClashGameCardsConfig,
} from "./storage";
import type {
  PCreditBundle,
  TcgCustomPack,
  TcgCustomPackCardEntry,
  TcgCustomPackWithCards,
  TcgMarketListing,
  TcgPackStatus,
  TcgStoreConfig,
} from "./types";

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

async function currentUser(): Promise<{ id: string; name: string; role?: string } | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const memberData = await redis.hmget<Record<string, unknown>>(`member:${id}`, "nickname", "name");
  const nickname = typeof memberData?.nickname === "string" ? memberData.nickname.trim() : "";
  const profileName = typeof memberData?.name === "string" ? memberData.name.trim() : "";
  const name = nickname || profileName || session?.user?.name?.trim() || "Member";
  return { id, name, role: session?.user?.role };
}

function publicCard(stored: StoredMemberCard): MemberCard {
  const { referenceUrl, ...card } = stored;
  void referenceUrl;
  return card;
}

// ── P-Credits & SumUp Checkout ──────────────────────────────────────────────

export async function getMyTcgBalances(): Promise<{ pCredits: number; packCredits: number }> {
  const user = await currentUser();
  if (!user) return { pCredits: 0, packCredits: 0 };
  const [pCredits, packCredits] = await Promise.all([
    getPCredits(user.id),
    getCardCredits(user.id),
  ]);
  return { pCredits, packCredits };
}

export async function createPCreditsCheckout(
  bundleId: string
): Promise<
  ActionResult<{
    url: string;
    checkoutId: string;
    amount: number;
    currency: string;
    email?: string;
    bundleName: string;
    pCredits: number;
  }>
> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in to purchase P-Credits." };

    const storeConfig = await getTcgStoreConfig();
    const bundle = storeConfig.pCreditBundles.find((b) => b.id === bundleId);
    if (!bundle) return { success: false, error: "Invalid P-Credits bundle selected." };

    const { createCheckout } = await import("@/lib/sumup");
    const { CURRENCY } = await import("@/lib/pricing");
    const memberEmail = (await redis.hget(`member:${user.id}`, "email")) as string | null;

    const effectiveGbp = getEffectivePrice(bundle.priceGbp, bundle.salePriceGbp);
    const totalAmount = Math.round(effectiveGbp * 100) / 100;
    const itemLabel = `${bundle.name} (${bundle.pCredits.toLocaleString()} P-Credits)`;
    const description = `Penthouse TCG - ${itemLabel} - ${user.name}`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${baseUrl}/cards?tab=p-credits`;

    const checkout = await createCheckout({
      memberId: `pcredits_${user.id}_${bundle.pCredits}`,
      amount: totalAmount,
      currency: CURRENCY,
      description,
      returnUrl,
    });

    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: user.id,
        itemType: "pcredits",
        quantity: bundle.pCredits,
        itemLabel: bundle.name,
        checkoutReference: checkout.checkout_reference,
        amount: totalAmount,
        currency: CURRENCY,
        createdAt: Date.now(),
      }),
      { ex: 86400 * 30 }
    );
    await redis.set(`pending_pcredits_checkout:${user.id}`, checkout.id, { ex: 86400 });

    const { registerPendingCheckout } = await import("@/lib/pending-checkouts");
    await registerPendingCheckout(checkout.id);

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    return {
      success: true,
      data: {
        url: redirectUrl,
        checkoutId: checkout.id,
        amount: totalAmount,
        currency: CURRENCY,
        email: memberEmail || undefined,
        bundleName: bundle.name,
        pCredits: bundle.pCredits,
      },
    };
  } catch (error) {
    console.error("[tcg] createPCreditsCheckout error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start P-Credits checkout",
    };
  }
}

// ── Quick Sell ──────────────────────────────────────────────────────────────

/**
 * Quick-sell a card for its fixed rarity P-Credits payout:
 *   Bronze: 10, Silver: 25, Gold: 50, Legend: 100, Mythic: 250 P-Credits.
 * Permanently deletes the card and credits the member's P-Credits balance.
 */
export async function quickSellCard(
  cardId: string
): Promise<ActionResult<{ cardId: string; payout: number; pCredits: number }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in." };
  if (!MEMBER_CARD_ID_PATTERN.test(cardId)) return { success: false, error: "Invalid card." };

  const lock = await redis.set(tcgMarketLockKey(cardId), "1", { nx: true, ex: 30 });
  if (!lock) return { success: false, error: "This card is busy right now. Try again in a moment." };

  try {
    const card = parseStoredCard(await redis.get(memberCardKey(cardId)));
    if (!card || card.userId !== user.id || card.archived) {
      return { success: false, error: "We couldn't find that card in your collection." };
    }

    // If the card was listed on the Marketplace, remove its listing first
    const existingListingId = await getListingIdForCard(cardId);
    if (existingListingId) {
      await removeMarketListingRecord(existingListingId, cardId);
    }

    const payout = getQuickSellPrice(card);

    // Delete the card record and remove it from member & global indices
    await redis
      .multi()
      .del(memberCardKey(cardId))
      .zrem(memberCardsIndexKey(user.id), cardId)
      .zrem(ALL_MEMBER_CARDS_INDEX, cardId)
      .exec();

    // Update community pool
    await removeFromCommunityPool(card).catch(() => {});

    // Delete unique AI art blob if not shared with set/custom-pack cards
    if (!card.featured && !card.packId && isBlobUrl(card.imageUrl)) {
      try {
        await deleteImage(card.imageUrl);
      } catch {
        /* ignore leftover blob error */
      }
    }

    const newBalance = await grantPCredits(user.id, payout);

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");
    return {
      success: true,
      data: { cardId, payout, pCredits: newBalance },
    };
  } catch (error) {
    console.error("[tcg] quickSellCard failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not quick-sell card",
    };
  } finally {
    await redis.del(tcgMarketLockKey(cardId)).catch(() => {});
  }
}

// ── Card Marketplace (List, Unlist, Buy) ────────────────────────────────────

export async function getMarketListings(): Promise<TcgMarketListing[]> {
  return listActiveMarketListings();
}

export async function listCardOnMarket(
  cardId: string,
  pricePCredits: number
): Promise<ActionResult<{ card: MemberCard; listing: TcgMarketListing }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to list a card." };
  if (!MEMBER_CARD_ID_PATTERN.test(cardId)) return { success: false, error: "Invalid card." };

  const price = Math.round(Number(pricePCredits));
  if (!Number.isFinite(price) || price < MIN_MARKET_LISTING_PRICE || price > MAX_MARKET_LISTING_PRICE) {
    return {
      success: false,
      error: `Enter a price between ${MIN_MARKET_LISTING_PRICE} and ${MAX_MARKET_LISTING_PRICE.toLocaleString()} P-Credits.`,
    };
  }

  const lock = await redis.set(tcgMarketLockKey(cardId), "1", { nx: true, ex: 30 });
  if (!lock) return { success: false, error: "This card is busy right now. Try again in a moment." };

  try {
    const stored = parseStoredCard(await redis.get(memberCardKey(cardId)));
    if (!stored || stored.userId !== user.id || stored.archived) {
      return { success: false, error: "We couldn't find that card in your collection." };
    }

    const existingListingId = await getListingIdForCard(cardId);
    if (existingListingId) {
      await removeMarketListingRecord(existingListingId, cardId);
    }

    // Mark card as kept so it cannot be re-rolled while listed
    const updatedStored: StoredMemberCard = { ...stored, kept: true, ownerName: user.name };
    await redis.set(memberCardKey(cardId), JSON.stringify(updatedStored));

    const listingId = randomUUID();
    const now = Date.now();
    const listing: TcgMarketListing = {
      id: listingId,
      cardId,
      sellerId: user.id,
      sellerName: user.name,
      price,
      createdAt: now,
      card: publicCard(updatedStored),
    };

    await redis
      .multi()
      .set(tcgMarketListingKey(listingId), JSON.stringify(listing))
      .zadd(TCG_MARKET_ACTIVE_KEY, { score: now, member: listingId })
      .hset(TCG_MARKET_BY_CARD_KEY, { [cardId]: listingId })
      .exec();

    revalidatePath("/cards");
    return {
      success: true,
      data: {
        card: { ...publicCard(updatedStored), listingId, listedPrice: price },
        listing,
      },
    };
  } catch (error) {
    console.error("[tcg] listCardOnMarket failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not list card for sale",
    };
  } finally {
    await redis.del(tcgMarketLockKey(cardId)).catch(() => {});
  }
}

export async function unlistCardFromMarket(
  cardId: string
): Promise<ActionResult<{ cardId: string; card: MemberCard | null }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in." };
  if (!MEMBER_CARD_ID_PATTERN.test(cardId)) return { success: false, error: "Invalid card." };

  const lock = await redis.set(tcgMarketLockKey(cardId), "1", { nx: true, ex: 30 });
  if (!lock) return { success: false, error: "This card is busy right now. Try again in a moment." };

  try {
    const listingId = await getListingIdForCard(cardId);
    if (!listingId) {
      const stored = parseStoredCard(await redis.get(memberCardKey(cardId)));
      return {
        success: true,
        data: { cardId, card: stored ? publicCard(stored) : null },
      };
    }

    const listing = parseMarketListing(await redis.get(tcgMarketListingKey(listingId)));
    const stored = parseStoredCard(await redis.get(memberCardKey(cardId)));

    const isOwner =
      (listing && listing.sellerId === user.id) ||
      (stored && stored.userId === user.id) ||
      user.role === "admin";
    if (!isOwner) {
      return { success: false, error: "You can only unlist your own cards." };
    }

    await removeMarketListingRecord(listingId, cardId);
    revalidatePath("/cards");

    return {
      success: true,
      data: { cardId, card: stored ? publicCard(stored) : null },
    };
  } catch (error) {
    console.error("[tcg] unlistCardFromMarket failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not unlist card",
    };
  } finally {
    await redis.del(tcgMarketLockKey(cardId)).catch(() => {});
  }
}

/**
 * Purchase a listed card on the Marketplace with P-Credits.
 * Deducts P-Credits from the buyer, transfers P-Credits to the seller,
 * removes the card from the seller's collection, and adds it to the buyer's collection.
 */
export async function buyCardFromMarket(
  listingId: string
): Promise<ActionResult<{ card: MemberCard; pCredits: number; listingId: string }>> {
  const buyer = await currentUser();
  if (!buyer) return { success: false, error: "Please sign in to buy cards." };
  if (!MEMBER_CARD_ID_PATTERN.test(listingId)) return { success: false, error: "Invalid listing." };

  const listing = parseMarketListing(await redis.get(tcgMarketListingKey(listingId)));
  if (!listing) {
    return { success: false, error: "This listing is no longer available." };
  }
  if (listing.sellerId === buyer.id) {
    return { success: false, error: "You already own this card. You can unlist it instead." };
  }

  const lock = await redis.set(tcgMarketLockKey(listing.cardId), "1", { nx: true, ex: 30 });
  if (!lock) return { success: false, error: "Someone else is buying this card right now." };

  try {
    // Re-verify listing and card ownership under lock
    const freshListing = parseMarketListing(await redis.get(tcgMarketListingKey(listingId)));
    if (!freshListing) {
      return { success: false, error: "This card was just sold or unlisted." };
    }

    const storedCard = parseStoredCard(await redis.get(memberCardKey(freshListing.cardId)));
    if (!storedCard || storedCard.userId !== freshListing.sellerId || storedCard.archived) {
      await removeMarketListingRecord(listingId, freshListing.cardId);
      return { success: false, error: "This card is no longer available from the seller." };
    }

    // Atomically transfer P-Credits from buyer to seller
    const transfer = await transferPCredits(buyer.id, freshListing.sellerId, freshListing.price);
    if (!transfer.ok) {
      return {
        success: false,
        error: `Not enough P-Credits. You need ${freshListing.price.toLocaleString()} P-Credits (you have ${transfer.buyerBalance.toLocaleString()}).`,
      };
    }

    const now = Date.now();
    const transferredCard: StoredMemberCard = {
      ...storedCard,
      userId: buyer.id,
      ownerName: buyer.name,
      kept: true,
    };

    // Transfer ownership in Redis: remove from seller, add to buyer, update card record, and delete listing
    await redis
      .multi()
      .set(memberCardKey(transferredCard.id), JSON.stringify(transferredCard))
      .zrem(memberCardsIndexKey(freshListing.sellerId), transferredCard.id)
      .zadd(memberCardsIndexKey(buyer.id), { score: now, member: transferredCard.id })
      .del(tcgMarketListingKey(listingId))
      .zrem(TCG_MARKET_ACTIVE_KEY, listingId)
      .hdel(TCG_MARKET_BY_CARD_KEY, transferredCard.id)
      .exec();

    // Update community pool for the old owner
    await removeFromCommunityPool(storedCard).catch(() => {});

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");

    return {
      success: true,
      data: {
        card: publicCard(transferredCard),
        pCredits: transfer.buyerBalance,
        listingId,
      },
    };
  } catch (error) {
    console.error("[tcg] buyCardFromMarket failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to complete card purchase",
    };
  } finally {
    await redis.del(tcgMarketLockKey(listing.cardId)).catch(() => {});
  }
}

// ── Pack Store (Standard Pack & Custom Set Packs) ───────────────────────────

/**
 * Purchase 1 Standard Pack using P-Credits (at the admin-configured Standard Pack price, default 100 P-Credits).
 * Deducts P-Credits and adds 1 Standard Pack Credit so the member can open a Standard Pack of their car.
 */
export async function buyStandardPackWithPCredits(): Promise<
  ActionResult<{ pCredits: number; packCredits: number; pricePaid: number }>
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to buy a pack." };

  const storeConfig = await getTcgStoreConfig();
  const price = getEffectivePrice(storeConfig.standardPackPrice, storeConfig.standardPackSalePrice);

  const spent = await spendPCredits(user.id, price);
  if (!spent.ok) {
    return {
      success: false,
      error: `Not enough P-Credits. A Standard Pack costs ${price.toLocaleString()} P-Credits (you have ${spent.balance.toLocaleString()}).`,
    };
  }

  try {
    const newPackCredits = await grantCardCredits(user.id, 1);
    revalidatePath("/cards");
    revalidatePath("/cards/new");
    revalidateTag("admin-members", "max");
    return {
      success: true,
      data: {
        pCredits: spent.balance,
        packCredits: newPackCredits,
        pricePaid: price,
      },
    };
  } catch (error) {
    // Refund P-Credits if granting pack credit failed
    await grantPCredits(user.id, price).catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not purchase Standard Pack",
    };
  }
}

/**
 * Purchase and immediately open a Live Custom Set Pack using P-Credits.
 * Deducts `pack.price` P-Credits, rolls `pack.cardsPerPack` card(s) from the pack's
 * assigned set list weighted by each card's odds weight, saves them to the member's
 * collection, and returns them for the animated `PackOpening` reveal.
 */
export async function buyAndOpenCustomPack(
  packId: string
): Promise<ActionResult<{ cards: MemberCard[]; pCredits: number; packName: string }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to buy and open a pack." };
  if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

  const rawPack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
  if (!rawPack || rawPack.status !== "live") {
    return { success: false, error: "This pack is not currently available in the store." };
  }

  const [hydrated] = await hydrateCustomPacks([rawPack]);
  if (!hydrated || hydrated.setList.length === 0) {
    return { success: false, error: "This pack doesn't have any cards in its set list yet." };
  }

  const effectivePackPrice = getEffectivePrice(hydrated.price, hydrated.salePrice);
  const spent = await spendPCredits(user.id, effectivePackPrice);
  if (!spent.ok) {
    return {
      success: false,
      error: `Not enough P-Credits. "${hydrated.name}" costs ${effectivePackPrice.toLocaleString()} P-Credits (you have ${spent.balance.toLocaleString()}).`,
    };
  }

  try {
    const totalWeight = hydrated.setList.reduce((sum, item) => sum + item.weight, 0);
    const pickOne = () => {
      let r = rng() * totalWeight;
      for (const entry of hydrated.setList) {
        if (r < entry.weight) return entry.card;
        r -= entry.weight;
      }
      return hydrated.setList[hydrated.setList.length - 1].card;
    };

    const count = Math.max(1, Math.min(3, hydrated.cardsPerPack || 1));
    const pulled: StoredMemberCard[] = [];
    const baseNow = Date.now();

    const tx = redis.multi();
    for (let i = 0; i < count; i++) {
      const source = pickOne();
      const createdAt = baseNow + i;
      const stored: StoredMemberCard = {
        id: randomUUID(),
        userId: user.id,
        createdAt,
        name: source.name,
        ability: source.ability,
        effect: source.effect,
        tier: source.tier,
        stats: source.stats,
        imageUrl: source.imageUrl,
        imageZoom: source.imageZoom,
        imageX: source.imageX,
        imageY: source.imageY,
        driver: source.driver,
        team: source.team,
        styleIds: [],
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: "",
        featured: true,
        bonusFromCardId: source.id,
        packId: hydrated.id,
        packName: hydrated.name,
      };
      pulled.push(stored);
      tx.set(memberCardKey(stored.id), JSON.stringify(stored));
      tx.zadd(memberCardsIndexKey(user.id), { score: createdAt, member: stored.id });
      tx.zadd(ALL_MEMBER_CARDS_INDEX, { score: createdAt, member: stored.id });
    }
    tx.hincrby(`member:${user.id}`, "packsOpened", 1);
    await tx.exec();

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");
    revalidateTag("admin-members", "max");

    return {
      success: true,
      data: {
        cards: pulled.map(publicCard),
        pCredits: spent.balance,
        packName: hydrated.name,
      },
    };
  } catch (error) {
    // Refund P-Credits if rolling/saving failed
    await grantPCredits(user.id, effectivePackPrice).catch(() => {});
    console.error("[tcg] buyAndOpenCustomPack failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to open custom pack",
    };
  }
}

// ── Admin Pack & Store Management Actions ───────────────────────────────────

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function updateStandardPackPriceAction(
  pricePCredits: number,
  salePricePCredits?: number | null
): Promise<ActionResult<TcgStoreConfig>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can update store pricing." };
    }
    const price = Math.round(Number(pricePCredits));
    if (!Number.isFinite(price) || price < 1 || price > 100_000) {
      return { success: false, error: "Standard pack price must be between 1 and 100,000 P-Credits." };
    }
    let salePrice: number | null = null;
    if (salePricePCredits !== null && salePricePCredits !== undefined && Number(salePricePCredits) > 0) {
      const parsedSale = Math.round(Number(salePricePCredits));
      if (!Number.isFinite(parsedSale) || parsedSale < 1 || parsedSale >= price) {
        return {
          success: false,
          error: "Sale price must be at least 1 P-Credit and strictly less than the regular price.",
        };
      }
      salePrice = parsedSale;
    }
    const updated = await setTcgStoreConfig({
      standardPackPrice: price,
      standardPackSalePrice: salePrice,
    });
    revalidatePath("/cards");
    revalidatePath("/admin/card-maker");
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not update Standard Pack price",
    };
  }
}

export async function updatePCreditBundlesAction(
  bundles: PCreditBundle[]
): Promise<ActionResult<TcgStoreConfig>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can update P-Credit bundle prices." };
    }
    for (const b of bundles) {
      const priceGbp = Number(b.priceGbp);
      if (!Number.isFinite(priceGbp) || priceGbp < 0.5 || priceGbp > 10_000) {
        return { success: false, error: `Invalid GBP price for "${b.name}". Minimum is £0.50.` };
      }
      if (b.salePriceGbp !== null && b.salePriceGbp !== undefined && Number(b.salePriceGbp) > 0) {
        const saleGbp = Number(b.salePriceGbp);
        if (!Number.isFinite(saleGbp) || saleGbp < 0.5 || saleGbp >= priceGbp) {
          return {
            success: false,
            error: `Sale price for "${b.name}" must be at least £0.50 and less than the regular price (£${priceGbp.toFixed(2)}).`,
          };
        }
      }
    }
    const updated = await setTcgStoreConfig({ pCreditBundles: bundles });
    revalidatePath("/cards");
    revalidatePath("/admin/card-maker");
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not update P-Credit bundle prices",
    };
  }
}

export interface SaveCustomPackInput {
  id?: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number | null;
  status: TcgPackStatus;
  cardsPerPack?: number;
  cards: TcgCustomPackCardEntry[];
}

export async function saveCustomPackAction(
  input: SaveCustomPackInput
): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can create or edit custom packs." };
    }

    const name = String(input.name ?? "").trim().slice(0, 60);
    if (!name) return { success: false, error: "Give the pack a name." };

    const description = String(input.description ?? "").trim().slice(0, 200);
    const price = Math.max(1, Math.min(100_000, Math.round(Number(input.price) || DEFAULT_STANDARD_PACK_PRICE)));
    let salePrice: number | null = null;
    if (input.salePrice !== null && input.salePrice !== undefined && Number(input.salePrice) > 0) {
      const parsedSale = Math.round(Number(input.salePrice));
      if (!Number.isFinite(parsedSale) || parsedSale < 1 || parsedSale >= price) {
        return {
          success: false,
          error: "Pack sale price must be at least 1 P-Credit and less than the regular pack price.",
        };
      }
      salePrice = isOnSale(price, parsedSale) ? parsedSale : null;
    }

    const status: TcgPackStatus = input.status === "live" ? "live" : "draft";
    const cardsPerPack = Math.max(1, Math.min(3, Math.round(Number(input.cardsPerPack) || 1)));

    const seen = new Set<string>();
    const cleanCards: TcgCustomPackCardEntry[] = [];
    for (const c of input.cards ?? []) {
      const cardId = String(c?.cardId ?? "").trim();
      if (!cardId || !MEMBER_CARD_ID_PATTERN.test(cardId) || seen.has(cardId)) continue;
      seen.add(cardId);
      const weight = Math.max(1, Math.min(100, Math.round(Number(c?.weight) || 10)));
      cleanCards.push({ cardId, weight });
    }

    if (status === "live" && cleanCards.length === 0) {
      return {
        success: false,
        error: "Assign at least 1 saved Full-Art card to the pack's set list before setting it Live.",
      };
    }

    const now = Date.now();
    const id = input.id && MEMBER_CARD_ID_PATTERN.test(input.id) ? input.id : randomUUID();
    const existing = input.id ? parseCustomPack(await redis.get(tcgCustomPackKey(id))) : null;

    const pack: TcgCustomPack = {
      id,
      name,
      description,
      price,
      salePrice,
      status,
      cardsPerPack,
      cards: cleanCards,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await redis
      .multi()
      .set(tcgCustomPackKey(id), JSON.stringify(pack))
      .zadd(TCG_CUSTOM_PACKS_INDEX_KEY, { score: pack.createdAt, member: id })
      .exec();

    const [hydrated] = await hydrateCustomPacks([pack]);
    revalidatePath("/cards");
    revalidatePath("/admin/card-maker");

    return { success: true, data: hydrated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not save custom pack",
    };
  }
}

export async function setCustomPackStatusAction(
  packId: string,
  status: TcgPackStatus
): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can update packs." };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

    const existing = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!existing) return { success: false, error: "Pack not found." };

    return saveCustomPackAction({
      ...existing,
      status,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not update pack status",
    };
  }
}

export async function updateCustomPackPricingAction(
  packId: string,
  price: number,
  salePrice?: number | null
): Promise<ActionResult<TcgCustomPackWithCards>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can update pack pricing." };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

    const existing = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
    if (!existing) return { success: false, error: "Pack not found." };

    return saveCustomPackAction({
      ...existing,
      price,
      salePrice,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not update pack pricing",
    };
  }
}

export async function deleteCustomPackAction(packId: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can delete packs." };
    if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

    await redis
      .multi()
      .del(tcgCustomPackKey(packId))
      .zrem(TCG_CUSTOM_PACKS_INDEX_KEY, packId)
      .exec();

    revalidatePath("/cards");
    revalidatePath("/admin/card-maker");
    return { success: true, data: { id: packId } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not delete custom pack",
    };
  }
}

export async function listAdminCustomPacksAction(): Promise<TcgCustomPackWithCards[]> {
  if (!(await requireAdmin())) return [];
  return listCustomPacks({ onlyLive: false });
}

export async function getClashGameCardsConfigAction(): Promise<ClashGameCardsConfig> {
  return getClashGameCardsConfig();
}

export async function saveClashGameCardsConfigAction(
  config: ClashGameCardsConfig
): Promise<ActionResult<ClashGameCardsConfig>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can manage Crew, Debuff, and UK Track cards." };
    }
    const saved = await saveClashGameCardsConfig(config);
    revalidatePath("/cards");
    revalidatePath("/admin/card-maker");
    revalidatePath("/admin/member-cards");
    return { success: true, data: saved };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not save Clash game cards",
    };
  }
}

export async function grantClashEarlyAccessAction(
  targetUserId: string
): Promise<ActionResult<{ granted: boolean; targetUserId: string }>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can grant Tandem Clash Early Access." };
    }
    const { grantClashEarlyAccess } = await import("./clash");
    await grantClashEarlyAccess(targetUserId);
    revalidatePath("/cards");
    revalidatePath("/admin/members");
    revalidatePath("/admin/member-cards");
    return { success: true, data: { granted: true, targetUserId } };
  } catch (error) {
    console.error("[tcg] grantClashEarlyAccessAction error:", error);
    return { success: false, error: "Failed to grant early access." };
  }
}

export async function revokeClashEarlyAccessAction(
  targetUserId: string
): Promise<ActionResult<{ revoked: boolean; targetUserId: string }>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can revoke Tandem Clash Early Access." };
    }
    const { revokeClashEarlyAccess } = await import("./clash");
    await revokeClashEarlyAccess(targetUserId);
    revalidatePath("/cards");
    revalidatePath("/admin/members");
    revalidatePath("/admin/member-cards");
    return { success: true, data: { revoked: true, targetUserId } };
  } catch (error) {
    console.error("[tcg] revokeClashEarlyAccessAction error:", error);
    return { success: false, error: "Failed to revoke early access." };
  }
}

export interface EarlyAccessMemberItem {
  id: string;
  name: string;
  email: string;
  role: string;
  hasEarlyAccess: boolean;
}

export async function listClashEarlyAccessRosterAction(): Promise<
  ActionResult<EarlyAccessMemberItem[]>
> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can view the early access roster." };
    }
    const { getMemberRoster } = await import("@/lib/member-roster");
    const { getClashEarlyAccessUserIds } = await import("./clash");
    const [roster, earlyAccessIds] = await Promise.all([
      getMemberRoster(),
      getClashEarlyAccessUserIds(),
    ]);
    const earlySet = new Set(earlyAccessIds);

    const data: EarlyAccessMemberItem[] = roster.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      hasEarlyAccess: m.role === "admin" || earlySet.has(m.id),
    }));

    return { success: true, data };
  } catch (error) {
    console.error("[tcg] listClashEarlyAccessRosterAction error:", error);
    return { success: false, error: "Failed to load member roster." };
  }
}

/**
 * Apply a Maintenance Consumable Card to repair a mechanical fault on a car card.
 * Reduces the car's cooldown battles by the card's repair power.
 * If cooldown reaches 0, the car is fully repaired and gets a fresh 2-10 battle counter.
 * The maintenance consumable card is consumed (deleted) from inventory.
 */
export async function applyMaintenanceRepairAction(input: {
  carCardId: string;
  maintenanceCardId: string;
}): Promise<
  ActionResult<{
    car: MemberCard;
    fullyRepaired: boolean;
    battlesRemaining: number;
    faultCleared: boolean;
  }>
> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in to repair cars." };

    const {
      memberCardKey,
      memberCardsIndexKey,
      ALL_MEMBER_CARDS_INDEX,
      parseStoredCard,
    } = await import("@/lib/member-card-store");
    const { rollCarInitialDurability } = await import("@/lib/mechanical-faults");

    const [carRaw, maintRaw] = await Promise.all([
      redis.get(memberCardKey(input.carCardId)),
      redis.get(memberCardKey(input.maintenanceCardId)),
    ]);

    const car = parseStoredCard(carRaw);
    const maint = parseStoredCard(maintRaw);

    if (!car || car.userId !== user.id) {
      return { success: false, error: "Car card not found in your collection." };
    }
    if (!maint || maint.userId !== user.id) {
      return { success: false, error: "Maintenance card not found in your collection." };
    }
    if (maint.cardType !== "maintenance") {
      return { success: false, error: "The chosen card is not a Maintenance Consumable." };
    }
    if (!car.fault || car.fault.battlesRemaining <= 0) {
      return { success: false, error: "This car does not have an active mechanical fault." };
    }
    if (car.fault.type !== maint.targetFault) {
      return {
        success: false,
        error: `This card repairs ${maint.team || maint.name}, but this car has an ${car.fault.name}.`,
      };
    }

    const repairPower = maint.repairBattles ?? 1;
    const remaining = Math.max(0, car.fault.battlesRemaining - repairPower);
    const fullyRepaired = remaining <= 0;

    if (fullyRepaired) {
      car.fault = null;
      const freshDurability = rollCarInitialDurability();
      car.maxBattles = freshDurability;
      car.battlesRemaining = freshDurability;
    } else {
      car.fault.battlesRemaining = remaining;
    }

    // Save updated car
    await redis.set(memberCardKey(car.id), JSON.stringify(car));

    // Consume the maintenance card (delete it completely from user cards)
    await Promise.all([
      redis.del(memberCardKey(maint.id)),
      redis.zrem(memberCardsIndexKey(user.id), maint.id),
      redis.zrem(ALL_MEMBER_CARDS_INDEX, maint.id),
    ]);

    revalidatePath("/cards");

    return {
      success: true,
      data: {
        car,
        fullyRepaired,
        battlesRemaining: car.battlesRemaining ?? 0,
        faultCleared: fullyRepaired,
      },
    };
  } catch (error) {
    console.error("[tcg] applyMaintenanceRepairAction error:", error);
    return { success: false, error: "Failed to apply maintenance repair." };
  }
}



