import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { isLegacySubscriptionId, subscriptionId } from "@/lib/push-ids";

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

    const userId = session.user.id;
    // Each device has its own id, made from its whole endpoint (see push-ids.ts).
    const subId = subscriptionId(String(subscription.endpoint));

    // A device belongs to whoever is signed in on it now. If someone else was signed in here before, they stop getting this
    // device's notifications.
    const previous = await redis.get<{ userId?: string } | string>(`push:subscription:${subId}`);
    const previousUserId =
      previous && typeof previous === "object" ? previous.userId : typeof previous === "string" ? (JSON.parse(previous) as { userId?: string }).userId : undefined;
    if (previousUserId && previousUserId !== userId) {
      await redis.srem(`push:user:${previousUserId}:subscriptions`, subId);
    }

    await redis.set(`push:subscription:${subId}`, JSON.stringify({ ...subscription, userId }));

    // Admin alerts go only to admins' devices.
    if (session.user.role === "admin") await redis.sadd("push:admin:subscriptions", subId);
    else await redis.srem("push:admin:subscriptions", subId);

    // Track in global subscriptions set
    await redis.sadd("push:all:subscriptions", subId);

    // Also track per-user, and drop any old-style ids this member was linked to: those are shared by many members, so they
    // would send this member's notifications to somebody else's device.
    const mine = (await redis.smembers(`push:user:${userId}:subscriptions`)) as string[];
    const stale = mine.filter(isLegacySubscriptionId);
    if (stale.length > 0) await redis.srem(`push:user:${userId}:subscriptions`, ...(stale as [string, ...string[]]));
    await redis.sadd(`push:user:${userId}:subscriptions`, subId);

    return NextResponse.json({ success: true, subId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscription failed" },
      { status: 500 }
    );
  }
}
