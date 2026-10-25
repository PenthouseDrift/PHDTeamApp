"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MarketplaceListing } from "@/types";
import { deleteListing, setListingStatus, setListingSoldCount, sellAsboRcUnits, publishListing, adjustVariantSold, addListingStock, addVariantStock } from "@/actions/marketplace";
import { isListingReserved } from "@/lib/marketplace-reserved";
import { ShareButton } from "@/components/ShareButton";
import { AddToBasketButton } from "@/components/marketplace/AddToBasketButton";
import { MemberReservations, ReserveForMemberButton } from "@/components/marketplace/MemberReservations";
import { SheetFrame } from "@/components/admin/desk/desk-ui";
import type { ReservationView } from "@/actions/marketplace-reservations";

// Public base URL of the app (inlined at build time), used for share links.
const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.penthousedrift.com").replace(/\/$/, "");


interface ListingCardProps {
  listing: MarketplaceListing;
  authorName: string;
  /** Current viewer's user id (empty string if logged out). */
  viewerId: string;
  /** Whether the viewer is admin/moderator (can moderate any listing). */
  isStaff?: boolean;
  /** Whether the viewer is an admin specifically (reserve is admin-only). */
  isAdmin?: boolean;
  /** Admin only: who each reservation on THIS listing is held for. */
  reservations?: ReservationView[];
  /** The viewer's own reservations on THIS listing (never anyone else's). */
  myReservations?: ReservationView[];
}

