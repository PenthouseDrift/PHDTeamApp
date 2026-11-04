"use server";

import { hostedCheckoutUrl } from "@/lib/sumup-urls";
import { randomInt, randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { grantCardCredits, getCardCredits, refundCardCredit, spendCardCredit } from "@/lib/card-credits";
import { deleteImage } from "@/lib/blob";
import { isBlobUrl } from "@/lib/card-art-generate";
import {
  ALL_MEMBER_CARDS_INDEX,
  MEMBER_CARD_ID_PATTERN,
  memberCardKey,
  memberCardsIndexKey,
  addToCommunityPool,
  parseStoredCard,
  pickCommunityCardSource,
  removeFromCommunityPool,
} from "@/lib/member-card-store";
import { MEMBER_ART_ZOOM, cardTitle, type MemberCard, type StoredMemberCard } from "@/lib/card-roll";
import { CardArtError } from "@/lib/card-art-generate";
import { applyVariant, rollPackCard } from "@/lib/pack-config";
import { deletePackConfig, entryAvailable, loadPackConfig, loadRuntimeFor, rollPackBonus } from "@/lib/pack-config-store";
import { buildBonusCard } from "@/lib/pack-bonus";
import { rollAndDrawSlot, slotOverrides } from "@/lib/pack-draw";
import { rollCarInitialDurability } from "@/lib/mechanical-faults";
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
import { buildPackContents, type PackContents } from "./pack-contents";
import { buildPackExtraCards } from "./pack-extras";
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

    const redirectUrl = hostedCheckoutUrl(checkout.id, checkout.hosted_checkout_url);
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

/** How a store pack is paid for: its P-Credit price, or one card credit when the pack allows that. */
export type PackPayment = "pcredits" | "cardCredit";

/**
 * Take payment for opening a store pack: its price in P-Credits, or 1 card credit if the member asked for that and the
 * pack allows it. Returns a way to give the same thing back if the pack then fails to open.
 */
async function chargeForPack(
  userId: string,
  pack: TcgCustomPackWithCards,
  payWith: PackPayment | undefined
): Promise<{ ok: true; pCredits: number; refund: () => Promise<void> } | { ok: false; error: string }> {
  if (payWith === "cardCredit") {
    if (!pack.allowCardCredits) return { ok: false, error: `"${pack.name}" can't be opened with a card credit.` };
    if (!(await spendCardCredit(userId))) return { ok: false, error: "You don't have a card credit to use." };
    return { ok: true, pCredits: await getPCredits(userId), refund: () => refundCardCredit(userId) };
  }
  const price = getEffectivePrice(pack.price, pack.salePrice);
  const spent = await spendPCredits(userId, price);
  if (!spent.ok) {
    return {
      ok: false,
      error: `Not enough P-Credits. "${pack.name}" costs ${price.toLocaleString()} P-Credits (you have ${spent.balance.toLocaleString()}).`,
    };
  }
  return { ok: true, pCredits: spent.balance, refund: async () => void (await grantPCredits(userId, price)) };
}

/**
 * Purchase and immediately open a Live Custom Set Pack using P-Credits.
 * Deducts `pack.price` P-Credits, rolls `pack.cardsPerPack` card(s) from the pack's
 * assigned set list weighted by each card's odds weight, saves them to the member's
 * collection, and returns them for the animated `PackOpening` reveal.
 */
export async function buyAndOpenCustomPack(
  packId: string,
  options?: { payWith?: PackPayment }
): Promise<ActionResult<{ cards: MemberCard[]; pCredits: number; packCredits: number; packName: string }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to buy and open a pack." };
  if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

  const rawPack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
  if (!rawPack || rawPack.status !== "live") {
    return { success: false, error: "This pack is not currently available in the store." };
  }
  if (rawPack.purchasable === false) {
    return { success: false, error: "This pack can't be bought right now. Have a look at what's in it, and check back soon." };
  }

  const [hydrated] = await hydrateCustomPacks([rawPack]);
  if (hydrated?.needsGeneration) {
    return { success: false, error: "Choose a car to open this pack." };
  }
  if (!hydrated || hydrated.setList.length === 0) {
    return { success: false, error: "This pack doesn't have any cards in its set list yet." };
  }

  const charge = await chargeForPack(user.id, hydrated, options?.payWith);
  if (!charge.ok) return { success: false, error: charge.error };

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

    // A pack with a config rolls a rarity, then a set card on it. An old pack keeps its weighted list.
    const runtime = hydrated.config ? await loadRuntimeFor(hydrated.config) : null;
    const pickSource = () => {
      if (runtime) {
        const roll = rollPackCard(runtime.config, rng, entryAvailable(runtime));
        const saved = roll.entry?.kind === "card" ? runtime.cards.get(roll.entry.refId) : undefined;
        // This pack's changes to the set card (rolled stats for the rarity, a style's frame, a redrawn picture).
        if (saved) return applyVariant(saved, roll.entry?.variant, runtime.styles, roll.tier, rng);
      }
      return pickOne();
    };

    const count = Math.max(1, Math.min(3, hydrated.cardsPerPack || 1));
    const pulled: StoredMemberCard[] = [];
    const baseNow = Date.now();

    const tx = redis.multi();
    for (let i = 0; i < count; i++) {
      const source = pickSource();
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
        // Old packs mark their cards as featured set cards. Config packs keep the card as saved (its rarity and frame).
        ...(runtime
          ? {
              setCardId: source.id,
              customBorderColor: source.customBorderColor,
              customStatLabelColor: source.customStatLabelColor,
              customStatValueColor: source.customStatValueColor,
              customBottomBarBgColor: source.customBottomBarBgColor,
              customBottomBarBorderColor: source.customBottomBarBorderColor,
              customFrameEffect: source.customFrameEffect,
              customFrameShine: source.customFrameShine,
              customFlameColor: source.customFlameColor,
            }
          : { featured: true }),
        bonusFromCardId: source.id,
        packId: hydrated.id,
        packName: hydrated.name,
      };
      pulled.push(stored);
      tx.set(memberCardKey(stored.id), JSON.stringify(stored));
      tx.zadd(memberCardsIndexKey(user.id), { score: createdAt, member: stored.id });
      tx.zadd(ALL_MEMBER_CARDS_INDEX, { score: createdAt, member: stored.id });
    }

    // The pack's bonus pull, if it has one set up: an extra card, last in the pack. Its picture is fixed. If it can't
    // be rolled the pack just opens without it.
    if (runtime) {
      const bonusSource = await rollPackBonus(runtime.config, rng, runtime).catch((error) => {
        console.error("[tcg] bonus pull failed, skipping it:", error);
        return null;
      });
      if (bonusSource) {
        const bonusAt = baseNow + count;
        const bonusCard = buildBonusCard({
          source: bonusSource,
          userId: user.id,
          ownerName: user.name,
          createdAt: bonusAt,
          pack: { id: hydrated.id, name: hydrated.name },
        });
        pulled.push(bonusCard);
        tx.set(memberCardKey(bonusCard.id), JSON.stringify(bonusCard));
        tx.zadd(memberCardsIndexKey(user.id), { score: bonusAt, member: bonusCard.id });
        tx.zadd(ALL_MEMBER_CARDS_INDEX, { score: bonusAt, member: bonusCard.id });
      }

      // The Crew and Repair Kit cards this pack is set to give, last in the pack.
      const extraCards = await buildPackExtraCards({
        config: runtime.config,
        userId: user.id,
        ownerName: user.name,
        createdAt: baseNow + count + 1,
        rng,
        pack: { id: hydrated.id, name: hydrated.name },
      });
      for (const extra of extraCards) {
        pulled.push(extra);
        tx.set(memberCardKey(extra.id), JSON.stringify(extra));
        tx.zadd(memberCardsIndexKey(user.id), { score: extra.createdAt, member: extra.id });
        tx.zadd(ALL_MEMBER_CARDS_INDEX, { score: extra.createdAt, member: extra.id });
      }
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
        pCredits: charge.pCredits,
        packCredits: await getCardCredits(user.id),
        packName: hydrated.name,
      },
    };
  } catch (error) {
    // Give back the P-Credits or the card credit if rolling/saving failed
    await charge.refund().catch(() => {});
    console.error("[tcg] buyAndOpenCustomPack failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to open custom pack",
    };
  }
}

