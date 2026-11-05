"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { PackOpening, splitStorePackCards } from "@/components/member-cards/PackOpening";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyAndOpenCustomPack, buyStandardPackWithPCredits } from "@/tcg/actions";
import { PackArt } from "@/tcg/components/PackArt";
import { PackContentsModal, PackContentsView } from "@/tcg/components/PackContentsView";
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
  standardAllowsCardCredits = true,
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
  /** False when an admin has switched pack credit opening off for the Standard Pack: it is paid for in P-Credits when opened. */
  standardAllowsCardCredits?: boolean;
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
  /** The Standard Pack's "What's in the pack" window. */
  const [showStandardContents, setShowStandardContents] = useState(false);
  const [openingState, setOpeningState] = useState<{
    packName: string;
    cards: MemberCard[];
    revealed: boolean;
    /** The pack that was opened, so the reveal can offer to open another one. */
    pack: TcgCustomPackWithCards;
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

  function handleBuyCustomPack(pack: TcgCustomPackWithCards, payWith: "pcredits" | "cardCredit" = "pcredits") {
    setFeedback(null);
    startTransition(async () => {
      const res = await buyAndOpenCustomPack(pack.id, { payWith });
      if (res.success) {
        setInspectPack(null);
        onCustomCardsPulled(res.data.cards, res.data.pCredits);
        // A pack credit leaves the P-Credits alone and takes one pack credit, so the pack credit balance is updated too.
        onBalancesChange({ pCredits: res.data.pCredits, packCredits: res.data.packCredits });
        setOpeningState({
          packName: res.data.packName,
          cards: res.data.cards,
          revealed: false,
          pack,
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
            Spend your P-Credits on packs curated by Penthouse Drift.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Link href="/admin/driftclash/packs" className={secondaryBtn}>
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

      {/* Packs: store packs first, the Standard Pack last, all as the same kind of tile */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Packs</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pick a pack, see what could be inside, and spend your P-Credits.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {customPacks.map((pack) => {
              const packOnSale = isOnSale(pack.price, pack.salePrice);
              const effectivePrice = getEffectivePrice(pack.price, pack.salePrice);
              const discountPct = getSaleDiscountPct(pack.price, pack.salePrice);
              const canAfford = pCredits >= effectivePrice;
              // A live pack can be shown without being for sale: members can look inside but not buy.
              const forSale = pack.purchasable !== false;
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
                        {previewCards.length === 0 && (
                          <span className="rounded-xl border border-amber-400/40 bg-black/60 px-4 py-3 text-center text-sm font-black text-amber-300">
                            Cards drawn from a car
                          </span>
                        )}
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
                      {pack.bonus && (
                        <span className="z-20 absolute bottom-3 right-3 rounded-full border border-fuchsia-400/50 bg-black/80 px-2.5 py-0.5 text-[11px] font-black text-fuchsia-300 backdrop-blur-sm">
                          ★ Bonus card
                        </span>
                      )}
                      {!forSale && (
                        <span className="z-20 absolute bottom-3 left-3 rounded-full border border-zinc-500/60 bg-black/80 px-2.5 py-0.5 text-[11px] font-black text-zinc-200 backdrop-blur-sm">
                          Not available right now
                        </span>
                      )}
                      <span className="z-20 absolute left-3 top-3 rounded-full border border-amber-400/40 bg-black/75 px-2.5 py-0.5 text-[11px] font-black text-amber-300 backdrop-blur-sm">
                        {pack.needsGeneration
                          ? `${pack.setList.length} Set Card${pack.setList.length === 1 ? "" : "s"} + drawn cards`
                          : `${pack.setList.length} Card${pack.setList.length === 1 ? "" : "s"} in Set`}
                      </span>
                      <div className="z-20 absolute right-3 top-3 flex items-center gap-1.5">
                        {packOnSale && (
                          <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white shadow">
                            🔥 -{discountPct}% SALE
                          </span>
                        )}
                        <span
                          className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black"
                          title={[
                            `${pack.cardsPerPack} card${pack.cardsPerPack === 1 ? "" : "s"}`,
                            ...(pack.extraCards?.crew ? [`${pack.extraCards.crew} crew`] : []),
                            ...(pack.extraCards?.repair ? [`${pack.extraCards.repair} repair kit${pack.extraCards.repair === 1 ? "" : "s"}`] : []),
                          ].join(" + ")}
                        >
                          {totalCardsInPack(pack)} Card{totalCardsInPack(pack) === 1 ? "" : "s"} / Pack
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
                      What&apos;s in the pack?
                    </button>
                    {!forSale ? (
                      <button type="button" disabled className={`${primaryBtn} flex-1 text-xs`}>
                        Not available right now
                      </button>
                    ) : pack.needsGeneration ? (
                      canAfford ? (
                        <Link
                          href={`/cards/new?pack=${pack.id}`}
                          className={`${primaryBtn} flex-1 text-xs`}
                        >
                          Choose car &amp; open · {effectivePrice.toLocaleString()} P
                        </Link>
                      ) : (
                        <button type="button" disabled className={`${primaryBtn} flex-1 text-xs`}>
                          Need {effectivePrice.toLocaleString()} P
                        </button>
                      )
                    ) : (
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
                    )}
                    {forSale && pack.allowCardCredits && (
                      pack.needsGeneration ? (
                        packCredits > 0 ? (
                          <Link href={`/cards/new?pack=${pack.id}`} className={`${secondaryBtn} basis-full text-xs`}>
                            Choose car &amp; use a pack credit ({packCredits} left)
                          </Link>
                        ) : (
                          <button type="button" disabled className={`${secondaryBtn} basis-full text-xs`}>
                            Pack credit: none left
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuyCustomPack(pack, "cardCredit")}
                          disabled={pending || packCredits < 1}
                          className={`${secondaryBtn} basis-full text-xs`}
                        >
                          {pending ? "Opening…" : packCredits > 0 ? `Use a pack credit (${packCredits} left)` : "Pack credit: none left"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {/* The Standard Pack: last, and the same tile as the others */}
            <div
              className={`relative flex flex-col justify-between rounded-3xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
                standardOnSale
                  ? "border-rose-500/60 bg-white dark:border-rose-500/50 dark:bg-zinc-900"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="space-y-4">
                <div
                  className={`relative flex h-48 items-center justify-center overflow-hidden rounded-2xl p-4 ${
                    standardOnSale
                      ? "bg-gradient-to-b from-rose-950/80 via-zinc-900 to-zinc-950"
                      : "bg-gradient-to-b from-zinc-900 to-zinc-950"
                  }`}
                >
                  <div className="w-28">
                    <PackArt
                      name="Standard Pack"
                      variant="standard"
                      cardsLabel="4 CARDS"
                      extraLabel="+ RARE CHANCE"
                      discountPct={standardOnSale ? standardDiscountPct : 0}
                    />
                  </div>
                  {standardAllowsCardCredits && (
                    <span className="z-20 absolute left-3 top-3 rounded-full border border-amber-400/40 bg-black/75 px-2.5 py-0.5 text-[11px] font-black text-amber-300 backdrop-blur-sm">
                      You have {packCredits} unopened
                    </span>
                  )}
                  <div className="z-20 absolute right-3 top-3 flex items-center gap-1.5">
                    {standardOnSale && (
                      <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white shadow">
                        🔥 -{standardDiscountPct}% SALE
                      </span>
                    )}
                    <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black">4 Cards / Pack</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Penthouse Standard Pack</h4>
                      {standardOnSale && (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">
                          On Sale
                        </span>
                      )}
                    </div>
                    {standardOnSale ? (
                      <div className="shrink-0 text-right">
                        <span className="mr-1.5 text-xs font-bold text-zinc-400 line-through">
                          {standardPackPrice.toLocaleString()} P
                        </span>
                        <span className="rounded-xl bg-emerald-500/15 px-3 py-1 text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {effectiveStandardPrice.toLocaleString()} P-Credits
                        </span>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-xl bg-amber-500/15 px-3 py-1 text-sm font-black text-amber-600 dark:text-amber-400">
                        {effectiveStandardPrice.toLocaleString()} P-Credits
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    1 custom AI card of your car, 1 community car card, 1 Tactical Crew Card for Clash Arena and 1 Repair Kit, plus a
                    chance at a rare Bonus Set Card.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setShowStandardContents(true)} className={`${secondaryBtn} flex-1 text-xs`}>
                    What&apos;s in the pack?
                  </button>
                  {!standardAllowsCardCredits && pCredits >= effectiveStandardPrice && (
                    // Paid for when it is opened: the member picks their car in the wizard, which charges the price.
                    <Link href="/cards/new" className={`${primaryBtn} flex-1 text-xs`}>
                      Choose car &amp; open · {effectiveStandardPrice.toLocaleString()} P
                    </Link>
                  )}
                  {(standardAllowsCardCredits || pCredits < effectiveStandardPrice) && (
                  <button
                    type="button"
                    onClick={handleBuyStandardPack}
                    disabled={pending || pCredits < effectiveStandardPrice}
                    className={`${primaryBtn} flex-1 text-xs`}
                  >
                    {pending ? (
                      "Purchasing…"
                    ) : pCredits < effectiveStandardPrice ? (
                      `Need ${effectiveStandardPrice.toLocaleString()} P`
                    ) : standardOnSale ? (
                      <span>
                        Buy ·{" "}
                        <span className="line-through opacity-60">{standardPackPrice.toLocaleString()}</span>{" "}
                        {effectiveStandardPrice.toLocaleString()} P
                      </span>
                    ) : (
                      `Buy Pack · ${effectiveStandardPrice.toLocaleString()} P`
                    )}
                  </button>
                  )}
                </div>
                {standardAllowsCardCredits && packCredits > 0 && (
                  <Link href="/cards/new" className={`${secondaryBtn} w-full text-xs`}>
                    Open Pack ({packCredits} ready) →
                  </Link>
                )}
                {pCredits < effectiveStandardPrice && (
                  <button
                    type="button"
                    onClick={onOpenPCreditsTab}
                    className="block w-full text-center text-[11px] font-bold text-amber-600 underline hover:text-amber-500 dark:text-amber-400"
                  >
                    Need {(effectiveStandardPrice - pCredits).toLocaleString()} more P-Credits
                  </button>
                )}
              </div>
            </div>
          </div>
      </section>

      {/* What's in the Standard Pack */}
      {showStandardContents && (
        <PackContentsModal
          packId="standard"
          title="Penthouse Standard Pack"
          eyebrow="Core Pack"
          onClose={() => setShowStandardContents(false)}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xl font-black text-amber-400">{effectiveStandardPrice.toLocaleString()} P-Credits</span>
              {pCredits >= effectiveStandardPrice ? (
                standardAllowsCardCredits ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowStandardContents(false);
                      handleBuyStandardPack();
                    }}
                    disabled={pending}
                    className={primaryBtn}
                  >
                    Buy Pack · {effectiveStandardPrice.toLocaleString()} P
                  </button>
                ) : (
                  <Link href="/cards/new" className={primaryBtn}>
                    Choose car &amp; open · {effectiveStandardPrice.toLocaleString()} P
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowStandardContents(false);
                    onOpenPCreditsTab();
                  }}
                  className={primaryBtn}
                >
                  Top Up P-Credits to Buy
                </button>
              )}
            </div>
          }
        />
      )}

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
              aria-label={`What's in ${inspectPack.name}`}
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
                        Pack · {totalCardsInPack(inspectPack)} Card{totalCardsInPack(inspectPack) === 1 ? "" : "s"} per pack
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
                  <PackOddsNote pack={inspectPack} />
                  <PackContentsView
                    packId={inspectPack.id}
                    fallback={
                      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                        {inspectPack.setList.map(({ card }) => (
                          <li key={card.id} className="space-y-1.5">
                            <FullArtCard card={card} className="drop-shadow-lg" />
                            <div className="px-1 text-xs">
                              <span className="font-bold text-zinc-200">{rarityLabel(card.tier)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    }
                  />
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
                  {inspectPack.purchasable === false ? (
                    <span className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300">
                      Not available to buy right now
                    </span>
                  ) : pCredits >= inspectEffectivePrice ? (
                    inspectPack.needsGeneration ? (
                    <Link href={`/cards/new?pack=${inspectPack.id}`} className={primaryBtn}>
                      Choose car &amp; open ({inspectEffectivePrice.toLocaleString()} P-Credits)
                    </Link>
                  ) : (
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
                  )
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
                  {inspectPack.purchasable !== false && inspectPack.allowCardCredits && (
                    inspectPack.needsGeneration ? (
                      packCredits > 0 ? (
                        <Link href={`/cards/new?pack=${inspectPack.id}`} className={primaryBtn}>
                          Choose car &amp; use a pack credit ({packCredits} left)
                        </Link>
                      ) : (
                        <span className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300">
                          Pack credit: none left
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuyCustomPack(inspectPack, "cardCredit")}
                        disabled={pending || packCredits < 1}
                        className={primaryBtn}
                      >
                        {pending ? "Opening Pack…" : packCredits > 0 ? `Use a pack credit (${packCredits} left)` : "Pack credit: none left"}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

      {/* Animated Pack Opening Stage for store packs */}
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
                    Pack
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
                packName={openingState.packName}
                packVariant="custom"
                {...splitStorePackCards(openingState.cards)}
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
              {openingState.revealed && (() => {
                // Another of the same pack, paid for with P-Credits or a pack credit, whichever the member has.
                const again = openingState.pack;
                const againPrice = getEffectivePrice(again.price, again.salePrice);
                const canPay = pCredits >= againPrice;
                const canCredit = again.allowCardCredits !== false && packCredits > 0;
                if (again.purchasable === false || (!canPay && !canCredit)) return null;
                return (
                  <div className="flex flex-wrap justify-center gap-3 border-t border-zinc-800 pt-4">
                    {canPay && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setOpeningState(null);
                          handleBuyCustomPack(again, "pcredits");
                        }}
                        className={primaryBtn}
                      >
                        Open another · {againPrice.toLocaleString()} P
                      </button>
                    )}
                    {canCredit && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setOpeningState(null);
                          handleBuyCustomPack(again, "cardCredit");
                        }}
                        className={canPay ? "min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-5 text-sm font-bold text-zinc-100 hover:bg-zinc-800" : primaryBtn}
                      >
                        Open another with a pack credit ({packCredits} left)
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Every card a pack gives each time it is opened: its cards plus its Crew and Repair Kit cards. (A bonus pull is a chance, so it isn't counted.) */
function totalCardsInPack(pack: TcgCustomPackWithCards): number {
  return pack.cardsPerPack + (pack.extraCards?.crew ?? 0) + (pack.extraCards?.repair ?? 0);
}

/** For packs that draw some cards from a car: a short note that a car is chosen when opening. */
function PackOddsNote({ pack }: { pack: TcgCustomPackWithCards }) {
  if (!pack.needsGeneration) return null;
  return (
    <p className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
      Some cards are drawn from a car (yours, or community cars), so you pick a car when you open this pack.
    </p>
  );
}
