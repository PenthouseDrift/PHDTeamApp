"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  adjustVariantSold,
  deleteListing,
  setListingStatus,
  setListingSoldCount,
  sellAsboRcUnits,
  addListingStock,
} from "@/actions/marketplace";

/** What the "mark a variation sold" window needs to know about each variation. */
export interface DetailVariant {
  id: string;
  name: string;
  price: number;
  quantity: number;
  soldCount: number;
}

interface ListingDetailActionsProps {
  listingId: string;
  initialStatus: "available" | "sold";
  quantity?: number;
  initialSoldCount?: number;
  soldByAsboRc?: boolean;
  /** Whether this listing uses per-option variants (stock managed per variant). */
    hasVariations?: boolean;
  /** The listing's variations (variant listings only), for the "mark a variation sold" window. */
  variants?: DetailVariant[];
  /** Label the listing uses for its variations (e.g. "Size"), defaults to "option". */
  variationLabel?: string;
}


export function ListingDetailActions({
  listingId,
  initialStatus,
  quantity = 1,
  initialSoldCount = 0,
  soldByAsboRc = false,
    hasVariations = false,
  variants: initialVariants = [],
  variationLabel,
}: ListingDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [soldCount, setSoldCount] = useState(initialSoldCount);
  // For ASBO-RC, quantity IS the available stock. We keep a local copy so the
  // control updates immediately after a sale.
  const [asboAvailable, setAsboAvailable] = useState(Math.max(0, quantity));
  // Total quantity (restockable). For ASBO this doubles as live available.
  const [quantityState, setQuantityState] = useState(Math.max(0, quantity));
    const [addQty, setAddQty] = useState(1);
  const [variants, setVariants] = useState(initialVariants);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const optionWord = (variationLabel || "option").toLowerCase();

  // Variant listings keep their stock on each variation: the listing-level quantity is everything
  // ever stocked, so what is left is the sum of each variation's remaining units.
  const variantTotal = variants.reduce((s, v) => s + v.quantity, 0);
  const variantAvailable = variants.reduce((s, v) => s + Math.max(0, v.quantity - v.soldCount), 0);

  const totalUnits = hasVariations ? Math.max(1, variantTotal) : Math.max(1, quantityState);
  // Physical stock remaining (ignores holds).
  const inStock = hasVariations
    ? variantAvailable
    : soldByAsboRc
      ? asboAvailable
      : Math.max(0, totalUnits - soldCount);
  // Units still in stock (holds are managed in the Reservations panel).
  const available = inStock;
  const multiUnit = totalUnits > 1;

  const addStock = () => {
    const n = Math.max(1, Math.floor(addQty) || 1);
    startTransition(async () => {
      const result = await addListingStock(listingId, n);
      if (result.success) {
        setQuantityState(result.data.quantity);
        if (soldByAsboRc) setAsboAvailable(result.data.available);
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const handleToggleSold = () => {
    const next = status === "sold" ? "available" : "sold";
    startTransition(async () => {
      const result = await setListingStatus(listingId, next);
      if (result.success) {
        setStatus(result.data.status);
        setSoldCount(next === "sold" ? totalUnits : 0);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const adjustSold = (delta: number) => {
    const target = Math.min(totalUnits, Math.max(0, soldCount + delta));
    if (target === soldCount) return;
    startTransition(async () => {
      const result = await setListingSoldCount(listingId, target);
      if (result.success) {
        setSoldCount(result.data.soldCount);
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  // ASBO-RC: record one sale (decrements available + logs a ledger sale).
  const sellOne = () => {
    startTransition(async () => {
      const result = await sellAsboRcUnits(listingId, 1);
      if (result.success) {
        setAsboAvailable(result.data.available);
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

    // Variant listings: sell (or undo) one unit of a chosen variation.
  const adjustVariant = (variantId: string, delta: number) => {
    setPickerError(null);
    startTransition(async () => {
      const result = await adjustVariantSold(listingId, variantId, delta);
      if (result.success) {
        setVariants((list) =>
          list.map((v) => (v.id === variantId ? { ...v, soldCount: result.data.variantSoldCount } : v))
        );
        setStatus(result.data.status);
        router.refresh();
      } else {
        setPickerError(result.error);
      }
    });
  };

  // Close the window with Escape and stop the page scrolling behind it.
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [pickerOpen]);

  const handleDelete = () => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (result.success) {
        router.push("/marketplace");
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
            {hasVariations ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="text-sm">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {variantAvailable > 0 ? `${variantAvailable} of ${variantTotal} available` : "Sold out"}
            </span>
            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
              ({variantTotal - variantAvailable} sold across {variants.length} {optionWord}
              {variants.length === 1 ? "" : "s"})
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPickerError(null);
              setPickerOpen(true);
            }}
            disabled={isPending || variants.length === 0}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            Mark a {optionWord} sold
          </button>
        </div>
      ) : soldByAsboRc ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5 dark:border-teal-900/50 dark:bg-teal-950/20">
          <div className="text-sm">
            <span className="font-semibold text-teal-800 dark:text-teal-200">
              {available > 0 ? `${available} available` : "Sold out"}
            </span>
            <span className="ml-2 text-xs text-teal-600/80 dark:text-teal-400/80">ASBO-RC consignment</span>
          </div>
          <button
            type="button"
            onClick={sellOne}
            disabled={isPending || available <= 0}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-500 disabled:opacity-40"
          >
            Record a sale
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="text-sm">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {status === "sold" && !multiUnit ? "Sold" : `${available} of ${totalUnits} available`}
            </span>
            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">({soldCount} sold)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Mark sold</span>
            <button
              type="button"
              aria-label="Fewer sold"
              onClick={() => adjustSold(-1)}
              disabled={isPending || soldCount <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-base font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              −
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
              {soldCount}/{totalUnits}
            </span>
            <button
              type="button"
              aria-label="More sold"
              onClick={() => adjustSold(1)}
              disabled={isPending || soldCount >= totalUnits}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-base font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Add stock — raises total quantity (and availability). Works for both
          normal and ASBO-RC non-variant listings. Never touches soldCount or
          the ledger. Variant listings manage stock per-option from the
          marketplace card, so the control is hidden here for them. */}
      {!hasVariations ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Add stock</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label="Units to add to stock"
            value={addQty}
            onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="h-8 w-16 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <button
            type="button"
            onClick={addStock}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            + Add stock
          </button>
          <span className="ml-auto text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Raises availability without logging a sale.
          </span>
        </div>
      ) : (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
          This item has variations — add stock per option from its card in the marketplace list.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/marketplace/${listingId}/edit`}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Edit
        </Link>
        {/* ASBO-RC stock is managed via "Record a sale" + the ASBO report, so no
            whole-listing sold toggle is shown for it. */}
                {!soldByAsboRc && !hasVariations && (
          <button
            type="button"
            onClick={handleToggleSold}
            disabled={isPending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {status === "sold"
              ? multiUnit
                ? "Restock (mark available)"
                : "Mark as available"
              : multiUnit
              ? "Mark all sold"
              : "Mark as sold"}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Delete listing
        </button>
      </div>

      {pickerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mark-variant-sold-title"
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPickerOpen(false)} aria-hidden="true" />
            <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div>
                  <h2 id="mark-variant-sold-title" className="text-base font-black text-zinc-900 dark:text-zinc-100">
                    Which {optionWord} sold?
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Pick a {optionWord} to mark 1 unit sold. {variantAvailable} left in total.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>

              <ul className="divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {variants.map((v) => {
                  const left = Math.max(0, v.quantity - v.soldCount);
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{v.name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          £{v.price.toFixed(2)} · {left > 0 ? `${left} left` : "Sold out"}
                          {v.soldCount > 0 ? ` · ${v.soldCount} sold` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {v.soldCount > 0 && (
                          <button
                            type="button"
                            onClick={() => adjustVariant(v.id, -1)}
                            disabled={isPending}
                            aria-label={`Undo 1 sold for ${v.name}`}
                            className="min-h-9 rounded-lg border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Undo 1
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => adjustVariant(v.id, 1)}
                          disabled={isPending || left <= 0}
                          aria-label={`Mark 1 ${v.name} sold`}
                          className="min-h-9 rounded-lg bg-amber-500 px-3 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-40"
                        >
                          Mark 1 sold
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {pickerError && (
                <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {pickerError}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
