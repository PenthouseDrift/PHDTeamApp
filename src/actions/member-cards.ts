"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCardCredits, refundCardCredit, spendCardCredit } from "@/lib/card-credits";
import { CardArtError, generateArtImage, isBlobUrl } from "@/lib/card-art-generate";
import {
  BONUS_CARD_CHANCE,
  MEMBER_ART_ZOOM,
  REROLL_ENABLED,
  canRerollCard,
  cardTitle,
  rollRarity,
  rollStats,
  rollStyleIds,
  type MemberCard,
  type StoredMemberCard,
} from "@/lib/card-roll";
import { tierArtPrompt, type FullArtTier } from "@/lib/full-art-card";
import {
  ALL_MEMBER_CARDS_INDEX,
  MEMBER_CARD_ID_PATTERN,
  memberCardKey as cardKey,
  memberCardsIndexKey as indexKey,
  parseStoredCard as parseCard,
} from "@/lib/member-card-store";
import type { ActionResult } from "@/types";

/**
 * Member card packs. A member spends 1 card credit (earned by checking in at the track: 1, or 2 with a membership) to open a
 * pack: the server rolls the rarity, art styles and stats, draws the art with Gemini, and saves the
 * card to the member's collection. Nothing about the roll is ever decided by the browser.
 *
 * Storage: one JSON string per card (`usercard:<id>`) plus a sorted set per member
 * (`member:<id>:usercards`, scored by when the card was opened). Every action works out who the
 * member is from the session and checks the card belongs to them.
 */

const lockKey = (userId: string) => `cardgen:lock:${userId}`;
/** Most cards listed on the collection page. */
const MAX_LISTED = 500;
/** A pack is rolled and drawn within this long; the lock stops a second pack being opened at the same time. */
const LOCK_SECONDS = 150;

/** Random number in [0, 1) from the operating system's secure generator. */
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const clamp = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

async function currentUser(): Promise<{ id: string; name: string } | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? { id, name: session?.user?.name?.trim() || "" } : null;
}

/** What the browser gets: the card without the stored car photo address. */
function publicCard(stored: StoredMemberCard): MemberCard {
  const { referenceUrl, ...card } = stored;
  void referenceUrl;
  return card;
}

async function loadOwnCard(userId: string, cardId: string): Promise<StoredMemberCard | null> {
  if (!MEMBER_CARD_ID_PATTERN.test(cardId)) return null;
  const card = parseCard(await redis.get(cardKey(cardId)));
  // An archived (re-rolled away) card belongs to the admin record, not to the member's collection.
  return card && card.userId === userId && !card.archived ? card : null;
}

/** The art for a freshly rolled card: random rarity, random styles, random stats, then Gemini draws it. */
async function rollAndDraw(referenceUrl: string): Promise<{
  tier: FullArtTier;
  styleIds: string[];
  stats: MemberCard["stats"];
  imageUrl: string;
}> {
  const tier = rollRarity(rng);
  const styleIds = rollStyleIds(rng);
  const stats = rollStats(tier, rng);
  const prompt = tierArtPrompt(tier, styleIds);

  // Image models sometimes return no picture. Try once more with the same roll before giving up.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { imageUrl } = await generateArtImage({ referenceUrl, prompt, aspectRatio: "3:4", folder: "member-cards" });
      return { tier, styleIds, stats, imageUrl };
    } catch (error) {
      lastError = error;
      console.error(`[member-cards] art attempt ${attempt + 1} failed:`, error);
    }
  }
  throw lastError;
}

/**
 * A random earlier card to build the second card from, or null when there isn't one yet. It picks a
 * random place in the list of every card opened and checks what it finds, a few times over, so it
 * never loads the whole list. Another member's card is preferred; if none turns up (for example
 * while only one person has made cards) one of the opener's own is used instead. Skipped: re-rolled
 * away copies, second-slot cards (so a card is never a copy of a copy), and any without a car photo.
 */
async function pickBonusSource(userId: string): Promise<StoredMemberCard | null> {
  let ownCard: StoredMemberCard | null = null;
  try {
    const total = await redis.zcard(ALL_MEMBER_CARDS_INDEX);
    if (!total) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const position = Math.floor(rng() * total);
      const [id] = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, position, position)) as string[];
      if (!id || !MEMBER_CARD_ID_PATTERN.test(String(id))) continue;
      const card = parseCard(await redis.get(cardKey(String(id))));
      if (!card || card.archived || card.bonus || !card.driver || !isBlobUrl(card.referenceUrl)) continue;
      if (card.userId !== userId) return card;
      ownCard ??= card;
    }
  } catch (error) {
    console.error("[member-cards] could not pick a bonus card:", error);
  }
  return ownCard;
}

