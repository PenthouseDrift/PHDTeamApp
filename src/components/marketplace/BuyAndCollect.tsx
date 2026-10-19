"use client";

import { useState, useTransition } from "react";
import { createMarketplaceCheckout } from "@/actions/marketplace-checkout";

interface BuyVariant {
  id: string;
  name: string;
  price: number;
  available: number;
}

interface BuyAndCollectProps {
  listingId: string;
  /** Listing-level price (used when there are no variations). */
  price: number;
  hasVariations: boolean;
  variationLabel?: string;
  variants?: BuyVariant[];
}

function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function BuyAndCollect({
  listingId,
  price,
  hasVariations,
  variationLabel,
  variants = [],
}: BuyAndCollectProps) {
  const sellable = variants.filter((v) => v.available > 0 && v.price > 0);
  const [selectedId, setSelectedId] = useState<string>(sellable[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedVariant = hasVariations ? sellable.find((v) => v.id === selectedId) : undefined;
  const displayPrice = hasVariations ? selectedVariant?.price ?? 0 : price;

  // Can't purchase online when there's nothing priced to buy.
  if (hasVariations && sellable.length === 0) return null;
  if (!hasVariations && !(price > 0)) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          This item is at the track — speak to a staff member to buy it in person.
        </p>
      </div>
    );
  }

  function handleBuy() {
    setError(null);
    if (hasVariations && !selectedId) {
      setError("Please choose an option first.");
      return;
    }
    startTransition(async () => {
      const result = await createMarketplaceCheckout(
        listingId,
        hasVariations ? selectedId : undefined
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Hand off to SumUp's hosted checkout.
      window.location.href = result.data.url;
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex items-center gap-2">
        <span>🛒</span>
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Buy &amp; Collect</h2>
      </div>
      <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/70">
        Pay online now and collect from a staff member at Penthouse Drift. We&apos;ll email your order
        confirmation with a collection reference.
      </p>

      {hasVariations && (
        <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
          <span>{variationLabel || "Option"}</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 dark:border-amber-500/40 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {sellable.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {formatGBP(v.price)}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleBuy}
        disabled={pending || (hasVariations && !selectedId)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-black text-black transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60"
      >
        {pending ? "Starting checkout…" : `Buy & Collect · ${formatGBP(displayPrice)}`}
      </button>
    </div>
  );
}
