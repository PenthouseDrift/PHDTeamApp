import { redis } from "@/lib/redis";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import { fullArtCardKey } from "@/lib/member-card-store";
import { QUESTION_IMAGE, sanitizePackStyle, styleToPreviewCard } from "@/lib/pack-styles";
import { packStyleKey } from "@/lib/pack-styles-store";
import { COMING_SOON_NAME, HIDDEN_STAT, sanitizeComingSoonList, type ComingSoonCard, type ComingSoonItem } from "@/lib/coming-soon";

/**
 * Where the "Coming soon" list lives in Redis: one JSON string (`tcg:coming-soon`) holding the ordered list
 * of teasers (see coming-soon.ts). Reading needs no admin session because members see the row on their
 * Home page; it only ever returns what a card looks like.
 */
export const COMING_SOON_KEY = "tcg:coming-soon";

/** The saved list in the admin's order. Throws if Redis cannot be read. */
export async function loadComingSoonItems(): Promise<ComingSoonItem[]> {
  return sanitizeComingSoonList(await redis.get(COMING_SOON_KEY));
}

export async function saveComingSoonItems(items: ComingSoonItem[]): Promise<void> {
  await redis.set(COMING_SOON_KEY, JSON.stringify(items));
}

/**
 * Turn the list into cards a member can be shown. A saved card or style that no longer exists is left out.
 * A card or style with no picture yet is shown as a "?" card, which suits a teaser.
 */
export async function resolveComingSoon(items: ComingSoonItem[]): Promise<ComingSoonCard[]> {
  if (items.length === 0) return [];
  const keys = items.map((i) => (i.source === "card" ? fullArtCardKey(i.refId) : packStyleKey(i.refId)));
  const rows = await redis.mget(...keys);
  const out: ComingSoonCard[] = [];
  items.forEach((item, idx) => {
    const raw = rows[idx];
    let card: FullArtCardData | null = null;
    try {
      if (item.source === "card") {
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (value && typeof value === "object") card = sanitizeFullArtCard(value as Partial<FullArtCardData>);
      } else {
        const style = sanitizePackStyle(raw);
        // A style has no stats or text of its own, so drop the preview's "Sample" wording.
        if (style) card = { ...styleToPreviewCard(style, item.tier ?? "legend"), ability: "Coming soon", effect: "" };
      }
    } catch {
      card = null;
    }
    if (!card) return;
    out.push({
      id: item.id,
      // Members see a teaser: the real name and stats stay on the server.
      card: {
        ...card,
        id: item.id,
        name: COMING_SOON_NAME,
        stats: { drift: HIDDEN_STAT, accel: HIDDEN_STAT, grip: HIDDEN_STAT, steer: HIDDEN_STAT },
        imageUrl: card.imageUrl || QUESTION_IMAGE,
      },
      when: item.when,
      note: item.note,
    });
  });
  return out;
}

/** The Home page row. A failed read gives an empty list so the page still loads. */
export async function getComingSoonCards(): Promise<ComingSoonCard[]> {
  try {
    return await resolveComingSoon(await loadComingSoonItems());
  } catch (error) {
    console.error("[tcg] could not load the coming soon row:", error);
    return [];
  }
}
