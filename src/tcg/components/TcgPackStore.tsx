"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { PackOpening, splitStorePackCards } from "@/components/member-cards/PackOpening";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyAndOpenCustomPack, buyStandardPackWithPCredits, previewOpenPackAction } from "@/tcg/actions";
import { PackPicker, type CarouselPack } from "@/tcg/components/PackPicker";
import { QuickSellSheet } from "@/tcg/components/QuickSellSheet";
import { PackContentsView } from "@/tcg/components/PackContentsView";
import { getEffectivePrice, getQuickSellPrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { TcgCustomPackWithCards } from "@/tcg/types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { buzz } from "@/tcg/ui/feedback";
import { useBottomChromeHeight } from "@/tcg/ui/useBottomChrome";
import { packCardsLabel, packExtraLabel, totalCardsInPack } from "@/tcg/pack-display";
import { BusyOverlay } from "@/tcg/ui/Shimmer";
import { useToast } from "@/tcg/ui/Toast";

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5";
const primaryBtn =
  "gx-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "gx-tap inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";
/** The main button on a pack tile: full width, 48px tall. (The pack opening stage uses this too.) */
const buyBtn = `${primaryBtn} min-h-12 w-full`;
/** The big main button in the bar that stays on screen: 56px tall, with large text. */
const actionBtn = `${primaryBtn} min-h-14 w-full text-base`;
/** The smaller buttons beside each other under it. */
const moreBtn =
  "gx-tap inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900 px-2 text-center text-sm font-bold text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-50";
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
  standardPackEnabled = true,
  customPacks,
  isAdmin = false,
  onBalancesChange,
  onCustomCardsPulled,
  onOpenPCreditsTab,
  onOpenCollectionTab,
  onCardsSold,
  showWalletBar = true,
}: {
  pCredits: number;
  packCredits: number;
  standardPackPrice: number;
  standardPackSalePrice?: number | null;
  /** False when an admin has switched pack credit opening off for the Standard Pack: it is paid for in P-Credits when opened. */
  standardAllowsCardCredits?: boolean;
  /** False when an admin has removed the Standard Pack: it is not shown, bought or opened, and only store packs are sold. */
  standardPackEnabled?: boolean;
  customPacks: TcgCustomPackWithCards[];
  isAdmin?: boolean;
  onBalancesChange: (next: { pCredits: number; packCredits: number }) => void;
  onCustomCardsPulled: (cards: MemberCard[], newPCredits: number) => void;
  onOpenPCreditsTab: () => void;
  onOpenCollectionTab: () => void;
  /** Cards from a pack were quick sold: they leave the collection and the balance changes. */
  onCardsSold?: (soldIds: string[], pCredits: number) => void;
  /** The slim sticky wallet line. Off on the game-only app, where the page header already shows these balances. */
  showWalletBar?: boolean;
}) {
  const toast = useToast();
  /** How tall the bars fixed to the bottom of a phone screen are, so the docked pack fan sits just above them. */
  const chromeHeight = useBottomChromeHeight();
  const [pending, startTransition] = useTransition();
  /** The purchase that is running, if any. `pending` alone can't say which tile it belongs to. */
  const [pendingBuy, setPendingBuy] = useState<PendingBuy | null>(null);
  /** The last purchase error, kept on the page as well as in a toast in case the toast was missed. */
  const [error, setError] = useState<string | null>(null);
  /** Set after a Standard Pack purchase: offers to open it right away. */
  const [boughtStandard, setBoughtStandard] = useState<{ pricePaid: number; packCredits: number } | null>(null);
  const [openingState, setOpeningState] = useState<{
    packName: string;
    cards: MemberCard[];
    revealed: boolean;
    /** The pack that was opened, so the reveal can offer to open another one. Not set for a dev preview. */
    pack: TcgCustomPackWithCards | null;
    /** Set for an admin's dev preview: the cards are not kept, and the pack that was previewed. */
    preview?: { packId: string };
    /** Cards from this pack that were quick sold from the result screen, and a line saying so. */
    sold?: string[];
    soldNote?: string;
  } | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  /** The pack an admin is rolling a dev preview of, so its button shows it is busy. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  /** Dev preview option: make sure the pack gives a Legend car card, to try the Legend reveal. Shared by every pack. */
  const [guaranteeLegend, setGuaranteeLegend] = useState(false);

  const standardOnSale = isOnSale(standardPackPrice, standardPackSalePrice);
  const effectiveStandardPrice = getEffectivePrice(standardPackPrice, standardPackSalePrice);
  const standardDiscountPct = getSaleDiscountPct(standardPackPrice, standardPackSalePrice);

  /** Which pack is raised in the middle of the fan. Falls back to the first pack if the chosen one is gone (the list refreshed). */
  // With the Standard Pack removed there may be nothing to select at all (an empty id).
  const firstId = customPacks[0]?.id ?? (standardPackEnabled ? STANDARD_ID : "");
  const [selectedId, setSelectedId] = useState<string>(firstId);
  const activeId = (standardPackEnabled && selectedId === STANDARD_ID) || customPacks.some((p) => p.id === selectedId) ? selectedId : firstId;
  /** The selected store pack, or null when the Standard Pack is selected. */
  const activePack = customPacks.find((p) => p.id === activeId) ?? null;
  // The store packs first, then the Standard Pack last.
  const carouselPacks: CarouselPack[] = [
    ...customPacks.map(
      (p): CarouselPack => ({
        id: p.id,
        name: p.name,
        variant: "custom",
        cardsLabel: packCardsLabel(p),
        extraLabel: packExtraLabel(p),
        heroCard: p.setList[0]?.card,
        discountPct: isOnSale(p.price, p.salePrice) ? getSaleDiscountPct(p.price, p.salePrice) : 0,
        priceLabel: `${getEffectivePrice(p.price, p.salePrice).toLocaleString()} P`,
      })
    ),
    ...(standardPackEnabled
      ? [
          {
            id: STANDARD_ID,
            name: "Standard Pack",
            variant: "standard" as const,
            cardsLabel: "4 CARDS",
            extraLabel: "+ RARE CHANCE",
            discountPct: standardOnSale ? standardDiscountPct : 0,
            priceLabel: `${effectiveStandardPrice.toLocaleString()} P`,
          },
        ]
      : []),
  ];


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

  /** Admin dev tool: open a pack to watch the reveal. Nothing is charged, saved or kept. */
  async function handlePreviewPack(packId: string) {
    if (previewing) return;
    setError(null);
    setPreviewing(packId);
    try {
      const res = await previewOpenPackAction(packId, { guaranteeLegend });
      if (res.success) {
        buzz(20);
        setOpeningState({ packName: res.data.packName, cards: res.data.cards, revealed: false, pack: null, preview: { packId } });
      } else {
        setError(res.error);
        toast(res.error, "error");
      }
    } catch {
      const text = "Could not preview that pack.";
      setError(text);
      toast(text, "error");
    } finally {
      setPreviewing(null);
    }
  }

  const isBuying = (id: string, via: PendingBuy["via"] = "pcredits") => pendingBuy?.id === id && pendingBuy.via === via;

  const empty = carouselPacks.length === 0;
  const selName = activePack ? activePack.name : "Standard Pack";
  const selPrice = activePack ? activePack.price : standardPackPrice;
  const selEffective = activePack ? getEffectivePrice(activePack.price, activePack.salePrice) : effectiveStandardPrice;
  const selOnSale = activePack ? isOnSale(activePack.price, activePack.salePrice) : standardOnSale;

  /**
   * What the member can do with the selected pack: one big main button, then up to two smaller ones beside each other. They sit
   * in a bar that stays on screen, so there is never any scrolling to find them.
   */
  function buildActions(): { main: ReactNode; more: ReactNode[] } {
    let main: ReactNode;
    const more: ReactNode[] = [];
    if (activePack) {
      const pack = activePack;
      const packOnSale = isOnSale(pack.price, pack.salePrice);
      const effectivePrice = getEffectivePrice(pack.price, pack.salePrice);
      const canAfford = pCredits >= effectivePrice;
      // A live pack can be shown without being for sale: members can look inside but not buy.
      const forSale = pack.purchasable !== false;
      if (!forSale) {
        main = (
          <button type="button" disabled className={actionBtn}>
            Not available right now
          </button>
        );
      } else if (pack.needsGeneration) {
        main = canAfford ? (
          <Link href={`/cards/new?pack=${pack.id}`} className={actionBtn}>
            Choose car &amp; open · {effectivePrice.toLocaleString()} P
          </Link>
        ) : (
          <button type="button" disabled className={actionBtn}>
            Need {effectivePrice.toLocaleString()} P
          </button>
        );
      } else {
        main = (
          <button type="button" onClick={() => handleBuyCustomPack(pack)} disabled={pending || !canAfford} className={actionBtn}>
            {isBuying(pack.id) ? (
              "Opening…"
            ) : canAfford ? (
              packOnSale ? (
                <span>
                  Buy &amp; Open · <span className="line-through opacity-60">{pack.price.toLocaleString()}</span> {effectivePrice.toLocaleString()} P
                </span>
              ) : (
                `Buy & Open · ${effectivePrice.toLocaleString()} P`
              )
            ) : (
              `Need ${effectivePrice.toLocaleString()} P`
            )}
          </button>
        );
      }
      if (forSale && pack.allowCardCredits) {
        more.push(
          pack.needsGeneration ? (
            packCredits > 0 ? (
              <Link key="credit" href={`/cards/new?pack=${pack.id}`} className={moreBtn}>
                Use a pack credit ({packCredits})
              </Link>
            ) : (
              <button key="credit" type="button" disabled className={moreBtn}>
                No pack credits
              </button>
            )
          ) : (
            <button key="credit" type="button" onClick={() => handleBuyCustomPack(pack, "cardCredit")} disabled={pending || packCredits < 1} className={moreBtn}>
              {isBuying(pack.id, "cardCredit") ? "Opening…" : packCredits > 0 ? `Use a pack credit (${packCredits})` : "No pack credits"}
            </button>
          )
        );
      }
      if (forSale && !canAfford) {
        more.push(
          <button key="topup" type="button" onClick={onOpenPCreditsTab} className={`${moreBtn} !border-amber-500/60 !text-amber-300`}>
            Get {(effectivePrice - pCredits).toLocaleString()} more P
          </button>
        );
      }
    } else {
      if (!standardAllowsCardCredits && pCredits >= effectiveStandardPrice) {
        // Paid for when it is opened: the member picks their car in the wizard, which charges the price.
        main = (
          <Link href="/cards/new" className={actionBtn}>
            Choose car &amp; open · {effectiveStandardPrice.toLocaleString()} P
          </Link>
        );
      } else {
        main = (
          <button type="button" onClick={handleBuyStandardPack} disabled={pending || pCredits < effectiveStandardPrice} className={actionBtn}>
            {isBuying(STANDARD_ID) ? (
              "Purchasing…"
            ) : pCredits < effectiveStandardPrice ? (
              `Need ${effectiveStandardPrice.toLocaleString()} P`
            ) : standardOnSale ? (
              <span>
                Buy · <span className="line-through opacity-60">{standardPackPrice.toLocaleString()}</span> {effectiveStandardPrice.toLocaleString()} P
              </span>
            ) : (
              `Buy Pack · ${effectiveStandardPrice.toLocaleString()} P`
            )}
          </button>
        );
      }
      if (standardAllowsCardCredits && packCredits > 0) {
        more.push(
          <Link key="open" href="/cards/new" className={moreBtn}>
            Open a pack ({packCredits} ready) →
          </Link>
        );
      }
      if (pCredits < effectiveStandardPrice) {
        more.push(
          <button key="topup" type="button" onClick={onOpenPCreditsTab} className={`${moreBtn} !border-amber-500/60 !text-amber-300`}>
            Get {(effectiveStandardPrice - pCredits).toLocaleString()} more P
          </button>
        );
      }
    }
    return { main, more };
  }
  const actions = empty ? null : buildActions();

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Always in reach: what you can spend, and the way to get more. One slim line, above the page content. */}
      {showWalletBar && (
        <div className="gx-sticky-top sticky z-[35] -mx-1 hidden items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/95 px-2 py-1.5 text-zinc-100 shadow-lg backdrop-blur sm:flex">
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
      )}

      <section className={`${panel} hidden flex-wrap items-center justify-between gap-3 sm:flex`}>
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


      {empty || !actions ? (
        <div role="status" className="space-y-1.5 rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="text-4xl" aria-hidden>
            🎁
          </p>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">No packs on sale right now</h2>
          <p className="text-base text-zinc-600 dark:text-zinc-400">New packs are on their way. Check back soon.</p>
          {packCredits > 0 && (
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              You have {packCredits} pack credit{packCredits === 1 ? "" : "s"}. They&apos;ll be ready to use as soon as a pack that takes them goes on sale.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 1 and 2: pick a pack, and see what it costs. Side by side on a wide screen. */}
          <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-6">
            <section aria-labelledby="ps-choose" className={`${panel} space-y-4`}>
              <h2 id="ps-choose" className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                Choose a pack
              </h2>
              <PackPicker packs={carouselPacks} selectedId={activeId} onSelect={setSelectedId} />
            </section>

            <section aria-label={`${selName}: price and details`} aria-live="polite" className="space-y-3">
              {activePack ? (
                <PackSummary onSale={selOnSale}>
                  <TitleAndPrice name={activePack.name} price={activePack.price} effectivePrice={selEffective} onSale={selOnSale} />
                  {/* Only what the pack really gives. The bonus is just a chance, so it says "Bonus card" and no percentage. */}
                  <ul className={`grid gap-2 ${activePack.bonus ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                    <ContentStat icon="🏎️" value={activePack.cardsPerPack} label={activePack.cardsPerPack === 1 ? "Card" : "Cards"} />
                    <ContentStat icon="👥" value={activePack.extraCards?.crew ?? 0} label="Crew" />
                    <ContentStat icon="🔧" value={activePack.extraCards?.repair ?? 0} label="Repair kit" />
                    {activePack.bonus && <ContentStat icon="★" value="Bonus" label="Card" accent />}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    {selOnSale && (
                      <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-1 text-xs font-black uppercase text-white">
                        🔥 -{getSaleDiscountPct(activePack.price, activePack.salePrice)}% sale
                      </span>
                    )}
                    {activePack.purchasable === false && (
                      <span className="rounded-full border border-zinc-400/60 bg-zinc-500/10 px-3 py-1 text-xs font-black text-zinc-700 dark:text-zinc-200">
                        Not available right now
                      </span>
                    )}
                    {activePack.needsGeneration && (
                      <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                        Pick a car when you open it
                      </span>
                    )}
                  </div>
                  {activePack.description && <p className="text-sm text-zinc-600 dark:text-zinc-300">{activePack.description}</p>}
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    {totalCardsInPack(activePack)} card{totalCardsInPack(activePack) === 1 ? "" : "s"} in every pack. The full list is just below.
                  </p>
                </PackSummary>
              ) : (
                <PackSummary onSale={standardOnSale}>
                  <TitleAndPrice name="Standard Pack" price={standardPackPrice} effectivePrice={effectiveStandardPrice} onSale={standardOnSale} />
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <ContentStat icon="🏎️" value={2} label="Car cards" />
                    <ContentStat icon="👥" value={1} label="Crew" />
                    <ContentStat icon="🔧" value={1} label="Repair kit" />
                    <ContentStat icon="★" value="Bonus" label="Card" accent />
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    {standardOnSale && (
                      <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-1 text-xs font-black uppercase text-white">
                        🔥 -{standardDiscountPct}% sale
                      </span>
                    )}
                    {standardAllowsCardCredits && (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-300">
                        You have {packCredits} unopened
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    1 custom AI card of your car and 1 community car card, 1 Tactical Crew Card for Clash Arena, 1 Repair Kit, and a chance at a rare
                    bonus set card. The full list is just below.
                  </p>
                </PackSummary>
              )}

              {isAdmin && (
                <div className="space-y-2">
                  <Link href="/admin/driftclash/packs" className={`${secondaryBtn} w-full sm:hidden`}>
                    ⚙️ Manage Packs &amp; Sale Prices
                  </Link>
                  <DevPreviewButton
                    busy={previewing === (activePack?.id ?? STANDARD_ID)}
                    disabled={previewing !== null}
                    guaranteeLegend={guaranteeLegend}
                    onGuaranteeChange={setGuaranteeLegend}
                    onClick={() => handlePreviewPack(activePack?.id ?? STANDARD_ID)}
                  />
                </div>
              )}
            </section>
          </div>

          {/* 3: what is in the pack, right on the page (no window to open). */}
          <section aria-labelledby="ps-contents" className="space-y-2">
            <h2 id="ps-contents" className="px-1 text-lg font-black text-zinc-900 dark:text-zinc-100">
              What&apos;s in this pack
            </h2>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 sm:p-5">
              {activePack && <PackOddsNote pack={activePack} />}
              <PackContentsView
                key={activeId}
                packId={activeId}
                fallback={
                  activePack ? (
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {activePack.setList.map(({ card }) => (
                        <li key={card.id} className="space-y-1.5">
                          <FullArtCard card={card} className="drop-shadow-lg" />
                          <div className="px-1 text-sm">
                            <span className="font-bold text-zinc-200">{rarityLabel(card.tier)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            </div>
          </section>

          {/* 4: the buttons stay on screen, just above the app's bottom bar, so there is never any scrolling to find them. */}
          <div className="sticky z-[30] lg:flex lg:justify-center" style={{ bottom: chromeHeight + 8 }}>
            <div className="space-y-2 rounded-2xl border border-zinc-700 bg-zinc-950/95 p-2.5 text-zinc-100 shadow-2xl backdrop-blur sm:p-3 lg:w-full lg:max-w-2xl lg:p-4">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="min-w-0 truncate text-sm font-black">{selName}</span>
                <span className="shrink-0 text-sm font-black tabular-nums text-amber-300">
                  {selOnSale && <span className="mr-2 text-xs font-bold text-zinc-400 line-through">{selPrice.toLocaleString()} P</span>}
                  {selEffective.toLocaleString()} P-Credits
                </span>
              </div>
              {actions.main}
              {actions.more.length > 0 && <div className={`grid gap-2 ${actions.more.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{actions.more}</div>}
            </div>
          </div>
        </>
      )}

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

      {/* Quick sell the cards from the pack that was just opened */}
      {sellOpen && openingState && !openingState.preview && onCardsSold && (
        <QuickSellSheet
          cards={openingState.cards.filter((c) => !(openingState.sold ?? []).includes(c.id))}
          title="Quick sell this pack"
          subtitle={openingState.packName}
          keepRareByDefault
          onClose={() => setSellOpen(false)}
          onSold={(result) => {
            setSellOpen(false);
            onCardsSold(result.soldIds, result.pCredits);
            const left = result.skipped.length;
            const note = `Sold ${result.soldIds.length} card${result.soldIds.length === 1 ? "" : "s"} for +${result.payout.toLocaleString()} P-Credits.${
              left > 0 ? ` ${left} could not be sold and ${left === 1 ? "stays" : "stay"} in your collection.` : ""
            }`;
            setOpeningState((prev) => (prev ? { ...prev, sold: [...(prev.sold ?? []), ...result.soldIds], soldNote: note } : prev));
            toast(note, "success");
          }}
        />
      )}

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
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  {openingState.preview ? "🧪 Dev preview · not kept" : "Pack"}
                </p>
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

            {openingState.revealed && openingState.preview && (
              <div className="gx-safe-b sticky bottom-0 z-10 mt-auto border-t border-zinc-800 bg-zinc-950/95 px-4 pt-3 backdrop-blur">
                <div className="mx-auto w-full max-w-xl space-y-2">
                  <p role="status" className="text-center text-xs font-bold text-amber-300">
                    🧪 Dev preview. These cards were not saved and nothing was charged.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setOpeningState(null)} className={stageBtn}>
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = openingState.preview?.packId;
                        setOpeningState(null);
                        if (id) void handlePreviewPack(id);
                      }}
                      className={buyBtn}
                    >
                      Preview again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {openingState.revealed &&
              openingState.pack &&
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
                      {openingState.soldNote && (
                        <p role="status" className="text-center text-xs font-bold text-amber-300">
                          {openingState.soldNote}
                        </p>
                      )}
                      {onCardsSold && openingState.cards.some((c) => !(openingState.sold ?? []).includes(c.id)) && (
                        <button
                          type="button"
                          onClick={() => setSellOpen(true)}
                          className="gx-tap inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 text-sm font-bold text-rose-200 hover:bg-rose-500/20"
                        >
                          Quick sell this pack · +
                          {openingState.cards
                            .filter((c) => !(openingState.sold ?? []).includes(c.id))
                            .reduce((sum, c) => sum + getQuickSellPrice(c), 0)
                            .toLocaleString()}{" "}
                          P
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

/** Admin only: opens the pack for the reveal without charging for it or keeping the cards. */
function DevPreviewButton({
  onClick,
  busy,
  disabled,
  guaranteeLegend,
  onGuaranteeChange,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  guaranteeLegend: boolean;
  onGuaranteeChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-dashed border-fuchsia-500/60 bg-fuchsia-500/5 p-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="gx-tap inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-fuchsia-600 px-4 text-sm font-bold text-white transition-colors hover:bg-fuchsia-500 disabled:opacity-50"
      >
        {busy ? "Rolling a preview…" : "🧪 Dev preview · open, don’t keep"}
      </button>
      <label className="flex min-h-9 cursor-pointer items-center justify-center gap-2 text-xs font-bold text-fuchsia-800 dark:text-fuchsia-200">
        <input
          type="checkbox"
          checked={guaranteeLegend}
          onChange={(e) => onGuaranteeChange(e.target.checked)}
          className="h-4 w-4 accent-fuchsia-600"
        />
        Guarantee a Legend car card
      </label>
    </div>
  );
}

/** The panel that sums up the selected pack above the fan. */
function PackSummary({ onSale, children }: { onSale: boolean; children: ReactNode }) {
  return (
    <div
      className={`space-y-3 rounded-3xl border bg-white p-4 shadow-sm dark:bg-zinc-900 sm:p-5 ${
        onSale ? "border-rose-500/60 dark:border-rose-500/50" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {children}
    </div>
  );
}

/** One thing a pack gives: an icon and how many on one line, and what it is underneath. */
function ContentStat({ icon, value, label, accent = false }: { icon: string; value: number | string; label: string; accent?: boolean }) {
  return (
    <li
      className={`min-w-0 rounded-xl border px-2 py-1.5 ${
        accent
          ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
          : "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="text-base leading-none">
          {icon}
        </span>
        <span className="text-lg font-black leading-tight tabular-nums">{value}</span>
      </span>
      <span className="mt-0.5 block text-xs font-bold leading-tight opacity-80">{label}</span>
    </li>
  );
}

/** The name, then the price on its own line (beside the name from sm: up). */
function TitleAndPrice({ name, price, effectivePrice, onSale }: { name: string; price: number; effectivePrice: number; onSale: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 sm:gap-3">
      <h3 className="text-xl font-black leading-tight text-zinc-900 dark:text-zinc-100">{name}</h3>
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

/** For packs that draw some cards from a car: a short note that a car is chosen when opening. */
function PackOddsNote({ pack }: { pack: TcgCustomPackWithCards }) {
  if (!pack.needsGeneration) return null;
  return (
    <p className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
      Some cards are drawn from a car (yours, or community cars), so you pick a car when you open this pack.
    </p>
  );
}
