import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getListings, getDraftListings, getListingAuthorName } from "@/actions/marketplace";
import { ListingCard } from "@/components/marketplace/ListingCard";

export const dynamic = "force-dynamic";

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const viewerId = session.user.id;
  const isStaff = session.user.role === "admin" || session.user.role === "moderator";
  const isAdmin = session.user.role === "admin";

  // Published (available + sold) listings, then narrowed to this member. A
  // generous limit covers any member's own catalogue without a bespoke query.
  // Drafts live outside the public index, so fetch them separately (scoped to
  // the viewer server-side) and show them alongside.
  const [all, drafts] = await Promise.all([
    getListings(200, { includeSold: true }),
    getDraftListings(),
  ]);

  const mine = all.filter((l) => l.userId === viewerId);
  const myDrafts = drafts.filter((l) => l.userId === viewerId);
  const authorName = await getListingAuthorName(viewerId);

  const hasAny = mine.length > 0 || myDrafts.length > 0;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/marketplace"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Marketplace
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">My Listings</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The items you&apos;ve listed for sale
              {mine.length + myDrafts.length > 0 && (
                <span className="text-zinc-400 dark:text-zinc-500">
                  {" "}· {mine.length + myDrafts.length} item{mine.length + myDrafts.length === 1 ? "" : "s"}
                </span>
              )}
            </p>
          </div>
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

        {!hasAny ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">You haven&apos;t listed anything yet.</p>
            <Link
              href="/marketplace/submit"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
            >
              List your first item →
            </Link>
          </div>
        ) : (
          <>
            {myDrafts.length > 0 && (
              <section className="space-y-3 rounded-xl border border-dashed border-amber-400/60 bg-amber-50/40 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Drafts · not yet published
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {myDrafts.map((draft) => (
                    <ListingCard
                      key={draft.listingId}
                      listing={draft}
                      authorName={authorName}
                      viewerId={viewerId}
                      isStaff={isStaff}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </section>
            )}

            {mine.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {mine.map((listing) => (
                  <ListingCard
                    key={listing.listingId}
                    listing={listing}
                    authorName={authorName}
                    viewerId={viewerId}
                    isStaff={isStaff}
                      isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
