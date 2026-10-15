"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MarketplaceListing } from "@/types";
import { deleteListing, setListingStatus, setListingSoldCount, sellAsboRcUnits, publishListing } from "@/actions/marketplace";


interface ListingCardProps {
  listing: MarketplaceListing;
  authorName: string;
  /** Current viewer's user id (empty string if logged out). */
  viewerId: string;
  /** Whether the viewer is admin/moderator (can moderate any listing). */
  isStaff?: boolean;
}

function formatPrice(price: number): string {
  if (price <= 0) return "Free / Offers";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function ListingCard({ listing, authorName, viewerId, isStaff = false }: ListingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(listing.status);
  const [soldCount, setSoldCount] = useState(listing.soldCount);
  const [manageOpen, setManageOpen] = useState(false);

  const canManage = viewerId === listing.userId || isStaff;
  const cover = listing.images[0];
  const isAsbo = listing.soldByAsboRc;
  // For ASBO-RC listings, quantity IS the live available stock (sold units live
  // in the ledger, not soldCount). For normal listings, available = quantity - sold.
  const quantity = Math.max(0, listing.quantity || 0);
  const available = isAsbo ? quantity : Math.max(0, quantity - soldCount);
  // "multiUnit" only tweaks wording for normal listings.
  const multiUnit = Math.max(1, listing.quantity || 1) > 1;

  const handleToggleSold = () => {
    const next = status === "sold" ? "available" : "sold";
    startTransition(async () => {
      const result = await setListingStatus(listing.listingId, next);
      if (result.success) {
        setStatus(result.data.status);
        setSoldCount(next === "sold" ? quantity : 0);
        router.refresh();
      }
    });
  };

  const adjustSold = (delta: number) => {
    const target = Math.min(quantity, Math.max(0, soldCount + delta));
    if (target === soldCount) return;
    startTransition(async () => {
      const result = await setListingSoldCount(listing.listingId, target);
      if (result.success) {
        setSoldCount(result.data.soldCount);
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  // ASBO-RC: record a sale of one unit (decrements available + logs a ledger sale).
  const sellOne = () => {
    startTransition(async () => {
      const result = await sellAsboRcUnits(listing.listingId, 1);
      if (result.success) {
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const handlePublish = () => {
    if (!confirm("Publish this listing? It will become visible to members and on the website.")) return;
    startTransition(async () => {
      const result = await publishListing(listing.listingId);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteListing(listing.listingId);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="group flex flex-col self-start overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <Link href={`/marketplace/${listing.listingId}`} className="relative block aspect-square overflow-hidden bg-zinc-100 active:opacity-90 dark:bg-zinc-800">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">No image</div>
        )}
        {status === "sold" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-md bg-red-500 px-3 py-1 text-sm font-bold uppercase tracking-wide text-white">
              {multiUnit ? "Sold out" : "Sold"}
            </span>
          </div>
        )}
        {listing.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {listing.images.length} photos
          </span>
        )}
        {listing.isDraft && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-zinc-900/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-300 shadow ring-1 ring-amber-400/50">
            Draft
          </span>
        )}
        {listing.atTrack && status !== "sold" && !listing.isDraft && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black shadow">
            📍 At the track
          </span>
        )}
        {(listing.soldByPhd || listing.soldByAsboRc) && status !== "sold" && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-teal-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
            Sold by PHD
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/marketplace/${listing.listingId}`}
            className="line-clamp-1 text-sm font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
          >
            {listing.title}
          </Link>
        </div>
        <p className="text-base font-bold text-amber-600 dark:text-amber-400">{formatPrice(listing.price)}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
          {authorName}
          {listing.location ? ` · ${listing.location}` : ""}
        </p>
        <p className={`mt-0.5 text-xs font-semibold ${status === "sold" ? "text-red-500 dark:text-red-400" : "text-zinc-600 dark:text-zinc-300"}`}>
          {status === "sold"
            ? isAsbo || multiUnit ? "Sold out" : "Sold"
            : `${available} available`}
        </p>

        {canManage && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setManageOpen((v) => !v)}
              aria-expanded={manageOpen}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-zinc-300 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Manage
              <svg
                className={`h-3.5 w-3.5 transition-transform ${manageOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {manageOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {listing.isDraft && (
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPending}
                    className="rounded-lg bg-amber-500 py-2.5 text-center text-sm font-bold text-black transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
                <Link
                  href={`/marketplace/${listing.listingId}/edit`}
                  className="rounded-lg border border-zinc-300 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Edit
                </Link>
                {isAsbo ? (
                  <>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/20">
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                        {available} available
                      </span>
                      <button
                        type="button"
                        onClick={sellOne}
                        disabled={isPending || available <= 0}
                        className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-teal-500 disabled:opacity-40"
                      >
                        Record a sale
                      </button>
                    </div>
                    <p className="text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                      Logs a sale to the ASBO-RC ledger and drops available by 1. Manage stock in Admin
                      → Reports → ASBO-RC.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Sold</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="Fewer sold"
                          onClick={() => adjustSold(-1)}
                          disabled={isPending || soldCount <= 0}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          −
                        </button>
                        <span className="min-w-[3.5rem] text-center text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                          {soldCount}/{quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="More sold"
                          onClick={() => adjustSold(1)}
                          disabled={isPending || soldCount >= quantity}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSold}
                      disabled={isPending}
                      className="rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {status === "sold"
                        ? multiUnit ? "Restock (mark available)" : "Mark available"
                        : multiUnit ? "Mark all sold" : "Mark as sold"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
