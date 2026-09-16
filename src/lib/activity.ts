import { redis } from "@/lib/redis";

export interface ActivityEntry {
  id: string;
  type: "purchase" | "checkin";
  memberId: string;
  memberName: string;
  description: string;
  amount?: number;
  currency?: string;
  /**
   * Check-in method for `type: "checkin"` entries (e.g. "day_pass_cash").
   * Used to distinguish door revenue (cash/in-person) from wallet redemptions
   * (already counted at online purchase time) on the revenue report.
   */
  method?: string;
  /**
   * True when a cash/in-person check-in has NOT been paid for yet. Unpaid
   * entries carry no `amount` and are excluded from revenue until marked paid.
   */
  unpaid?: boolean;
  isDev?: boolean;
  timestamp: number;
}

export async function logActivity(
  params: Omit<ActivityEntry, "id" | "timestamp"> & { timestamp?: number }
) {
  try {
    // Allow callers to pass an explicit timestamp so a check-in list entry and
    // its activity-log entry share the same timestamp (used to match them when
    // marking an unpaid check-in as paid). Falls back to now.
    const timestamp = params.timestamp ?? Date.now();
    const id = `act_${timestamp}_${Math.random().toString(36).substring(7)}`;
    
    const entry: ActivityEntry = {
      ...params,
      id,
      timestamp,
    };

    // Keep the log to maximum ~5000 items (or just use zadd for now)
    await redis.zadd("activity:log", { score: timestamp, member: JSON.stringify(entry) });

    // Bust the cached activity feed so the new entry shows up in the admin
    // activity log instead of waiting for the time-based revalidation window.
    // This runs from contexts like the payment webhook (not a Server Action),
    // so we use revalidateTag with the "max" profile (Next 16) for background
    // invalidation rather than updateTag.
    try {
      const { revalidateTag } = await import("next/cache");
      revalidateTag("activity-log", "max");
    } catch {
      // revalidateTag is only available in a request/render context; ignore otherwise.
    }
  } catch (error) {
    console.error("[Activity Logger] Failed to log activity:", error);
  }
}
