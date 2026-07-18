import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();

    // Get all members whose expiresAt (score) is less than now
    const expired = await redis.zrange<string[]>("memberships:active", 0, now, {
      byScore: true,
    });

    if (!expired || expired.length === 0) {
      return NextResponse.json({ expired: 0 });
    }

    // Update each expired membership
    for (const userId of expired) {
      await redis.hset(`membership:${userId as string}`, { status: "expired" });
      await redis.zrem("memberships:active", userId as string);
    }

    return NextResponse.json({ expired: expired.length });
  } catch (error) {
    console.error("Cron expire-memberships error:", error);
    return NextResponse.json(
      { error: "Failed to process expired memberships" },
      { status: 500 }
    );
  }
}
