import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Store subscription keyed by a hash of the endpoint
    const subId = Buffer.from(subscription.endpoint).toString("base64url").slice(0, 32);

    await redis.set(`push:subscription:${subId}`, JSON.stringify(subscription));

    // If user is admin, add to admin subscriptions set
    if (session.user.role === "admin") {
      await redis.sadd("push:admin:subscriptions", subId);
    }

    // Also track per-user
    await redis.sadd(`push:user:${session.user.id}:subscriptions`, subId);

    return NextResponse.json({ success: true, subId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscription failed" },
      { status: 500 }
    );
  }
}
