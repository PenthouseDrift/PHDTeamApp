"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { EmbeddedCheckout } from "@/components/marketplace/EmbeddedCheckout";
import { FULL_ART_TIERS } from "@/lib/full-art-card";
import {
  P_CREDIT_BUNDLES,
  QUICK_SELL_PRICES,
  getEffectivePrice,
  getSaleDiscountPct,
  isOnSale,
} from "@/tcg/config";
import { createPCreditsCheckout, getMyTcgBalances } from "@/tcg/actions";
import type { PCreditBundle } from "@/tcg/types";
import { useToast } from "@/tcg/ui/Toast";

const EMBEDDED = process.env.NEXT_PUBLIC_SUMUP_EMBEDDED !== "false";

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export function TcgPCreditsShop({
  pCredits,
  bundles = P_CREDIT_BUNDLES,
  isAdmin = false,
  onPCreditsChange,
  onOpenStoreTab,
  onOpenMarketplaceTab,
  onOpenCollectionTab,
}: {
  pCredits: number;
  bundles?: PCreditBundle[];
  isAdmin?: boolean;
  onPCreditsChange: (next: number) => void;
  onOpenStoreTab: () => void;
  onOpenMarketplaceTab: () => void;
  onOpenCollectionTab: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<{
    checkoutId: string;
    amount: number;
    currency: string;
    email?: string;
    bundleName: string;
    pCredits: number;
    url?: string;
  } | null>(null);

  // Stable callbacks: EmbeddedCheckout re-mounts its card form whenever these change identity.
  const closeCheckout = useCallback(() => setEmbedded(null), []);
  const handlePaid = useCallback(async () => {
    try {
      const latest = await getMyTcgBalances();
      onPCreditsChange(latest.pCredits);
    } catch {
      toast("Payment received. Pull to refresh to update your balance.", "info");
    }
  }, [onPCreditsChange, toast]);

  // The bundle with the lowest price per credit, for the "Best value" cue.
  const bestValueId = useMemo(() => {
    if (bundles.length < 2) return null;
    let best: { id: string; per: number } | null = null;
    for (const b of bundles) {
      const per = getEffectivePrice(b.priceGbp, b.salePriceGbp) / b.pCredits;
      if (Number.isFinite(per) && per > 0 && (!best || per < best.per)) best = { id: b.id, per };
    }
    return best?.id ?? null;
  }, [bundles]);

  function handleBuyBundle(bundle: PCreditBundle) {
    setError(null);
    setActiveBundleId(bundle.id);
    startTransition(async () => {
      try {
        const res = await createPCreditsCheckout(bundle.id);
        if (!res.success) {
          setError(res.error);
          toast(res.error, "error");
          setActiveBundleId(null);
          return;
        }
        if (EMBEDDED) {
          setEmbedded({
            checkoutId: res.data.checkoutId,
            amount: res.data.amount,
            currency: res.data.currency,
            email: res.data.email,
            bundleName: res.data.bundleName,
            pCredits: res.data.pCredits,
            url: res.data.url,
          });
          setActiveBundleId(null);
        } else {
          window.location.href = res.data.url;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not start SumUp checkout";
        setError(message);
        toast(message, "error");
        setActiveBundleId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {embedded && (
        <EmbeddedCheckout
          checkoutId={embedded.checkoutId}
          amount={embedded.amount}
          currency={embedded.currency}
          email={embedded.email}
          hostedUrl={embedded.url}
          onCancel={closeCheckout}
          onPaid={handlePaid}
          label={`${embedded.bundleName} (${embedded.pCredits.toLocaleString()} P-Credits)`}
          successTitle="P-Credits Added!"
          successBody={(ref) =>
            `${embedded.pCredits.toLocaleString()} P-Credits have been added to your Penthouse TCG balance${
              ref ? ` (Ref ${ref})` : ""
            }. A confirmation email has been sent to your inbox.`
          }
          doneHref="/cards?tab=p-credits"
          doneLabel="Back to Penthouse TCG"
        />
      )}

      {/* Compact balance header */}
      <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black px-4 py-3 text-zinc-100 shadow-lg sm:px-6 sm:py-4">
        <div className="min-w-0">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
            <span aria-hidden>🪙 </span>Your balance
          </span>
          <h2 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
            {pCredits.toLocaleString()} <span className="text-amber-400">P-Credits</span>
          </h2>
        </div>
        <p className="hidden max-w-sm text-xs text-zinc-400 md:block">
          Use P-Credits to buy Standard Packs, exclusive Custom Set Packs, or trade cards with other members on the Marketplace.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Buy P-Credits via SumUp */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Purchase P-Credits</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Instant top-up with secure checkout. Pay with Card, Apple Pay, or Google Pay.
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/driftclash/packs"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              ⚙️ Edit P-Credit Prices &amp; Sales
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bundles.map((bundle) => {
            const isBuying = pending && activeBundleId === bundle.id;
            const bundleOnSale = isOnSale(bundle.priceGbp, bundle.salePriceGbp);
            const effectiveGbp = getEffectivePrice(bundle.priceGbp, bundle.salePriceGbp);
            const discountPct = getSaleDiscountPct(bundle.priceGbp, bundle.salePriceGbp);
            const perPound = effectiveGbp > 0 ? Math.round(bundle.pCredits / effectiveGbp) : 0;
            const isBest = bundle.id === bestValueId;

            return (
              <div
                key={bundle.id}
                className={`relative flex items-center gap-3 rounded-2xl border p-4 shadow-sm motion-safe:transition-all sm:flex-col sm:items-stretch sm:justify-between sm:p-5 ${
                  bundleOnSale
                    ? "border-rose-500/60 bg-white ring-1 ring-rose-500/20 hover:border-rose-500 dark:border-rose-500/50 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white hover:border-amber-500/60 dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                {isBest && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-black shadow">
                    ★ Best value
                  </span>
                )}
                {bundleOnSale ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white shadow">
                    🔥 Sale · {discountPct}% Off
                  </span>
                ) : bundle.badge ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-black shadow">
                    {bundle.badge}
                  </span>
                ) : null}

                <div className="min-w-0 flex-1 space-y-1 sm:flex-none sm:space-y-2">
                  <p className="truncate text-xs font-bold uppercase tracking-wider text-zinc-400">{bundle.name}</p>
                  <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 sm:text-2xl">
                    {bundle.pCredits.toLocaleString()}{" "}
                    <span className="text-sm font-extrabold text-amber-500">P</span>
                  </p>
                  {perPound > 0 && (
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {perPound.toLocaleString()} P per £1
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{bundle.description}</p>
                </div>

                <div className="w-[8.5rem] shrink-0 space-y-2 sm:w-auto sm:border-t sm:border-zinc-100 sm:pt-4 sm:dark:border-zinc-800">
                  <div className="flex items-baseline justify-end gap-1.5 sm:justify-between">
                    <span className="hidden text-xs font-semibold text-zinc-500 sm:inline">Price</span>
                    {bundleOnSale ? (
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-xs font-bold text-zinc-400 line-through">£{bundle.priceGbp.toFixed(2)}</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          £{effectiveGbp.toFixed(2)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                        £{effectiveGbp.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyBundle(bundle)}
                    disabled={pending}
                    aria-label={`Buy ${bundle.name}, ${bundle.pCredits.toLocaleString()} P-Credits for £${effectiveGbp.toFixed(2)}`}
                    className="gx-tap inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-500 px-3 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                  >
                    {isBuying ? "Opening…" : bundleOnSale ? "Buy on sale" : "Buy"}
                  </button>
                  <p className="hidden text-center text-[11px] font-medium text-zinc-400 sm:block">Card · Pay · GPay</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Where else to spend or earn */}
      <section aria-label="Shortcuts" className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpenStoreTab}
          className="gx-tap min-h-12 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Spend in Pack Store
        </button>
        <button
          type="button"
          onClick={onOpenMarketplaceTab}
          className="gx-tap min-h-12 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Browse Marketplace
        </button>
      </section>

      {/* Quick Sell & Trading Rates Info */}
      <section className={`${panel} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
              Earn P-Credits by Quick Selling or Listing Cards
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Tap any card in My Cards to either list it on the Marketplace at your own asking price, or Quick Sell it for an instant payout:
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCollectionTab}
            className="gx-tap min-h-12 w-full rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
          >
            Go to My Cards →
          </button>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {FULL_ART_TIERS.map((tier) => (
            <li
              key={tier.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="block text-xs font-bold text-zinc-500 dark:text-zinc-400">
                {tier.label}
              </span>
              <span className="mt-0.5 block text-lg font-black text-amber-600 dark:text-amber-400">
                {QUICK_SELL_PRICES[tier.id]} P-Credits
              </span>
              <span className="text-[11px] text-zinc-400">Instant Quick Sell</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
