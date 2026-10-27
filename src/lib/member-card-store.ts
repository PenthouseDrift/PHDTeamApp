import type { StoredMemberCard } from "@/lib/card-roll";

/**
 * Where member cards live in Redis, shared by the member actions and the admin view.
 *
 *   usercard:<id>              one JSON string per card
 *   member:<userId>:usercards  sorted set of that member's own cards (scored by when opened); what "My cards" lists
 *   usercards:all              sorted set of EVERY card ever opened, including ones re-rolled away; what admins list
 *
 * A re-rolled card is not deleted: its old version is kept as an archived card that only appears in
 * the admin list.
 */
export const memberCardKey = (id: string) => `usercard:${id}`;
export const memberCardsIndexKey = (userId: string) => `member:${userId}:usercards`;
export const ALL_MEMBER_CARDS_INDEX = "usercards:all";

export const MEMBER_CARD_ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

/** A stored card from whatever Redis returned (a JSON string or an already-parsed object), or null if it isn't one. */
export function parseStoredCard(raw: unknown): StoredMemberCard | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const c = value as StoredMemberCard;
    return typeof c.id === "string" && typeof c.userId === "string" ? c : null;
  } catch {
    return null;
  }
}
