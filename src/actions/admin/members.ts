"use server";

import { redis } from "@/lib/redis";
import type { Member, Membership } from "@/types";

export interface MemberWithMembership {
  member: Member;
  membership: Membership | null;
}

export async function getAllMembers(): Promise<MemberWithMembership[]> {
  try {
    const members: MemberWithMembership[] = [];

    // Scan all member:* keys to find everyone who has signed in
    let cursor = 0;
    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "member:*",
        count: 100,
      });
      cursor = Number(newCursor);

      for (const key of keys) {
        const memberData = await redis.hgetall(key);
        if (!memberData || !memberData.email) continue;

        const userId = (memberData.id as string) || (key as string).replace("member:", "");

        const member: Member = {
          id: userId,
          email: (memberData.email as string) || "",
          name: (memberData.name as string) || "Unknown",
          image: (memberData.image as string) || null,
          role: (memberData.role as "admin" | "member") || "member",
          qrCode: null,
          createdAt: Number(memberData.createdAt) || 0,
        };

        // Check if they have a membership
        const membershipData = await redis.hgetall(`membership:${userId}`);
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

        members.push({ member, membership });
      }
    } while (cursor !== 0);

    // Sort: active first, then expired, then no membership; within each group by name
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
