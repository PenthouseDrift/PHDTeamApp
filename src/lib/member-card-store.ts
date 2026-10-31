import { redis } from "@/lib/redis";
import { tierFromStats, type StoredMemberCard } from "@/lib/card-roll";
import { crewDefinitionToCardData, getCrewCardDefinition, scaleCrewCardDefinition } from "@/lib/crew-cards";

/**
 * Where member cards live in Redis, shared by the member actions and the admin view.
 *
 *   usercard:<id>              one JSON string per card
 *   member:<userId>:usercards  sorted set of that member's own cards (scored by when opened); what "My cards" lists
 *   usercards:all              sorted set of EVERY card ever opened, including ones re-rolled away; what admins list
 *   usercards:pool             the community pool: sorted set holding ONE card per driver and car (see below)
 *   usercards:pool:bycar       hash from "driver and car" to the card id that stands for it in the pool
 *
 * A re-rolled card is not deleted: its old version is kept as an archived card that only appears in
 * the admin list.
 */
export const memberCardKey = (id: string) => `usercard:${id}`;
export const memberCardsIndexKey = (userId: string) => `member:${userId}:usercards`;
export const ALL_MEMBER_CARDS_INDEX = "usercards:all";

/**
 * The pullable set cards. An admin marks a saved full art card (`fullart:<id>`, made in the admin card
 * maker) as pullable, and it goes in this hash as card id -> odds weight. A pack's third card is one of
 * these, picked in proportion to its weight. Their pictures are fixed and never drawn again.
 */
export const FEATURED_CARDS_KEY = "fullart:featured";
export const fullArtCardKey = (id: string) => `fullart:${id}`;
export const MIN_FEATURED_WEIGHT = 1;
export const MAX_FEATURED_WEIGHT = 100;

export const MEMBER_CARD_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

/** A stored card from whatever Redis returned (a JSON string or an already-parsed object), or null if it isn't one. */
export function parseStoredCard(raw: unknown): StoredMemberCard | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const c = value as StoredMemberCard;
    if (typeof c.id !== "string" || typeof c.userId !== "string") return null;
    if ((c.cardType === "crew" || c.crewCardId) && c.crewCardId) {
      const def = getCrewCardDefinition(c.crewCardId);
      if (def) {
        const tier = (c.tier as any) || def.tier;
        const scaled = scaleCrewCardDefinition(def, tier);
        const fresh = crewDefinitionToCardData(scaled);
        return {
          ...c,
          name: fresh.name,
          ability: fresh.ability,
          effect: fresh.effect,
          tier: scaled.tier,
          driver: fresh.driver,
          team: fresh.team,
          imageUrl: fresh.imageUrl,
          cardType: "crew",
          crewCardId: def.id,
          crewIcon: def.icon,
        };
      }
    }
    // Auto-heal maintenance card SVGs to centered crosshairs
    if (c.cardType === "maintenance" && typeof c.imageUrl === "string" && c.imageUrl.startsWith("data:image/svg+xml")) {
      c.imageUrl = c.imageUrl
        .replace(/y%3D%22340%22/g, 'y%3D%22300%22')
        .replace(/y="340"/g, 'y="300"');
    }
    // Auto-heal car cards: stats scale (25 max, x/100 total), mythic (25 25 25 25), high legend for set cards, chassis/ability or initial durability
    if (!c.cardType && !c.crewCardId) {
      const ability =
        !c.ability || c.ability.trim() === ""
          ? (c as { chassis?: string }).chassis?.trim() || c.name || ""
          : c.ability;
      const maxBattles = typeof c.maxBattles === "number" ? c.maxBattles : 6;
      const battlesRemaining =
        typeof c.battlesRemaining === "number" ? c.battlesRemaining : maxBattles;

      let tier = c.tier;
      let stats = c.stats ? { ...c.stats } : { drift: "15", accel: "15", grip: "15", steer: "15" };

      if (tier === "mythic") {
        stats = { drift: "25", accel: "25", grip: "25", steer: "25" };
      } else if (c.featured) {
        tier = "legend";
        const dVal = Number.parseInt(stats.drift || "0", 10);
        if (dVal < 20) {
          stats = { drift: "24", accel: "23", grip: "23", steer: "24" };
        }
      }

      // Auto-scale ANY non-mythic car (standard cards, community bonus cards, etc.) if on legacy 1..10 scale
      if (tier !== "mythic") {
        const vals = [
          Number.parseInt(stats.drift, 10),
          Number.parseInt(stats.accel, 10),
          Number.parseInt(stats.grip, 10),
          Number.parseInt(stats.steer, 10),
        ].filter((n) => Number.isFinite(n));
        if (vals.length > 0 && Math.max(...vals) <= 10) {
          stats = {
            drift: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.drift, 10) || 5) * 2.5)))),
            accel: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.accel, 10) || 5) * 2.5)))),
            grip: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.grip, 10) || 5) * 2.5)))),
            steer: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.steer, 10) || 5) * 2.5)))),
          };
        }
      }

      // Re-derive rarity tier according to active RARITY_STAT_BRACKETS:
      // Bronze: 4–59, Silver: 60–74, Gold: 75–84, Legend: 85–99, Mythic: 100
      if (!c.featured) {
        tier = tierFromStats(stats);
      }

      return {
        ...c,
        ability,
        tier,
        stats,
        maxBattles,
        battlesRemaining,
        fault: c.fault ?? null,
      };
    }
    return c;
  } catch {
    return null;
  }
}

