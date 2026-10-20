"use client";

import { useState, useTransition } from "react";
import { createMarketplaceCheckout } from "@/actions/marketplace-checkout";
import { EmbeddedCheckout } from "@/components/marketplace/EmbeddedCheckout";

// Feature flag: when "true", card details are collected inline via the SumUp
// Card Widget (no redirect). Otherwise the hosted-checkout redirect is used.
const EMBEDDED = process.env.NEXT_PUBLIC_SUMUP_EMBEDDED === "true";

interface BuyVariant {
  id: string;
  name: string;
  price: number;
  /** Buyable units: physical stock minus sold minus any reserved hold. */
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
  // `available` is already the buyable count (stock minus sold minus holds),
  // so a fully-held variant drops out here.
  const sellable = variants.filter((v) => v.available > 0 && v.price > 0);
  const [selectedId, setSelectedId] = useState<string>(sellable[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Set when the embedded widget is active, holding the created checkout.
  const [embedded, setEmbedded] = useState<{ checkoutId: string; amount: number; currency: string; email?: string } | null>(null);

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
      if (EMBEDDED) {
        // Render the card widget inline against the created checkout.
        setEmbedded({
          checkoutId: result.data.checkoutId,
          amount: result.data.amount,
          currency: result.data.currency,
          email: result.data.email,
        });
      } else {
        // Hand off to SumUp's hosted checkout page.
        window.location.href = result.data.url;
      }
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

      {embedded ? (
        <EmbeddedCheckout
          checkoutId={embedded.checkoutId}
          amount={embedded.amount}
          currency={embedded.currency}
          email={embedded.email}
          onCancel={() => setEmbedded(null)}
          finalizeUrl="/api/marketplace/finalize"
          label="Click & Collect"
          successBody={(ref) =>
            ref
              ? `Your order is confirmed. Collection reference ${ref} — speak to staff at Penthouse Drift to collect.`
              : "Your order is being confirmed and will appear under My Orders shortly."
          }
          doneHref="/orders"
          doneLabel="View my orders"
        />
      ) : (
        <button
          type="button"
          onClick={handleBuy}
          disabled={pending || (hasVariations && !selectedId)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-black text-black transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60"
        >
          {pending ? "Starting checkout…" : `Buy & Collect · ${formatGBP(displayPrice)}`}
        </button>
      )}
    </div>
  );
}
