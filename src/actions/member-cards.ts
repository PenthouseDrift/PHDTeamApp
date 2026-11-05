"use server";

import { randomInt, randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCardCredits, refundCardCredit, spendCardCredit } from "@/lib/card-credits";
import { CardArtError, isBlobUrl } from "@/lib/card-art-generate";
import {
  BONUS_CARD_CHANCE,
  FEATURED_CARD_CHANCE,
  MEMBER_ART_ZOOM,
  REROLL_ENABLED,
  canRerollCard,
  cardTitle,
  type MemberCard,
  type StoredMemberCard,
} from "@/lib/card-roll";
import { sanitizeFullArtCard } from "@/lib/full-art-card";
import { rollAndDrawSlot, slotOverrides, type DrawnSlot } from "@/lib/pack-draw";
import { STANDARD_PACK_ID } from "@/lib/pack-config";
import {
  loadPackConfig,
  loadStandardPackRuntime,
  rollPackBonus,
  standardPackAllowsCardCredits,
} from "@/lib/pack-config-store";
import { buildBonusCard } from "@/lib/pack-bonus";
import { crewDefinitionToCardData, rollCrewCardDefinition } from "@/lib/crew-cards";
import {
  rollCarInitialDurability,
  rollMaintenanceConsumableCard,
} from "@/lib/mechanical-faults";
import {
  ALL_MEMBER_CARDS_INDEX,
  FEATURED_CARDS_KEY,
  MEMBER_CARD_ID_PATTERN,
  addToCommunityPool,
  fullArtCardKey,
  memberCardKey as cardKey,
  memberCardsIndexKey as indexKey,
  parseStoredCard as parseCard,
  pickCommunityCardSource,
} from "@/lib/member-card-store";
import { saveSpecSheet } from "@/actions/spec-sheets";
import { updateCarParts } from "@/actions/cars";
import { recordCommunityParts } from "@/actions/custom-parts";
import { parsePartsFromDescription } from "@/lib/spec-sheets";
import type { PartValues } from "@/lib/rc-parts-data";
import {
  attachListingStateToCards,
  getClashGameCardsConfig,
  getListingIdForCard,
  getPCredits,
  getTcgStoreConfig,
  grantPCredits,
  spendPCredits,
} from "@/tcg/storage";
import { getEffectivePrice } from "@/tcg/config";
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

/**
 * The art for a freshly rolled card: roll 1–25 stats, derive rarity tier from total (/100), roll styles, then Gemini draws it.
 * When the Standard Pack has been set up on the DriftClash Card packs page and switched on, its rarity entries (custom
 * styles and fixed set cards) can take the place of the normal card. Switched off, this rolls exactly as it always has.
 * `useConfig` is false for re-rolls, which always make a normal card.
 */