function friendlyError(error: unknown): string {
  if (error instanceof CardArtError) return error.message;
  return "We couldn't make your card this time. Please try again in a moment.";
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** The signed-in member's card credits. */
export async function getMyCardCredits(): Promise<number> {
  const user = await currentUser();
  return user ? getCardCredits(user.id) : 0;
}

/** The signed-in member's cards, newest first. */
export async function listMyCards(): Promise<MemberCard[]> {
  const user = await currentUser();
  if (!user) return [];
  const ids = (await redis.zrange(indexKey(user.id), 0, MAX_LISTED - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => cardKey(String(id))));
  return rows
    .map(parseCard)
    .filter((c): c is StoredMemberCard => c !== null && c.userId === user.id && !c.archived)
    .map(publicCard);
}

// ── Opening a pack ──────────────────────────────────────────────────────────

export interface NewCardInput {
  /** The member's name, printed as the driver. */
  driver: string;
  team: string;
  /** Chassis, printed as the card's ability line. */
  chassis: string;
  /** Printed as the card's effect text: the car's parts, e.g. "Hobbywing XeRun V10 G4 · Futaba 4PM". */
  description: string;
  /** Name of the garage car, if one was chosen; it becomes the card's title. */
  carName?: string;
  /** Photo of the car the art is drawn from. */
  referenceUrl: string;
}

/** Spend a credit, roll a pack, draw the card and add it to the collection. */
export async function openCardPack(
  input: NewCardInput
): Promise<ActionResult<{ card: MemberCard; bonus: MemberCard | null; credits: number }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to open a card pack." };

  const driver = clamp(input?.driver, 30);
  const team = clamp(input?.team, 30);
  const chassis = clamp(input?.chassis, 48);
  const description = clamp(input?.description, 160);
  const carName = clamp(input?.carName, 40);
  if (!driver) return { success: false, error: "Add your name for the card.", field: "driver" };
  if (!isBlobUrl(input?.referenceUrl)) {
    return { success: false, error: "Choose or upload a photo of your car first.", field: "referenceUrl" };
  }

  // One pack at a time per member, so a double tap can't spend two credits or make two cards.
  const locked = await redis.set(lockKey(user.id), "1", { nx: true, ex: LOCK_SECONDS });
  if (!locked) return { success: false, error: "A pack is already being opened. Give it a moment." };

  let spent = false;
  try {
    spent = await spendCardCredit(user.id);
    if (!spent) {
      return { success: false, error: "You don't have a card credit. Check in at the track to earn one." };
    }

    // Sometimes the pack also holds a bonus card built from another member's card. It is drawn at the
    // same time as the member's own card, so the pack takes no longer to open, and if it fails it is
    // simply skipped: it never fails the pack or costs the member anything.
    const bonusSource = rng() < BONUS_CARD_CHANCE ? await pickBonusSource(user.id) : null;
    const bonusDrawing = bonusSource
      ? rollAndDraw(bonusSource.referenceUrl).catch((error) => {
          console.error("[member-cards] bonus card failed, skipping it:", error);
          return null;
        })
      : null;

    const drawn = await rollAndDraw(input.referenceUrl);
    const now = Date.now();
    const title = cardTitle({ carName, chassis, driver });
    const stored: StoredMemberCard = {
      id: randomUUID(),
      userId: user.id,
      createdAt: now,
      name: title,
      // The chassis line is skipped when it would only repeat the card's title.
      ability: chassis.toLowerCase() === title.toLowerCase() ? "" : chassis,
      effect: description,
      tier: drawn.tier,
      stats: drawn.stats,
      imageUrl: drawn.imageUrl,
      imageZoom: MEMBER_ART_ZOOM,
      imageX: 50,
      imageY: 50,
      driver,
      team,
      styleIds: drawn.styleIds,
      // With re-rolling switched off there is nothing left to decide, so the card is kept straight away.
      kept: !REROLL_ENABLED,
      rerolled: false,
      ownerName: user.name,
      referenceUrl: input.referenceUrl,
    };
    await redis.set(cardKey(stored.id), JSON.stringify(stored));
    await redis.zadd(indexKey(user.id), { score: now, member: stored.id });
    // Every card is also listed for admins, who can see all stored cards.
    await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: now, member: stored.id });

    // The bonus card: the other member's card details, drawn again as a whole new card (its own
    // rarity, stats, art styles and picture). It goes straight into this member's collection and
    // can't be re-rolled. Anything going wrong here leaves the member's own card untouched.
    let bonus: StoredMemberCard | null = null;
    const bonusDrawn = bonusDrawing ? await bonusDrawing : null;
    if (bonusSource && bonusDrawn) {
      try {
        const bonusNow = Date.now();
        bonus = {
          id: randomUUID(),
          userId: user.id,
          createdAt: bonusNow,
          name: bonusSource.name,
          ability: bonusSource.ability,
          effect: bonusSource.effect,
          tier: bonusDrawn.tier,
          stats: bonusDrawn.stats,
          imageUrl: bonusDrawn.imageUrl,
          imageZoom: MEMBER_ART_ZOOM,
          imageX: 50,
          imageY: 50,
          driver: bonusSource.driver,
          team: bonusSource.team,
          styleIds: bonusDrawn.styleIds,
          kept: true,
          rerolled: false,
          ownerName: user.name,
          referenceUrl: bonusSource.referenceUrl,
          bonus: true,
          bonusFromCardId: bonusSource.id,
        };
        await redis.set(cardKey(bonus.id), JSON.stringify(bonus));
        await redis.zadd(indexKey(user.id), { score: bonusNow, member: bonus.id });
        await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: bonusNow, member: bonus.id });
      } catch (error) {
        console.error("[member-cards] could not save the bonus card:", error);
        bonus = null;
      }
    }

    revalidatePath("/cards");
    return {
      success: true,
      data: { card: publicCard(stored), bonus: bonus ? publicCard(bonus) : null, credits: await getCardCredits(user.id) },
    };
  } catch (error) {
    // The pack didn't open, so the member gets their credit back.
    if (spent) await refundCardCredit(user.id);
    console.error("[member-cards] opening a pack failed:", error);
    return { success: false, error: friendlyError(error) };
  } finally {
    await redis.del(lockKey(user.id)).catch(() => {});
  }
}

