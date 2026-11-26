import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { LB_DIRTY_KEY } from "./leaderboard-keys";
import type { MemberCard, StoredMemberCard } from "@/lib/card-roll";
import { memberCardKey, memberCardsIndexKey, parseStoredCard } from "@/lib/member-card-store";
import { getListingIdForCard, parseMarketListing, tcgMarketListingKey, tcgMarketLockKey } from "./storage";
import { loadActiveRun } from "./campaign/store";
import { OFFER_OPEN_DAYS, OFFER_RESULT_DAYS, type OfferStatus, type ReceivedCard, type TradeOffer } from "./trade-types";

/**
 * Redis access for gifts and trade offers. Plain functions (no "use server"); the actions are in trade-actions.ts.
 *
 * Keys:
 *   tcg:offer:<id>              one offer (JSON). Expires by itself: a week after it is made while it is open, two weeks after it is settled.
 *   tcg:offers:seller:<userId>  zset of offer ids made on this member's listings (score = when made)
 *   tcg:offers:buyer:<userId>   zset of offer ids this member made
 *   tcg:offers:listing:<id>     zset of offer ids made on one listing
 *   tcg:received:<userId>       hash cardId -> JSON {fromName, kind, at}: cards given to this member that they have not been shown yet
 *   tcg:trades:log              list of every gift and accepted trade, newest first (capped), for sorting out disputes
 *   tcg:trade:rl:<scope>:<userId>:<bucket>   rate limit counters
 * Cards are locked with the Marketplace's own lock (tcgMarketLockKey) so a gift, a sale and a trade can never touch one card at once.
 */

const offerKey = (id: string) => `tcg:offer:${id}`;
const sellerIndexKey = (userId: string) => `tcg:offers:seller:${userId}`;
const buyerIndexKey = (userId: string) => `tcg:offers:buyer:${userId}`;
const listingIndexKey = (listingId: string) => `tcg:offers:listing:${listingId}`;
const TRADE_LOG_KEY = "tcg:trades:log";
const LIST_LIMIT = 30;
const OPEN_TTL = OFFER_OPEN_DAYS * 86_400;
const RESULT_TTL = OFFER_RESULT_DAYS * 86_400;
const INDEX_TTL = (OFFER_OPEN_DAYS + OFFER_RESULT_DAYS + 1) * 86_400;

export interface TradeUser {
  id: string;
  name: string;
}

/** The signed-in member and the name other members know them by (nickname first). */
export async function tradeUser(): Promise<TradeUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const data = await redis.hmget<Record<string, unknown>>(`member:${id}`, "nickname", "name");
  const nickname = typeof data?.nickname === "string" ? data.nickname.trim() : "";
  const profileName = typeof data?.name === "string" ? data.name.trim() : "";
  return { id, name: nickname || profileName || session?.user?.name?.trim() || "Member" };
}

/** A card as the browser may see it (without the car photo it was made from). */
export function publicCard(stored: StoredMemberCard): MemberCard {
  const { referenceUrl, ...card } = stored;
  void referenceUrl;
  return card;
}

export async function loadCard(cardId: string): Promise<StoredMemberCard | null> {
  return parseStoredCard(await redis.get(memberCardKey(cardId)));
}

