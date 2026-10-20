"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteListing,
  setListingStatus,
  setListingSoldCount,
  sellAsboRcUnits,
  setListingReserved,
  addListingStock,
} from "@/actions/marketplace";

interface ListingDetailActionsProps {
  listingId: string;
  initialStatus: "available" | "sold";
  quantity?: number;
  initialSoldCount?: number;
  soldByAsboRc?: boolean;
  /** Whether this listing uses per-option variants (stock managed per variant). */
  hasVariations?: boolean;
  /** Current reserved state (listing-level, non-variant only). */
  initialReserved?: boolean;
  /** Whether the viewer is an admin (reserve is admin-only). */
  isAdmin?: boolean;
  /** Whether this listing is PHD/ASBO (reserve only applies to those). */
  canReserve?: boolean;
}

export function ListingDetailActions({
  listingId,
  initialStatus,
  quantity = 1,
  initialSoldCount = 0,
  soldByAsboRc = false,
  hasVariations = false,
  initialReserved = false,
  isAdmin = false,
  canReserve = false,
}: ListingDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [soldCount, setSoldCount] = useState(initialSoldCount);
  const [reserved, setReserved] = useState(initialReserved);

  const toggleReserved = () => {
    const next = !reserved;
    startTransition(async () => {
      const result = await setListingReserved(listingId, next);
      if (result.success) {
        setReserved(result.data.reserved);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };
  // For ASBO-RC, quantity IS the available stock. We keep a local copy so the
  // control updates immediately after a sale.
  const [asboAvailable, setAsboAvailable] = useState(Math.max(0, quantity));
  // Total quantity (restockable). For ASBO this doubles as live available.
  const [quantityState, setQuantityState] = useState(Math.max(0, quantity));
  const [addQty, setAddQty] = useState(1);

  const totalUnits = Math.max(1, quantityState);
  const available = soldByAsboRc ? asboAvailable : Math.max(0, totalUnits - soldCount);
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
      {soldByAsboRc ? (
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
        {!soldByAsboRc && (
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
        {/* Reserve hold — admin only, PHD/ASBO listings only, non-sold. Pure
            flag: no stock/ledger effect. */}
        {isAdmin && canReserve && status !== "sold" && (
          <button
            type="button"
            onClick={toggleReserved}
            disabled={isPending}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              reserved
                ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {reserved ? "🔖 Reserved — tap to release" : "Reserve item"}
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
    </div>
  );
}
