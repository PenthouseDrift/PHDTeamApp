"use client";

import { useState } from "react";
import type { ListingVariant } from "@/types";

function formatPrice(price: number): string {
  if (price <= 0) return "Free / Offers";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

interface ListingVariantPricingProps {
  /** Listing-level fallbacks (used when there are no variations). */
  price: number;
  status: "available" | "sold";
  /** Available units for the whole listing (non-variant display). */
  available: number;
  /** Whether to show the "N available" line at all for the non-variant case. */
  showAvailable: boolean;
  variationLabel: string;
  variants: ListingVariant[];
}

/**
 * Price + variation selector for the listing detail page. When the listing has
 * variations, shows selectable chips; picking one updates the displayed price
 * and remaining stock. Falls back to the plain listing price otherwise.
 */
export function ListingVariantPricing({
  price,
  status,
  available,
  showAvailable,
  variationLabel,
  variants,
}: ListingVariantPricingProps) {
  const [idx, setIdx] = useState(0);
  const hasVariants = variants.length > 0;
  const selected = hasVariants ? variants[idx] : null;

  const shownPrice = selected ? selected.price : price;
  const shownAvailable = selected ? Math.max(0, selected.quantity - selected.soldCount) : available;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
          {formatPrice(shownPrice)}
        </p>
        {status === "sold" ? (
          <p className="mt-1 text-sm font-semibold text-red-500 dark:text-red-400">Sold out</p>
        ) : hasVariants ? (
          <p className="mt-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {shownAvailable} available
          </p>
        ) : (
          showAvailable && (
            <p className="mt-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              {available} available
            </p>
          )
        )}
      </div>

      {hasVariants && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {variationLabel || "Options"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {variants.map((v, i) => {
              const soldOut = v.quantity - v.soldCount <= 0;
              const isSelected = i === idx;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-pressed={isSelected}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500 dark:bg-amber-500/10 dark:text-amber-300"
                      : "border-zinc-300 text-zinc-700 hover:border-amber-500/60 dark:border-zinc-700 dark:text-zinc-300"
                  } ${soldOut ? "opacity-50" : ""}`}
                >
                  {v.name}
                  <span className="ml-1.5 text-xs text-zinc-400">{formatPrice(v.price)}</span>
                  {soldOut && <span className="ml-1 text-[10px] font-bold text-red-500">· sold out</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
