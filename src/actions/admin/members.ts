"use server";

import { redis } from "@/lib/redis";
import type { Member, Membership } from "@/types";

export interface MemberWithMembership {
  member: Member;
  membership: Membership | null;
}

export async function getAllMembers(): Promise<MemberWithMembership[]> {
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

    // Fetch all member data in parallel (batch)
    const memberDataPromises = uniqueKeys.map(async (key) => {
      const userId = key.replace("member:", "");
      if (membersMap.has(userId)) return;

      const [memberData, membershipData] = await Promise.all([
        redis.hgetall(key),
        redis.hgetall(`membership:${userId}`),
      ]);

      if (!memberData || !memberData.email) return;

      const member: Member = {
        id: userId,
        email: (memberData.email as string) || "",
        name: (memberData.name as string) || "Unknown",
        image: (memberData.customAvatar as string) || (memberData.image as string) || null,
        role: (memberData.role as "admin" | "member") || "member",
        qrCode: null,
        createdAt: Number(memberData.createdAt) || 0,
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

      membersMap.set(userId, { member, membership });
    });

    await Promise.all(memberDataPromises);

    const members = Array.from(membersMap.values());

    // Sort: active first, then expired, then no membership
    members.sort((a, b) => {
      const aStatus = a.membership?.status === "active" ? 0 : a.membership ? 1 : 2;
      const bStatus = b.membership?.status === "active" ? 0 : b.membership ? 1 : 2;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return a.member.name.localeCompare(b.member.name);
    });

    return members;
  } catch (error) {
    console.error("getAllMembers error:", error);
    return [];
  }
}
