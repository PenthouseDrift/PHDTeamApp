import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { event_type, id: checkoutId, status, checkout_reference } = body;

    // Only process successful payments
    if (status !== "PAID" && event_type !== "checkout.completed") {
      return NextResponse.json({ received: true });
    }

    // Extract memberId from checkout_reference (format: membership_{memberId}_{timestamp})
    const parts = (checkout_reference as string).split("_");
    if (parts.length < 3 || parts[0] !== "membership") {
      return NextResponse.json(
        { error: "Invalid reference" },
        { status: 400 }
      );
    }
    const memberId = parts[1];

    // Check if already processed (idempotency)
    const existingRef = await redis.hget(`membership:${memberId}`, "paymentRef");
    if (existingRef === checkoutId) {
      return NextResponse.json({ received: true, already_processed: true });
    }

    // Get current membership to determine new vs renewal
    const currentExpiry = await redis.hget(
      `membership:${memberId}`,
      "expiresAt"
    );
    const now = Date.now();
    const TWENTY_EIGHT_DAYS = 28 * 24 * 60 * 60 * 1000;

    let newExpiresAt: number;
    if (currentExpiry && Number(currentExpiry) > now) {
      // Renewal: extend from current expiry
      newExpiresAt = Number(currentExpiry) + TWENTY_EIGHT_DAYS;
    } else {
      // New or expired: start from now
      newExpiresAt = now + TWENTY_EIGHT_DAYS;
    }

    // Update membership in Redis
    await redis.hset(`membership:${memberId}`, {
      userId: memberId,
      status: "active",
      purchasedAt: now,
      expiresAt: newExpiresAt,
      paymentRef: checkoutId,
    });

    // Add to active memberships sorted set (score = expiresAt for cron expiry)
    await redis.zadd("memberships:active", {
      score: newExpiresAt,
      member: memberId,
    });

    // Ensure member is in the all memberships set
    await redis.zadd("memberships:all", { score: now, member: memberId });

    return NextResponse.json({ received: true, membership_activated: true });
  } catch (error) {
    console.error("SumUp webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
