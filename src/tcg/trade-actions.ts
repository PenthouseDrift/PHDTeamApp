"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { MEMBER_CARD_ID_PATTERN, removeFromCommunityPool } from "@/lib/member-card-store";
import { getMemberRoster } from "@/lib/member-roster";
import { createNotification } from "@/actions/notifications";
import type { ActionResult } from "@/types";
import {
  TCG_MARKET_ACTIVE_KEY,
  TCG_MARKET_BY_CARD_KEY,
  getPCredits,
  grantPCredits,
  parseMarketListing,
  removeMarketListingRecord,
  spendPCredits,
  tcgMarketListingKey,
} from "./storage";
import {
  MAX_OFFER_CARDS,
  MAX_OFFER_MESSAGE,
  MAX_OFFER_PCREDITS,
  MAX_OPEN_OFFERS_PER_BUYER,
  MAX_PENDING_OFFERS_PER_LISTING,
  describeOffer,
  type GiftRecipient,
  type MyTradeOffers,
  type TradeOffer,
} from "./trade-types";
import {
  cardBlockedReason,
  clearReceived,
  createOffer,
  getOffer,
  loadCard,
  logTrade,
  offersForBuyer,
  offersForSeller,
  pendingOffersForListing,
  publicCard,
  queueSettledOffer,
  queueTransfer,
  recordReceived,
  saveSettledOffer,
  settled,
  tradeUser,
  underLimit,
  withCardLocks,
} from "./trade-store";

/**
 * Gifts and trade offers. Every action works out who is asking from the session, never from what the browser sends, and
 * checks the cards again on the server: who owns them, whether they are listed, whether they are in a cup.
 */

const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BUSY = "That card is busy right now. Try again in a moment.";

/** "This card is listed on the Marketplace" -> adds what to do about it. */
function blockedMessage(cardName: string, reason: string): string {
  const fix = reason.includes("Marketplace") ? " Unlist it first." : reason.includes("in progress") ? " Finish it first." : "";
  return `"${cardName}" ${reason}.${fix}`;
}

function cleanMessage(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_OFFER_MESSAGE) : "";
}

function refresh() {
  revalidatePath("/cards");
  revalidatePath("/admin/member-cards");
}

// ── Gifts ───────────────────────────────────────────────────────────────────

