"use server";

import { redis } from "@/lib/redis";
import type { Member, Membership } from "@/types";

export interface MemberWithMembership {
  member: Member;
  membership: Membership | null;
}

export async function getAllMembers(): Promise<MemberWithMembership[]> {
  // Get all member IDs from the memberships:all sorted set
  const memberIds = await redis.zrange("memberships:all", 0, -1);

  if (!memberIds || memberIds.length === 0) {
    return [];
  }

  const members: MemberWithMembership[] = [];

  for (const userId of memberIds) {
    const [memberData, membershipData] = await Promise.all([
      redis.hgetall(`member:${userId as string}`),
      redis.hgetall(`membership:${userId as string}`),
    ]);

    if (!memberData || Object.keys(memberData).length === 0) continue;

    const member: Member = {
      id: memberData.id as string,
      email: memberData.email as string,
      name: memberData.name as string,
      image: (memberData.image as string) || null,
      role: memberData.role as "admin" | "member",
      qrCode: null,
      createdAt: Number(memberData.createdAt),
    };

    let membership: Membership | null = null;
    if (membershipData && Object.keys(membershipData).length > 0) {
      membership = {
        userId: membershipData.userId as string,
        status:
          Number(membershipData.expiresAt) > Date.now()
            ? "active"
            : "expired",
        purchasedAt: Number(membershipData.purchasedAt),
        expiresAt: Number(membershipData.expiresAt),
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
}
