"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { PackOpening } from "@/components/member-cards/PackOpening";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyAndOpenCustomPack, buyStandardPackWithPCredits } from "@/tcg/actions";
import { getEffectivePrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { TcgCustomPackWithCards } from "@/tcg/types";

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

export function TcgPackStore({
  pCredits,
  packCredits,
  standardPackPrice,
  standardPackSalePrice = null,
  customPacks,
  isAdmin = false,
  onBalancesChange,
  onCustomCardsPulled,
  onOpenPCreditsTab,
  onOpenCollectionTab,
}: {
  pCredits: number;
  packCredits: number;
  standardPackPrice: number;
  standardPackSalePrice?: number | null;
  customPacks: TcgCustomPackWithCards[];
  isAdmin?: boolean;
  onBalancesChange: (next: { pCredits: number; packCredits: number }) => void;
  onCustomCardsPulled: (cards: MemberCard[], newPCredits: number) => void;
  onOpenPCreditsTab: () => void;
  onOpenCollectionTab: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [inspectPack, setInspectPack] = useState<TcgCustomPackWithCards | null>(null);
  const [openingState, setOpeningState] = useState<{
    packName: string;
    cards: MemberCard[];
    revealed: boolean;
  } | null>(null);

  const standardOnSale = isOnSale(standardPackPrice, standardPackSalePrice);
  const effectiveStandardPrice = getEffectivePrice(standardPackPrice, standardPackSalePrice);
  const standardDiscountPct = getSaleDiscountPct(standardPackPrice, standardPackSalePrice);

  function handleBuyStandardPack() {
    setFeedback(null);
    startTransition(async () => {
      const res = await buyStandardPackWithPCredits();
      if (res.success) {
        onBalancesChange({
          pCredits: res.data.pCredits,
          packCredits: res.data.packCredits,
        });
        setFeedback({
          text: `Purchased 1 Standard Pack for ${res.data.pricePaid.toLocaleString()} P-Credits! You now have ${res.data.packCredits} pack credit${res.data.packCredits === 1 ? "" : "s"} ready to open.`,
        });
      } else {
        setFeedback({ text: res.error, error: true });
      }
    });
  }

  function handleBuyCustomPack(pack: TcgCustomPackWithCards) {
    setFeedback(null);
    startTransition(async () => {
      const res = await buyAndOpenCustomPack(pack.id);
      if (res.success) {
        setInspectPack(null);
        onCustomCardsPulled(res.data.cards, res.data.pCredits);
        setOpeningState({
          packName: res.data.packName,
          cards: res.data.cards,
          revealed: false,
        });
      } else {
        setFeedback({ text: res.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">TCG Pack Store</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Spend your P-Credits on Standard Packs or limited-edition Custom Set Packs curated by Penthouse Drift.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Link href="/admin/card-maker?tab=packs" className={secondaryBtn}>
              ⚙️ Manage Packs &amp; Sale Prices
            </Link>
          )}
          <button type="button" onClick={onOpenPCreditsTab} className={primaryBtn}>
            + Get P-Credits
          </button>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm font-bold ${
            feedback.error
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          <span>{feedback.text}</span>
          {!feedback.error && packCredits > 0 && (
            <Link
              href="/cards/new"
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white hover:bg-emerald-500"
            >
              Open Standard Pack Now →
            </Link>
          )}
        </div>
      )}

      {/* Standard Pack Featured Card */}
      <section
        className={`relative overflow-hidden rounded-3xl border p-6 text-zinc-100 shadow-lg ${
          standardOnSale
            ? "border-rose-500/60 bg-gradient-to-br from-rose-950/60 via-zinc-950 to-black shadow-[0_0_35px_rgba(244,63,94,0.18)]"
            : "border-amber-500/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black"
        }`}
      >
        {standardOnSale && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-400/50 bg-gradient-to-r from-rose-600 to-amber-500 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-md">
            <span>🔥 Limited Sale · Save {standardDiscountPct}%</span>
          </div>
        )}
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
          {/* Visual Pack Representation */}
          <div
            className={`relative mx-auto flex h-44 w-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-gradient-to-b p-3 ${
              standardOnSale
                ? "border-rose-400 from-rose-500/25 via-zinc-900 to-black shadow-[0_0_30px_rgba(244,63,94,0.35)]"
                : "border-amber-400 from-amber-500/20 via-zinc-900 to-black shadow-[0_0_30px_rgba(245,158,11,0.25)]"
            }`}
          >
            {standardOnSale && (
              <span className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow">
                -{standardDiscountPct}%
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PHD" className="w-20" />
            <span className="text-[10px] font-black tracking-[0.25em] text-amber-400">STANDARD</span>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              3 Cards + Bonus
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-black">
                Core Pack
              </span>
              <span className="text-xs font-bold text-amber-300">
                You have {packCredits} unopened Standard Pack{packCredits === 1 ? "" : "s"}
              </span>
            </div>
            <h3 className="text-2xl font-black text-white">Penthouse Standard Pack</h3>
            <p className="max-w-xl text-xs leading-relaxed text-zinc-300">
              Contains <strong>1 Custom AI Card of your car</strong> (stats rolled 1–10 each, graded by /40 total), <strong>1 Community Car Card</strong>, and <strong>1 Tactical Crew Card</strong> (from the 30-card Crew Set for Clash Arena), plus a 1-in-30 chance at a rare Bonus Set Card!
            </p>
            <div className="flex flex-wrap items-baseline gap-2.5 pt-1">
              {standardOnSale ? (
                <>
                  <span className="text-sm font-bold text-zinc-400 line-through">
                    {standardPackPrice.toLocaleString()} P-Credits
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {effectiveStandardPrice.toLocaleString()} P-Credits
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-black text-emerald-300">
                    You save {(standardPackPrice - effectiveStandardPrice).toLocaleString()} P
                  </span>
                </>
              ) : (
                <span className="text-sm font-bold text-amber-400">
                  Price: {effectiveStandardPrice.toLocaleString()} P-Credits
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:min-w-[14rem]">
            <button
              type="button"
              onClick={handleBuyStandardPack}
              disabled={pending || pCredits < effectiveStandardPrice}
              className={primaryBtn}
            >
              {pending ? (
                "Purchasing…"
              ) : standardOnSale ? (
                <span>
                  Buy on Sale ·{" "}
                  <span className="line-through opacity-60">{standardPackPrice.toLocaleString()}</span>{" "}
                  {effectiveStandardPrice.toLocaleString()} P
                </span>
              ) : (
                `Buy Pack · ${effectiveStandardPrice.toLocaleString()} P`
              )}
            </button>
            {packCredits > 0 && (
              <Link
                href="/cards/new"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 text-xs font-black text-amber-300 hover:bg-amber-500/20"
              >
                Open Pack ({packCredits} ready) →
              </Link>
            )}
            {pCredits < effectiveStandardPrice && (
              <button
                type="button"
                onClick={onOpenPCreditsTab}
                className="text-center text-[11px] font-bold text-amber-400 underline hover:text-amber-300"
              >
                Need {(effectiveStandardPrice - pCredits).toLocaleString()} more P-Credits
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Custom Set Packs Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              Custom Set Packs
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Curated themed packs containing exclusive cards created in the Penthouse Card Maker.
            </p>
          </div>
        </div>

        {customPacks.length === 0 ? (
          <div className={`${panel} py-10 text-center space-y-2`}>
            <p className="text-base font-black text-zinc-900 dark:text-zinc-100">
              No custom set packs live right now
            </p>
            <p className="mx-auto max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              Check back soon for special edition set packs, or grab a Standard Pack above!
            </p>
            {isAdmin && (
              <div className="pt-2">
                <Link href="/admin/card-maker?tab=packs" className={secondaryBtn}>
                  + Create a Custom Pack in Card Maker
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {customPacks.map((pack) => {
              const packOnSale = isOnSale(pack.price, pack.salePrice);
              const effectivePrice = getEffectivePrice(pack.price, pack.salePrice);
              const discountPct = getSaleDiscountPct(pack.price, pack.salePrice);
              const canAfford = pCredits >= effectivePrice;
              const previewCards = pack.setList.slice(0, 3).map((s) => s.card);

              return (
                <div
                  key={pack.id}
                  className={`relative flex flex-col justify-between rounded-3xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
                    packOnSale
                      ? "border-rose-500/60 bg-white dark:border-rose-500/50 dark:bg-zinc-900"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Preview Fan of Cards in Set */}
                    <div
                      className={`relative flex h-48 items-center justify-center overflow-hidden rounded-2xl p-4 ${
                        packOnSale
                          ? "bg-gradient-to-b from-rose-950/80 via-zinc-900 to-zinc-950"
                          : "bg-gradient-to-b from-zinc-900 to-zinc-950"
                      }`}
                    >
                      <div className="flex items-center justify-center -space-x-8">
                        {previewCards.map((c, idx) => (
                          <div
                            key={c.id ?? idx}
                            className="w-28 transition-transform"
                            style={{
                              transform:
                                previewCards.length > 1
                                  ? `rotate(${(idx - (previewCards.length - 1) / 2) * 8}deg) translateY(${idx === 1 ? -4 : 4}px)`
                                  : undefined,
                              zIndex: idx === 1 ? 10 : idx,
                            }}
                          >
                            <FullArtCard card={c} className="drop-shadow-xl" />
                          </div>
                        ))}
                      </div>
                      <span className="absolute left-3 top-3 rounded-full border border-amber-400/40 bg-black/75 px-2.5 py-0.5 text-[11px] font-black text-amber-300 backdrop-blur-sm">
                        {pack.setList.length} Card{pack.setList.length === 1 ? "" : "s"} in Set
                      </span>
                      <div className="absolute right-3 top-3 flex items-center gap-1.5">
                        {packOnSale && (
                          <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white shadow">
                            🔥 -{discountPct}% SALE
                          </span>
                        )}
                        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black">
                          {pack.cardsPerPack} Card{pack.cardsPerPack === 1 ? "" : "s"} / Pack
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                              {pack.name}
                            </h4>
                            {packOnSale && (
                              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">
                                On Sale
                              </span>
                            )}
                          </div>
                        </div>

                        {packOnSale ? (
                          <div className="shrink-0 text-right">
                            <span className="mr-1.5 text-xs font-bold text-zinc-400 line-through">
                              {pack.price.toLocaleString()} P
                            </span>
                            <span className="rounded-xl bg-emerald-500/15 px-3 py-1 text-sm font-black text-emerald-600 dark:text-emerald-400">
                              {effectivePrice.toLocaleString()} P-Credits
                            </span>
                          </div>
                        ) : (
                          <span className="shrink-0 rounded-xl bg-amber-500/15 px-3 py-1 text-sm font-black text-amber-600 dark:text-amber-400">
                            {effectivePrice.toLocaleString()} P-Credits
                          </span>
                        )}
                      </div>
                      {pack.description && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {pack.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setInspectPack(pack)}
                      className={`${secondaryBtn} flex-1 text-xs`}
                    >
                      View Set List ({pack.setList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBuyCustomPack(pack)}
                      disabled={pending || !canAfford}
                      className={`${primaryBtn} flex-1 text-xs`}
                    >
                      {pending ? (
                        "Opening…"
                      ) : canAfford ? (
                        packOnSale ? (
                          <span>
                            Buy &amp; Open ·{" "}
                            <span className="line-through opacity-60">{pack.price.toLocaleString()}</span>{" "}
                            {effectivePrice.toLocaleString()} P
                          </span>
                        ) : (
                          `Buy & Open · ${effectivePrice.toLocaleString()} P`
                        )
                      ) : (
                        `Need ${effectivePrice.toLocaleString()} P`
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Set List Preview Modal */}
      {inspectPack &&
        typeof document !== "undefined" &&
        (() => {
          const inspectOnSale = isOnSale(inspectPack.price, inspectPack.salePrice);
          const inspectEffectivePrice = getEffectivePrice(inspectPack.price, inspectPack.salePrice);
          const inspectDiscountPct = getSaleDiscountPct(inspectPack.price, inspectPack.salePrice);
          return createPortal(
            <div
              className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center overscroll-contain sm:items-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={`${inspectPack.name} set list`}
            >
              <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => {
                  if (!pending) setInspectPack(null);
                }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex h-full w-full flex-col justify-between space-y-5 overflow-y-auto bg-zinc-950 p-5 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-amber-500/30 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                        Custom Set Pack · {inspectPack.cardsPerPack} Card{inspectPack.cardsPerPack === 1 ? "" : "s"} per pack
                      </span>
                      {inspectOnSale && (
                        <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                          🔥 On Sale · Save {inspectDiscountPct}%
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-black">{inspectPack.name}</h3>
                    {inspectPack.description && (
                      <p className="mt-1 text-xs text-zinc-400">{inspectPack.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectPack(null)}
                    className="min-h-10 rounded-xl border border-zinc-700 px-4 text-xs font-bold hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Cards in this Set ({inspectPack.setList.length})
                  </h4>
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {inspectPack.setList.map(({ card, chancePct }) => (
                      <li key={card.id} className="space-y-1.5">
                        <FullArtCard card={card} className="drop-shadow-lg" />
                        <div className="flex items-center justify-between px-1 text-xs">
                          <span className="font-bold text-zinc-200">{rarityLabel(card.tier)}</span>
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-300">
                            {chancePct}% odds
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                  <div>
                    <span className="block text-xs text-zinc-400">Pack Price</span>
                    {inspectOnSale ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-zinc-500 line-through">
                          {inspectPack.price.toLocaleString()} P
                        </span>
                        <span className="text-xl font-black text-emerald-400">
                          {inspectEffectivePrice.toLocaleString()} P-Credits
                        </span>
                      </div>
                    ) : (
                      <span className="text-xl font-black text-amber-400">
                        {inspectEffectivePrice.toLocaleString()} P-Credits
                      </span>
                    )}
                  </div>
                  {pCredits >= inspectEffectivePrice ? (
                    <button
                      type="button"
                      onClick={() => handleBuyCustomPack(inspectPack)}
                      disabled={pending}
                      className={primaryBtn}
                    >
                      {pending
                        ? "Opening Pack…"
                        : `Buy & Open Pack (${inspectEffectivePrice.toLocaleString()} P-Credits)`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInspectPack(null);
                        onOpenPCreditsTab();
                      }}
                      className={primaryBtn}
                    >
                      Top Up P-Credits to Buy
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

      {/* Animated Pack Opening Stage for Custom Set Packs */}
      {openingState &&
        openingState.cards.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={`Opening ${openingState.packName}`}
          >
            <div className="w-full max-w-xl space-y-4">
              <div className="flex items-center justify-between text-zinc-100">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Custom Set Pack
                  </p>
                  <h3 className="text-lg font-black">{openingState.packName}</h3>
                </div>
                {openingState.revealed && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningState(null);
                      onOpenCollectionTab();
                    }}
                    className={primaryBtn}
                  >
                    View in My Cards →
                  </button>
                )}
              </div>

              <PackOpening
                ready={true}
                card={openingState.cards[0] ?? null}
                bonus={openingState.cards[1] ?? null}
                featured={openingState.cards[2] ?? null}
                onRevealed={() =>
                  setOpeningState((prev) => (prev ? { ...prev, revealed: true } : null))
                }
              />

              {openingState.revealed && (
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpeningState(null)}
                    className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-5 text-sm font-bold text-zinc-100 hover:bg-zinc-800"
                  >
                    Back to Pack Store
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningState(null);
                      onOpenCollectionTab();
                    }}
                    className={primaryBtn}
                  >
                    Go to My Cards
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
