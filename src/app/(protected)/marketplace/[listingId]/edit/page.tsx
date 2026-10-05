import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getListingById } from "@/actions/marketplace";
import { ListingForm } from "@/components/marketplace/ListingForm";

export const dynamic = "force-dynamic";

interface EditListingPageProps {
  params: Promise<{ listingId: string }>;
}

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { listingId } = await params;

  const [session, listing] = await Promise.all([auth(), getListingById(listingId)]);

  if (!listing) {
    notFound();
  }

  const viewerId = session?.user?.id ?? "";
  const isStaff = session?.user?.role === "admin" || session?.user?.role === "moderator";
  const canEdit = viewerId === listing.userId || isStaff;

  if (!canEdit) {
    // Not the owner (and not staff) — send them back to the listing.
    redirect(`/marketplace/${listingId}`);
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back */}
        <Link
          href={`/marketplace/${listingId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span>←</span> Back to listing
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Edit Listing</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Update your item&apos;s photos, price and details
          </p>
        </div>

        <ListingForm mode="edit" listing={listing} />
      </div>
    </div>
  );
}