// ── After the reveal ────────────────────────────────────────────────────────

/** Re-roll a card once. It is replaced completely, so the member loses the tier it had and gets a new roll. */
export async function rerollCard(cardId: string): Promise<ActionResult<{ card: MemberCard }>> {
  if (!REROLL_ENABLED) return { success: false, error: "Re-rolling is switched off for now." };
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in." };
  const existing = await loadOwnCard(user.id, cardId);
  if (!existing) return { success: false, error: "We couldn't find that card." };
  if (!canRerollCard(existing)) {
    return { success: false, error: "This card can't be re-rolled any more." };
  }

  const locked = await redis.set(lockKey(user.id), "1", { nx: true, ex: LOCK_SECONDS });
  if (!locked) return { success: false, error: "A pack is already being opened. Give it a moment." };

  try {
    // Look again now we hold the lock, so two quick taps can't both re-roll.
    const fresh = await loadOwnCard(user.id, cardId);
    if (!fresh || !canRerollCard(fresh)) return { success: false, error: "This card can't be re-rolled any more." };

    const drawn = await rollAndDraw(fresh.referenceUrl);
    const updated: StoredMemberCard = {
      ...fresh,
      tier: drawn.tier,
      styleIds: drawn.styleIds,
      stats: drawn.stats,
      imageUrl: drawn.imageUrl,
      imageZoom: MEMBER_ART_ZOOM,
      imageX: 50,
      imageY: 50,
      rerolled: true,
      kept: true,
    };
    await redis.set(cardKey(updated.id), JSON.stringify(updated));

    // The card the member gave up is kept, picture included, as an archived copy that only admins can see.
    try {
      const archivedId = randomUUID();
      const archived: StoredMemberCard = { ...fresh, id: archivedId, archived: true };
      await redis.set(cardKey(archivedId), JSON.stringify(archived));
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: fresh.createdAt - 1, member: archivedId });
    } catch (error) {
      console.error("[member-cards] could not archive the re-rolled card:", error);
    }

    revalidatePath("/cards");
    return { success: true, data: { card: publicCard(updated) } };
  } catch (error) {
    // Nothing was changed, so the member still has their card and their re-roll.
    console.error("[member-cards] re-roll failed:", error);
    return { success: false, error: friendlyError(error) };
  } finally {
    await redis.del(lockKey(user.id)).catch(() => {});
  }
}

/** Keep a card as it is. This ends its re-roll chance. */
export async function keepCard(cardId: string): Promise<ActionResult<{ card: MemberCard }>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in." };
  const existing = await loadOwnCard(user.id, cardId);
  if (!existing) return { success: false, error: "We couldn't find that card." };

  const updated: StoredMemberCard = { ...existing, kept: true };
  await redis.set(cardKey(updated.id), JSON.stringify(updated));
  revalidatePath("/cards");
  return { success: true, data: { card: publicCard(updated) } };
}
