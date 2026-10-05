import Link from "next/link";
import { auth } from "@/lib/auth";
import { getListings, getListingAuthorName } from "@/actions/marketplace";
import { ListingCard } from "@/components/marketplace/ListingCard";
import type { MarketplaceListing } from "@/types";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const session = await auth();
  const viewerId = session?.user?.id ?? "";
  const isStaff = session?.user?.role === "admin" || session?.user?.role === "moderator";

  const listings: MarketplaceListing[] = await getListings();

  // Resolve author display names in parallel (de-duped by userId).
  const uniqueUserIds = [...new Set(listings.map((l) => l.userId))];
  const authorNamesArr = await Promise.all(
    uniqueUserIds.map(async (uid) => [uid, await getListingAuthorName(uid)] as [string, string])
  );
  const authorNames = new Map(authorNamesArr);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Marketplace</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Buy and sell gear with the Penthouse Drift community
            </p>
          </div>
          {/* Full-width primary action on mobile, inline on larger screens */}
          <Link
            href="/marketplace/submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400 active:bg-amber-600 sm:w-auto sm:rounded-lg sm:py-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            List an Item
          </Link>
        </div>

        {/* Grid */}
        {listings.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Nothing for sale yet. Be the first to list an item!
            </p>
            <Link
              href="/marketplace/submit"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
            >
              List an item →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.listingId}
                listing={listing}
                authorName={authorNames.get(listing.userId) || "Member"}
                viewerId={viewerId}
                isStaff={isStaff}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
