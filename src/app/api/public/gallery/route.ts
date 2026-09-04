import { NextResponse } from "next/server";
import { getWeeklyWinners } from "@/actions/admin/showcase";
import { getShowcaseEntries } from "@/actions/showcase";
import { getFeedPosts } from "@/actions/feed";
import { getWebsiteGalleryImages } from "@/actions/admin/gallery";

export const dynamic = "force-dynamic";

/**
 * Public, cross-origin gallery feed for the marketing website.
 *
 * Aggregates images from three sources:
 *   - admin-curated website gallery (getWebsiteGalleryImages)
 *   - shell showcase (weekly winners, falling back to recent entries)
 *   - newsfeed post images
 *
 * No auth: this route lives under /api/public/* which is excluded from the
 * auth middleware. CORS is added manually since the app has no global CORS.
 */

// Origins allowed to consume this endpoint from a browser. Defaults cover the
// production website + member app and local dev; override/extend via the
// PUBLIC_ALLOWED_ORIGINS env var (comma-separated list of full origins).
const DEFAULT_ALLOWED_ORIGINS = [
  "https://penthousedrift.com",
  "https://www.penthousedrift.com",
  "https://app.penthousedrift.com",
  "https://penthousedrift.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

const ALLOWED_ORIGINS = new Set(
  (process.env.PUBLIC_ALLOWED_ORIGINS
    ? process.env.PUBLIC_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS)
);

/**
 * Build CORS headers for a given request origin. Only echoes the origin back
 * when it's on the allowlist; other origins get no CORS header, so browsers on
 * those sites are blocked from reading the response.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

type GalleryItem = {
  src: string;
  alt: string;
  source: "gallery" | "showcase" | "newsfeed";
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 24, 60);
  const cors = corsHeaders(request.headers.get("origin"));

  try {
    const [gallery, winners, entries, posts] = await Promise.all([
      getWebsiteGalleryImages(),
      getWeeklyWinners(20).catch(() => []),
      getShowcaseEntries(20).catch(() => []),
      getFeedPosts(20).catch(() => []),
    ]);

    const items: GalleryItem[] = [];

    // 1. Admin-curated gallery images (highest priority).
    for (const img of gallery) {
      if (img.imageUrl) {
        items.push({
          src: img.imageUrl,
          alt: img.caption || "Penthouse Drift gallery photo",
          source: "gallery",
        });
      }
    }

    // 2. Shell showcase — prefer winners, fall back to recent entries.
    const showcase = winners.length > 0 ? winners : entries;
    for (const shell of showcase) {
      if (shell.imageUrl) {
        items.push({
          src: shell.imageUrl,
          alt: shell.description || "Shell showcase build",
          source: "showcase",
        });
      }
    }

    // 3. Newsfeed post images (flatten the images[] arrays).
    for (const post of posts) {
      for (const url of post.images || []) {
        if (url) {
          items.push({
            src: url,
            alt: post.text?.slice(0, 120) || "Track newsfeed photo",
            source: "newsfeed",
          });
        }
      }
    }

    // De-duplicate by URL, preserving source priority order above.
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      if (seen.has(item.src)) return false;
      seen.add(item.src);
      return true;
    });

    return NextResponse.json(
      { images: deduped.slice(0, limit) },
      { headers: { ...cors, "Cache-Control": "public, max-age=300" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        images: [],
        error: error instanceof Error ? error.message : "Failed to load gallery",
      },
      { status: 500, headers: cors }
    );
  }
}
