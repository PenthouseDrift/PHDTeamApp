import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getListingById, getListingAuthorName, canViewDraft } from "@/actions/marketplace";
import { ListingDetailActions } from "@/components/marketplace/ListingDetailActions";
import { ListingGallery } from "@/components/marketplace/ListingGallery";
import { ListingVariantPricing } from "@/components/marketplace/ListingVariantPricing";
import { BuyAndCollect } from "@/components/marketplace/BuyAndCollect";

export const dynamic = "force-dynamic";

interface ListingDetailPageProps {
  params: Promise<{ listingId: string }>;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Resolve a tappable href + button label for a contact method. */
function contactAction(method: string, rawValue: unknown): { href: string | null; label: string } {
  // Coerce defensively: Redis may hand back a non-string (e.g. an all-digit
  // phone number comes through as a number).
  const value = String(rawValue ?? "");
  if (method === "email") return { href: `mailto:${value}`, label: "Email seller" };
  if (method === "phone") {
    return { href: `tel:${value.replace(/[^\d+]/g, "")}`, label: "Call / message seller" };
  }
  if (/^https?:\/\//i.test(value)) {
    const label =
      method === "facebook"
        ? "Message on Facebook"
        : method === "instagram"
        ? "Message on Instagram"
        : "Contact seller";
    return { href: value, label };
  }
  return { href: null, label: "Contact seller" };
}

/**
 * Large, thumb-friendly contact button for mobile. Falls back to showing the
 * raw value when it can't be turned into a tappable link.
 */
function ContactButton({ method, value }: { method: string; value: string }) {
  const { href, label } = contactAction(method, value);

  if (!href) {
    return (
      <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 break-words">
        {value}
      </p>
    );
  }

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400 active:bg-amber-600"
    >
      {label}
    </a>
  );
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { listingId } = await params;

  const [session, listing] = await Promise.all([auth(), getListingById(listingId)]);

  if (!listing) {
    notFound();
  }

  // Draft listings are only viewable by admins (any draft) or the ASBO-RC owner
  // of that draft. Everyone else gets a 404 so drafts stay invisible by URL.
  if (!(await canViewDraft(listing))) {
    notFound();
  }

  const authorName = await getListingAuthorName(listing.userId);
  const viewerId = session?.user?.id ?? "";
  const isStaff = session?.user?.role === "admin" || session?.user?.role === "moderator";
  const canManage = viewerId === listing.userId || isStaff;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Back */}
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span>←</span> Back to Marketplace
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Images */}
          <ListingGallery
            images={listing.images}
            title={listing.title}
            isSold={listing.status === "sold"}
          />

          {/* Details */}
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{listing.title}</h1>
              {/* Price + variation selector (client). Picking a variation updates
                  the displayed price and stock. */}
              <div className="mt-1">
                <ListingVariantPricing
                  price={listing.price}
                  status={listing.status}
                  available={Math.max(0, listing.quantity - listing.soldCount)}
                  showAvailable
                  variationLabel={listing.variationLabel}
                  variants={listing.hasVariations ? listing.variants : []}
                />
              </div>
            </div>

            {/* Online Buy & Collect — shown at the top so buyers see the primary
                action first. Available items physically at the track can be paid
                for online via SumUp and collected from staff. */}
            {listing.status === "available" && listing.atTrack && (
              <BuyAndCollect
                listingId={listing.listingId}
                price={listing.price}
                hasVariations={listing.hasVariations}
                variationLabel={listing.variationLabel}
                variants={listing.variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  price: v.price,
                  available: Math.max(0, v.quantity - v.soldCount),
                }))}
              />
            )}

            {/* Owner/staff management (incl. "Record a sale") — shown near the
                top so staff can record sales without scrolling. Hidden for
                regular buyers. */}
            {canManage && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {viewerId === listing.userId ? "Manage your listing" : "Moderator controls"}
                </p>
                <ListingDetailActions
                  listingId={listing.listingId}
                  initialStatus={listing.status}
                  quantity={listing.quantity}
                  initialSoldCount={listing.soldCount}
                  soldByAsboRc={listing.soldByAsboRc}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{authorName}</span>
              {listing.location && <span>· {listing.location}</span>}
              {listing.createdAt > 0 && <span>· Listed {formatDate(listing.createdAt)}</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              {listing.atTrack && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  <span>📍</span>
                  <span>At Penthouse Drift — buy in person at the track</span>
                </div>
              )}
              {(listing.soldByPhd || listing.soldByAsboRc) && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-300">
                  <span>🏷️</span>
                  <span>Sold by PHD</span>
                </div>
              )}
            </div>

            {listing.status === "sold" && (
              <div className="rounded-lg bg-red-500/10 px-4 py-3">
                <p className="text-sm font-medium text-red-500 dark:text-red-400">
                  {listing.quantity > 1
                    ? "All units of this item have sold."
                    : "This item has been marked as sold."}
                </p>
              </div>
            )}

            {listing.description && (
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Description</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {listing.description}
                </p>
              </div>
            )}

            {/* Sold-by-PHD items that AREN'T eligible for online Buy & Collect
                (e.g. not flagged at-track) show the in-person message instead. */}
            {listing.status !== "sold" && listing.soldByPhd && !listing.atTrack ? (
              <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-500/40 dark:bg-teal-500/10">
                <h2 className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                  How to buy
                </h2>
                <div className="flex items-center gap-2 text-sm font-medium text-teal-800 dark:text-teal-200">
                  <span>📍</span>
                  <span>Sold by Penthouse Drift — just come to the track to buy it in person.</span>
                </div>
              </div>
            ) : (
              listing.status !== "sold" &&
              !listing.soldByPhd &&
              (listing.contactValue || listing.meetAtTrack) && (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    Contact the seller
                  </h2>

                  {listing.meetAtTrack && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <span>🤝</span>
                      <span>Meet {listing.contactName || authorName} at the track to arrange the sale.</span>
                    </div>
                  )}

                  {listing.contactValue && (
                    <>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {listing.contactName || authorName}
                        <span className="text-zinc-400"> · {listing.contactMethod}</span>
                      </p>
                      <ContactButton method={listing.contactMethod} value={listing.contactValue} />
                      <p className="break-words text-center text-xs text-zinc-400 dark:text-zinc-500">
                        {listing.contactValue}
                      </p>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
