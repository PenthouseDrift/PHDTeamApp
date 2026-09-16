"use server";

import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";
import { revalidatePath, updateTag } from "next/cache";
import { auth } from "@/lib/auth";
import {
  CURRENCY,
  resolveActivityItem,
  priceFor,
  getMemberDiscounts,
  type MemberDiscounts,
} from "@/lib/pricing";
import type { ActivityEntry } from "@/lib/activity";

export const getRecentActivity = unstable_cache(
  async () => {
    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    
    const parsed = (records || []).map(str => {
      try {
        return typeof str === "string" ? JSON.parse(str) : str;
      } catch {
        return null;
      }
    }).filter(Boolean);

    const checkinsByMemberDate = new Map<string, any[]>();
    for (const item of parsed) {
      if (item.type === "checkin") {
        const date = new Date(item.timestamp).toISOString().split("T")[0];
        const key = `${item.memberId}_${date}`;
        if (!checkinsByMemberDate.has(key)) {
          checkinsByMemberDate.set(key, []);
        }
        checkinsByMemberDate.get(key)!.push(item);
      }
    }

    const itemsToHide = new Set<string>();
    for (const checkins of checkinsByMemberDate.values()) {
      if (checkins.length > 1) {
        checkins.sort((a, b) => (b.description?.length || 0) - (a.description?.length || 0));
        for (let i = 1; i < checkins.length; i++) {
          itemsToHide.add(checkins[i].id);
        }
      }
    }

    return parsed.filter((item: any) => !itemsToHide.has(item.id));
  },
  ["global-activity-log"],
  {
    revalidate: 3600, // Cache for 1 hour by default, will be revalidated on demand
    tags: ["activity-log"],
  }
);

export async function refreshActivityLog() {
  // Bust the unstable_cache data entry (keyed/tagged "activity-log"). A plain
  // revalidatePath does NOT invalidate the cached data, so the tag must be used.
  // updateTag (Next 16) blocks until the data is fresh, giving read-your-own-writes
  // so the admin sees the latest activity immediately after clicking Refresh.
  updateTag("activity-log");
  revalidatePath("/admin/activity");
  return { success: true };
}

/**
 * Mark the check-in activity entry identified by (memberId, timestamp) as paid:
 * clears its `unpaid` flag and sets the given amount so it counts toward
 * revenue. Called when an admin marks an unpaid check-in as paid.
 */
export async function markActivityCheckInPaid(
  memberId: string,
  timestamp: number,
  amount: number,
  currency: string
): Promise<{ success: boolean }> {
  try {
    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    for (const item of records) {
      const parsed = typeof item === "string" ? JSON.parse(item) : (item as any);
      if (
        parsed &&
        parsed.type === "checkin" &&
        parsed.memberId === memberId &&
        Number(parsed.timestamp) === Number(timestamp)
      ) {
        // Remove the old member (matching the exact stored form) and re-add the
        // updated one at the same score.
        await redis.zrem("activity:log", item as any);
        // Rewrite the description so it no longer reads "Not Paid Yet".
        // Handles both "(Not Paid Yet)" (member cash) and ", Not Paid Yet)"
        // (guest, e.g. "(day_pass, Not Paid Yet)").
        const newDescription =
          typeof parsed.description === "string"
            ? parsed.description
                .replace(/\(Not Paid Yet\)/i, "(Paid Cash)")
                .replace(/,\s*Not Paid Yet\)/i, ", Paid)")
            : parsed.description;
        const updated = { ...parsed, unpaid: false, amount, currency, description: newDescription };
        await redis.zadd("activity:log", {
          score: Number(parsed.timestamp),
          member: JSON.stringify(updated),
        });
        updateTag("activity-log");
        revalidatePath("/admin/activity");
        return { success: true };
      }
    }
    return { success: false };
  } catch (error) {
    console.error("[Activity] markActivityCheckInPaid failed:", error);
    return { success: false };
  }
}

export async function deleteActivity(id: string) {
  try {
    // Only admins may delete activity log entries.
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Unauthorized: only admins can delete activity records" };
    }

    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    
    let targetObjOrStr: any = null;
    
    for (const item of records) {
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          if (parsed.id === id) {
            targetObjOrStr = item;
            break;
          }
        } catch { }
      } else if (typeof item === "object" && item !== null) {
        // Upstash auto-parses JSON
        if ((item as any).id === id) {
          targetObjOrStr = item;
          break;
        }
      }
    }

    if (targetObjOrStr) {
      await redis.zrem("activity:log", targetObjOrStr);
      updateTag("activity-log");
      revalidatePath("/admin/activity");
      return { success: true };
    }

    return { success: false, error: "Activity not found" };
  } catch (error) {
    console.error("[Activity Logger] Failed to delete activity:", error);
    return { success: false, error: "Internal server error" };
  }
}

