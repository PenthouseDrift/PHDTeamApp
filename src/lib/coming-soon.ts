/**
 * The "Coming soon" teaser row on the game's Home page: cards the admin wants members to see before they
 * can be pulled. Pure (no server imports) so the admin editor, the server actions and the member page share
 * one definition.
 *
 * Each item points at either a saved full art card (made in the card maker) or a style from the style
 * library shown at a chosen rarity. The item stores only the reference, so edits to the card or style carry
 * through; one that has been deleted is simply not shown.
 */
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { ALL_TIERS, ID_PATTERN } from "@/lib/pack-styles";

export type ComingSoonSource = "card" | "style";

export interface ComingSoonItem {
  /** This teaser's own id. */
  id: string;
  source: ComingSoonSource;
  /** The saved full art card's id, or the style's id. */
  refId: string;
  /** The rarity a style is shown at. Not used for saved cards, which have their own. */
  tier?: FullArtTier;
  /** Short release hint under the card, e.g. "Next week" or "Friday 14 Nov". */
  when: string;
  /** Optional one-line note, e.g. "Joins the Summer Pack". */
  note: string;
}

/** What a member sees: the card to draw and its captions. Nothing about prompts or odds. */
export interface ComingSoonCard {
  id: string;
  card: FullArtCardData;
  when: string;
  note: string;
}

/** What members see in place of a teaser card's real name and stats. */
export const COMING_SOON_NAME = "Coming soon";
export const HIDDEN_STAT = "???";

export const MAX_COMING_SOON = 12;
export const COMING_SOON_WHEN_MAX = 40;
export const COMING_SOON_NOTE_MAX = 80;
export const DEFAULT_COMING_SOON_TIER: FullArtTier = "legend";

const clampStr = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** One item from untrusted input, or null if it can't be used. */
export function sanitizeComingSoonItem(value: unknown): ComingSoonItem | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const source = v.source === "card" || v.source === "style" ? v.source : null;
  const id = typeof v.id === "string" && ID_PATTERN.test(v.id) ? v.id : null;
  const refId = typeof v.refId === "string" && ID_PATTERN.test(v.refId) ? v.refId : null;
  if (!source || !id || !refId) return null;
  const item: ComingSoonItem = {
    id,
    source,
    refId,
    when: clampStr(v.when, COMING_SOON_WHEN_MAX),
    note: clampStr(v.note, COMING_SOON_NOTE_MAX),
  };
  if (source === "style") {
    item.tier = ALL_TIERS.find((t) => t === v.tier) ?? DEFAULT_COMING_SOON_TIER;
  }
  return item;
}

/** The saved list: valid items only, no repeats of the same card or style at the same rarity, in the given order. */
export function sanitizeComingSoonList(value: unknown): ComingSoonItem[] {
  const list = typeof value === "string" ? safeParse(value) : value;
  if (!Array.isArray(list)) return [];
  const seenIds = new Set<string>();
  const seenRefs = new Set<string>();
  const out: ComingSoonItem[] = [];
  for (const raw of list) {
    const item = sanitizeComingSoonItem(raw);
    if (!item || seenIds.has(item.id)) continue;
    const ref = `${item.source}:${item.refId}:${item.tier ?? ""}`;
    if (seenRefs.has(ref)) continue;
    seenIds.add(item.id);
    seenRefs.add(ref);
    out.push(item);
    if (out.length >= MAX_COMING_SOON) break;
  }
  return out;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