/** Members whose name matches, for picking who to gift to. Names and pictures only: never an email. */
export async function searchGiftRecipients(query: string): Promise<GiftRecipient[]> {
  try {
    const user = await tradeUser();
    if (!user) return [];
    const q = String(query ?? "").trim().toLowerCase();
    if (q.length < 2 || q.length > 40) return [];
    if (!(await underLimit("search", user.id, 60, 60))) return [];
    const roster = await getMemberRoster();
    return roster
      .filter((m) => m.id !== user.id && `${m.nickname ?? ""} ${m.name}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((m) => ({ id: m.id, name: m.nickname?.trim() || m.name, image: m.image }));
  } catch (error) {
    console.error("[trade] searchGiftRecipients failed:", error);
    return [];
  }
}

/** Give one of your cards to another member. It moves straight away; they are told about it. */
export async function giftCard(
  cardId: string,
  recipientId: string
): Promise<ActionResult<{ cardId: string; recipientName: string }>> {
  try {
    const user = await tradeUser();
    if (!user) return { success: false, error: "Please sign in to gift a card." };
    if (!MEMBER_CARD_ID_PATTERN.test(cardId)) return { success: false, error: "Invalid card." };
    if (!MEMBER_ID_PATTERN.test(String(recipientId ?? ""))) return { success: false, error: "Pick who to gift it to." };
    if (recipientId === user.id) return { success: false, error: "You can't gift a card to yourself." };
    if (!(await underLimit("gift", user.id, 20, 3600))) {
      return { success: false, error: "You've gifted a lot of cards in the last hour. Please try again later." };
    }

    const profile = await redis.hmget<Record<string, unknown>>(`member:${recipientId}`, "nickname", "name", "email");
    const profileName = typeof profile?.name === "string" ? profile.name.trim() : "";
    if (!profile || (!profileName && !profile.email)) return { success: false, error: "We couldn't find that member." };
    const recipientName = (typeof profile.nickname === "string" ? profile.nickname.trim() : "") || profileName || "Member";

    const outcome = await withCardLocks([cardId], async () => {
      const stored = await loadCard(cardId);
      const blocked = await cardBlockedReason(stored, user.id);
      if (!stored || blocked) {
        return { error: stored && blocked ? blockedMessage(stored.name, blocked) : "We couldn't find that card in your collection." };
      }
      const tx = redis.multi();
      queueTransfer(tx, stored, recipientId, recipientName, Date.now());
      await tx.exec();
      // The card has left the old owner's list, so the community pool can pick another card of theirs to stand in for it.
      await removeFromCommunityPool(stored).catch(() => {});
      return { card: stored };
    });

    if (!outcome) return { success: false, error: BUSY };
    if ("error" in outcome) return { success: false, error: outcome.error as string };

    const card = outcome.card;
    await logTrade({ type: "gift", fromId: user.id, toId: recipientId, cardId, cardName: card.name, tier: card.tier });
    // Next time they open the game they are shown the card arriving.
    await recordReceived(recipientId, [{ cardId, fromName: user.name, kind: "gift" }]);
    await createNotification({
      userId: recipientId,
      type: "card_gift",
      fromUserId: user.id,
      fromUserName: user.name,
      message: `${user.name} gifted you a ${rarityLabel(card.tier)} card: ${card.name}`,
      url: "/cards?tab=collection",
      dedupKey: `gift:${cardId}:${Date.now()}`,
    });
    refresh();
    return { success: true, data: { cardId, recipientName } };
  } catch (error) {
    console.error("[trade] giftCard failed:", error);
    return { success: false, error: "Could not gift the card. Please try again." };
  }
}

// ── Trade offers ────────────────────────────────────────────────────────────

/** All the offers on my listings, and all the offers I have made. */
export async function getMyTradeOffers(): Promise<MyTradeOffers> {
  try {
    const user = await tradeUser();
    if (!user) return { received: [], sent: [] };
    const [received, sent] = await Promise.all([offersForSeller(user.id), offersForBuyer(user.id)]);
    return { received, sent };
  } catch (error) {
    console.error("[trade] getMyTradeOffers failed:", error);
    return { received: [], sent: [] };
  }
}

/**
 * Offer cards and/or P-Credits for a card listed on the Marketplace. Nothing is taken until the seller accepts, and the
 * offer is checked again at that moment. A new offer on the same listing replaces your earlier one.
 */
export async function makeTradeOffer(input: {
  listingId: string;
  cardIds: string[];
  pCredits: number;
  message?: string;
}): Promise<ActionResult<TradeOffer>> {
  try {
    const buyer = await tradeUser();
    if (!buyer) return { success: false, error: "Please sign in to make an offer." };
    if (!MEMBER_CARD_ID_PATTERN.test(String(input?.listingId ?? ""))) return { success: false, error: "Invalid listing." };

    const cardIds = [...new Set(Array.isArray(input.cardIds) ? input.cardIds.map(String) : [])];
    if (cardIds.length > MAX_OFFER_CARDS) return { success: false, error: `You can offer up to ${MAX_OFFER_CARDS} cards.` };
    if (!cardIds.every((id) => MEMBER_CARD_ID_PATTERN.test(id))) return { success: false, error: "One of the cards isn't valid." };
    const pCredits = Math.floor(Number(input.pCredits) || 0);
    if (pCredits < 0 || pCredits > MAX_OFFER_PCREDITS) {
      return { success: false, error: `Offer between 0 and ${MAX_OFFER_PCREDITS.toLocaleString()} P-Credits.` };
    }
    if (cardIds.length === 0 && pCredits === 0) return { success: false, error: "Add at least one card or some P-Credits to your offer." };

    const listing = parseMarketListing(await redis.get(tcgMarketListingKey(input.listingId)));
    if (!listing) return { success: false, error: "This listing is no longer available." };
    if (listing.sellerId === buyer.id) return { success: false, error: "That's your own listing." };
    if (cardIds.includes(listing.cardId)) return { success: false, error: "You can't offer the card that is for sale." };

    if (!(await underLimit("offer", buyer.id, 30, 3600))) {
      return { success: false, error: "You've made a lot of offers in the last hour. Please try again later." };
    }
    if (pCredits > 0) {
      const balance = await getPCredits(buyer.id);
      if (balance < pCredits) return { success: false, error: `You only have ${balance.toLocaleString()} P-Credits.` };
    }

    const offered: MemberCard[] = [];
    for (const id of cardIds) {
      const stored = await loadCard(id);
      const blocked = await cardBlockedReason(stored, buyer.id);
      if (!stored || blocked) {
        return { success: false, error: stored && blocked ? blockedMessage(stored.name, blocked) : "One of those cards isn't in your collection." };
      }
      offered.push(publicCard(stored));
    }

    const [onListing, mine] = await Promise.all([pendingOffersForListing(listing.id), offersForBuyer(buyer.id)]);
    const myEarlier = onListing.filter((o) => o.buyerId === buyer.id);
    if (onListing.length - myEarlier.length >= MAX_PENDING_OFFERS_PER_LISTING) {
      return { success: false, error: "This card already has plenty of offers. Try again later." };
    }
    const otherOpen = mine.filter((o) => o.status === "pending" && o.listingId !== listing.id).length;
    if (otherOpen >= MAX_OPEN_OFFERS_PER_BUYER) {
      return { success: false, error: `You already have ${MAX_OPEN_OFFERS_PER_BUYER} offers waiting. Withdraw one first.` };
    }

    for (const earlier of myEarlier) await saveSettledOffer(settled(earlier, "withdrawn", "Replaced by a newer offer."));

    const offer: TradeOffer = {
      id: randomUUID(),
      listingId: listing.id,
      listedCardId: listing.cardId,
      listedCard: listing.card,
      listedPrice: listing.price,
      sellerId: listing.sellerId,
      sellerName: listing.sellerName,
      buyerId: buyer.id,
      buyerName: buyer.name,
      pCredits,
      cards: offered,
      message: cleanMessage(input.message),
      status: "pending",
      createdAt: Date.now(),
    };
    await createOffer(offer);

    await createNotification({
      userId: offer.sellerId,
      type: "card_offer",
      fromUserId: buyer.id,
      fromUserName: buyer.name,
      message: `${buyer.name} offered ${describeOffer(offer)} for your ${listing.card.name}`,
      url: "/cards?tab=marketplace",
      dedupKey: `offer:${offer.id}`,
    });
    return { success: true, data: offer };
  } catch (error) {
    console.error("[trade] makeTradeOffer failed:", error);
    return { success: false, error: "Could not send the offer. Please try again." };
  }
}

/** Take back an offer you made, while it is still waiting. */
export async function withdrawTradeOffer(offerId: string): Promise<ActionResult<TradeOffer>> {
  try {
    const user = await tradeUser();
    if (!user) return { success: false, error: "Please sign in." };
    const offer = MEMBER_CARD_ID_PATTERN.test(String(offerId ?? "")) ? await getOffer(offerId) : null;
    if (!offer || offer.buyerId !== user.id) return { success: false, error: "We couldn't find that offer." };
    if (offer.status !== "pending") return { success: false, error: `This offer was already ${offer.status}.` };
    const next = settled(offer, "withdrawn");
    await saveSettledOffer(next);
    return { success: true, data: next };
  } catch (error) {
    console.error("[trade] withdrawTradeOffer failed:", error);
    return { success: false, error: "Could not withdraw the offer. Please try again." };
  }
}

/** Say no to an offer on one of your listings. The buyer is told. The card stays listed. */
export async function declineTradeOffer(offerId: string): Promise<ActionResult<TradeOffer>> {
  try {
    const user = await tradeUser();
    if (!user) return { success: false, error: "Please sign in." };
    const offer = MEMBER_CARD_ID_PATTERN.test(String(offerId ?? "")) ? await getOffer(offerId) : null;
    if (!offer || offer.sellerId !== user.id) return { success: false, error: "We couldn't find that offer." };
    if (offer.status !== "pending") return { success: false, error: `This offer was already ${offer.status}.` };
    const next = settled(offer, "declined");
    await saveSettledOffer(next);
    await createNotification({
      userId: offer.buyerId,
      type: "card_offer_result",
      fromUserId: user.id,
      fromUserName: user.name,
      message: `${user.name} declined your offer for ${offer.listedCard.name}`,
      url: "/cards?tab=marketplace",
      dedupKey: `offer-result:${offer.id}`,
    });
    return { success: true, data: next };
  } catch (error) {
    console.error("[trade] declineTradeOffer failed:", error);
    return { success: false, error: "Could not decline the offer. Please try again." };
  }
}

/**
 * Say yes to an offer on one of your listings. Under a lock on every card involved, everything is checked again (the
 * listing, who owns each card, that none is listed or in a cup, and that the buyer still has the P-Credits).
 * Then the P-Credits are taken from the buyer, the cards swap owners in one transaction, and the seller is paid. If the
 * swap fails, the buyer's P-Credits are given back.
 */
export async function acceptTradeOffer(offerId: string): Promise<
  ActionResult<{ offer: TradeOffer; gaveCardId: string; receivedCards: MemberCard[]; pCredits: number; listingId: string }>
> {
  try {
    const seller = await tradeUser();
    if (!seller) return { success: false, error: "Please sign in." };
    const first = MEMBER_CARD_ID_PATTERN.test(String(offerId ?? "")) ? await getOffer(offerId) : null;
    if (!first || first.sellerId !== seller.id) return { success: false, error: "We couldn't find that offer." };
    if (first.status !== "pending") return { success: false, error: `This offer was already ${first.status}.` };

    const outcome = await withCardLocks([first.listedCardId, ...first.cards.map((c) => c.id)], async () => {
      const offer = await getOffer(offerId);
      if (!offer || offer.status !== "pending") return { error: "This offer was just settled." };

      const cancel = async (note: string) => {
        await saveSettledOffer(settled(offer, "cancelled", note));
        return { error: `${note} The offer was cancelled.` };
      };

      const listing = parseMarketListing(await redis.get(tcgMarketListingKey(offer.listingId)));
      if (!listing || listing.cardId !== offer.listedCardId || listing.sellerId !== seller.id) {
        return cancel("This card is no longer listed.");
      }
      const sellerCard = await loadCard(offer.listedCardId);
      if (!sellerCard || sellerCard.userId !== seller.id || sellerCard.archived) {
        await removeMarketListingRecord(listing.id, listing.cardId);
        return cancel("You no longer own that card.");
      }

      const buyerCards = [];
      for (const offered of offer.cards) {
        const stored = await loadCard(offered.id);
        const blocked = await cardBlockedReason(stored, offer.buyerId);
        if (!stored || blocked) {
          return cancel(stored && blocked ? `${offer.buyerName}'s card "${stored.name}" ${blocked}.` : `${offer.buyerName} no longer has "${offered.name}".`);
        }
        buyerCards.push(stored);
      }

      if (offer.pCredits > 0) {
        const spent = await spendPCredits(offer.buyerId, offer.pCredits);
        if (!spent.ok) {
          // Not a reason to cancel: they may top up. The seller can wait or decline.
          return { error: `${offer.buyerName} doesn't have the ${offer.pCredits.toLocaleString()} P-Credits offered right now.` };
        }
      }

      const now = Date.now();
      const accepted = settled(offer, "accepted");
      let moved: ReturnType<typeof queueTransfer>[] = [];
      try {
        const tx = redis.multi();
        queueTransfer(tx, sellerCard, offer.buyerId, offer.buyerName, now);
        moved = buyerCards.map((c) => queueTransfer(tx, c, seller.id, seller.name, now));
        tx.del(tcgMarketListingKey(listing.id)).zrem(TCG_MARKET_ACTIVE_KEY, listing.id).hdel(TCG_MARKET_BY_CARD_KEY, sellerCard.id);
        queueSettledOffer(tx, accepted);
        await tx.exec();
      } catch (error) {
        console.error("[trade] accept transaction failed:", error);
        if (offer.pCredits > 0) await grantPCredits(offer.buyerId, offer.pCredits).catch(() => {});
        return { error: "The trade couldn't be completed. Nothing changed. Please try again." };
      }

      const balance = offer.pCredits > 0 ? await grantPCredits(seller.id, offer.pCredits) : await getPCredits(seller.id);
      await Promise.all([sellerCard, ...buyerCards].map((c) => removeFromCommunityPool(c).catch(() => {})));
      return { offer: accepted, sellerCard, received: moved.map(publicCard), balance, listingId: listing.id };
    });

    if (!outcome) return { success: false, error: BUSY };
    if ("error" in outcome) return { success: false, error: outcome.error as string };

    const { offer, sellerCard, received, balance, listingId } = outcome;
    await logTrade({
      type: "trade",
      offerId: offer.id,
      sellerId: offer.sellerId,
      buyerId: offer.buyerId,
      gaveCardId: sellerCard.id,
      gaveCardName: sellerCard.name,
      receivedCardIds: received.map((c) => c.id),
      pCredits: offer.pCredits,
    });
    // The buyer is shown the card arriving next time they open the game. (The seller sees theirs straight away, on screen.)
    await recordReceived(offer.buyerId, [{ cardId: sellerCard.id, fromName: seller.name, kind: "trade" }]);
    await createNotification({
      userId: offer.buyerId,
      type: "card_offer_result",
      fromUserId: seller.id,
      fromUserName: seller.name,
      message: `${seller.name} accepted your offer: ${sellerCard.name} is yours`,
      url: "/cards?tab=collection",
      dedupKey: `offer-result:${offer.id}`,
    });
    refresh();
    return { success: true, data: { offer, gaveCardId: sellerCard.id, receivedCards: received, pCredits: balance, listingId } };
  } catch (error) {
    console.error("[trade] acceptTradeOffer failed:", error);
    return { success: false, error: "Could not complete the trade. Please try again." };
  }
}

/** The member has seen the reveal for these cards, so it won't play for them again. Only ever touches the caller's own list. */
export async function acknowledgeReceivedCards(cardIds: string[]): Promise<ActionResult<null>> {
  try {
    const user = await tradeUser();
    if (!user) return { success: false, error: "Please sign in." };
    const ids = (Array.isArray(cardIds) ? cardIds : []).map(String).filter((id) => MEMBER_CARD_ID_PATTERN.test(id)).slice(0, 100);
    await clearReceived(user.id, ids);
    return { success: true, data: null };
  } catch (error) {
    console.error("[trade] acknowledgeReceivedCards failed:", error);
    return { success: false, error: "Could not save that." };
  }
}