/** Counts one use of `scope` by this member in the current window. False once they are over `limit`. */
export async function underLimit(scope: string, userId: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `tcg:trade:rl:${scope}:${userId}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds + 5);
  return count <= limit;
}

/**
 * Holds the Marketplace lock on every card at once (always in the same order, so two trades can't wait on each other),
 * runs `task`, then lets them go. Returns null without running `task` when any card is busy.
 */
export async function withCardLocks<T>(cardIds: string[], task: () => Promise<T>): Promise<T | null> {
  const ids = [...new Set(cardIds)].sort();
  const held: string[] = [];
  try {
    for (const id of ids) {
      const ok = await redis.set(tcgMarketLockKey(id), "1", { nx: true, ex: 30 });
      if (!ok) return null;
      held.push(id);
    }
    return await task();
  } finally {
    await Promise.all(held.map((id) => redis.del(tcgMarketLockKey(id)).catch(() => {})));
  }
}

/** Why a card can't change hands right now, or null when it is free to. Run this while holding the card's lock. */
export async function cardBlockedReason(card: StoredMemberCard | null, ownerId: string): Promise<string | null> {
  if (!card || card.userId !== ownerId || card.archived) return "isn't in the collection any more";
  if (await getListingIdForCard(card.id)) return "is listed on the Marketplace";
  // A card in a cup in progress is still being played, so it stays with its owner until that ends.
  const run = await loadActiveRun(ownerId);
  if (run && run.status === "active" && [...run.cars, ...run.crew].some((c) => c.id === card.id)) return "is in a Campaign cup in progress";
  return null;
}

/**
 * Every card of this member's that is in a Campaign cup in progress, with why. The cup is read once, so checking a whole
 * batch of cards costs the same as checking one.
 */
export async function cardsInUse(ownerId: string): Promise<Map<string, string>> {
  const inUse = new Map<string, string>();
  const run = await loadActiveRun(ownerId);
  if (run && run.status === "active") {
    for (const c of [...run.cars, ...run.crew]) inUse.set(c.id, "is in a Campaign cup in progress");
  }
  return inUse;
}

type Tx = ReturnType<typeof redis.multi>;

/** Adds "this card now belongs to someone else" to a transaction: the card itself, the old owner's list and the new owner's list. */
export function queueTransfer(tx: Tx, card: StoredMemberCard, toUserId: string, toName: string, now: number): StoredMemberCard {
  const moved: StoredMemberCard = { ...card, userId: toUserId, ownerName: toName, kept: true };
  tx.set(memberCardKey(card.id), JSON.stringify(moved))
    .zrem(memberCardsIndexKey(card.userId), card.id)
    .zadd(memberCardsIndexKey(toUserId), { score: now, member: card.id })
    // Both members' cards changed, so both lines on the Hall of Fame need adding up again.
    .sadd(LB_DIRTY_KEY, card.userId, toUserId);
  return moved;
}

/** A record of a gift or a trade that went through. */
export async function logTrade(entry: Record<string, unknown>): Promise<void> {
  try {
    await redis.lpush(TRADE_LOG_KEY, JSON.stringify({ at: Date.now(), ...entry }));
    await redis.ltrim(TRADE_LOG_KEY, 0, 4999);
  } catch (error) {
    console.error("[trade] could not write the trade log:", error);
  }
}

// ── Offers ──────────────────────────────────────────────────────────────────

const STATUSES: OfferStatus[] = ["pending", "accepted", "declined", "withdrawn", "cancelled"];

export function parseOffer(raw: unknown): TradeOffer | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const o = value as TradeOffer;
    if (typeof o.id !== "string" || typeof o.listingId !== "string" || typeof o.sellerId !== "string" || typeof o.buyerId !== "string") return null;
    if (!STATUSES.includes(o.status) || !Array.isArray(o.cards) || !o.listedCard) return null;
    return o;
  } catch {
    return null;
  }
}

export async function getOffer(id: string): Promise<TradeOffer | null> {
  return parseOffer(await redis.get(offerKey(id)));
}

/** Saves a new offer and files it under the seller, the buyer and the listing. */
export async function createOffer(offer: TradeOffer): Promise<void> {
  await redis
    .multi()
    .set(offerKey(offer.id), JSON.stringify(offer), { ex: OPEN_TTL })
    .zadd(sellerIndexKey(offer.sellerId), { score: offer.createdAt, member: offer.id })
    .zadd(buyerIndexKey(offer.buyerId), { score: offer.createdAt, member: offer.id })
    .zadd(listingIndexKey(offer.listingId), { score: offer.createdAt, member: offer.id })
    .expire(sellerIndexKey(offer.sellerId), INDEX_TTL)
    .expire(buyerIndexKey(offer.buyerId), INDEX_TTL)
    .expire(listingIndexKey(offer.listingId), INDEX_TTL)
    .exec();
}

/** An offer with its new status, written back (and kept for a while so both members can see how it ended). */
export function settled(offer: TradeOffer, status: Exclude<OfferStatus, "pending">, note?: string): TradeOffer {
  return { ...offer, status, resolvedAt: Date.now(), ...(note ? { note } : {}) };
}

export async function saveSettledOffer(offer: TradeOffer): Promise<void> {
  await redis.set(offerKey(offer.id), JSON.stringify(offer), { ex: RESULT_TTL });
}

/** Queues a settled offer into a transaction instead of writing it straight away. */
export function queueSettledOffer(tx: Tx, offer: TradeOffer): void {
  tx.set(offerKey(offer.id), JSON.stringify(offer), { ex: RESULT_TTL });
}

async function loadOffers(ids: string[]): Promise<{ offers: TradeOffer[]; gone: string[] }> {
  if (ids.length === 0) return { offers: [], gone: [] };
  const rows = await redis.mget(...ids.map(offerKey));
  const offers: TradeOffer[] = [];
  const gone: string[] = [];
  ids.forEach((id, i) => {
    const parsed = parseOffer(rows[i]);
    if (parsed) offers.push(parsed);
    else gone.push(id);
  });
  return { offers, gone };
}

/**
 * Open offers whose listing has since been sold or taken down can't be accepted, so they are marked cancelled here
 * (this is how they get tidied up: nothing has to chase them when a listing disappears).
 */
async function cancelOrphans(offers: TradeOffer[]): Promise<TradeOffer[]> {
  const pending = offers.filter((o) => o.status === "pending");
  if (pending.length === 0) return offers;
  const listingIds = [...new Set(pending.map((o) => o.listingId))];
  const rows = await redis.mget(...listingIds.map(tcgMarketListingKey));
  const alive = new Set<string>();
  listingIds.forEach((id, i) => {
    const listing = parseMarketListing(rows[i]);
    if (listing) alive.add(`${listing.id}|${listing.cardId}`);
  });
  const result: TradeOffer[] = [];
  for (const o of offers) {
    if (o.status === "pending" && !alive.has(`${o.listingId}|${o.listedCardId}`)) {
      const cancelled = settled(o, "cancelled", "The card was sold or taken off the Marketplace.");
      await saveSettledOffer(cancelled).catch(() => {});
      result.push(cancelled);
    } else {
      result.push(o);
    }
  }
  return result;
}

async function offersFromIndex(indexKey: string): Promise<TradeOffer[]> {
  const ids = ((await redis.zrange(indexKey, 0, LIST_LIMIT - 1, { rev: true })) as string[]).map(String);
  const { offers, gone } = await loadOffers(ids);
  if (gone.length > 0) await redis.zrem(indexKey, ...(gone as [string, ...string[]])).catch(() => {});
  return cancelOrphans(offers);
}

/** Offers made on this member's listings, newest first. */
export const offersForSeller = (userId: string) => offersFromIndex(sellerIndexKey(userId));
/** Offers this member has made, newest first. */
export const offersForBuyer = (userId: string) => offersFromIndex(buyerIndexKey(userId));

/** Open offers on one listing. */
export async function pendingOffersForListing(listingId: string): Promise<TradeOffer[]> {
  const ids = ((await redis.zrange(listingIndexKey(listingId), 0, 99, { rev: true })) as string[]).map(String);
  const { offers } = await loadOffers(ids);
  return offers.filter((o) => o.status === "pending");
}

// ── Cards received and not yet shown ────────────────────────────────────────

const receivedKey = (userId: string) => `tcg:received:${userId}`;
/** The most cards shown in one reveal. Any more wait for the next time the game is opened. */
const RECEIVED_SHOW_MAX = 30;

/** Notes that these cards were given to a member, so the game can show them the reveal next time it opens. */
export async function recordReceived(userId: string, items: { cardId: string; fromName: string; kind: ReceivedCard["kind"] }[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const now = Date.now();
    const fields: Record<string, string> = {};
    for (const i of items) fields[i.cardId] = JSON.stringify({ fromName: i.fromName, kind: i.kind, at: now });
    await redis.hset(receivedKey(userId), fields);
  } catch (error) {
    // The card has already moved; a missed reveal must not undo or fail the gift.
    console.error("[trade] could not record received cards:", error);
  }
}

/**
 * The cards this member was given and has not yet seen the reveal for, oldest first. A card that has since left their
 * collection (sold, gifted on) is dropped from the list instead of being shown.
 */
export async function getUnseenReceived(userId: string): Promise<ReceivedCard[]> {
  try {
    const rows = (await redis.hgetall(receivedKey(userId))) as Record<string, unknown> | null;
    const ids = Object.keys(rows ?? {});
    if (!rows || ids.length === 0) return [];
    const stored = await redis.mget(...ids.map(memberCardKey));
    const out: ReceivedCard[] = [];
    const stale: string[] = [];
    ids.forEach((id, i) => {
      const card = parseStoredCard(stored[i]);
      let meta: { fromName?: unknown; kind?: unknown; at?: unknown } = {};
      try {
        const raw = rows[id];
        meta = (typeof raw === "string" ? JSON.parse(raw) : raw) as typeof meta;
      } catch {
        /* an unreadable note is treated as a gift from someone unnamed */
      }
      if (!card || card.userId !== userId || card.archived) {
        stale.push(id);
        return;
      }
      out.push({
        card: publicCard(card),
        fromName: typeof meta?.fromName === "string" && meta.fromName ? meta.fromName : "A fellow driver",
        kind: meta?.kind === "trade" ? "trade" : "gift",
        at: Number(meta?.at) || 0,
      });
    });
    if (stale.length > 0) await redis.hdel(receivedKey(userId), ...(stale as [string, ...string[]])).catch(() => {});
    return out.sort((a, b) => a.at - b.at).slice(0, RECEIVED_SHOW_MAX);
  } catch (error) {
    console.error("[trade] getUnseenReceived failed:", error);
    return [];
  }
}

/** These cards have been shown: don't show the reveal for them again. */
export async function clearReceived(userId: string, cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  await redis.hdel(receivedKey(userId), ...(cardIds as [string, ...string[]]));
}
