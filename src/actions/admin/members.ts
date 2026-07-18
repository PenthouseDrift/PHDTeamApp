"use server";

import { redis } from "@/lib/redis";
import type { Member, Membership } from "@/types";

export interface MemberWithMembership {
  member: Member;
  membership: Membership | null;
}

export async function getAllMembers(): Promise<MemberWithMembership[]> {
  try {
    // Get all member IDs from the memberships:all sorted set
    const memberIdsFromMemberships = await redis.zrange("memberships:all", 0, -1);

    // Also get members who signed in (stored via auth callback as member:{userId})
    // We'll use a scan approach or just use what we have
    const memberIds = new Set<string>();

    // Add members from memberships sorted set
    if (memberIdsFromMemberships && memberIdsFromMemberships.length > 0) {
      for (const id of memberIdsFromMemberships) {
        memberIds.add(id as string);
      }
    }

    // If no members found at all, return empty
    if (memberIds.size === 0) {
      return [];
    }

    const members: MemberWithMembership[] = [];

    for (const userId of memberIds) {
      const [memberData, membershipData] = await Promise.all([
        redis.hgetall(`member:${userId}`),
        redis.hgetall(`membership:${userId}`),
      ]);

      if (!memberData || Object.keys(memberData).length === 0) continue;

      const member: Member = {
        id: (memberData.id as string) || userId,
        email: (memberData.email as string) || "",
        name: (memberData.name as string) || "Unknown",
        image: (memberData.image as string) || null,
        role: (memberData.role as "admin" | "member") || "member",
        qrCode: null,
        createdAt: Number(memberData.createdAt) || 0,
      };

      let membership: Membership | null = null;
      if (membershipData && Object.keys(membershipData).length > 0) {
        membership = {
          userId: (membershipData.userId as string) || userId,
          status:
            Number(membershipData.expiresAt) > Date.now()
              ? "active"
              : "expired",
          purchasedAt: Number(membershipData.purchasedAt) || 0,
          expiresAt: Number(membershipData.expiresAt) || 0,
          paymentRef: (membershipData.paymentRef as string) || "",
        };
      }

      members.push({ member, membership });
    }

    // Sort: active first, then by expiration date ascending
    members.sort((a, b) => {
      const aActive = a.membership?.status === "active" ? 0 : 1;
      const bActive = b.membership?.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aExpiry = a.membership?.expiresAt ?? 0;
      const bExpiry = b.membership?.expiresAt ?? 0;
      return aExpiry - bExpiry;
    });

    return members;
  } catch (error) {
    console.error("getAllMembers error:", error);
    return [];
  }
}
