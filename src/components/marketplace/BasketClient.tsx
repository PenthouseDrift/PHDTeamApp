"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useBasket } from "@/components/marketplace/BasketProvider";
import { createMarketplaceBasketCheckout } from "@/actions/marketplace-checkout";
import { EmbeddedCheckout } from "@/components/marketplace/EmbeddedCheckout";

const EMBEDDED = process.env.NEXT_PUBLIC_SUMUP_EMBEDDED === "true";

function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function BasketClient() {
  const { lines, total, count, setQuantity, remove, clear } = useBasket();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [embedded, setEmbedded] = useState<{
    checkoutId: string;
    amount: number;
    currency: string;
    email?: string;
  } | null>(null);

  function handleCheckout() {
    setError(null);
    if (lines.length === 0) return;
    startTransition(async () => {
      const result = await createMarketplaceBasketCheckout(
        lines.map((l) => ({ listingId: l.listingId, variantId: l.variantId, quantity: l.quantity }))
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (EMBEDDED) {
        setEmbedded({
          checkoutId: result.data.checkoutId,
          amount: result.data.amount,
          currency: result.data.currency,
          email: result.data.email,
        });
      } else {
        // Hosted redirect. The basket is cleared on the success page return.
        window.location.href = result.data.url;
      }
    });
  }

  if (lines.length === 0) {
    return (
      <>
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Your basket</h1>
          <Link data-page-back
            href="/marketplace"
            className="text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
          >
            ← Back to marketplace
          </Link>
        </header>
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">Your basket is empty.</p>
          <Link
            href="/marketplace"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-600 transition-colors hover:text-amber-500"
          >
            Browse the marketplace →
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Your basket</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {count} item{count === 1 ? "" : "s"} · Click &amp; Collect at the track
          </p>
        </div>
        <Link
          href="/marketplace"
          className="text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
        >
          ← Keep shopping
        </Link>
      </header>

      <ul className="space-y-3">
        {lines.map((line) => {
          const key = `${line.listingId}::${line.variantId ?? ""}`;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {line.image ? (
                  <Image src={line.image} alt={line.label} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                    No image
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/marketplace/${line.listingId}`}
                  className="line-clamp-2 text-sm font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  {line.label}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatGBP(line.unitPrice)} each
                </p>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="inline-flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity(line.listingId, line.variantId, line.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      −
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity(line.listingId, line.variantId, line.quantity + 1)}
                      disabled={line.quantity >= line.maxQuantity}
                      className="flex h-7 w-7 items-center justify-center text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      +
                    </button>
                  </div>
                  {line.quantity >= line.maxQuantity && (
                    <span className="text-[10px] font-medium text-zinc-400">max {line.maxQuantity}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(line.listingId, line.variantId)}
                    className="ml-auto text-xs font-medium text-red-500 transition-colors hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="shrink-0 text-right text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatGBP(line.unitPrice * line.quantity)}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between text-base font-bold text-zinc-900 dark:text-zinc-100">
          <span>Total</span>
          <span className="tabular-nums">{formatGBP(total)}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pay online now and collect every item from staff at Penthouse Drift. We&apos;ll email one
          confirmation covering the whole order.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={pending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-black text-black transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60"
        >
          {pending ? "Starting checkout…" : `Checkout · ${formatGBP(total)}`}
        </button>
        <button
          type="button"
          onClick={() => clear()}
          className="mt-2 w-full py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Empty basket
        </button>
      </div>

      {embedded && (
        <EmbeddedCheckout
          checkoutId={embedded.checkoutId}
          amount={embedded.amount}
          currency={embedded.currency}
          email={embedded.email}
          onCancel={() => setEmbedded(null)}
          finalizeUrl="/api/marketplace/finalize"
          label="Click & Collect"
          successTitle="Order confirmed"
          successBody={(ref) =>
            ref
              ? `Your order is confirmed. Collection reference ${ref} — speak to staff at Penthouse Drift to collect all items.`
              : "Your order is being confirmed and will appear under My Orders shortly."
          }
          doneHref="/orders"
          doneLabel="View my orders"
          onPaid={() => clear()}
        />
      )}
    </>
  );
}
