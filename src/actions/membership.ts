"use server";

import { redis } from "@/lib/redis";
import type { Membership, ActionResult } from "@/types";

export function isMembershipActive(membership: Membership): boolean {
  return membership.expiresAt > Date.now();
}

export function getRemainingDays(membership: Membership): number {
  const remaining = membership.expiresAt - Date.now();
  return Math.max(0, Math.floor(remaining / (1000 * 60 * 60 * 24)));
}

export async function getMembership(
  userId: string
): Promise<ActionResult<Membership | null>> {
  try {
    const data = await redis.hgetall(`membership:${userId}`);
    if (!data || Object.keys(data).length === 0) {
      return { success: true, data: null };
    }

    const membership: Membership = {
      userId: data.userId as string,
      status:
        (data.expiresAt as number) > Date.now() ? "active" : "expired",
      purchasedAt: Number(data.purchasedAt),
      expiresAt: Number(data.expiresAt),
      paymentRef: (data.paymentRef as string) || "",
    };

    return { success: true, data: membership };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load membership",
    };
  }
}
