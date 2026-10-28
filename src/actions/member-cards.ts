"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCardCredits, refundCardCredit, spendCardCredit } from "@/lib/card-credits";
import { CardArtError, generateArtImage, isBlobUrl } from "@/lib/card-art-generate";
import {
  BONUS_CARD_CHANCE,
  FEATURED_CARD_CHANCE,
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
import { sanitizeFullArtCard, tierArtPrompt, type FullArtTier } from "@/lib/full-art-card";
import {
  ALL_MEMBER_CARDS_INDEX,
  COMMUNITY_POOL_INDEX,
  FEATURED_CARDS_KEY,
  MEMBER_CARD_ID_PATTERN,
  addToCommunityPool,
  ensureCommunityPool,
  fullArtCardKey,
  isCommunityCard,
  memberCardKey as cardKey,
  memberCardsIndexKey as indexKey,
  parseStoredCard as parseCard,
} from "@/lib/member-card-store";
import { saveSpecSheet } from "@/actions/spec-sheets";
import { parsePartsFromDescription } from "@/lib/spec-sheets";
import type { PartValues } from "@/lib/rc-parts-data";
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
 * A set card from the admin's pullable list, picked in proportion to its odds weight, or null when
 * the list is empty. These are saved admin cards with a fixed picture, so nothing is drawn.
 */
async function pickFeaturedCard(): Promise<(ReturnType<typeof sanitizeFullArtCard> & { id: string }) | null> {
  try {
    const raw = (await redis.hgetall(FEATURED_CARDS_KEY)) ?? {};
    const entries = Object.entries(raw)
      .map(([id, w]) => ({ id, weight: Number(w) }))
      .filter((e) => MEMBER_CARD_ID_PATTERN.test(e.id) && Number.isFinite(e.weight) && e.weight > 0);
    if (entries.length === 0) return null;

    const rows = await redis.mget(...entries.map((e) => fullArtCardKey(e.id)));
    const cards = entries
      .map((e, i) => {
        try {
          const value = typeof rows[i] === "string" ? JSON.parse(rows[i] as string) : rows[i];
          if (!value || typeof value !== "object") return null;
          const card = sanitizeFullArtCard(value as never);
          return card.imageUrl ? { card: { ...card, id: e.id }, weight: e.weight } : null;
        } catch {
          return null;
        }
      })
      .filter((c): c is { card: ReturnType<typeof sanitizeFullArtCard> & { id: string }; weight: number } => c !== null);
    if (cards.length === 0) return null;

    let r = rng() * cards.reduce((sum, c) => sum + c.weight, 0);
    for (const c of cards) {
      if (r < c.weight) return c.card;
      r -= c.weight;
    }
    return cards[cards.length - 1].card;
  } catch (error) {
    console.error("[member-cards] could not pick a pullable card:", error);
    return null;
  }
}

/** Up to this many cards are looked at when the pool is big; a small pool is looked at in full. */
const POOL_SAMPLE = 12;
const POOL_LOAD_ALL_UNDER = 100;

/**
 * A random card from the community pool to build the second card from, or null when the pool is
 * empty. The pool holds one card for each driver and car (see member-card-store.ts), so a member
 * who has made lots of cards is no more likely to be picked than one who has made a single card.
 * Another member's driver and car is preferred; if the pool holds only the opener's own, one of
 * those is used instead. Cards without a usable car photo are skipped.
 */
async function pickBonusSource(userId: string): Promise<StoredMemberCard | null> {
  try {
    await ensureCommunityPool();
    const total = await redis.zcard(COMMUNITY_POOL_INDEX);
    if (!total) return null;

    // A small pool is read in full, so the pick is exactly even. A big one is sampled at random places.
    let ids: string[];
    if (total <= POOL_LOAD_ALL_UNDER) {
      ids = (await redis.zrange(COMMUNITY_POOL_INDEX, 0, -1)) as string[];
    } else {
      const picks = await Promise.all(
        Array.from({ length: POOL_SAMPLE }, () => {
          const position = Math.floor(rng() * total);
          return redis.zrange(COMMUNITY_POOL_INDEX, position, position) as Promise<string[]>;
        })
      );
      ids = [...new Set(picks.flat())];
    }
    ids = ids.map(String).filter((id) => MEMBER_CARD_ID_PATTERN.test(id));
    if (ids.length === 0) return null;

    const cards = (await redis.mget(...ids.map((id) => cardKey(id))))
      .map(parseCard)
      .filter((c): c is StoredMemberCard => isCommunityCard(c) && isBlobUrl(c.referenceUrl));
    const others = cards.filter((c) => c.userId !== userId);
    const candidates = others.length > 0 ? others : cards;
    return candidates.length > 0 ? candidates[Math.floor(rng() * candidates.length)] : null;
  } catch (error) {
    console.error("[member-cards] could not pick a bonus card:", error);
    return null;
  }
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
  /** Garage car id, if one was chosen. */
  carId?: string | null;
  /** Structured parts selected in Step 4 so the spec sheet can be saved accurately. */
  parts?: Partial<PartValues>;
  /** Photo of the car the art is drawn from. */
  referenceUrl: string;
}

/** Spend a credit, roll a pack, draw the card and add it to the collection. */
export async function openCardPack(
  input: NewCardInput
): Promise<ActionResult<{ card: MemberCard; bonus: MemberCard | null; featured: MemberCard | null; credits: number }>> {
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
    await redis.hincrby(`member:${user.id}`, "packsOpened", 1).catch(() => {});
    // This driver and car now stands in the community pool with this card (replacing their older one).
    await addToCommunityPool(stored).catch((error) => console.error("[member-cards] could not update the pool:", error));
    // Also save/update this setup in the member's spec sheets so they can select it anytime later.
    await saveSpecSheet(
      {
        name: carName || chassis || title,
        driver,
        team,
        carId: input.carId ?? null,
        carName: carName || title,
        chassis,
        photoUrl: input.referenceUrl,
        parts: input.parts ?? parsePartsFromDescription(description),
      },
      user.id
    ).catch(() => {});

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

    // A 1 in 30 chance of a third card: one of the admin's set cards. Its picture is fixed (not drawn), so
    // this is instant. Anything going wrong here leaves the rest of the pack untouched.
    let featured: StoredMemberCard | null = null;
    if (rng() < FEATURED_CARD_CHANCE) {
      try {
        const source = await pickFeaturedCard();
        if (source) {
          const featuredNow = Date.now();
          featured = {
            id: randomUUID(),
            userId: user.id,
            createdAt: featuredNow,
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
            bonus: true,
            featured: true,
            bonusFromCardId: source.id,
          };
          await redis.set(cardKey(featured.id), JSON.stringify(featured));
          await redis.zadd(indexKey(user.id), { score: featuredNow, member: featured.id });
          await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: featuredNow, member: featured.id });
        }
      } catch (error) {
        console.error("[member-cards] could not save the pullable card:", error);
        featured = null;
      }
    }

    revalidatePath("/cards");
    revalidateTag("admin-members", "max");
    return {
      success: true,
      data: {
        card: publicCard(stored),
        bonus: bonus ? publicCard(bonus) : null,
        featured: featured ? publicCard(featured) : null,
        credits: await getCardCredits(user.id),
      },
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
    revalidateTag("admin-members", "max");
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
