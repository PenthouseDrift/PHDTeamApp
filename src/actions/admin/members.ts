"use server";

import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";
import { parseDiscounts } from "@/lib/pricing";
import type { Member, Membership, Wallet, ActionResult } from "@/types";

export interface MemberWithMembership {
  member: Member;
  membership: Membership | null;
  wallet: Wallet;
}

async function _getAllMembers(): Promise<MemberWithMembership[]> {
  try {
    const membersMap = new Map<string, MemberWithMembership>();

    // Scan all member:* keys
    let cursor = 0;
    const memberKeys: string[] = [];

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "member:*",
        count: 200,
      });
      cursor = Number(newCursor);

      for (const key of keys) {
        const keyStr = key as string;
        if (keyStr.split(":").length > 2) continue;
        memberKeys.push(keyStr);
      }
    } while (cursor !== 0);

    // Deduplicate
    const uniqueKeys = [...new Set(memberKeys)];

    // Fetch all member data in parallel (batch) using pipeline
    const pipeline = redis.pipeline();
    const orderedIds: string[] = [];
    
    for (const key of uniqueKeys) {
      const userId = key.replace("member:", "");
      if (membersMap.has(userId)) continue;
      
      orderedIds.push(userId);
      pipeline.hgetall(key);
      pipeline.hgetall(`membership:${userId}`);
      pipeline.hgetall(`wallet:${userId}`);
    }

    if (orderedIds.length > 0) {
      // Chunk pipelines if needed in the future, but Vercel KV handles a few hundred fine.
      const results = await pipeline.exec();
      
      for (let i = 0; i < orderedIds.length; i++) {
        const userId = orderedIds[i];
        const memberData = results[i * 3] as Record<string, unknown> | null;
        const membershipData = results[i * 3 + 1] as Record<string, unknown> | null;
        const walletData = results[i * 3 + 2] as Record<string, unknown> | null;

        if (!memberData || !memberData.email) continue;

        const member: Member = {
          id: userId,
          email: (memberData.email as string) || "",
          name: (memberData.name as string) || "Unknown",
          nickname: (memberData.nickname as string) || null,
          image: (memberData.customAvatar as string) || (memberData.image as string) || null,
          role: (memberData.role as "admin" | "moderator" | "member") || "member",
          qrCode: null,
          aiGenerations: Number(memberData.aiGenerations) || 0,
          createdAt: Number(memberData.createdAt) || 0,
          checkinCount: Number(memberData.checkinCount) || 0,
          lastCheckIn: Number(memberData.lastCheckIn) || 0,
          discounts: parseDiscounts(memberData),
        };

        let membership: Membership | null = null;
        if (membershipData && Object.keys(membershipData).length > 0) {
          membership = {
            userId,
            status: Number(membershipData.expiresAt) > Date.now() ? "active" : "expired",
            purchasedAt: Number(membershipData.purchasedAt) || 0,
            expiresAt: Number(membershipData.expiresAt) || 0,
            paymentRef: (membershipData.paymentRef as string) || "",
          };
        }

        const wallet: Wallet = {
          userId,
          dayPasses: Math.max(0, Number(walletData?.dayPasses) || 0),
          rentalHours: Math.max(0, Number(walletData?.rentalHours) || 0),
          updatedAt: Number(walletData?.updatedAt) || 0,
        };

        membersMap.set(userId, { member, membership, wallet });
      }
    }

    const members = Array.from(membersMap.values());

    // Sort alphabetically by name
    members.sort((a, b) => a.member.name.localeCompare(b.member.name));

    return members;
  } catch (error) {
    console.error("getAllMembers error:", error);
    return [];
  }
}

export const getAllMembers = unstable_cache(
  async () => _getAllMembers(),
  ["admin-members"],
  { revalidate: 60, tags: ["admin-members"] }
);


// ── Check-in counter backfill ──────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { revalidateTag } from "next/cache";

/**
 * Recompute every member's lifetime check-in counter (checkinCount + lastCheckIn)
 * from the historical `checkins:<YYYY-MM-DD>` daily lists.
 *
 * Idempotent: it counts from scratch and OVERWRITES the stored values, so it can
 * be run repeatedly without double-counting. Guests (guest_* ids) are ignored.
 *
 * There's no index of which date lists exist, so we walk backwards from today
 * and stop after a run of consecutive empty days (default 60) — enough to skip
 * quiet gaps between events without scanning forever.
 */
export async function backfillCheckInCounts(
  maxEmptyRunDays = 60
): Promise<ActionResult<{ membersUpdated: number; daysScanned: number; totalCheckIns: number }>> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Unauthorized: only admins can run the backfill" };
    }

    const counts = new Map<string, number>();
    const lastSeen = new Map<string, number>();

    let cursor = new Date();
    let consecutiveEmpty = 0;
    let daysScanned = 0;
    let totalCheckIns = 0;

    // Walk backwards day by day until we hit a long empty streak.
    while (consecutiveEmpty < maxEmptyRunDays) {
      const dateKey = cursor.toISOString().split("T")[0];
      const entries = await redis.lrange(`checkins:${dateKey}`, 0, -1);
      daysScanned++;

      if (!entries || entries.length === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
        for (const raw of entries) {
          let parsed: { userId?: string; timestamp?: number; memberName?: string } | null = null;
          try {
            parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
          } catch {
            parsed = null;
          }
          const userId = parsed?.userId;
          // Skip guests and removed placeholders.
          if (!userId || userId.startsWith("guest_") || userId === "__REMOVED__") continue;
          counts.set(userId, (counts.get(userId) || 0) + 1);
          totalCheckIns++;
          const ts = Number(parsed?.timestamp) || 0;
          if (ts > (lastSeen.get(userId) || 0)) lastSeen.set(userId, ts);
        }
      }

      // Step back one day.
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    }

    // Write the recomputed totals onto each member hash.
    let membersUpdated = 0;
    for (const [userId, count] of counts) {
      const fields: Record<string, number> = { checkinCount: count };
      const last = lastSeen.get(userId);
      if (last) fields.lastCheckIn = last;
      await redis.hset(`member:${userId}`, fields);
      membersUpdated++;
    }

    // Bust the cached members list so the new counts show immediately.
    revalidateTag("admin-members", "max");

    return {
      success: true,
      data: { membersUpdated, daysScanned, totalCheckIns },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Backfill failed",
    };
  }
}
