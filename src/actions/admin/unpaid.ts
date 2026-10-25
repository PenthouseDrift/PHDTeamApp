"use server";

import { redis } from "@/lib/redis";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { requireStaff } from "@/lib/staff-auth";
import { CURRENCY, priceForCheckInMethod } from "@/lib/pricing";
import { settleActivityCheckIn } from "@/actions/admin/activity";
import { UNPAID_INDEX_KEY, type ActivityEntry } from "@/lib/activity";
import type { ActionResult } from "@/types";

/**
 * Outstanding "check in now, pay later" balances across ALL events.
 *
 * Redis cost design (this runs on a metered plan):
 *  - Every unpaid check-in is also written to a small hash (`unpaid:checkins`,
 *    id → compact record) when it's logged, and removed when settled. Listing
 *    who owes money is then ONE read of that hash, not a pass over the activity
 *    log.
 *  - The grouped, priced summary is cached, so most dashboard views cost zero
 *    Redis commands. It rebuilds only when an unpaid check-in is created or
 *    settled (both bust the "unpaid-checkins" tag).
 *  - Settling an entry finds it by its timestamp score (ZRANGE BYSCORE) rather
 *    than reading the newest 2000 log entries.
 *  - Older unpaid entries that pre-date the index are back-filled ONCE from the
 *    log, then never again (`unpaid:index:ready`).
 */

export interface UnpaidItem {
  /** Activity-log id; this is what Mark paid / Waive act on. */
  id: string;
  timestamp: number;
  method?: string;
  description: string;
  /** What they owe for this check-in, after any member discount. */
  owed: number;
}

export interface UnpaidGroup {
  memberId: string;
  memberName: string;
  /** Walk-in with no account. */
  isGuest: boolean;
  items: UnpaidItem[];
  totalOwed: number;
  /** Oldest outstanding check-in, so the longest-owed can be listed first. */
  oldest: number;
}

interface IndexRecord {
  id: string;
  memberId: string;
  memberName: string;
  timestamp: number;
  method?: string;
  description: string;
}

const READY_KEY = "unpaid:index:ready";

function parseRecord(raw: unknown): IndexRecord | null {
  try {
    const r = (typeof raw === "string" ? JSON.parse(raw) : raw) as IndexRecord;
    return r && r.id && r.memberId ? r : null;
  } catch {
    return null;
  }
}

/** One-time: fill the index with unpaid entries that were logged before it existed. */
async function backfillIfNeeded(): Promise<void> {
  if (await redis.get(READY_KEY)) return;

  const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
  const fields: Record<string, string> = {};
  for (const raw of records || []) {
    try {
      const e = (typeof raw === "string" ? JSON.parse(raw) : raw) as ActivityEntry;
      if (e && e.type === "checkin" && e.unpaid && !e.isDev) {
        fields[e.id] = JSON.stringify({
          id: e.id,
          memberId: e.memberId,
          memberName: e.memberName,
          timestamp: e.timestamp,
          method: e.method,
          description: e.description,
        });
      }
    } catch {
      // skip unreadable rows
    }
  }
  if (Object.keys(fields).length > 0) await redis.hset(UNPAID_INDEX_KEY, fields);
  await redis.set(READY_KEY, "1");
}

async function buildSummary(): Promise<UnpaidGroup[]> {
  await backfillIfNeeded();
  const rows = (await redis.hgetall(UNPAID_INDEX_KEY)) as Record<string, unknown> | null;
  const records = Object.values(rows ?? {})
    .map(parseRecord)
    .filter((r): r is IndexRecord => r !== null);
  if (records.length === 0) return [];

  // One price lookup per person+method (it reads their discounts).
  const unitPrice = new Map<string, number>();
  const groups = new Map<string, UnpaidGroup>();
  for (const r of records) {
    const key = `${r.memberId}::${r.method ?? ""}`;
    if (!unitPrice.has(key)) unitPrice.set(key, (await priceForCheckInMethod(r.method, r.memberId)) ?? 0);
    const owed = unitPrice.get(key)!;

    let g = groups.get(r.memberId);
    if (!g) {
      g = {
        memberId: r.memberId,
        memberName: r.memberName,
        isGuest: r.memberId.startsWith("guest_"),
        items: [],
        totalOwed: 0,
        oldest: r.timestamp,
      };
      groups.set(r.memberId, g);
    }
    g.items.push({ id: r.id, timestamp: r.timestamp, method: r.method, description: r.description, owed });
    g.totalOwed += owed;
    g.oldest = Math.min(g.oldest, r.timestamp);
  }

  for (const g of groups.values()) g.items.sort((a, b) => a.timestamp - b.timestamp);
  return [...groups.values()].sort((a, b) => a.oldest - b.oldest);
}

const getSummaryCached = unstable_cache(buildSummary, ["unpaid-summary"], {
  revalidate: 3600,
  tags: ["unpaid-checkins"],
});

/** Everyone with an unpaid check-in, longest-outstanding first. Staff only. */
export async function getUnpaidSummary(): Promise<UnpaidGroup[]> {
  if (!(await requireStaff())) return [];
  return getSummaryCached();
}

async function settle(activityId: string, mode: "paid" | "waived"): Promise<ActionResult<{ amount: number }>> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Unauthorized" };

    await backfillIfNeeded();
    const record = parseRecord(await redis.hget(UNPAID_INDEX_KEY, activityId));
    if (!record) return { success: false, error: "That one is already settled" };

    const amount = mode === "paid" ? (await priceForCheckInMethod(record.method, record.memberId)) ?? 0 : 0;

    const result = await settleActivityCheckIn(
      record.memberId,
      record.timestamp,
      mode === "paid" ? { mode: "paid", amount, currency: CURRENCY } : { mode: "waived" }
    );
    if (!result.success) {
      // The log entry is gone (deleted or aged out) so the index entry is stale.
      await redis.hdel(UNPAID_INDEX_KEY, activityId);
      updateTag("unpaid-checkins");
      return { success: false, error: "That record is no longer in the activity log, so it's been removed from this list" };
    }

    // Clear the Unpaid badge on that day's check-in list too (keyed by the UTC
    // date the check-in was made). One LRANGE + one LSET.
    const dayKey = `checkins:${new Date(record.timestamp).toISOString().split("T")[0]}`;
    const rows = await redis.lrange(dayKey, 0, -1);
    for (let i = 0; i < rows.length; i++) {
      try {
        const parsed = (typeof rows[i] === "string" ? JSON.parse(rows[i] as string) : rows[i]) as {
          userId?: string;
          timestamp?: number;
          unpaid?: boolean;
        };
        if (parsed?.userId === record.memberId && Number(parsed.timestamp) === Number(record.timestamp)) {
          if (parsed.unpaid) await redis.lset(dayKey, i, JSON.stringify({ ...parsed, unpaid: false }));
          break;
        }
      } catch {
        // skip
      }
    }

    revalidatePath("/admin");
    revalidatePath("/admin/check-in");
    revalidatePath("/admin/activity");
    revalidatePath("/admin/activity/log");
    revalidatePath("/admin/activity/revenue");
    return { success: true, data: { amount } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

/** They've paid: record the payment so it counts as revenue. Works for any date. */
export async function markUnpaidAsPaid(activityId: string): Promise<ActionResult<{ amount: number }>> {
  return settle(activityId, "paid");
}

/**
 * Write the balance off: clears the Unpaid mark WITHOUT counting any revenue.
 * The activity log keeps the entry, labelled "Waived", so there's a record.
 */
export async function waiveUnpaid(activityId: string): Promise<ActionResult<{ amount: number }>> {
  return settle(activityId, "waived");
}