function formatPrice(price: number): string {
  if (price <= 0) return "Free / Offers";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function ListingCard({
  listing,
  authorName,
  viewerId,
  isStaff = false,
  isAdmin = false,
  reservations = [],
  myReservations = [],
}: ListingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(listing.status);
  const [soldCount, setSoldCount] = useState(listing.soldCount);
  const [variants, setVariants] = useState(listing.variants);
  const [reservedCount, setReservedCount] = useState(Math.max(0, listing.reservedCount || 0));
  const [quantityState, setQuantityState] = useState(listing.quantity);
  const [addQty, setAddQty] = useState(1);
  const [variantAddQty, setVariantAddQty] = useState<Record<string, number>>({});
  const [manageOpen, setManageOpen] = useState(false);

  // Server-driven changes (reserving, cancelling, a purchase) arrive as a new
  // listing prop after router.refresh(). Re-sync local copies when updatedAt moves.
  const [syncedAt, setSyncedAt] = useState(listing.updatedAt);
  if (syncedAt !== listing.updatedAt) {
    setSyncedAt(listing.updatedAt);
    setStatus(listing.status);
    setSoldCount(listing.soldCount);
    setVariants(listing.variants);
    setReservedCount(Math.max(0, listing.reservedCount || 0));
    setQuantityState(listing.quantity);
  }

  const addStockToListing = () => {
    const n = Math.max(1, Math.floor(addQty) || 1);
    startTransition(async () => {
      const result = await addListingStock(listing.listingId, n);
      if (result.success) {
        setQuantityState(result.data.quantity);
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const addStockToVariant = (variantId: string) => {
    const n = Math.max(1, Math.floor(variantAddQty[variantId] ?? 1) || 1);
    startTransition(async () => {
      const result = await addVariantStock(listing.listingId, variantId, n);
      if (result.success) {
        setVariants((vs) =>
          vs.map((v) => (v.id === variantId ? { ...v, quantity: result.data.variantQuantity } : v))
        );
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const hasVariations = listing.hasVariations;
  // Admins can reserve any live listing for a member; nobody else can.
  const canReserve = isAdmin;
  // Units THIS viewer has reserved here (variant listings: summed across options).
  const myHeld = myReservations.reduce((s, r) => s + r.quantity, 0);
  const memberHeldFor = (variantId?: string) =>
    reservations.filter((r) => (r.variantId ?? "") === (variantId ?? "")).reduce((s, r) => s + r.quantity, 0);
  // Whether the card should show the "Reserved" corner badge (no buyable units
  // left due to a hold, and not sold).
  const showReservedBadge =
    status !== "sold" &&
    myHeld === 0 &&
    isListingReserved({
      status,
      reservedCount,
      quantity: quantityState,
      soldCount,
      hasVariations,
      variants,
    });

  const adjustVariant = (variantId: string, delta: number) => {
    startTransition(async () => {
      const result = await adjustVariantSold(listing.listingId, variantId, delta);
      if (result.success) {
        setVariants((vs) =>
          vs.map((v) =>
            v.id === variantId ? { ...v, soldCount: result.data.variantSoldCount } : v
          )
        );
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const canManage = viewerId === listing.userId || isStaff;
  const cover = listing.images[0];
  const isAsbo = listing.soldByAsboRc;
  const listingShareUrl = `${APP_BASE_URL}/marketplace/${listing.listingId}`;
  // Buyable (non-variant) stock for the quick "Add to basket" on the card.
  const nonVariantBuyable = Math.max(0, quantityState - soldCount - reservedCount);
  // The viewer's own reservation is theirs to buy, so it counts for them.
  const myBuyable = nonVariantBuyable + (hasVariations ? 0 : myHeld);
  // A card can quick-add only a simple (non-variant), at-track, priced,
  // in-stock, non-sold, non-draft item. Variant items need the detail page to
  // pick an option, so they show a "Choose options" link instead.
  const canQuickAdd =
    !hasVariations &&
    !listing.isDraft &&
    status !== "sold" &&
    listing.atTrack &&
    listing.price > 0 &&
    myBuyable > 0;
  // For ASBO-RC listings, quantity IS the live available stock (sold units live
  // in the ledger, not soldCount). For normal listings, available = quantity - sold.
  const quantity = Math.max(0, quantityState || 0);
  const available = isAsbo ? quantity : Math.max(0, quantity - soldCount);
  // "multiUnit" only tweaks wording for normal listings.
  const multiUnit = Math.max(1, quantityState || 1) > 1;

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
          <Image
            src={cover}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
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
        {/* Reserved pill (top-right). Sold takes precedence. */}
        {showReservedBadge && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black shadow">
            🔖 Reserved
          </span>
        )}
        {listing.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {listing.images.length} photos
          </span>
        )}
        {/* Left badges stack vertically so long labels (e.g. "Facilitated by PHD")
            never collide with the photo count at the bottom-right. */}
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">
          {myHeld > 0 && status !== "sold" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
              🔖 Reserved for you
            </span>
          )}
          {listing.isDraft && (
            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-900/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-300 shadow ring-1 ring-amber-400/50">
              Draft
            </span>
          )}
          {listing.atTrack && status !== "sold" && !listing.isDraft && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black shadow">
              📍 At the track
            </span>
          )}
          {(listing.soldByPhd || listing.soldByAsboRc) && status !== "sold" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
              Sold by PHD
            </span>
          )}
          {listing.facilitatedByPhd && !listing.soldByPhd && !listing.soldByAsboRc && status !== "sold" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
              Facilitated by PHD
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/marketplace/${listing.listingId}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
          >
            {listing.title}
          </Link>
          <ShareButton
            variant="icon"
            url={listingShareUrl}
            title={listing.title}
            text={`Check out "${listing.title}" on Penthouse Drift`}
            label="Share this listing"
            className="-mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          />
        </div>
        <p className="text-base font-bold text-amber-600 dark:text-amber-400">
          {hasVariations ? `from ${formatPrice(listing.price)}` : formatPrice(listing.price)}
        </p>
        {/* "Facilitated by PHD" owner payout — SENSITIVE: shown ONLY to the
            listing owner and admins, never to other buyers. For variant
            listings the payout varies per option, so we just flag it. */}
        {listing.facilitatedByPhd && (viewerId === listing.userId || isAdmin) && (
          <p className="mt-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {hasVariations
              ? "Your payout set per option"
              : listing.ownerPayoutPrice != null
              ? `Your payout: ${formatPrice(listing.ownerPayoutPrice)}`
              : `Your payout: ${formatPrice(listing.price)} (full price)`}
          </p>
        )}
        {hasVariations && (
          <p className="mt-0.5 line-clamp-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {variants.length} {listing.variationLabel || "option"}
            {variants.length === 1 ? "" : "s"}
          </p>
        )}
        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
          {authorName}
          {listing.location ? ` · ${listing.location}` : ""}
        </p>
        <p className={`mt-0.5 text-xs font-semibold ${status === "sold" ? "text-red-500 dark:text-red-400" : "text-zinc-600 dark:text-zinc-300"}`}>
          {status === "sold"
            ? isAsbo || multiUnit ? "Sold out" : "Sold"
            : `${available} available`}
        </p>

        {/* Quick add-to-basket (simple items) or a prompt to choose options. */}
        {canQuickAdd ? (
          <AddToBasketButton
            listingId={listing.listingId}
            label={listing.title}
            unitPrice={listing.price}
            image={cover}
            maxQuantity={myBuyable}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/70 py-1.5 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          />
        ) : hasVariations && status !== "sold" && listing.atTrack ? (
          <Link
            href={`/marketplace/${listing.listingId}`}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Choose options
          </Link>
        ) : null}

        {/* Admin: reserve straight from the card, right under Add to basket. */}
        {canReserve && status !== "sold" && !listing.isDraft && (
          <div className="mt-2">
            <ReserveForMemberButton
              listingId={listing.listingId}
              hasVariations={hasVariations}
              variationLabel={listing.variationLabel}
              free={nonVariantBuyable}
              variants={variants.map((v) => ({
                id: v.id,
                name: v.name,
                free: Math.max(0, v.quantity - v.soldCount - Math.max(0, v.reservedCount ?? 0)),
                anonHeld: 0,
              }))}
            />
          </div>
        )}

        {canManage && (
          <>
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              aria-haspopup="dialog"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
              Manage
            </button>

            {manageOpen && (
              <SheetFrame
                title={listing.title}
                subtitle={listing.isDraft ? "Draft · manage listing" : "Manage listing"}
                onClose={() => setManageOpen(false)}
              >
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-2">
                  {listing.isDraft && (
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPending}
                      className="col-span-2 min-h-12 rounded-xl bg-amber-500 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                    >
                      Publish listing
                    </button>
                  )}
                  <Link
                    href={`/marketplace/${listing.listingId}/edit`}
                    className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/marketplace/${listing.listingId}`}
                    className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    View
                  </Link>
                </div>

                {/* Reserve for a member / see who holds what (admin only). */}
                {canReserve && status !== "sold" && (
                  <MemberReservations
                    listingId={listing.listingId}
                    hasVariations={hasVariations}
                    variationLabel={listing.variationLabel}
                    free={nonVariantBuyable}
                    anonHeld={Math.max(0, reservedCount - memberHeldFor())}
                    variants={variants.map((v) => {
                      const held = Math.max(0, v.reservedCount ?? 0);
                      return {
                        id: v.id,
                        name: v.name,
                        free: Math.max(0, v.quantity - v.soldCount - held),
                        anonHeld: Math.max(0, held - memberHeldFor(v.id)),
                      };
                    })}
                    reservations={reservations}
                  />
                )}

                {/* Stock & sales */}
                <section className="space-y-2" aria-label="Stock and sales">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {hasVariations ? listing.variationLabel || "Variations" : "Stock & sales"}
                  </h3>

                  {hasVariations ? (
                    <>
                      {variants.map((v) => {
                        const vAvail = Math.max(0, v.quantity - v.soldCount);
                        return (
                          <div key={v.id} className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                {v.name}
                                <span className="ml-1.5 font-medium text-zinc-400">{formatPrice(v.price)}</span>
                              </span>
                              <span className="shrink-0 text-right leading-tight">
                                <span className="block text-sm font-black tabular-nums text-zinc-900 dark:text-zinc-100">
                                  {vAvail} left
                                </span>
                                <span className="block text-xs tabular-nums text-zinc-400">{v.soldCount} sold</span>
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => adjustVariant(v.id, 1)}
                                disabled={isPending || vAvail <= 0}
                                className="min-h-11 flex-1 rounded-lg bg-zinc-900 px-3 text-sm font-bold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                              >
                                {vAvail <= 0 ? "Sold out" : `Mark 1 ${v.name} sold`}
                              </button>
                              <button
                                type="button"
                                onClick={() => adjustVariant(v.id, -1)}
                                disabled={isPending || v.soldCount <= 0}
                                title="Undo the last sale"
                                className="min-h-11 rounded-lg border border-zinc-300 px-3.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                Undo 1
                              </button>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg bg-emerald-50/70 p-2 dark:bg-emerald-950/20">
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Add stock</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                aria-label={`Units to add to ${v.name}`}
                                value={variantAddQty[v.id] ?? 1}
                                onChange={(e) =>
                                  setVariantAddQty((m) => ({
                                    ...m,
                                    [v.id]: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                                  }))
                                }
                                className="ml-auto h-10 w-16 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                              <button
                                type="button"
                                onClick={() => addStockToVariant(v.id)}
                                disabled={isPending}
                                className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                        {isAsbo
                          ? "Selling a variation logs it to the ASBO-RC ledger at that variation's price."
                          : "Mark 1 sold when one goes. Use Undo 1 if you tapped it by mistake."}
                      </p>
                    </>
                  ) : isAsbo ? (
                    <>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
                        <span className="text-sm font-bold text-teal-800 dark:text-teal-300">{available} available</span>
                        <button
                          type="button"
                          onClick={sellOne}
                          disabled={isPending || available <= 0}
                          className="min-h-11 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-500 disabled:opacity-40"
                        >
                          Record a sale
                        </button>
                      </div>
                      <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                        Logs a sale to the ASBO-RC ledger and drops available by 1. Manage stock in Admin → Reports → ASBO-RC.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Sold</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label="Fewer sold"
                            onClick={() => adjustSold(-1)}
                            disabled={isPending || soldCount <= 0}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            −
                          </button>
                          <span className="min-w-[4rem] text-center text-sm font-black tabular-nums text-zinc-900 dark:text-zinc-100">
                            {soldCount}/{quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="More sold"
                            onClick={() => adjustSold(1)}
                            disabled={isPending || soldCount >= quantity}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleSold}
                        disabled={isPending}
                        className="min-h-12 w-full rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {status === "sold"
                          ? multiUnit ? "Restock (mark available)" : "Mark available"
                          : multiUnit ? "Mark all sold" : "Mark as sold"}
                      </button>
                      {/* Add stock: raises total quantity (and availability). */}
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Add stock</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          aria-label="Units to add to stock"
                          value={addQty}
                          onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          className="ml-auto h-10 w-16 rounded-lg border border-zinc-300 bg-white px-2 text-center text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={addStockToListing}
                          disabled={isPending}
                          className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          + Add
                        </button>
                      </div>
                    </>
                  )}
                </section>

                {/* Danger zone */}
                <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="min-h-12 w-full rounded-xl border border-red-300 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Delete listing
                  </button>
                </div>
              </SheetFrame>
            )}
          </>
        )}
      </div>
    </div>
  );
}
