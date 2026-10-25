"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff-auth";
import { parseDiscounts, priceFor } from "@/lib/pricing";
import type { ActionResult } from "@/types";

/**
 * Fresh, single-member snapshot used by the check-in desk once a member is
 * selected. The roster itself comes from the 60s-cached member list, which can
 * show stale wallet balances, so the options a staff member sees (and the
 * prices they quote) are read live: 3 HGETALLs for one member, no scans.
 */
export interface DeskProfile {
  userId: string;
  isStaff: boolean;
  membershipActive: boolean;
  membershipExpiresAt: number | null;
  dayPasses: number;
  rentalHours: number;
  /** Per-member prices after any discount, in GBP. */
  prices: { membership: number; daypass: number; rental: number };
}

export async function getDeskProfile(userId: string): Promise<ActionResult<DeskProfile>> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Unauthorized" };
  if (!userId) return { success: false, error: "Missing member" };

  try {
    const pipeline = redis.pipeline();
    pipeline.hgetall(`member:${userId}`);
    pipeline.hgetall(`membership:${userId}`);
    pipeline.hgetall(`wallet:${userId}`);
    const [memberHash, membershipHash, walletHash] = (await pipeline.exec()) as Array<
      Record<string, unknown> | null
    >;

    if (!memberHash || !memberHash.email) return { success: false, error: "Member not found" };

    const discounts = parseDiscounts(memberHash);
    const expiresAt = Number(membershipHash?.expiresAt) || 0;
    const role = memberHash.role as string | undefined;

    return {
      success: true,
      data: {
        userId,
        isStaff: role === "admin" || role === "moderator",
        membershipActive: expiresAt > Date.now(),
        membershipExpiresAt: expiresAt || null,
        dayPasses: Math.max(0, Number(walletHash?.dayPasses) || 0),
        rentalHours: Math.max(0, Number(walletHash?.rentalHours) || 0),
        prices: {
          membership: priceFor("membership", discounts.membership).final,
          daypass: priceFor("daypass", discounts.daypass).final,
          rental: priceFor("rental", discounts.rental).final,
        },
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not load member" };
  }
}

/** Methods that can be reversed cleanly: no cash taken and no rental timer started. */
const UNDOABLE_METHODS = new Set(["manual", "membership", "qr", "self_checkin", "day_pass_wallet", "day_pass"]);

/** How long after a check-in the desk's Undo remains valid. */
const UNDO_WINDOW_MS = 2 * 60 * 1000;

/**
 * Undo the check-in the desk just made for this member. The entry is located
 * on the server (the member's most recent entry, which must be under two
 * minutes old) rather than by a list index the client saw earlier, so a second
 * device adding someone in the meantime can't make us remove the wrong person.
 * A wallet day pass is refunded. Cash and rental check-ins are deliberately not
 * undoable here: they have revenue / a running timer attached, so they go
 * through the explicit Remove in the Checked-in list.
 */
export async function undoCheckIn(userId: string): Promise<ActionResult<null>> {
  const staff = await requireStaff();
  if (!staff) return { success: false, error: "Unauthorized" };

  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `checkins:${today}`;
    const entries = await redis.lrange(key, 0, -1);

    const parsedEntries = entries.map((raw) => {
      try {
        return (typeof raw === "string" ? JSON.parse(raw) : raw) as {
          userId?: string;
          timestamp?: number;
          method?: string;
        } | null;
      } catch {
        return null;
      }
    });

    let index = -1;
    for (let i = parsedEntries.length - 1; i >= 0; i--) {
      if (parsedEntries[i]?.userId === userId) {
        index = i;
        break;
      }
    }
    if (index === -1) return { success: false, error: "That check-in was already removed" };

    const entry = parsedEntries[index]!;
    if (Date.now() - Number(entry.timestamp) > UNDO_WINDOW_MS) {
      return { success: false, error: "Too late to undo. Use Remove in the Checked-in list" };
    }
    if (!UNDOABLE_METHODS.has(entry.method ?? "")) {
      return { success: false, error: "Paid and rental check-ins are removed from the Checked-in list" };
    }

    const placeholder = "__REMOVED__";
    await redis.lset(key, index, placeholder);
    await redis.lrem(key, 1, placeholder);

    const stillCheckedIn = parsedEntries.some((e, i) => i !== index && e?.userId === userId);
    if (!stillCheckedIn && !userId.startsWith("guest_")) {
      await redis.del(`checkin:dedup:${userId}`);
    }

    if (entry.method === "day_pass_wallet" || entry.method === "day_pass") {
      await redis.hincrby(`wallet:${userId}`, "dayPasses", 1);
      await redis.hset(`wallet:${userId}`, { userId, updatedAt: Date.now() });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not undo" };
  }
}
