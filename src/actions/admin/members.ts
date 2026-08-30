"use server";

import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";
import { parseDiscounts } from "@/lib/pricing";
import type { Member, Membership, Wallet } from "@/types";

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