export interface OpenCustomPackInput {
  driver: string;
  team: string;
  chassis: string;
  description: string;
  carName?: string;
  /** Photo of the member's car. Not needed when `skipPersonalCar` is set. */
  referenceUrl: string;
  /** Draw every generated card from community cars instead of the member's own car. */
  skipPersonalCar?: boolean;
  /** How the pack is paid for: its P-Credit price (the default), or a card credit if the pack allows it. */
  payWith?: PackPayment;
}

const customPackLockKey = (userId: string) => `cardgen:lock:${userId}`;
const clampText = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Buy and open a pack that has styles or normal generated cards in it. Like the Standard Pack, the
 * member either uses their own car photo or lets the pack draw from community cars. The first card
 * is drawn from the member's car (unless they chose community cars); the rest come from community cars.
 * P-Credits are only taken once the cards have been picked, and are refunded if anything fails.
 */
export async function openCustomPackWithCar(
  packId: string,
  input: OpenCustomPackInput
): Promise<ActionResult<{ cards: MemberCard[]; pCredits: number; packCredits: number; packName: string }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to open a pack." };
  if (!MEMBER_CARD_ID_PATTERN.test(packId)) return { success: false, error: "Invalid pack." };

  const rawPack = parseCustomPack(await redis.get(tcgCustomPackKey(packId)));
  if (!rawPack || rawPack.status !== "live") {
    return { success: false, error: "This pack is not currently available in the store." };
  }
  if (rawPack.purchasable === false) {
    return { success: false, error: "This pack can't be bought right now. Have a look at what's in it, and check back soon." };
  }
  const [hydrated] = await hydrateCustomPacks([rawPack]);
  if (!hydrated?.config) return { success: false, error: "This pack opens straight from the store." };
  if (!hydrated.needsGeneration) return { success: false, error: "This pack doesn't need a car. Use Buy & Open." };

  const skipPersonalCar = Boolean(input?.skipPersonalCar);
  const driver = clampText(input?.driver, 30);
  const team = clampText(input?.team, 30);
  const chassis = clampText(input?.chassis, 48);
  const description = clampText(input?.description, 160);
  const carName = clampText(input?.carName, 40);
  if (!skipPersonalCar && !driver) return { success: false, error: "Add your name for the card.", field: "driver" };
  if (!skipPersonalCar && !isBlobUrl(input?.referenceUrl)) {
    return { success: false, error: "Choose or upload a photo of your car first.", field: "referenceUrl" };
  }

  // One pack at a time per member (shared with the Standard Pack), so a double tap can't open two.
  const locked = await redis.set(customPackLockKey(user.id), "1", { nx: true, ex: 150 });
  if (!locked) return { success: false, error: "A pack is already being opened. Give it a moment." };

  // Set once the member has been charged, and cleared once the cards are saved. If anything fails in between it gives the charge back.
  let refund: (() => Promise<void>) | null = null;
  try {
    const count = Math.max(1, Math.min(3, hydrated.cardsPerPack || 1));
    const title = cardTitle({ carName, chassis, driver });

    // Who each card is built from: the member's own car for the first card, community cars for the rest.
    type Source = {
      name: string;
      ability: string;
      effect: string;
      driver: string;
      team: string;
      referenceUrl: string;
      own: boolean;
      fromCardId?: string;
    };
    const own: Source | null = skipPersonalCar
      ? null
      : {
          name: title,
          ability: chassis.trim() || carName.trim() || title,
          effect: description,
          driver,
          team,
          referenceUrl: input.referenceUrl,
          own: true,
        };
    const sources: Source[] = [];
    const used: string[] = [];
    for (let i = 0; i < count; i++) {
      if (i === 0 && own) {
        sources.push(own);
        continue;
      }
      const community = await pickCommunityCardSource(user.id, used, rng);
      if (community) {
        used.push(community.id);
        sources.push({
          name: community.name,
          ability: community.ability || community.name,
          effect: community.effect,
          driver: community.driver,
          team: community.team,
          referenceUrl: community.referenceUrl,
          own: false,
          fromCardId: community.id,
        });
      } else if (own) {
        sources.push(own);
      } else {
        return { success: false, error: "The community card pool is currently empty. Please try again later." };
      }
    }

    const charge = await chargeForPack(user.id, hydrated, input?.payWith);
    if (!charge.ok) return { success: false, error: charge.error };
    refund = charge.refund;

    const runtime = await loadRuntimeFor(hydrated.config);
    const settled = await Promise.allSettled(
      sources.map((source) => rollAndDrawSlot({ referenceUrl: source.referenceUrl, rng, runtime }))
    );
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    const drawn = settled.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof rollAndDrawSlot>>>).value);

    const baseNow = Date.now();
    const pulled: StoredMemberCard[] = drawn.map((d, i) => {
      const source = sources[i];
      const durability = rollCarInitialDurability(rng);
      return {
        id: randomUUID(),
        userId: user.id,
        createdAt: baseNow + i,
        name: source.name,
        ability: source.ability,
        effect: source.effect,
        tier: d.tier,
        stats: d.stats,
        imageUrl: d.imageUrl,
        imageZoom: MEMBER_ART_ZOOM,
        imageX: 50,
        imageY: 50,
        driver: source.driver,
        team: source.team,
        styleIds: d.styleIds,
        ...slotOverrides(d),
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: d.fixed ? "" : source.referenceUrl,
        ...(source.own ? {} : { bonus: true, bonusFromCardId: source.fromCardId }),
        maxBattles: durability,
        battlesRemaining: durability,
        fault: null,
        packId: hydrated.id,
        packName: hydrated.name,
      };
    });

    // The pack's bonus pull, if it has one set up: an extra card, last in the pack. Its picture is fixed (never drawn).
    // If it can't be rolled the pack just opens without it.
    const bonusSource = await rollPackBonus(runtime.config, rng, runtime).catch((error) => {
      console.error("[tcg] bonus pull failed, skipping it:", error);
      return null;
    });
    const bonusCard = bonusSource
      ? buildBonusCard({
          source: bonusSource,
          userId: user.id,
          ownerName: user.name,
          createdAt: baseNow + pulled.length,
          pack: { id: hydrated.id, name: hydrated.name },
        })
      : null;
    // The Crew and Repair Kit cards this pack is set to give, after the bonus pull.
    const extraCards = await buildPackExtraCards({
      config: runtime.config,
      userId: user.id,
      ownerName: user.name,
      createdAt: baseNow + pulled.length + 1,
      rng,
      pack: { id: hydrated.id, name: hydrated.name },
    });
    const allCards = [...pulled, ...(bonusCard ? [bonusCard] : []), ...extraCards];

    const tx = redis.multi();
    for (const stored of allCards) {
      tx.set(memberCardKey(stored.id), JSON.stringify(stored));
      tx.zadd(memberCardsIndexKey(user.id), { score: stored.createdAt, member: stored.id });
      tx.zadd(ALL_MEMBER_CARDS_INDEX, { score: stored.createdAt, member: stored.id });
    }
    tx.hincrby(`member:${user.id}`, "packsOpened", 1);
    await tx.exec();
    refund = null; // saved: nothing to refund from here on

    // The member's own car stands in the community pool, as it does after a Standard Pack.
    const ownCard = pulled.find((c, i) => sources[i].own && !c.setCardId);
    if (ownCard) await addToCommunityPool(ownCard).catch((e) => console.error("[tcg] could not update the pool:", e));

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");
    revalidateTag("admin-members", "max");

    return {
      success: true,
      data: {
        cards: allCards.map(publicCard),
        pCredits: charge.pCredits,
        packCredits: await getCardCredits(user.id),
        packName: hydrated.name,
      },
    };
  } catch (error) {
    console.error("[tcg] openCustomPackWithCar failed:", error);
    return {
      success: false,
      error:
        error instanceof CardArtError
          ? error.message
          : "We couldn't make your cards this time. You haven't been charged. Please try again in a moment.",
    };
  } finally {
    if (refund) await refund().catch(() => {});
    await redis.del(customPackLockKey(user.id)).catch(() => {});
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

/**
 * What is in a pack, for the "What's in this pack" window: "standard" for the Standard Pack, otherwise a store pack's id.
 * Any signed-in member can look at a live pack, including one that can't be bought right now. Drafts are for admins only.
 */
export async function getPackContentsAction(packId: string): Promise<ActionResult<PackContents>> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Please sign in to see what's in a pack." };
    const contents = await buildPackContents(String(packId ?? ""), { isAdmin: user.role === "admin" });
    if (!contents) return { success: false, error: "That pack isn't available." };
    return { success: true, data: contents };
  } catch (error) {
    console.error("[tcg] could not load a pack's contents:", error);
    return { success: false, error: "Could not load what's in this pack. Please try again." };
  }
}

export interface SaveCustomPackInput {
  id?: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number | null;
  status: TcgPackStatus;
  purchasable?: boolean;
  allowCardCredits?: boolean;
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
      purchasable: input.purchasable ?? existing?.purchasable ?? true,
      allowCardCredits: input.allowCardCredits ?? existing?.allowCardCredits ?? true,
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
    await deletePackConfig(packId).catch(() => {});

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



