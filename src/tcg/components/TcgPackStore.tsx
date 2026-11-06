"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { PackOpening, splitStorePackCards } from "@/components/member-cards/PackOpening";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyAndOpenCustomPack, buyStandardPackWithPCredits } from "@/tcg/actions";
import { PackArt } from "@/tcg/components/PackArt";
import { PackContentsModal, PackContentsView } from "@/tcg/components/PackContentsView";
import { getEffectivePrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { TcgCustomPackWithCards } from "@/tcg/types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { buzz } from "@/tcg/ui/feedback";
import { BusyOverlay } from "@/tcg/ui/Shimmer";
import { useToast } from "@/tcg/ui/Toast";

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5";
const primaryBtn =
  "gx-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "gx-tap inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";
/** The main button on a pack tile: full width, 48px tall. */
const buyBtn = `${primaryBtn} min-h-12 w-full`;
/** "What's in the pack?": a quiet 44px button under the main one. */
const ghostBtn =
  "gx-tap inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800";
/** An outlined, full-width 44px button (use a pack credit, top up). */
const outlineBtn = `${secondaryBtn} w-full`;
/** Buttons on the dark opening stage: 48px, thumb-sized. */
const stageBtn =
  "gx-tap inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 hover:bg-zinc-800 disabled:opacity-50";

/** Which pack is being bought, and how, so only that button shows its busy label. */
type PendingBuy = { id: string; via: "pcredits" | "cardCredit" };
const STANDARD_ID = "standard";

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
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  /** The purchase that is running, if any. `pending` alone can't say which tile it belongs to. */
  const [pendingBuy, setPendingBuy] = useState<PendingBuy | null>(null);
  /** The last purchase error, kept on the page as well as in a toast in case the toast was missed. */
  const [error, setError] = useState<string | null>(null);
  /** Set after a Standard Pack purchase: offers to open it right away. */
  const [boughtStandard, setBoughtStandard] = useState<{ pricePaid: number; packCredits: number } | null>(null);
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
    setError(null);
    setPendingBuy({ id: STANDARD_ID, via: "pcredits" });
    startTransition(async () => {
      try {
        const res = await buyStandardPackWithPCredits();
        if (res.success) {
          onBalancesChange({
            pCredits: res.data.pCredits,
            packCredits: res.data.packCredits,
          });
          buzz(20);
          toast(`Bought 1 Standard Pack for ${res.data.pricePaid.toLocaleString()} P-Credits`, "success");
          setBoughtStandard({ pricePaid: res.data.pricePaid, packCredits: res.data.packCredits });
        } else {
          setError(res.error);
          toast(res.error, "error");
        }
      } catch {
        const text = "Could not complete the purchase. Check your balance and try again.";
        setError(text);
        toast(text, "error");
      } finally {
        setPendingBuy(null);
      }
    });
  }

  function handleBuyCustomPack(pack: TcgCustomPackWithCards, payWith: "pcredits" | "cardCredit" = "pcredits") {
    setError(null);
    setPendingBuy({ id: pack.id, via: payWith });
    startTransition(async () => {
      try {
        const res = await buyAndOpenCustomPack(pack.id, { payWith });
        if (res.success) {
          setInspectPack(null);
          onCustomCardsPulled(res.data.cards, res.data.pCredits);
          // A pack credit leaves the P-Credits alone and takes one pack credit, so the pack credit balance is updated too.
          onBalancesChange({ pCredits: res.data.pCredits, packCredits: res.data.packCredits });
          buzz(20);
          setOpeningState({
            packName: res.data.packName,
            cards: res.data.cards,
            revealed: false,
            pack,
          });
        } else {
          setError(res.error);
          toast(res.error, "error");
        }
      } catch {
        const text = "Could not complete the purchase. Check your balance and try again.";
        setError(text);
        toast(text, "error");
      } finally {
        setPendingBuy(null);
      }
    });
  }

  const isBuying = (id: string, via: PendingBuy["via"] = "pcredits") => pendingBuy?.id === id && pendingBuy.via === via;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Always in reach: what you can spend, and the way to get more. One slim line, above the page content. */}
      <div className="gx-sticky-top sticky z-[35] -mx-1 flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/95 px-2 py-1.5 text-zinc-100 shadow-lg backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl bg-amber-500/15 px-2.5 text-sm font-black tabular-nums text-amber-300"
            aria-label={`${pCredits.toLocaleString()} P-Credits`}
          >
            <span aria-hidden>🪙</span>
            <span className="truncate">{pCredits.toLocaleString()}</span>
          </span>
          <span
            className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl bg-zinc-800/80 px-2.5 text-sm font-black tabular-nums text-zinc-100"
            aria-label={`${packCredits.toLocaleString()} pack credits`}
          >
            <span aria-hidden>🎟️</span>
            <span className="truncate">{packCredits.toLocaleString()}</span>
          </span>
        </div>
        <button type="button" onClick={onOpenPCreditsTab} className={`${primaryBtn} shrink-0 px-3.5`}>
          + P-Credits
        </button>
      </div>

      <section className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">TCG Pack Store</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Spend your P-Credits on packs curated by Penthouse Drift.
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/driftclash/packs" className={secondaryBtn}>
            ⚙️ Manage Packs &amp; Sale Prices
          </Link>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-600 dark:text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss message"
            className="gx-tap -m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base hover:bg-red-500/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* Packs: the Standard Pack first (it is what most players buy), then the store packs, all the same kind of tile */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Packs</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pick a pack, see what could be inside, and spend your P-Credits.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* The Standard Pack */}
          <PackTile onSale={standardOnSale}>
            <div className="space-y-3">
              <ArtFrame onSale={standardOnSale}>
                <div className="w-24 sm:w-28">
                  <PackArt
                    name="Standard Pack"
                    variant="standard"
                    cardsLabel="4 CARDS"
                    extraLabel="+ RARE CHANCE"
                    discountPct={standardOnSale ? standardDiscountPct : 0}
                  />
                </div>
                <span className="absolute left-3 top-3 z-20 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black">
                  4 Cards / Pack
                </span>
                {standardOnSale && <SalePill pct={standardDiscountPct} />}
              </ArtFrame>

              {standardAllowsCardCredits && (
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-300">
                    You have {packCredits} unopened
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <TitleAndPrice
                  name="Penthouse Standard Pack"
                  price={standardPackPrice}
                  effectivePrice={effectiveStandardPrice}
                  onSale={standardOnSale}
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  1 custom AI card of your car, 1 community car card, 1 Tactical Crew Card for Clash Arena and 1 Repair Kit, plus a
                  chance at a rare Bonus Set Card.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              {!standardAllowsCardCredits && pCredits >= effectiveStandardPrice && (
                // Paid for when it is opened: the member picks their car in the wizard, which charges the price.
                <Link href="/cards/new" className={buyBtn}>
                  Choose car &amp; open · {effectiveStandardPrice.toLocaleString()} P
                </Link>
              )}
              {(standardAllowsCardCredits || pCredits < effectiveStandardPrice) && (
                <button
                  type="button"
                  onClick={handleBuyStandardPack}
                  disabled={pending || pCredits < effectiveStandardPrice}
                  className={buyBtn}
                >
                  {isBuying(STANDARD_ID) ? (
                    "Purchasing…"
                  ) : pCredits < effectiveStandardPrice ? (
                    `Need ${effectiveStandardPrice.toLocaleString()} P`
                  ) : standardOnSale ? (
                    <span>
                      Buy · <span className="line-through opacity-60">{standardPackPrice.toLocaleString()}</span>{" "}
                      {effectiveStandardPrice.toLocaleString()} P
                    </span>
                  ) : (
                    `Buy Pack · ${effectiveStandardPrice.toLocaleString()} P`
                  )}
                </button>
              )}
              {standardAllowsCardCredits && packCredits > 0 && (
                <Link href="/cards/new" className={outlineBtn}>
                  Open Pack ({packCredits} ready) →
                </Link>
              )}
              {pCredits < effectiveStandardPrice && (
                <button type="button" onClick={onOpenPCreditsTab} className={`${outlineBtn} border-amber-500/50 text-amber-700 dark:text-amber-300`}>
                  Need {(effectiveStandardPrice - pCredits).toLocaleString()} more P-Credits
                </button>
              )}
              <button type="button" onClick={() => setShowStandardContents(true)} className={ghostBtn}>
                What&apos;s in the pack?
              </button>
            </div>
          </PackTile>

          {customPacks.map((pack) => {
            const packOnSale = isOnSale(pack.price, pack.salePrice);
            const effectivePrice = getEffectivePrice(pack.price, pack.salePrice);
            const discountPct = getSaleDiscountPct(pack.price, pack.salePrice);
            const canAfford = pCredits >= effectivePrice;
            // A live pack can be shown without being for sale: members can look inside but not buy.
            const forSale = pack.purchasable !== false;
            const previewCards = pack.setList.slice(0, 3).map((s) => s.card);

            return (
              <PackTile key={pack.id} onSale={packOnSale}>
                <div className="space-y-3">
                  {/* Preview fan of cards in the set */}
                  <ArtFrame onSale={packOnSale}>
                    <div className="flex items-center justify-center -space-x-7 sm:-space-x-8">
                      {previewCards.length === 0 && (
                        <span className="rounded-xl border border-amber-400/40 bg-black/60 px-4 py-3 text-center text-sm font-black text-amber-300">
                          Cards drawn from a car
                        </span>
                      )}
                      {previewCards.map((c, idx) => (
                        <div
                          key={c.id ?? idx}
                          className="relative w-24 transition-transform sm:w-28"
                          style={{
                            transform:
                              previewCards.length > 1
                                ? `rotate(${(idx - (previewCards.length - 1) / 2) * 8}deg) translateY(${idx === 1 ? -4 : 4}px)`
                                : undefined,
                            zIndex: idx === 1 ? 10 : idx,
                          }}
                        >
                          {/* Holds the card's place (and shimmers) until its picture has loaded, so the fan doesn't pop in */}
                          <div aria-hidden className="gx-shimmer absolute inset-0 rounded-xl" style={{ aspectRatio: "63 / 88" }} />
                          <FullArtCard card={c} className="relative drop-shadow-xl" />
                        </div>
                      ))}
                    </div>
                    <span className="absolute left-3 top-3 z-20 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black">
                      {totalCardsInPack(pack)} Card{totalCardsInPack(pack) === 1 ? "" : "s"} / Pack
                    </span>
                    {packOnSale && <SalePill pct={discountPct} />}
                  </ArtFrame>

                  {(pack.bonus || !forSale) && (
                    <div className="flex flex-wrap gap-2">
                      {pack.bonus && (
                        <span className="rounded-full border border-fuchsia-400/50 bg-fuchsia-500/10 px-2.5 py-0.5 text-[11px] font-black text-fuchsia-700 dark:text-fuchsia-300">
                          ★ Bonus card
                        </span>
                      )}
                      {!forSale && (
                        <span className="rounded-full border border-zinc-400/60 bg-zinc-500/10 px-2.5 py-0.5 text-[11px] font-black text-zinc-700 dark:text-zinc-200">
                          Not available right now
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <TitleAndPrice name={pack.name} price={pack.price} effectivePrice={effectivePrice} onSale={packOnSale} />
                    {/* Said out loud on the tile: a hover tooltip is invisible on a phone */}
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{packBreakdown(pack)}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {pack.needsGeneration
                        ? `${pack.setList.length} set card${pack.setList.length === 1 ? "" : "s"} + cards drawn from a car`
                        : `${pack.setList.length} card${pack.setList.length === 1 ? "" : "s"} in the set`}
                    </p>
                    {pack.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{pack.description}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  {!forSale ? (
                    <button type="button" disabled className={buyBtn}>
                      Not available right now
                    </button>
                  ) : pack.needsGeneration ? (
                    canAfford ? (
                      <Link href={`/cards/new?pack=${pack.id}`} className={buyBtn}>
                        Choose car &amp; open · {effectivePrice.toLocaleString()} P
                      </Link>
                    ) : (
                      <button type="button" disabled className={buyBtn}>
                        Need {effectivePrice.toLocaleString()} P
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBuyCustomPack(pack)}
                      disabled={pending || !canAfford}
                      className={buyBtn}
                    >
                      {isBuying(pack.id) ? (
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
                        <Link href={`/cards/new?pack=${pack.id}`} className={outlineBtn}>
                          Choose car &amp; use a pack credit ({packCredits} left)
                        </Link>
                      ) : (
                        <button type="button" disabled className={outlineBtn}>
                          Pack credit: none left
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuyCustomPack(pack, "cardCredit")}
                        disabled={pending || packCredits < 1}
                        className={outlineBtn}
                      >
                        {isBuying(pack.id, "cardCredit")
                          ? "Opening…"
                          : packCredits > 0
                            ? `Use a pack credit (${packCredits} left)`
                            : "Pack credit: none left"}
                      </button>
                    )
                  )}
                  {forSale && !canAfford && (
                    <button type="button" onClick={onOpenPCreditsTab} className={`${outlineBtn} border-amber-500/50 text-amber-700 dark:text-amber-300`}>
                      Need {(effectivePrice - pCredits).toLocaleString()} more P-Credits
                    </button>
                  )}
                  <button type="button" onClick={() => setInspectPack(pack)} className={ghostBtn}>
                    What&apos;s in the pack?
                  </button>
                </div>
              </PackTile>
            );
          })}
        </div>
      </section>

      {/* A purchase is going through: block taps so nothing is pressed twice */}
      {pending && pendingBuy && (
        <BusyOverlay
          label={pendingBuy.id === STANDARD_ID ? "Buying your pack…" : pendingBuy.via === "cardCredit" ? "Opening your pack…" : "Buying & opening your pack…"}
          hint="This usually takes a few seconds. Please stay on this screen."
        />
      )}

      {/* After buying a Standard Pack: it can be opened straight away */}
      {boughtStandard && (
        <BottomSheet
          title="Pack bought"
          subtitle="Penthouse Standard Pack"
          tone="emerald"
          size="md"
          onClose={() => setBoughtStandard(null)}
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={() => setBoughtStandard(null)} className={sheetSecondary}>
                Not now
              </button>
              {boughtStandard.packCredits > 0 && (
                <Link href="/cards/new" className={sheetPrimary}>
                  Open Pack
                </Link>
              )}
            </div>
          }
        >
          <p className="text-sm text-zinc-200">
            You paid {boughtStandard.pricePaid.toLocaleString()} P-Credits. You now have {boughtStandard.packCredits} pack credit
            {boughtStandard.packCredits === 1 ? "" : "s"} ready to open.
          </p>
        </BottomSheet>
      )}

      {/* What's in the Standard Pack */}
      {showStandardContents && (
        <PackContentsModal
          packId="standard"
          title="Penthouse Standard Pack"
          eyebrow="Core Pack"
          onClose={() => setShowStandardContents(false)}
          footer={
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-zinc-400">Pack Price</span>
                <span className="text-xl font-black text-amber-400">{effectiveStandardPrice.toLocaleString()} P-Credits</span>
              </div>
              {pCredits >= effectiveStandardPrice ? (
                standardAllowsCardCredits ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowStandardContents(false);
                      handleBuyStandardPack();
                    }}
                    disabled={pending}
                    className={`${sheetPrimary} w-full`}
                  >
                    Buy Pack · {effectiveStandardPrice.toLocaleString()} P
                  </button>
                ) : (
                  <Link href="/cards/new" className={`${sheetPrimary} w-full`}>
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
                  className={`${sheetPrimary} w-full`}
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
        (() => {
          const inspectOnSale = isOnSale(inspectPack.price, inspectPack.salePrice);
          const inspectEffectivePrice = getEffectivePrice(inspectPack.price, inspectPack.salePrice);
          const inspectDiscountPct = getSaleDiscountPct(inspectPack.price, inspectPack.salePrice);
          const total = totalCardsInPack(inspectPack);
          return (
            <BottomSheet
              title={inspectPack.name}
              subtitle={`Pack · ${total} card${total === 1 ? "" : "s"} per pack`}
              size="lg"
              fullHeight
              dismissible={!pending}
              onClose={() => setInspectPack(null)}
              footer={
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-zinc-400">Pack Price</span>
                    {inspectOnSale ? (
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-zinc-500 line-through">{inspectPack.price.toLocaleString()} P</span>
                        <span className="text-xl font-black text-emerald-400">{inspectEffectivePrice.toLocaleString()} P-Credits</span>
                      </span>
                    ) : (
                      <span className="text-xl font-black text-amber-400">{inspectEffectivePrice.toLocaleString()} P-Credits</span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    {inspectPack.purchasable === false ? (
                      <span className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-300">
                        Not available to buy right now
                      </span>
                    ) : pCredits >= inspectEffectivePrice ? (
                      inspectPack.needsGeneration ? (
                        <Link href={`/cards/new?pack=${inspectPack.id}`} className={sheetPrimary}>
                          Choose car &amp; open · {inspectEffectivePrice.toLocaleString()} P
                        </Link>
                      ) : (
                        <button type="button" onClick={() => handleBuyCustomPack(inspectPack)} disabled={pending} className={sheetPrimary}>
                          {isBuying(inspectPack.id) ? "Opening Pack…" : `Buy & Open · ${inspectEffectivePrice.toLocaleString()} P`}
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectPack(null);
                          onOpenPCreditsTab();
                        }}
                        className={sheetPrimary}
                      >
                        Top Up P-Credits to Buy
                      </button>
                    )}
                    {inspectPack.purchasable !== false &&
                      inspectPack.allowCardCredits &&
                      (inspectPack.needsGeneration ? (
                        packCredits > 0 ? (
                          <Link href={`/cards/new?pack=${inspectPack.id}`} className={sheetSecondary}>
                            Choose car &amp; use a pack credit ({packCredits} left)
                          </Link>
                        ) : (
                          <span className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-300">
                            Pack credit: none left
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuyCustomPack(inspectPack, "cardCredit")}
                          disabled={pending || packCredits < 1}
                          className={sheetSecondary}
                        >
                          {isBuying(inspectPack.id, "cardCredit")
                            ? "Opening Pack…"
                            : packCredits > 0
                              ? `Use a pack credit (${packCredits} left)`
                              : "Pack credit: none left"}
                        </button>
                      ))}
                  </div>
                </div>
              }
            >
              {inspectOnSale && (
                <p className="mb-3">
                  <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-1 text-[11px] font-black uppercase text-white">
                    🔥 On Sale · Save {inspectDiscountPct}%
                  </span>
                </p>
              )}
              {inspectPack.description && <p className="mb-3 text-xs text-zinc-400">{inspectPack.description}</p>}
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
            </BottomSheet>
          );
        })()}

      {/* Animated Pack Opening Stage for store packs */}
      {openingState &&
        openingState.cards.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="gx-safe-t fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col overflow-y-auto overscroll-contain bg-black/90 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={`Opening ${openingState.packName}`}
          >
            {/* my-auto centres this when it is shorter than the screen and lets it start at the top (never clipped) when it is taller */}
            <div className="mx-auto my-auto w-full max-w-xl space-y-3 px-4 pb-4 pt-2">
              <div className="text-zinc-100">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Pack</p>
                <h3 className="text-lg font-black">{openingState.packName}</h3>
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
            </div>

            {openingState.revealed &&
              (() => {
                // Another of the same pack, paid for with P-Credits or a pack credit, whichever the member has.
                const again = openingState.pack;
                const againPrice = getEffectivePrice(again.price, again.salePrice);
                const canPay = pCredits >= againPrice;
                const canCredit = again.allowCardCredits !== false && packCredits > 0;
                const showAgain = again.purchasable !== false && (canPay || canCredit);
                const goToCards = () => {
                  setOpeningState(null);
                  onOpenCollectionTab();
                };
                return (
                  <div className="gx-safe-b sticky bottom-0 z-10 mt-auto border-t border-zinc-800 bg-zinc-950/95 px-4 pt-3 backdrop-blur">
                    <div className="mx-auto w-full max-w-xl space-y-2">
                      {showAgain && canPay && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setOpeningState(null);
                            handleBuyCustomPack(again, "pcredits");
                          }}
                          className={buyBtn}
                        >
                          Open another · {againPrice.toLocaleString()} P
                        </button>
                      )}
                      {showAgain && canCredit && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setOpeningState(null);
                            handleBuyCustomPack(again, "cardCredit");
                          }}
                          className={canPay ? stageBtn : buyBtn}
                        >
                          Open another with a pack credit ({packCredits} left)
                        </button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setOpeningState(null)} className={stageBtn}>
                          Back to Pack Store
                        </button>
                        <button type="button" onClick={goToCards} className={showAgain ? stageBtn : buyBtn}>
                          View in My Cards →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
          </div>,
          document.body
        )}
    </div>
  );
}

/** The outer card of a pack tile. */
function PackTile({ onSale, children }: { onSale: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative flex flex-col justify-between rounded-3xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900 sm:p-5 ${
        onSale ? "border-rose-500/60 dark:border-rose-500/50" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {children}
    </div>
  );
}

/** The dark art block at the top of a tile. The pills that sit on it are placed by the caller (top-left and top-right only). */
function ArtFrame({ onSale, children }: { onSale: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative flex h-44 items-center justify-center overflow-hidden rounded-2xl p-4 sm:h-48 ${
        onSale ? "bg-gradient-to-b from-rose-950/80 via-zinc-900 to-zinc-950" : "bg-gradient-to-b from-zinc-900 to-zinc-950"
      }`}
    >
      {children}
    </div>
  );
}

function SalePill({ pct }: { pct: number }) {
  return (
    <span className="absolute right-3 top-3 z-20 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white shadow">
      🔥 -{pct}% SALE
    </span>
  );
}

/** The name, then the price on its own line (beside the name from sm: up). */
function TitleAndPrice({ name, price, effectivePrice, onSale }: { name: string; price: number; effectivePrice: number; onSale: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <h4 className="text-lg font-black leading-tight text-zinc-900 dark:text-zinc-100">{name}</h4>
      <div className="flex shrink-0 items-baseline gap-2 sm:justify-end">
        {onSale && <span className="text-xs font-bold text-zinc-400 line-through">{price.toLocaleString()} P</span>}
        <span
          className={`rounded-xl px-3 py-1 text-base font-black ${
            onSale ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          {effectivePrice.toLocaleString()} P-Credits
        </span>
      </div>
    </div>
  );
}

/** Every card a pack gives each time it is opened: its cards plus its Crew and Repair Kit cards. (A bonus pull is a chance, so it isn't counted.) */
function totalCardsInPack(pack: TcgCustomPackWithCards): number {
  return pack.cardsPerPack + (pack.extraCards?.crew ?? 0) + (pack.extraCards?.repair ?? 0);
}

/** What one pack gives, in words: "3 cards + 1 crew + 1 repair kit". */
function packBreakdown(pack: TcgCustomPackWithCards): string {
  return [
    `${pack.cardsPerPack} card${pack.cardsPerPack === 1 ? "" : "s"}`,
    ...(pack.extraCards?.crew ? [`${pack.extraCards.crew} crew`] : []),
    ...(pack.extraCards?.repair ? [`${pack.extraCards.repair} repair kit${pack.extraCards.repair === 1 ? "" : "s"}`] : []),
  ].join(" + ");
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
