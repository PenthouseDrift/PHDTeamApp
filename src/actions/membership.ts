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
      status: Number(data.expiresAt) > Date.now() ? "active" : "expired",
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
  userId: string,
  customReturnUrl?: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const { createCheckout } = await import("@/lib/sumup");
    const { getMemberDiscounts, priceFor, CURRENCY, MEMBERSHIP_DURATION_DAYS } = await import("@/lib/pricing");
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = customReturnUrl || `${baseUrl}/membership/success`;

    const discounts = await getMemberDiscounts(userId);
    const price = priceFor("membership", discounts.membership);

    const memberName = (await redis.hget(`member:${userId}`, "name")) as string | null;

    const checkout = await createCheckout({
      memberId: userId,
      amount: price.final,
      currency: CURRENCY,
      description: `Penthouse Drift - ${MEMBERSHIP_DURATION_DAYS}-Day Membership - ${memberName || "Member"} (${userId})`,
      returnUrl,
    });

    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: userId,
        itemType: "membership",
        checkoutReference: checkout.checkout_reference,
        // Persist the exact amount charged so the activity log records the real
        // price even when the payment webhook omits/mis-reports the amount.
        amount: price.final,
        currency: CURRENCY,
        createdAt: Date.now(),
      }),
      { ex: 86400 * 30 }
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

export async function activateMembershipInPerson(
  memberId: string,
  memberName: string,
  adminId: string
): Promise<ActionResult<{ message: string; expiresAt: number }>> {
  try {
    const now = Date.now();
    const TWENTY_EIGHT_DAYS = 28 * 24 * 60 * 60 * 1000;
    const expiresAt = now + TWENTY_EIGHT_DAYS;
    const today = new Date().toISOString().split("T")[0];

    // 1. Activate 28-day membership in Redis
    await redis.hset(`membership:${memberId}`, {
      userId: memberId,
      status: "active",
      purchasedAt: now,
      expiresAt,
      paymentRef: "CASH_IN_PERSON",
      updatedAt: now,
    });

    // 2. Also update member status on member profile hash
    await redis.hset(`member:${memberId}`, {
      membershipStatus: "active",
      membershipExpiresAt: expiresAt,
    });

    // 3. Record Check-In for today if not already checked in
    const dedupKey = `checkin:dedup:${memberId}`;
    const alreadyCheckedIn = await redis.get(dedupKey);

    if (!alreadyCheckedIn) {
      const entry = JSON.stringify({
        userId: memberId,
        adminId,
        timestamp: now,
        method: "membership_cash",
        memberName,
      });

      await redis.rpush(`checkins:${today}`, entry);
      await redis.set(dedupKey, "1", { ex: 86400 });
    }

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/admin/members");
    revalidatePath("/admin/check-in");
    revalidatePath("/dashboard");
    revalidatePath("/wallet");

    return {
      success: true,
      data: {
        message: `28-Day Membership Activated (£40 Paid Cash/Card) & ${memberName} Checked In! 🟢`,
        expiresAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to activate membership in person",
    };
  }
}
