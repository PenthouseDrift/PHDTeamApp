import Link from "next/link";
import { auth } from "@/lib/auth";
import { getListingsPage, getListingAuthorName } from "@/actions/marketplace";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { MarketplaceSearch } from "@/components/marketplace/MarketplaceSearch";

export const dynamic = "force-dynamic";

const PER_PAGE = 14;

interface MarketplacePageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const [session, { page: pageParam, q: qParam }] = await Promise.all([auth(), searchParams]);
  const viewerId = session?.user?.id ?? "";
  const isStaff = session?.user?.role === "admin" || session?.user?.role === "moderator";

  const query = (qParam ?? "").trim();
  const requestedPage = Math.max(1, Number(pageParam) || 1);
  const { listings, page, totalPages, total } = await getListingsPage(requestedPage, PER_PAGE, {
    query,
  });

  // Build a page href that preserves the active search query.
  const pageHref = (p: number) =>
    query ? `/marketplace?q=${encodeURIComponent(query)}&page=${p}` : `/marketplace?page=${p}`;

  // Resolve author display names in parallel (de-duped by userId) for this page only.
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
              {query ? (
                <>
                  {total} result{total === 1 ? "" : "s"} for{" "}
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    &ldquo;{query}&rdquo;
                  </span>
                </>
              ) : (
                <>
                  Buy and sell gear with the Penthouse Drift community
                  {total > 0 && (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {" "}· {total} item{total === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )}
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

        {/* Search (keyed on query so external URL changes reset the input) */}
        <MarketplaceSearch key={query} initialQuery={query} />

        {/* Grid */}
        {listings.length === 0 ? (
          query ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-zinc-500 dark:text-zinc-400">
                No items match &ldquo;{query}&rdquo;.
              </p>
              <Link
                href="/marketplace"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
              >
                Clear search
              </Link>
            </div>
          ) : (
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
          )
        ) : (
          <>
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

            {totalPages > 1 && (
              <nav
                className="flex items-center justify-center gap-3 pt-2"
                aria-label="Marketplace pagination"
              >
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    scroll
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
                    ← Previous
                  </span>
                )}

                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Page {page} of {totalPages}
                </span>

                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    scroll
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
                    Next →
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
