import { redis } from "@/lib/redis";
import { bustAdminMembers } from "@/lib/cache-bust";

/**
 * Card credits: a check-in at the track earns 1 credit, or 2 when the member has an active paid
 * membership at the time, and opening a card pack spends 1. The balance is a field on the
 * `member:<id>` hash (like `checkinCount` and `aiGenerations`), so it can be read with the rest of
 * the member's data.
 *
 * Earning is once per member per day. A claim key (`cardcredit:claim:<id>:<YYYY-MM-DD>`, the same UTC
 * day the `checkins:<date>` lists use) is set with NX, so the several check-in code paths, a
 * double-tap, or staff checking someone in again the same day can never pay out twice. Removing or
 * undoing a check-in does not take the credit back, and does not let a second one be earned that day.
 */

/** Credits for a check-in, and for a check-in by a member with an active membership. */
export const CREDITS_PER_CHECKIN = 1;
export const CREDITS_PER_CHECKIN_MEMBER = 2;

const FIELD = "cardCredits";
const memberKey = (userId: string) => `member:${userId}`;
const dayOf = (timestamp: number) => new Date(timestamp).toISOString().split("T")[0];

/** Current balance. */
export async function getCardCredits(userId: string): Promise<number> {
  if (!userId) return 0;
  const raw = await redis.hget(memberKey(userId), FIELD);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * What a check-in at this time earns: the member rate when their membership (the `membership:<id>`
 * record every activation path writes: online payment, cash at the desk, admin) hasn't expired yet.
 * If the membership can't be read, the normal rate applies rather than failing the check-in.
 */
async function creditsForCheckIn(userId: string, timestamp: number): Promise<number> {
  try {
    const [expiresAtRaw, role] = await Promise.all([
      redis.hget(`membership:${userId}`, "expiresAt"),
      redis.hget(memberKey(userId), "role"),
    ]);
    if (role === "admin" || role === "moderator") return CREDITS_PER_CHECKIN_MEMBER;
    const expiresAt = Number(expiresAtRaw);
    return Number.isFinite(expiresAt) && expiresAt > timestamp ? CREDITS_PER_CHECKIN_MEMBER : CREDITS_PER_CHECKIN;
  } catch (error) {
    console.error("[card-credits] could not check membership:", error);
    return CREDITS_PER_CHECKIN;
  }
}

/**
 * Give the member their credits for this check-in (1, or 2 with an active membership), unless they
 * were already given for the same day. Never throws, so a problem here can't break a check-in.
 * Guests (`guest_*`) have no account and earn nothing.
 */
export async function awardCardCredit(userId: string, timestamp: number = Date.now()): Promise<boolean> {
  if (!userId || userId.startsWith("guest_")) return false;
  const claimKey = `cardcredit:claim:${userId}:${dayOf(timestamp)}`;
  try {
    const amount = await creditsForCheckIn(userId, timestamp);
    const claimed = await redis.set(claimKey, String(amount), { nx: true, ex: 60 * 60 * 48 });
    if (!claimed) return false;
    try {
      await redis.hincrby(memberKey(userId), FIELD, amount);
      bustAdminMembers();
    } catch (error) {
      await redis.del(claimKey).catch(() => {});
      throw error;
    }
    return true;
  } catch (error) {
    console.error("[card-credits] failed to award:", error);
    return false;
  }
}

/** Add credits to a balance without a check-in (test tools and, later, any manual grant). */
export async function grantCardCredits(userId: string, amount: number): Promise<number> {
  const n = Math.max(1, Math.floor(amount) || 1);
  return redis.hincrby(memberKey(userId), FIELD, n);
}

/** Add (positive) or remove (negative) credits. The balance never goes below zero. Returns the new balance. */
export async function adjustCardCredits(userId: string, delta: number): Promise<number> {
  const n = Math.trunc(delta);
  if (n === 0) return getCardCredits(userId);
  const after = await redis.hincrby(memberKey(userId), FIELD, n);
  if (after < 0) {
    // Took more than they had: put back what went below zero.
    await redis.hincrby(memberKey(userId), FIELD, -after);
    return 0;
  }
  return after;
}

/** Set the balance back to zero. */
export async function clearCardCredits(userId: string): Promise<void> {
  await redis.hset(memberKey(userId), { [FIELD]: 0 });
}

/** Take one credit if there is one. Returns false (and changes nothing) when the balance is empty. */
export async function spendCardCredit(userId: string): Promise<boolean> {
  const left = await redis.hincrby(memberKey(userId), FIELD, -1);
  if (left < 0) {
    // Went below zero, so there was nothing to spend. Put it back.
    await redis.hincrby(memberKey(userId), FIELD, 1);
    return false;
  }
  return true;
}

/** Give back a credit that was spent on a pack that then failed to open. */
export async function refundCardCredit(userId: string): Promise<void> {
  try {
    await redis.hincrby(memberKey(userId), FIELD, 1);
  } catch (error) {
    console.error("[card-credits] failed to refund:", error);
  }
}
