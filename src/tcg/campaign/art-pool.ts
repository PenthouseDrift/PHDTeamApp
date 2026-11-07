import { isCrewCard } from "@/lib/crew-cards";
import { sanitizeFullArtCard } from "@/lib/full-art-card";
import { ALL_MEMBER_CARDS_INDEX, fullArtCardKey, memberCardKey, parseStoredCard } from "@/lib/member-card-store";
import { redis } from "@/lib/redis";
import { loadPackStyles } from "@/lib/pack-styles-store";
import type { ArtEntry } from "./types";

/**
 * Every car picture in the game, as a list of faces the campaign can put generated stats on: members' car cards and the
 * admin's saved full-art cards. Duplicate pictures are dropped, and cards with no real picture (the grey placeholder
 * icon) are skipped. Server only.
 *
 * Two kinds of saved card are left out because they are not cars: a card whose picture is an art style's sample image, and an
 * admin card with no driver and no team (a test or draft made while building a style, such as "jap art").
 */

const MAX_MEMBER_CARDS = 600;
const MAX_FULL_ART_CARDS = 200;
const CHUNK = 100;

const hasRealPicture = (url: unknown): url is string => typeof url === "string" && url.length > 0 && !url.startsWith("/icons/");

/**
 * The pool, kept in this server's memory for a few minutes. Building it reads and parses hundreds of cards, and every cup
 * start and every later round needs it, so it is shared. Changes to cards show up when the copy expires.
 */
const POOL_MS = 10 * 60_000;
let pooled: { at: number; pool: Promise<ArtEntry[]> } | null = null;
export async function loadArtPoolCached(): Promise<ArtEntry[]> {
  if (!pooled || Date.now() - pooled.at > POOL_MS) {
    const entry = { at: Date.now(), pool: loadArtPool() };
    // A failed read must not be kept.
    entry.pool.catch(() => {
      if (pooled === entry) pooled = null;
    });
    pooled = entry;
  }
  return pooled.pool;
}

export async function loadArtPool(): Promise<ArtEntry[]> {
  const byImage = new Map<string, ArtEntry>();
  // The sample pictures of the art styles are examples of a look, not cars.
  const styleSamples = new Set<string>();
  try {
    for (const style of await loadPackStyles()) if (style.sampleImageUrl) styleSamples.add(style.sampleImageUrl);
  } catch {
    // Without the styles the pool is still built; the other checks below still apply.
  }

  const memberIds = ((await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, MAX_MEMBER_CARDS - 1, { rev: true })) as string[]).map(String);
  for (let i = 0; i < memberIds.length; i += CHUNK) {
    const rows = await redis.mget(...memberIds.slice(i, i + CHUNK).map(memberCardKey));
    for (const row of rows) {
      const card = parseStoredCard(row);
      if (!card || card.archived) continue;
      if (card.cardType && card.cardType !== "car") continue;
      if (card.crewCardId || isCrewCard(card)) continue;
      if (!hasRealPicture(card.imageUrl) || byImage.has(card.imageUrl) || styleSamples.has(card.imageUrl)) continue;
      byImage.set(card.imageUrl, {
        key: card.imageUrl,
        tier: card.tier,
        name: card.name || "Unnamed Car",
        driver: card.driver || "Unknown Driver",
        team: card.team || "Independent",
        imageUrl: card.imageUrl,
        imageZoom: card.imageZoom ?? 100,
        imageX: card.imageX ?? 50,
        imageY: card.imageY ?? 50,
      });
    }
  }

  const fullArtIds = ((await redis.zrange("fullart:index", 0, MAX_FULL_ART_CARDS - 1, { rev: true })) as string[]).map(String);
  for (let i = 0; i < fullArtIds.length; i += CHUNK) {
    const rows = await redis.mget(...fullArtIds.slice(i, i + CHUNK).map(fullArtCardKey));
    for (const row of rows) {
      if (!row) continue;
      try {
        const card = sanitizeFullArtCard(typeof row === "string" ? JSON.parse(row) : (row as object));
        if (card.cardType && card.cardType !== "car") continue;
        if (card.crewCardId || isCrewCard(card)) continue;
        if (!hasRealPicture(card.imageUrl) || byImage.has(card.imageUrl) || styleSamples.has(card.imageUrl)) continue;
        // A saved card with no driver and no team is a test or draft, not a car (a real set car names its driver or team).
        if (!card.driver?.trim() && !card.team?.trim()) continue;
        byImage.set(card.imageUrl, {
          key: card.imageUrl,
          tier: card.tier,
          name: card.name || "Set Car",
          driver: card.driver || "Pro Spec",
          team: card.team || "Team PHD",
          imageUrl: card.imageUrl,
          imageZoom: card.imageZoom,
          imageX: card.imageX,
          imageY: card.imageY,
        });
      } catch {
        // A card that will not parse is just not used.
      }
    }
  }

  return [...byImage.values()];
}
