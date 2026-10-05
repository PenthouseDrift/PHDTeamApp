import { NextResponse } from "next/server";
import { getWebsiteListings, getListingAuthorName } from "@/actions/marketplace";

export const dynamic = "force-dynamic";

/**
 * Public, cross-origin marketplace feed for the marketing website.
 *
 * Returns member-posted listings that are flagged to show on the website and
 * are still available. No auth: this route lives under /api/public/* which is
 * excluded from the auth middleware. CORS is added manually since the app has
 * no global CORS (mirrors /api/public/gallery).
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://penthousedrift.com",
  "https://www.penthousedrift.com",
  "https://app.penthousedrift.com",
  "https://penthousedrift.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

const ALLOWED_ORIGINS = new Set(
  process.env.PUBLIC_ALLOWED_ORIGINS
    ? process.env.PUBLIC_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS
);

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

type PublicListing = {
  id: string;
  title: string;
  description: string;
  price: number;
  priceLabel: string;
  images: string[];
  cover: string;
  location: string;
  seller: string;
  atTrack: boolean;
  meetAtTrack: boolean;
  contact: {
    name: string;
    method: "email" | "phone" | "facebook" | "instagram" | "other";
    value: string;
  };
  createdAt: number;
};

function priceLabel(price: number): string {
  if (price <= 0) return "Free / Offers";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 24, 60);
  const cors = corsHeaders(request.headers.get("origin"));

  try {
    const listings = await getWebsiteListings(limit);

    // Resolve seller display names in parallel (de-duped by userId).
    const uniqueUserIds = [...new Set(listings.map((l) => l.userId))];
    const nameEntries = await Promise.all(
      uniqueUserIds.map(async (uid) => [uid, await getListingAuthorName(uid)] as [string, string])
    );
    const names = new Map(nameEntries);

    const items: PublicListing[] = listings
      .filter((l) => l.images.length > 0)
      .map((l) => ({
        id: l.listingId,
        title: l.title,
        description: l.description,
        price: l.price,
        priceLabel: priceLabel(l.price),
        images: l.images,
        cover: l.images[0],
        location: l.location,
        seller: names.get(l.userId) || "Member",
        atTrack: l.atTrack,
        meetAtTrack: l.meetAtTrack,
        contact: {
          name: l.contactName || names.get(l.userId) || "Member",
          method: l.contactMethod,
          value: l.contactValue,
        },
        createdAt: l.createdAt,
      }));

    return NextResponse.json(
      { listings: items.slice(0, limit) },
      { headers: { ...cors, "Cache-Control": "public, max-age=300" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        listings: [],
        error: error instanceof Error ? error.message : "Failed to load marketplace",
      },
      { status: 500, headers: cors }
    );
  }
}
