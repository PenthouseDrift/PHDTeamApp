"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MarketplaceListing } from "@/types";
import { deleteListing, setListingStatus, setListingSoldCount, sellAsboRcUnits, publishListing, adjustVariantSold, setListingReservedCount, setVariantReservedCount, addListingStock, addVariantStock } from "@/actions/marketplace";
import { isListingReserved } from "@/lib/marketplace-reserved";
import { ShareButton } from "@/components/ShareButton";
import { AddToBasketButton } from "@/components/marketplace/AddToBasketButton";

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
}

function formatPrice(price: number): string {
  if (price <= 0) return "Free / Offers";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function ListingCard({ listing, authorName, viewerId, isStaff = false, isAdmin = false }: ListingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(listing.status);
  const [soldCount, setSoldCount] = useState(listing.soldCount);
  const [variants, setVariants] = useState(listing.variants);
  const [reservedCount, setReservedCount] = useState(Math.max(0, listing.reservedCount || 0));
  const [quantityState, setQuantityState] = useState(listing.quantity);
  const [addQty, setAddQty] = useState(1);
  const [variantAddQty, setVariantAddQty] = useState<Record<string, number>>({});
  // Draft values for the "reserve N units" inputs (listing + per variant).
  const [reserveInput, setReserveInput] = useState(0);
  const [variantReserveInput, setVariantReserveInput] = useState<Record<string, number>>({});
  const [manageOpen, setManageOpen] = useState(false);

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
  // PHD/ASBO items only can be reserved, and only admins may do it.
  const canReserve = isAdmin && (listing.soldByPhd || listing.soldByAsboRc);
  // Whether the card should show the "Reserved" corner badge (no buyable units
  // left due to a hold, and not sold).
  const showReservedBadge =
    status !== "sold" &&
    isListingReserved({
      status,
      reservedCount,
      quantity: quantityState,
      soldCount,
      hasVariations,
      variants,
    });

  // Set the listing-level hold to an absolute number of units (0 releases).
  const setListingReserve = (units: number) => {
    const n = Math.max(0, Math.floor(units) || 0);
    startTransition(async () => {
      const result = await setListingReservedCount(listing.listingId, n);
      if (result.success) {
        setReservedCount(result.data.reservedCount);
        setReserveInput(result.data.reservedCount);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  // Set a variant's hold to an absolute number of units (0 releases).
  const setVariantReserve = (variantId: string, units: number) => {
    const n = Math.max(0, Math.floor(units) || 0);
    startTransition(async () => {
      const result = await setVariantReservedCount(listing.listingId, variantId, n);
      if (result.success) {
        const applied = result.data.reservedCount;
        setVariants((vs) =>
          vs.map((v) => (v.id === variantId ? { ...v, reservedCount: applied } : v))
        );
        setVariantReserveInput((m) => ({ ...m, [variantId]: applied }));
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

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
  // A card can quick-add only a simple (non-variant), at-track, priced,
  // in-stock, non-sold, non-draft item. Variant items need the detail page to
  // pick an option, so they show a "Choose options" link instead.
  const canQuickAdd =
    !hasVariations &&
    !listing.isDraft &&
    status !== "sold" &&
    listing.atTrack &&
    listing.price > 0 &&
    nonVariantBuyable > 0;
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
            maxQuantity={nonVariantBuyable}
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
                {/* Listing-level reserve (quantity hold) — admin, PHD/ASBO,
                    non-variant, non-sold. Variant listings reserve per-option
                    below. Reserving holds N units out of the buyable pool. */}
                {canReserve && !hasVariations && status !== "sold" && (
                  <div
                    className={`flex flex-col gap-1.5 rounded-lg border px-2 py-2 ${
                      reservedCount > 0
                        ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        {reservedCount > 0 ? `🔖 ${reservedCount} reserved` : "Reserve units"}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {Math.max(0, quantity - soldCount - reservedCount)} buyable
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label="Units to reserve"
                        value={reserveInput || reservedCount}
                        onChange={(e) => setReserveInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        className="h-7 w-14 rounded border border-zinc-300 bg-white px-1 text-center text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                      />
                      <button
                        type="button"
                        onClick={() => setListingReserve(reserveInput || reservedCount)}
                        disabled={isPending}
                        className="h-7 flex-1 rounded border border-amber-300 bg-amber-100 px-2 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        Hold
                      </button>
                      {reservedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setListingReserve(0)}
                          disabled={isPending}
                          className="h-7 rounded border border-zinc-300 px-2 text-[11px] font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Release
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {hasVariations ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {listing.variationLabel || "Variations"}
                    </span>
                    {variants.map((v) => {
                      const vAvail = Math.max(0, v.quantity - v.soldCount);
                      const vReserved = Math.max(0, v.reservedCount ?? 0);
                      const vBuyable = Math.max(0, vAvail - vReserved);
                      return (
                        <div
                          key={v.id}
                          className="flex flex-col gap-1.5 rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {v.name}
                            <span className="ml-1 text-zinc-400">{formatPrice(v.price)}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`One fewer ${v.name} sold`}
                              onClick={() => adjustVariant(v.id, -1)}
                              disabled={isPending || v.soldCount <= 0}
                              className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              −
                            </button>
                            <span className="min-w-[3rem] text-center text-[11px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                              {vAvail} left
                            </span>
                            <button
                              type="button"
                              aria-label={`One more ${v.name} sold`}
                              onClick={() => adjustVariant(v.id, 1)}
                              disabled={isPending || vAvail <= 0}
                              className="flex h-6 w-6 items-center justify-center rounded border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              +
                            </button>
                          </div>
                          </div>
                          {/* Reserve units of this variation (admin, PHD/ASBO). */}
                          {canReserve && (
                            <div
                              className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${
                                vReserved > 0
                                  ? "bg-amber-50 dark:bg-amber-500/10"
                                  : ""
                              }`}
                            >
                              <span className="flex-1 truncate text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                                {vReserved > 0 ? `🔖 ${vReserved} reserved` : "Reserve"}
                                <span className="ml-1 text-zinc-400">· {vBuyable} buyable</span>
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                aria-label={`Units of ${v.name} to reserve`}
                                value={variantReserveInput[v.id] ?? vReserved}
                                onChange={(e) =>
                                  setVariantReserveInput((m) => ({
                                    ...m,
                                    [v.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                  }))
                                }
                                className="h-6 w-11 rounded border border-zinc-300 bg-white px-1 text-center text-[11px] font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                              />
                              <button
                                type="button"
                                onClick={() => setVariantReserve(v.id, variantReserveInput[v.id] ?? vReserved)}
                                disabled={isPending}
                                className="h-6 rounded border border-amber-300 bg-amber-100 px-2 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                              >
                                Hold
                              </button>
                              {vReserved > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setVariantReserve(v.id, 0)}
                                  disabled={isPending}
                                  className="h-6 rounded border border-zinc-300 px-1.5 text-[10px] font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}
                          {/* Add stock to this variation. */}
                          <div className="flex items-center gap-1.5">
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
                              className="h-6 w-12 rounded border border-zinc-300 bg-white px-1 text-center text-[11px] font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                            />
                            <button
                              type="button"
                              onClick={() => addStockToVariant(v.id)}
                              disabled={isPending}
                              className="h-6 rounded border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400"
                            >
                              + Add stock
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                      {isAsbo
                        ? "Selling a variation logs it to the ASBO-RC ledger at that variation's price."
                        : "Adjust how many of each variation have sold."}
                    </p>
                  </div>
                ) : isAsbo ? (
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
                    {/* Add stock — raises total quantity (and availability). */}
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 py-1.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Add stock</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          aria-label="Units to add to stock"
                          value={addQty}
                          onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          className="h-7 w-14 rounded border border-zinc-300 bg-white px-1 text-center text-xs font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                        />
                        <button
                          type="button"
                          onClick={addStockToListing}
                          disabled={isPending}
                          className="h-7 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
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
