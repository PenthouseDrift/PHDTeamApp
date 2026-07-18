import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getPageFeed } from "@/lib/facebook";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const posts = await getPageFeed(20);
    await redis.set("facebook:feed", JSON.stringify(posts));
    await redis.set("facebook:feed:updated", Date.now().toString());
    return NextResponse.json({ synced: posts.length });
  } catch (error) {
    console.error("Facebook sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
