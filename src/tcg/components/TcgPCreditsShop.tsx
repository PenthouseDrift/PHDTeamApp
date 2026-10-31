"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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

  function handleBuyBundle(bundle: PCreditBundle) {
    setError(null);
    setActiveBundleId(bundle.id);
    startTransition(async () => {
      try {
        const res = await createPCreditsCheckout(bundle.id);
        if (!res.success) {
          setError(res.error);
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
        setError(err instanceof Error ? err.message : "Could not start SumUp checkout");
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
          onCancel={() => setEmbedded(null)}
          onPaid={async () => {
            try {
              const latest = await getMyTcgBalances();
              onPCreditsChange(latest.pCredits);
            } catch {
              /* ignore */
            }
          }}
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

      {/* Hero Balance Card */}
      <section className="overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 text-zinc-100 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-300">
              🪙 Penthouse TCG Currency
            </span>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              {pCredits.toLocaleString()} <span className="text-amber-400">P-Credits</span>
            </h2>
            <p className="max-w-lg text-xs text-zinc-400">
              Use P-Credits to buy Standard Packs, exclusive Custom Set Packs, or trade cards with other members on the Marketplace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onOpenStoreTab}
              className="min-h-11 rounded-xl bg-amber-500 px-4 text-xs font-black text-black hover:bg-amber-400"
            >
              Spend in Pack Store
            </button>
            <button
              type="button"
              onClick={onOpenMarketplaceTab}
              className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-bold text-zinc-100 hover:bg-zinc-800"
            >
              Browse Marketplace
            </button>
          </div>
        </div>
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
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              Purchase P-Credits
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Instant top-up via embedded SumUp checkout. Pay securely with Card, Apple Pay, or Google Pay.
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/card-maker?tab=packs"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

            return (
              <div
                key={bundle.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all ${
                  bundleOnSale
                    ? "border-rose-500/60 bg-white ring-1 ring-rose-500/20 hover:border-rose-500 dark:border-rose-500/50 dark:bg-zinc-900"
                    : "border-zinc-200 bg-white hover:border-amber-500/60 dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                {bundleOnSale ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow">
                    🔥 Sale · {discountPct}% Off
                  </span>
                ) : bundle.badge ? (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow">
                    {bundle.badge}
                  </span>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {bundle.name}
                  </p>
                  <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                    {bundle.pCredits.toLocaleString()}{" "}
                    <span className="text-sm font-extrabold text-amber-500">P-Credits</span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{bundle.description}</p>
                </div>

                <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-zinc-500">Price</span>
                    {bundleOnSale ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-bold text-zinc-400 line-through">
                          £{bundle.priceGbp.toFixed(2)}
                        </span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          £{effectiveGbp.toFixed(2)}
                        </span>
                      </div>
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
                    className="min-h-11 w-full rounded-xl bg-amber-500 px-4 text-xs font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                  >
                    {isBuying ? (
                      "Opening Checkout…"
                    ) : bundleOnSale ? (
                      <span>
                        Buy on Sale ·{" "}
                        <span className="line-through opacity-60">£{bundle.priceGbp.toFixed(2)}</span>{" "}
                        £{effectiveGbp.toFixed(2)}
                      </span>
                    ) : (
                      `Buy · £${effectiveGbp.toFixed(2)}`
                    )}
                  </button>
                  <p className="text-[10px] text-center font-medium text-zinc-400">
                    Card · Pay · GPay
                  </p>
                </div>
              </div>
            );
          })}
        </div>
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
            className="min-h-10 rounded-xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
              <span className="text-[10px] text-zinc-400">Instant Quick Sell</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
