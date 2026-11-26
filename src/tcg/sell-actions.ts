"use server";

import { revalidatePath } from "next/cache";
import { redis } from "@/lib/redis";
import { deleteImage } from "@/lib/blob";
import { isBlobUrl } from "@/lib/card-art-generate";
import type { StoredMemberCard } from "@/lib/card-roll";
import { ALL_MEMBER_CARDS_INDEX, MEMBER_CARD_ID_PATTERN, memberCardKey, memberCardsIndexKey, removeFromCommunityPool } from "@/lib/member-card-store";
import type { ActionResult } from "@/types";
import { getQuickSellPrice } from "./config";
import { LB_DIRTY_KEY } from "./leaderboard-keys";
import { getListingIdForCard, grantPCredits, removeMarketListingRecord } from "./storage";
import { cardsInUse, loadCard, tradeUser, withCardLocks } from "./trade-store";

/** The most cards one batch can sell. A pack is at most about 8; this is for a deck selection. */
const MAX_BATCH = 40;

export interface QuickSellBatchResult {
  /** The cards that were sold. */
  soldIds: string[];
  /** Cards that were left alone, and why. */
  skipped: { id: string; reason: string }[];
  /** P-Credits paid for the cards that were sold. */
  payout: number;
  /** The member's balance afterwards. */
  pCredits: number;
}

/**
 * Quick sell several cards at once (a whole pack, or a selection from the deck) for one payout.
 *
 * It follows the single quick sell: each card pays out by rarity (less if a car is broken), a card that is listed on the
 * Marketplace has its listing removed, and the card is deleted for good. On top of that, a card in a Campaign cup in
 * progress is left alone. Cards that can't be sold (busy, not theirs, in a cup) are skipped and reported, and
 * the rest still go through. The P-Credits are paid in one go, after the cards are deleted.
 */
export async function quickSellCards(cardIds: string[]): Promise<ActionResult<QuickSellBatchResult>> {
  try {
    const user = await tradeUser();
    if (!user) return { success: false, error: "Please sign in." };
    const ids = [...new Set((Array.isArray(cardIds) ? cardIds : []).map(String))];
    if (ids.length === 0) return { success: false, error: "Pick at least one card to sell." };
    if (ids.length > MAX_BATCH) return { success: false, error: `You can sell up to ${MAX_BATCH} cards at a time.` };
    if (!ids.every((id) => MEMBER_CARD_ID_PATTERN.test(id))) return { success: false, error: "One of those cards isn't valid." };

    const outcome = await withCardLocks(ids, async () => {
      const inUse = await cardsInUse(user.id);
      const skipped: { id: string; reason: string }[] = [];
      const toSell: StoredMemberCard[] = [];
      for (const id of ids) {
        const card = await loadCard(id);
        if (!card || card.userId !== user.id || card.archived) skipped.push({ id, reason: "isn't in your collection" });
        else if (inUse.has(id)) skipped.push({ id, reason: inUse.get(id)! });
        else toSell.push(card);
      }
      if (toSell.length === 0) return { soldIds: [] as string[], skipped, payout: 0, sold: [] as StoredMemberCard[] };

      // A listed card comes off the Marketplace as it is sold.
      for (const card of toSell) {
        const listingId = await getListingIdForCard(card.id);
        if (listingId) await removeMarketListingRecord(listingId, card.id);
      }
      const tx = redis.multi();
      for (const card of toSell) tx.del(memberCardKey(card.id)).zrem(memberCardsIndexKey(user.id), card.id).zrem(ALL_MEMBER_CARDS_INDEX, card.id);
      // Fewer cards changes this member's line on the Hall of Fame.
      tx.sadd(LB_DIRTY_KEY, user.id);
      await tx.exec();

      const payout = toSell.reduce((sum, card) => sum + getQuickSellPrice(card), 0);
      return { soldIds: toSell.map((c) => c.id), skipped, payout, sold: toSell };
    });

    if (!outcome) return { success: false, error: "Some of those cards are busy right now. Try again in a moment." };

    // The cards are gone, so pay for them (once), and tidy up what used to depend on them.
    let balance: number;
    if (outcome.payout > 0) {
      try {
        balance = await grantPCredits(user.id, outcome.payout);
      } catch (error) {
        // Rare: the cards are already deleted, so say exactly what is owed.
        console.error("[tcg] quickSellCards: PAYOUT FAILED after the cards were deleted", { userId: user.id, payout: outcome.payout, cardIds: outcome.soldIds });
        throw error;
      }
    } else {
      const row = await redis.hget(`member:${user.id}`, "pCredits");
      balance = Math.max(0, Math.floor(Number(row) || 0));
    }
    await Promise.all(
      outcome.sold.map(async (card) => {
        await removeFromCommunityPool(card).catch(() => {});
        // Set and pack cards share their picture; only a card's own picture is deleted.
        if (!card.featured && !card.packId && isBlobUrl(card.imageUrl)) await deleteImage(card.imageUrl).catch(() => {});
      })
    );

    revalidatePath("/cards");
    revalidatePath("/admin/member-cards");
    return { success: true, data: { soldIds: outcome.soldIds, skipped: outcome.skipped, payout: outcome.payout, pCredits: balance } };
  } catch (error) {
    console.error("[tcg] quickSellCards failed:", error);
    return { success: false, error: "Could not sell those cards. Please try again." };
  }
}
