import { redis } from "@/lib/redis";
import { AUTO_CHECKIN_FIELDS } from "@/lib/auto-checkin-prefs";

/**
 * Called by the payment finalizer right after a day pass / rental hour has been
 * credited. If the member has switched auto check-in ON for that kind of pass,
 * and a track event is open right now, and they haven't already checked in
 * today, it uses the pass they just bought to check them in.
 *
 * It only ever does that when ALL of those are true; otherwise the pass simply
 * stays in the wallet exactly as before. Returns true if a check-in happened.
 * Never throws: a problem here must not undo or fail the payment.
 */
export async function tryAutoCheckIn(memberId: string, kind: "day_pass" | "rental"): Promise<boolean> {
  try {
    // One field read; this only runs when a pass has just been paid for.
    const field = kind === "day_pass" ? AUTO_CHECKIN_FIELDS.dayPass : AUTO_CHECKIN_FIELDS.rental;
    const pref = await redis.hget(`member:${memberId}`, field);
    if (!(pref === true || pref === "true")) return false;

    const { getSelfCheckInStatus } = await import("@/actions/admin/checkins");
    if (!(await getSelfCheckInStatus())) return false;

    const { performSelfCheckIn } = await import("@/actions/self-checkin");
    const result = await performSelfCheckIn(memberId, kind, true);
    if (result.success) {
      // The wallet changed and they're now on the track.
      const { bustAdminMembers } = await import("@/lib/cache-bust");
      bustAdminMembers();
    }
    return result.success;
  } catch (error) {
    console.error("[AutoCheckIn] failed:", error);
    return false;
  }
}

/**
 * True when this member has auto check-in on for that pass type AND is checked
 * in today. Used to tell the buyer "you were checked in automatically" even when
 * the webhook (not their own request) did the processing.
 */
export async function autoCheckInApplied(memberId: string, kind: "day_pass" | "rental"): Promise<boolean> {
  try {
    const field = kind === "day_pass" ? AUTO_CHECKIN_FIELDS.dayPass : AUTO_CHECKIN_FIELDS.rental;
    const [pref, dedup] = await Promise.all([redis.hget(`member:${memberId}`, field), redis.get(`checkin:dedup:${memberId}`)]);
    return (pref === true || pref === "true") && Boolean(dedup);
  } catch {
    return false;
  }
}