// ── The community pool ──────────────────────────────────────────────────────
//
// The extra card in a pack is built from a card in the pool. The pool holds one card for each
// driver and car, however many cards were made of it: a member with three cars and thirty cards
// adds three entries, the same as three members with one card each. That keeps one busy member from
// filling the pool, so every driver and car is equally likely to be picked. The card standing in for
// a driver and car is their newest one, so the details (parts, team) stay up to date.

export const COMMUNITY_POOL_INDEX = "usercards:pool";
const POOL_BY_CAR = "usercards:pool:bycar";
/** Set once the pool has been built from the cards that existed before it did. */
const POOL_BUILT = "usercards:pool:built";

/** One driver and car: the member, the driver name on the card and the car's name, ignoring case and spacing. */
export function communityKey(card: Pick<StoredMemberCard, "userId" | "driver" | "name">): string {
  const norm = (v: string) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return `${card.userId}|${norm(card.driver)}|${norm(card.name)}`;
}

/** A card can stand in the pool when it is a real, current card: not re-rolled away, not itself a second-slot card, and not a Crew modifier or Maintenance card. */
export const isCommunityCard = (card: StoredMemberCard | null): card is StoredMemberCard =>
  Boolean(
    card &&
      !card.archived &&
      !card.bonus &&
      card.cardType !== "crew" &&
      card.cardType !== "maintenance" &&
      !card.crewCardId &&
      card.driver?.trim()
  );

/** Make this card the pool's card for its driver and car, replacing the older one. */
export async function addToCommunityPool(card: StoredMemberCard): Promise<void> {
  if (!isCommunityCard(card)) return;
  const field = communityKey(card);
  const previous = await redis.hget<string>(POOL_BY_CAR, field);
  const tx = redis.multi();
  if (previous && previous !== card.id) tx.zrem(COMMUNITY_POOL_INDEX, previous);
  tx.hset(POOL_BY_CAR, { [field]: card.id });
  tx.zadd(COMMUNITY_POOL_INDEX, { score: card.createdAt, member: card.id });
  await tx.exec();
}

/**
 * A card has been deleted. If it was the one standing in the pool for its driver and car, another
 * card of the same driver and car takes its place, or the driver and car leaves the pool if there is
 * none. Call this after the card is gone from its owner's list.
 */
export async function removeFromCommunityPool(card: StoredMemberCard): Promise<void> {
  const field = communityKey(card);
  const standing = await redis.hget<string>(POOL_BY_CAR, field);
  if (standing !== card.id) {
    // Not the one in the pool, but make sure a stray entry for this id can't linger.
    await redis.zrem(COMMUNITY_POOL_INDEX, card.id);
    return;
  }
  await redis.multi().zrem(COMMUNITY_POOL_INDEX, card.id).hdel(POOL_BY_CAR, field).exec();

  const ids = (await redis.zrange(memberCardsIndexKey(card.userId), 0, 499, { rev: true })) as string[];
  if (!ids || ids.length === 0) return;
  const rows = await redis.mget(...ids.map((id) => memberCardKey(String(id))));
  const next = rows
    .map(parseStoredCard)
    .find((c) => isCommunityCard(c) && c.id !== card.id && communityKey(c) === field);
  if (next) await addToCommunityPool(next);
}

/**
 * Build the pool from every card that exists, newest card per driver and car. Safe to run any
 * time: it replaces the pool with exactly what the cards say. Returns how many drivers and cars are in it.
 */
export async function rebuildCommunityPool(): Promise<number> {
  const ids = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, -1)) as string[];
  const newest = new Map<string, StoredMemberCard>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await redis.mget(...ids.slice(i, i + 100).map((id) => memberCardKey(String(id))));
    for (const row of rows) {
      const card = parseStoredCard(row);
      if (!isCommunityCard(card)) continue;
      const field = communityKey(card);
      const seen = newest.get(field);
      if (!seen || card.createdAt > seen.createdAt) newest.set(field, card);
    }
  }

  const tx = redis.multi().del(COMMUNITY_POOL_INDEX).del(POOL_BY_CAR);
  for (const [field, card] of newest) {
    tx.hset(POOL_BY_CAR, { [field]: card.id });
    tx.zadd(COMMUNITY_POOL_INDEX, { score: card.createdAt, member: card.id });
  }
  tx.set(POOL_BUILT, "1");
  await tx.exec();
  return newest.size;
}

/** Build the pool the first time it is needed, from the cards made before the pool existed. */
export async function ensureCommunityPool(): Promise<void> {
  if (!(await redis.get(POOL_BUILT))) await rebuildCommunityPool();
}
