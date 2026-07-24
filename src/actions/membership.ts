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

export async function createMembershipCheckout(
  userId: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const { createCheckout } = await import("@/lib/sumup");
    const MEMBERSHIP_PRICE = 40.0;
    const MEMBERSHIP_CURRENCY = "GBP";
    const MEMBERSHIP_DURATION_DAYS = 28;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkout = await createCheckout({
      memberId: userId,
      amount: MEMBERSHIP_PRICE,
      currency: MEMBERSHIP_CURRENCY,
      description: `Penthouse Drift - ${MEMBERSHIP_DURATION_DAYS}-Day Membership`,
      returnUrl: `${baseUrl}/membership/success`,
    });

    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: userId,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 3600 }
    );
    await redis.set(`pending_checkout:${userId}`, checkout.id, { ex: 3600 });

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    return { success: true, data: { url: redirectUrl } };
  } catch (error) {
    console.error("createMembershipCheckout error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize membership checkout",
    };
  }
}