// ── Monthly revenue reporting ──────────────────────────────────────────────

export interface RevenueBreakdown {
  /** Money taken online (card via payment provider) — activity type "purchase". */
  online: number;
  /** Money taken in person at the door — priced cash/in-person check-ins. */
  door: number;
  /** online + door. */
  total: number;
}

export interface Attendance {
  /** People on track via a day pass or membership check-in (cash + wallet). */
  onTrack: number;
  /** People on track via a car rental check-in (cash + wallet). */
  rentals: number;
}

export interface DailyRevenue {
  /** Day key in YYYY-MM-DD (UTC). */
  day: string;
  /** Human label, e.g. "Fri 12 Sep". */
  label: string;
  breakdown: RevenueBreakdown;
  /** Count of revenue-bearing entries on the day. */
  count: number;
  /** Attendance counts (independent of revenue). */
  attendance: Attendance;
}

export interface MonthlyRevenue {
  /** Month key in YYYY-MM (UTC). */
  month: string;
  /** Human label, e.g. "September 2026". */
  label: string;
  breakdown: RevenueBreakdown;
  /** Count of revenue-bearing entries in the month. */
  count: number;
  /** Per-day breakdown, newest day first. Only days with revenue are included. */
  days: DailyRevenue[];
  /** Attendance counts (independent of revenue). */
  attendance: Attendance;
}