async function rollAndDraw(referenceUrl: string, useConfig = true): Promise<DrawnSlot> {
  const runtime = useConfig ? await loadStandardPackRuntime() : null;
  return rollAndDrawSlot({ referenceUrl, rng, runtime });
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

/**
 * The Standard Pack's bonus pull, or null when there is none this time. Once the bonus has been set up in the pack maker
 * (the Standard Pack's saved setup has a `bonus`) that decides everything: its chance and its cards. Until then it works
 * as it always has: 1 in 100, from the admin's pullable list. This does not depend on the Standard Pack's master switch.
 */
async function pickStandardBonusCard(): Promise<(ReturnType<typeof sanitizeFullArtCard> & { id: string }) | null> {
  const config = await loadPackConfig(STANDARD_PACK_ID).catch(() => null);
  if (config?.bonus) return rollPackBonus(config, rng);
  return rng() < FEATURED_CARD_CHANCE ? pickFeaturedCard() : null;
}

/**
 * A random card from the community pool to build another card from, or null when the pool is empty.
 * See pickCommunityCardSource in member-card-store.ts.
 */
function pickBonusSource(userId: string, excludeIds: string[] = []): Promise<StoredMemberCard | null> {
  return pickCommunityCardSource(userId, excludeIds, rng);
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
  const cards = rows
    .map(parseCard)
    .filter((c): c is StoredMemberCard => c !== null && c.userId === user.id && !c.archived)
    .map(publicCard);
  return attachListingStateToCards(cards);
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
  /** If true, the user has no car and selects to pull 2 community car cards instead of generating their own car. */
  skipPersonalCar?: boolean;
  /**
   * How the pack is paid for: 1 card credit (the default), or the Standard Pack's price in P-Credits. A card credit is
   * refused while an admin has switched card credit opening off for the Standard Pack; P-Credits always work.
   */
  payWith?: "cardCredit" | "pcredits";
}

/** Pay for the pack (a card credit, or its price in P-Credits), roll it, draw the card and add it to the collection. */
export async function openCardPack(
  input: NewCardInput
): Promise<
  ActionResult<{
    card: MemberCard;
    bonus: MemberCard | null;
    crew: MemberCard | null;
    featured: MemberCard | null;
    maintenance: MemberCard | null;
    credits: number;
    /** The member's P-Credits after paying (unchanged when a card credit was used). */
    pCredits: number;
  }>
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Please sign in to open a card pack." };

  const skipPersonalCar = Boolean(input?.skipPersonalCar);
  const driver = clamp(input?.driver, 30);
  const team = clamp(input?.team, 30);
  const chassis = clamp(input?.chassis, 48);
  const description = clamp(input?.description, 160);
  const carName = clamp(input?.carName, 40);
  if (!skipPersonalCar && !driver) return { success: false, error: "Add your name for the card.", field: "driver" };
  if (!skipPersonalCar && !isBlobUrl(input?.referenceUrl)) {
    return { success: false, error: "Choose or upload a photo of your car first.", field: "referenceUrl" };
  }

  // Checked on the server, whatever the browser shows: with card credit opening switched off, only P-Credits can pay.
  const payWithPCredits = input?.payWith === "pcredits";
  if (!payWithPCredits && !(await standardPackAllowsCardCredits())) {
    return {
      success: false,
      error: "The Standard Pack can't be opened with a card credit right now. Pay with P-Credits instead.",
    };
  }

  // One pack at a time per member, so a double tap can't spend two credits or make two cards.
  const locked = await redis.set(lockKey(user.id), "1", { nx: true, ex: LOCK_SECONDS });
  if (!locked) return { success: false, error: "A pack is already being opened. Give it a moment." };

  // Gives back whatever was taken (the card credit or the P-Credits) if the pack then fails to open.
  let refund: (() => Promise<void>) | null = null;
  try {
    if (payWithPCredits) {
      const store = await getTcgStoreConfig();
      const price = getEffectivePrice(store.standardPackPrice, store.standardPackSalePrice);
      const paid = await spendPCredits(user.id, price);
      if (!paid.ok) {
        return {
          success: false,
          error: `Not enough P-Credits. A Standard Pack costs ${price.toLocaleString()} P-Credits (you have ${paid.balance.toLocaleString()}).`,
        };
      }
      refund = async () => void (await grantPCredits(user.id, price));
    } else {
      if (!(await spendCardCredit(user.id))) {
        return { success: false, error: "You don't have a card credit. Check in at the track to earn one." };
      }
      refund = () => refundCardCredit(user.id);
    }

    let stored: StoredMemberCard;
    let bonus: StoredMemberCard | null = null;

    if (skipPersonalCar) {
      // User has no car / selected not to generate their own car: pull two community car cards instead
      const source1 = await pickBonusSource(user.id);
      if (!source1) {
        // Nothing was opened, so the member gets back what they paid.
        await refund().catch((error) => console.error("[member-cards] could not give the payment back:", error));
        return { success: false, error: "The community card pool is currently empty. Please add a car or check back soon." };
      }
      let source2 = await pickBonusSource(user.id, [source1.id]);
      if (!source2) source2 = source1;

      const [drawn1, drawn2] = await Promise.all([
        rollAndDraw(source1.referenceUrl),
        rollAndDraw(source2.referenceUrl),
      ]);

      const now = Date.now();
      const durability1 = rollCarInitialDurability(rng);
      stored = {
        id: randomUUID(),
        userId: user.id,
        createdAt: now,
        name: source1.name,
        ability: source1.ability || source1.name,
        effect: source1.effect,
        tier: drawn1.tier,
        stats: drawn1.stats,
        imageUrl: drawn1.imageUrl,
        imageZoom: MEMBER_ART_ZOOM,
        imageX: 50,
        imageY: 50,
        driver: source1.driver,
        team: source1.team,
        styleIds: drawn1.styleIds,
        ...slotOverrides(drawn1),
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: source1.referenceUrl,
        bonus: true,
        bonusFromCardId: source1.id,
        maxBattles: durability1,
        battlesRemaining: durability1,
        fault: null,
      };
      await redis.set(cardKey(stored.id), JSON.stringify(stored));
      await redis.zadd(indexKey(user.id), { score: now, member: stored.id });
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: now, member: stored.id });
      await redis.hincrby(`member:${user.id}`, "packsOpened", 1).catch(() => {});

      const bonusNow = Date.now() + 1;
      const durability2 = rollCarInitialDurability(rng);
      bonus = {
        id: randomUUID(),
        userId: user.id,
        createdAt: bonusNow,
        name: source2.name,
        ability: source2.ability || source2.name,
        effect: source2.effect,
        tier: drawn2.tier,
        stats: drawn2.stats,
        imageUrl: drawn2.imageUrl,
        imageZoom: MEMBER_ART_ZOOM,
        imageX: 50,
        imageY: 50,
        driver: source2.driver,
        team: source2.team,
        styleIds: drawn2.styleIds,
        ...slotOverrides(drawn2),
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: source2.referenceUrl,
        bonus: true,
        bonusFromCardId: source2.id,
        maxBattles: durability2,
        battlesRemaining: durability2,
        fault: null,
      };
      await redis.set(cardKey(bonus.id), JSON.stringify(bonus));
      await redis.zadd(indexKey(user.id), { score: bonusNow, member: bonus.id });
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: bonusNow, member: bonus.id });
    } else {
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
      const initialDurability = rollCarInitialDurability(rng);
      stored = {
        id: randomUUID(),
        userId: user.id,
        createdAt: now,
        name: title,
        // Always store the chassis so it pulls through to card art, details, and clash arena
        ability: chassis.trim() || carName.trim() || title,
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
        ...slotOverrides(drawn),
        // With re-rolling switched off there is nothing left to decide, so the card is kept straight away.
        kept: !REROLL_ENABLED,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: input.referenceUrl,
        maxBattles: initialDurability,
        battlesRemaining: initialDurability,
        fault: null,
      };
      await redis.set(cardKey(stored.id), JSON.stringify(stored));
      await redis.zadd(indexKey(user.id), { score: now, member: stored.id });
      // Every card is also listed for admins, who can see all stored cards.
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: now, member: stored.id });
      await redis.hincrby(`member:${user.id}`, "packsOpened", 1).catch(() => {});
      // This driver and car now stands in the community pool with this card (replacing their older one).
      await addToCommunityPool(stored).catch((error) => console.error("[member-cards] could not update the pool:", error));
      const resolvedParts = input.parts ?? parsePartsFromDescription(description);

      if (input.carId) {
        await updateCarParts(input.carId, user.id, resolvedParts, chassis).catch(() => {});
      }

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
          parts: resolvedParts,
        },
        user.id
      ).catch(() => {});

      await recordCommunityParts(resolvedParts).catch(() => {});

      // The bonus card: the other member's card details, drawn again as a whole new card (its own
      // rarity, stats, art styles and picture). It goes straight into this member's collection and
      // can't be re-rolled. Anything going wrong here leaves the member's own card untouched.
      const bonusDrawn = bonusDrawing ? await bonusDrawing : null;
      if (bonusSource && bonusDrawn) {
        try {
          const bonusNow = Date.now();
          const bonusDurability = rollCarInitialDurability(rng);
          bonus = {
            id: randomUUID(),
            userId: user.id,
            createdAt: bonusNow,
            name: bonusSource.name,
            ability: bonusSource.ability || bonusSource.name,
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
            ...slotOverrides(bonusDrawn),
            kept: true,
            rerolled: false,
            ownerName: user.name,
            referenceUrl: bonusSource.referenceUrl,
            bonus: true,
            bonusFromCardId: bonusSource.id,
            maxBattles: bonusDurability,
            battlesRemaining: bonusDurability,
            fault: null,
          };
          await redis.set(cardKey(bonus.id), JSON.stringify(bonus));
          await redis.zadd(indexKey(user.id), { score: bonusNow, member: bonus.id });
          await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: bonusNow, member: bonus.id });
        } catch (error) {
          console.error("[member-cards] could not save the bonus card:", error);
          bonus = null;
        }
      }
    }

    // 3. Every Standard Pack includes 1 Crew Card rolled from the Crew Advantage Set (including any bespoke admin cards).
    let crew: StoredMemberCard | null = null;
    try {
      const clashConfig = await getClashGameCardsConfig().catch(() => null);
      const crewDef = rollCrewCardDefinition(rng, clashConfig?.crewCards);
      const crewData = crewDefinitionToCardData(crewDef);
      const crewNow = Date.now() + 1;
      const createdCrew: StoredMemberCard = {
        id: randomUUID(),
        userId: user.id,
        createdAt: crewNow,
        ...crewData,
        styleIds: [],
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: "",
        bonus: true,
        bonusFromCardId: crewDef.id,
      };
      await redis.set(cardKey(createdCrew.id), JSON.stringify(createdCrew));
      await redis.zadd(indexKey(user.id), { score: crewNow, member: createdCrew.id });
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: crewNow, member: createdCrew.id });
      crew = createdCrew;
    } catch (error) {
      console.error("[member-cards] could not save the crew card:", error);
      crew = null;
    }

    // 4. The bonus pull: sometimes a fourth card, one of the admin's set cards. Its picture is fixed (not drawn), so
    // this is instant. Anything going wrong here leaves the rest of the pack untouched.
    let featured: StoredMemberCard | null = null;
    try {
      const source = await pickStandardBonusCard();
      if (source) {
        const featuredNow = Date.now() + 2;
        featured = buildBonusCard({ source, userId: user.id, ownerName: user.name, createdAt: featuredNow });
        await redis.set(cardKey(featured.id), JSON.stringify(featured));
        await redis.zadd(indexKey(user.id), { score: featuredNow, member: featured.id });
        await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: featuredNow, member: featured.id });
      }
    } catch (error) {
      console.error("[member-cards] could not save the bonus card:", error);
      featured = null;
    }

    // 5. Every Standard Pack includes 1 Maintenance Consumable Card for repairing Mechanical Faults!
    let maintenance: StoredMemberCard | null = null;
    try {
      const maintData = rollMaintenanceConsumableCard(rng);
      const maintNow = Date.now() + 3;
      maintenance = {
        id: randomUUID(),
        userId: user.id,
        createdAt: maintNow,
        ...maintData,
        styleIds: [],
        kept: true,
        rerolled: false,
        ownerName: user.name,
        referenceUrl: "",
        bonus: true,
      };
      await redis.set(cardKey(maintenance.id), JSON.stringify(maintenance));
      await redis.zadd(indexKey(user.id), { score: maintNow, member: maintenance.id });
      await redis.zadd(ALL_MEMBER_CARDS_INDEX, { score: maintNow, member: maintenance.id });
    } catch (error) {
      console.error("[member-cards] could not save the maintenance card:", error);
      maintenance = null;
    }

    revalidatePath("/cards");
    revalidateTag("admin-members", "max");
    return {
      success: true,
      data: {
        card: publicCard(stored),
        bonus: bonus ? publicCard(bonus) : null,
        crew: crew ? publicCard(crew) : null,
        featured: featured ? publicCard(featured) : null,
        maintenance: maintenance ? publicCard(maintenance) : null,
        credits: await getCardCredits(user.id),
        pCredits: await getPCredits(user.id),
      },
    };
  } catch (error) {
    // The pack didn't open, so the member gets their credit (or P-Credits) back.
    if (refund) await refund().catch((e) => console.error("[member-cards] could not give the payment back:", e));
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
  if (await getListingIdForCard(cardId)) {
    return { success: false, error: "Unlist this card from the Marketplace before re-rolling." };
  }
  if (!canRerollCard(existing)) {
    return { success: false, error: "This card can't be re-rolled any more." };
  }

  const locked = await redis.set(lockKey(user.id), "1", { nx: true, ex: LOCK_SECONDS });
  if (!locked) return { success: false, error: "A pack is already being opened. Give it a moment." };

  try {
    // Look again now we hold the lock, so two quick taps can't both re-roll.
    const fresh = await loadOwnCard(user.id, cardId);
    if (!fresh || !canRerollCard(fresh)) return { success: false, error: "This card can't be re-rolled any more." };

    const drawn = await rollAndDraw(fresh.referenceUrl, false);
    const updated: StoredMemberCard = {
      ...fresh,
      tier: drawn.tier,
      styleIds: drawn.styleIds,
      ...slotOverrides(drawn),
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
