import { redis } from "@/lib/redis";
import { awardCardCredit } from "@/lib/card-credits";

/**
 * Increment a member's lifetime check-in counter and record the latest
 * check-in time. Stored on the `member:<id>` hash so it's read for free by
 * getAllMembers (which already hgetall's the whole hash).
 *
 * Guests (synthetic `guest_*` ids) have no member hash and get a new id every
 * visit, so they are skipped — there's nothing meaningful to count for them.
 *
 * Also gives the member their card credit for the day (see lib/card-credits.ts).
 */
export async function recordCheckInCount(
  userId: string,
  timestamp: number = Date.now()
): Promise<void> {
  try {
    if (!userId || userId.startsWith("guest_")) return;
    await redis
      .multi()
      .hincrby(`member:${userId}`, "checkinCount", 1)
      .hset(`member:${userId}`, { lastCheckIn: timestamp })
      .exec();
  } catch (error) {
    // Non-critical: never let counter bookkeeping break a check-in.
    console.error("[checkin-count] failed to record:", error);
  }
  // Every member check-in goes through here, so this is also where the day's card credit is earned.
  // It is once per member per day and never throws.
  await awardCardCredit(userId, timestamp);
}
