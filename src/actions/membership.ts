"use server";

import { redis } from "@/lib/redis";
import type { Membership, ActionResult } from "@/types";

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
