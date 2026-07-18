import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getPageFeed } from "@/lib/facebook";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to get cached feed
    const cached = await redis.get("facebook:feed");
    if (cached) {
      return NextResponse.json({
        posts: JSON.parse(cached as string),
        cached: true,
      });
    }

    // Cache miss: fetch directly
    const posts = await getPageFeed(20);
    await redis.set("facebook:feed", JSON.stringify(posts));
    await redis.set("facebook:feed:updated", Date.now().toString());
    return NextResponse.json({ posts, cached: false });
  } catch (error) {
    // If API fails, try to return stale cache
    const stale = await redis.get("facebook:feed");
    if (stale) {
      return NextResponse.json({
        posts: JSON.parse(stale as string),
        cached: true,
        stale: true,
      });
    }
    console.error("Facebook feed error:", error);
    return NextResponse.json(
      { error: "Feed unavailable", posts: [] },
      { status: 503 }
    );
  }
}
