import type { MemberCard } from "@/lib/card-roll";

/**
 * Gifts and trade offers. Pure (no server imports) so the game screens can use it.
 *
 * A gift moves a card straight to another member. A trade offer is made on a card that is listed on the Marketplace:
 * the buyer offers some of their own cards and/or P-Credits instead of paying the asking price, and the seller accepts
 * or declines. Nothing is held back while an offer is open: what is offered is checked again at the moment it is accepted.
 */

/** The most cards one offer can include. */
export const MAX_OFFER_CARDS = 5;
export const MAX_OFFER_MESSAGE = 140;
/** The most P-Credits one offer can include. */
export const MAX_OFFER_PCREDITS = 1_000_000;
/** How many offers one member can have waiting at once, and how many one listing can have waiting. */
export const MAX_OPEN_OFFERS_PER_BUYER = 10;
export const MAX_PENDING_OFFERS_PER_LISTING = 20;
/** How long an offer stays open, and how long the result of one stays visible. */
export const OFFER_OPEN_DAYS = 7;
export const OFFER_RESULT_DAYS = 14;

export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "cancelled";

export interface TradeOffer {
  id: string;
  listingId: string;
  /** The listed card the offer is for. */
  listedCardId: string;
  /** The card as it was listed, and its asking price. */
  listedCard: MemberCard;
  listedPrice: number;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  /** P-Credits offered (0 for a cards-only offer). */
  pCredits: number;
  /** The cards offered, as they were when the offer was made. */
  cards: MemberCard[];
  message: string;
  status: OfferStatus;
  createdAt: number;
  resolvedAt?: number;
  /** Why an offer was cancelled, in words a member can read. */
  note?: string;
}

/** A card a member has been given (a gift, or a card from a trade) and has not yet been shown the reveal for. */
export interface ReceivedCard {
  card: MemberCard;
  /** Who it came from, by the name other members know them by. */
  fromName: string;
  kind: "gift" | "trade";
  /** When it arrived. */
  at: number;
}

/** A member who can be picked to receive a gift. Names and pictures only. */
export interface GiftRecipient {
  id: string;
  name: string;
  image: string | null;
}

export interface MyTradeOffers {
  /** Offers made on my listings. */
  received: TradeOffer[];
  /** Offers I made on other members' listings. */
  sent: TradeOffer[];
}

/** "2 cards + 150 P", "150 P" or "1 card" */
export function describeOffer(offer: Pick<TradeOffer, "cards" | "pCredits">): string {
  const parts: string[] = [];
  if (offer.cards.length > 0) parts.push(`${offer.cards.length} card${offer.cards.length === 1 ? "" : "s"}`);
  if (offer.pCredits > 0) parts.push(`${offer.pCredits.toLocaleString()} P`);
  return parts.join(" + ") || "nothing";
}