export interface RevenueReport {
  currency: string;
  months: MonthlyRevenue[];
  totals: RevenueBreakdown;
  /** Grand total entry count. */
  count: number;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Build a monthly revenue report from the activity log.
 *
 * Reads the raw `activity:log` sorted set (NOT the display-deduped feed) so
 * totals are accurate. Revenue is counted as:
 *   - online: `type === "purchase"` entries with a positive, non-dev amount.
 *   - door:   `type === "checkin"` entries whose method is a cash/in-person
 *             method (day_pass_cash / rental_cash / membership_cash) with a
 *             positive amount. Wallet redemptions are excluded because they were
 *             already counted as an online purchase when the pass was bought.
 *
 * Note: the activity:log is capped at ~5000 recent entries, so very old months
 * may fall out of the window. This is sufficient for ongoing monthly reporting.
 */
export async function getMonthlyRevenue(): Promise<RevenueReport> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { currency: CURRENCY, months: [], totals: { online: 0, door: 0, total: 0 }, count: 0 };
  }

  const records = await redis.zrange("activity:log", 0, -1, { rev: true });

  const parsed: ActivityEntry[] = (records || [])
    .map((str) => {
      try {
        return typeof str === "string" ? JSON.parse(str) : str;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ActivityEntry[];

  type Bucket = {
    online: number;
    door: number;
    count: number;
    onTrack: number;
    rentals: number;
  };
  const newBucket = (): Bucket => ({ online: 0, door: 0, count: 0, onTrack: 0, rentals: 0 });
  const byMonth = new Map<string, Bucket>();
  // Nested per-day buckets keyed by month -> day.
  const byDay = new Map<string, Map<string, Bucket>>();

  // Check-in methods that put a person on track (not a rental).
  const ON_TRACK_METHODS = new Set([
    "membership",
    "membership_cash",
    "qr",
    "manual",
    "self_checkin",
    "day_pass",
    "day_pass_cash",
    "day_pass_wallet",
  ]);
  const RENTAL_METHODS = new Set(["rental", "rental_cash", "rental_wallet"]);

  // Classify a check-in as attendance: on-track vs rental. Uses the method when
  // present, otherwise falls back to the description (older entries were logged
  // without a method field).
  function attendanceCategory(item: ActivityEntry): "onTrack" | "rentals" | null {
    const method = item.method || "";
    if (RENTAL_METHODS.has(method)) return "rentals";
    if (ON_TRACK_METHODS.has(method)) return "onTrack";

    const desc = (item.description || "").toLowerCase();
    if (!desc) return null;
    // Rentals first (both cash and wallet phrasings).
    if (desc.includes("rental")) return "rentals";
    // Everything else that reads like a track check-in counts as on-track:
    // day passes, memberships, manual/QR/self check-ins.
    if (
      desc.includes("day pass") ||
      desc.includes("(day_pass)") ||
      desc.includes("membership") ||
      desc.includes("checked in") ||
      desc.includes("check-in") ||
      desc.includes("track access")
    ) {
      return "onTrack";
    }
    return null;
  }

  // Cache each member's discounts so we only hit Redis once per member across
  // the whole log.
  const discountCache = new Map<string, MemberDiscounts>();
  async function discountsFor(memberId: string): Promise<MemberDiscounts> {
    const cached = discountCache.get(memberId);
    if (cached) return cached;
    // Guests (guest_*) have no member hash; getMemberDiscounts returns zeros.
    const d = await getMemberDiscounts(memberId);
    discountCache.set(memberId, d);
    return d;
  }

  // Fetch-or-create the month + day buckets for an entry's timestamp.
  function bucketsFor(ts: number): { month: Bucket; day: Bucket } {
    const mKey = monthKey(ts);
    let month = byMonth.get(mKey);
    if (!month) {
      month = newBucket();
      byMonth.set(mKey, month);
    }
    const dKey = dayKey(ts);
    let daysForMonth = byDay.get(mKey);
    if (!daysForMonth) {
      daysForMonth = new Map<string, Bucket>();
      byDay.set(mKey, daysForMonth);
    }
    let day = daysForMonth.get(dKey);
    if (!day) {
      day = newBucket();
      daysForMonth.set(dKey, day);
    }
    return { month, day };
  }

  for (const item of parsed) {
    if (item.isDev) continue;

    // 1) Attendance — count every check-in as a person on track, regardless of
    //    whether it generated revenue (wallet redemptions still put someone on
    //    the track). Split into on-track (passes + members) vs rentals.
    if (item.type === "checkin") {
      const category = attendanceCategory(item);
      if (category) {
        const { month, day } = bucketsFor(item.timestamp);
        if (category === "rentals") {
          month.rentals += 1;
          day.rentals += 1;
        } else {
          month.onTrack += 1;
          day.onTrack += 1;
        }
      }
    }

    // 2) Revenue — apply the member's actual discount:
    //   - a real stored amount already reflects the charge (incl. discount).
    //   - otherwise infer the item and price it with the member's discount so
    //     discounted memberships/passes aren't over-counted at base price.
    let amount: number | null = null;
    if (typeof item.amount === "number" && item.amount > 0) {
      amount = item.amount;
    } else {
      const inferred = resolveActivityItem(item);
      if (inferred) {
        const discounts = await discountsFor(item.memberId);
        amount = priceFor(inferred.item, discounts[inferred.item]).final * inferred.qty;
      }
    }
    if (amount === null || !(amount > 0)) continue;

    let online = 0;
    let door = 0;

    if (item.type === "purchase") {
      online = amount;
    } else if (item.type === "checkin") {
      // A resolved amount on a check-in only occurs for door revenue
      // (cash/in-person or a paid guest tag); wallet/free resolve to null above.
      door = amount;
    } else {
      continue;
    }

    const { month, day } = bucketsFor(item.timestamp);
    month.online += online;
    month.door += door;
    month.count += 1;
    day.online += online;
    day.door += door;
    day.count += 1;
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  const months: MonthlyRevenue[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest month first
    .map(([month, b]) => ({
      month,
      label: monthLabel(month),
      breakdown: {
        online: round(b.online),
        door: round(b.door),
        total: round(b.online + b.door),
      },
      count: b.count,
      attendance: { onTrack: b.onTrack, rentals: b.rentals },
      days: [...(byDay.get(month)?.entries() ?? [])]
        // Only include days that took money (per requirement).
        .filter(([, d]) => d.online + d.door > 0)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest day first
        .map(([day, d]) => ({
          day,
          label: dayLabel(day),
          breakdown: {
            online: round(d.online),
            door: round(d.door),
            total: round(d.online + d.door),
          },
          count: d.count,
          attendance: { onTrack: d.onTrack, rentals: d.rentals },
        })),
    }))
    // A month with no revenue AND no attendance shouldn't appear.
    .filter((m) => m.breakdown.total > 0 || m.attendance.onTrack > 0 || m.attendance.rentals > 0);

  const totals = months.reduce(
    (acc, m) => ({
      online: round(acc.online + m.breakdown.online),
      door: round(acc.door + m.breakdown.door),
      total: round(acc.total + m.breakdown.total),
    }),
    { online: 0, door: 0, total: 0 }
  );

  const count = months.reduce((acc, m) => acc + m.count, 0);

  return { currency: CURRENCY, months, totals, count };
}
