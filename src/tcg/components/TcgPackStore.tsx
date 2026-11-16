"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { PackOpening, splitStorePackCards } from "@/components/member-cards/PackOpening";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyAndOpenCustomPack, buyStandardPackWithPCredits, previewOpenPackAction } from "@/tcg/actions";
import { PackCarousel, type CarouselPack } from "@/tcg/components/PackCarousel";
import { PackContentsModal, PackContentsView } from "@/tcg/components/PackContentsView";
import { getEffectivePrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { TcgCustomPackWithCards } from "@/tcg/types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { buzz } from "@/tcg/ui/feedback";
import { useBottomChromeHeight, useFillScreenHeight } from "@/tcg/ui/useBottomChrome";
import { packCardsLabel, packExtraLabel, totalCardsInPack } from "@/tcg/pack-display";
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
/** The smaller buttons in the dark dock under the pack fan. */
const dockBtn =
  "gx-tap inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900 px-2 text-center text-xs font-bold text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-50";
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
  showWalletBar = true,
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
  /** The slim sticky wallet line. Off on the game-only app, where the page header already shows these balances. */
  showWalletBar?: boolean;
}) {
  const toast = useToast();
  /** How tall the bars fixed to the bottom of a phone screen are, so the docked pack fan sits just above them. */
  const chromeHeight = useBottomChromeHeight();
  /** The shop is one screen: it is as tall as what is left under the page header, above the bottom bars. */
  const stageRef = useRef<HTMLElement>(null);
  const stageHeight = useFillScreenHeight(stageRef, chromeHeight + 8);
  // The summary needs about 150px, and the buttons plus the dock's padding about 124px. The fan gets what is left: it grows on a
  // tall screen and shrinks on a short one, so the summary stays readable without scrolling.
  const fanScale = stageHeight ? Math.min(1.8, Math.max(0.6, (stageHeight - 150 - 8 - 124) / 168)) : 1;
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
    /** The pack that was opened, so the reveal can offer to open another one. Not set for a dev preview. */
    pack: TcgCustomPackWithCards | null;
    /** Set for an admin's dev preview: the cards are not kept, and the pack that was previewed. */
    preview?: { packId: string };
  } | null>(null);
  /** The pack an admin is rolling a dev preview of, so its button shows it is busy. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  /** Dev preview option: make sure the pack gives a Legend car card, to try the Legend reveal. Shared by every pack. */
  const [guaranteeLegend, setGuaranteeLegend] = useState(false);

  const standardOnSale = isOnSale(standardPackPrice, standardPackSalePrice);
  const effectiveStandardPrice = getEffectivePrice(standardPackPrice, standardPackSalePrice);
  const standardDiscountPct = getSaleDiscountPct(standardPackPrice, standardPackSalePrice);

  /** Which pack is raised in the middle of the fan. Falls back to the first pack if the chosen one is gone (the list refreshed). */
  const [selectedId, setSelectedId] = useState<string>(customPacks[0]?.id ?? STANDARD_ID);
  const activeId = selectedId === STANDARD_ID || customPacks.some((p) => p.id === selectedId) ? selectedId : (customPacks[0]?.id ?? STANDARD_ID);
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
      })
    ),
    {
      id: STANDARD_ID,
      name: "Standard Pack",
      variant: "standard",
      cardsLabel: "4 CARDS",
      extraLabel: "+ RARE CHANCE",
      discountPct: standardOnSale ? standardDiscountPct : 0,
    },
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

  return (
    <div className="space-y-2 sm:space-y-4">
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

      {/*
        The pack shop as one game screen: what's in the selected pack fills the space at the top (and scrolls inside itself only
        on a very short screen), while the fan of packs and the buy buttons are docked together at the bottom, just above the
        app's bottom bars. The page itself never has to scroll to reach another pack.
      */}
      <section
        ref={stageRef}
        aria-label="Packs"
        style={stageHeight ? { height: stageHeight } : undefined}
        className="flex min-h-[22rem] flex-col gap-2"
      >
        <div aria-live="polite" className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
          {activePack ? (
            <PackSummary onSale={isOnSale(activePack.price, activePack.salePrice)}>
              <TitleAndPrice
                name={activePack.name}
                price={activePack.price}
                effectivePrice={getEffectivePrice(activePack.price, activePack.salePrice)}
                onSale={isOnSale(activePack.price, activePack.salePrice)}
              />
              {/* Only what the pack really gives. The bonus is just a chance, so it says "Bonus card" and no percentage. */}
              <ul className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${3 + (activePack.bonus ? 1 : 0)}, minmax(0, 1fr))` }}>
                <ContentStat icon="🏎️" value={activePack.cardsPerPack} label={activePack.cardsPerPack === 1 ? "Card" : "Cards"} />
                <ContentStat icon="👥" value={activePack.extraCards?.crew ?? 0} label="Crew" />
                <ContentStat icon="🔧" value={activePack.extraCards?.repair ?? 0} label="Repair kit" />
                {activePack.bonus && <ContentStat icon="★" value="Bonus" label="Card" accent />}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                {isOnSale(activePack.price, activePack.salePrice) && (
                  <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white">
                    🔥 -{getSaleDiscountPct(activePack.price, activePack.salePrice)}% sale
                  </span>
                )}
                {activePack.purchasable === false && (
                  <span className="rounded-full border border-zinc-400/60 bg-zinc-500/10 px-2.5 py-0.5 text-[11px] font-black text-zinc-700 dark:text-zinc-200">
                    Not available right now
                  </span>
                )}
                {activePack.needsGeneration && (
                  <span className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    Pick a car when you open it
                  </span>
                )}
                <button type="button" onClick={() => setInspectPack(activePack)} className="ml-auto rounded-lg px-2 py-1 text-xs font-black text-amber-600 hover:bg-amber-500/10 dark:text-amber-400">
                  See pack list →
                </button>
              </div>
              {activePack.setList.length > 0 && (
                <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Cards in the set">
                  {activePack.setList.slice(0, 8).map(({ card }) => (
                    <li key={card.id} className="w-12 shrink-0 sm:w-16">
                      <FullArtCard card={card} className="drop-shadow-md" />
                    </li>
                  ))}
                  {activePack.setList.length > 8 && (
                    <li className="flex w-12 shrink-0 items-center justify-center text-xs font-black text-zinc-500 dark:text-zinc-400 sm:w-16">
                      +{activePack.setList.length - 8}
                    </li>
                  )}
                </ul>
              )}
              {activePack.description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{activePack.description}</p>}
            </PackSummary>
          ) : (
            <PackSummary onSale={standardOnSale}>
              <TitleAndPrice name="Standard Pack" price={standardPackPrice} effectivePrice={effectiveStandardPrice} onSale={standardOnSale} />
              <ul className="grid grid-cols-4 gap-1.5">
                <ContentStat icon="🏎️" value={2} label="Car cards" />
                <ContentStat icon="👥" value={1} label="Crew" />
                <ContentStat icon="🔧" value={1} label="Repair kit" />
                <ContentStat icon="★" value="Bonus" label="Card" accent />
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                {standardOnSale && (
                  <span className="rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase text-white">
                    🔥 -{standardDiscountPct}% sale
                  </span>
                )}
                {standardAllowsCardCredits && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-300">
                    You have {packCredits} unopened
                  </span>
                )}
                <button type="button" onClick={() => setShowStandardContents(true)} className="ml-auto rounded-lg px-2 py-1 text-xs font-black text-amber-600 hover:bg-amber-500/10 dark:text-amber-400">
                  See pack list →
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                1 custom AI card of your car and 1 community car card, 1 Tactical Crew Card for Clash Arena, 1 Repair Kit, and a chance at a rare
                bonus set card.
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
        </div>

        {/* Docked at the bottom: the fan of packs, then what you can do with the selected one */}
        <div className="shrink-0 space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
          <PackCarousel packs={carouselPacks} selectedId={activeId} onSelect={setSelectedId} scale={fanScale} />
          {(() => {
            // The main button first, then up to two smaller ones beside each other.
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
                  <button type="button" disabled className={buyBtn}>
                    Not available right now
                  </button>
                );
              } else if (pack.needsGeneration) {
                main = canAfford ? (
                  <Link href={`/cards/new?pack=${pack.id}`} className={buyBtn}>
                    Choose car &amp; open · {effectivePrice.toLocaleString()} P
                  </Link>
                ) : (
                  <button type="button" disabled className={buyBtn}>
                    Need {effectivePrice.toLocaleString()} P
                  </button>
                );
              } else {
                main = (
                  <button type="button" onClick={() => handleBuyCustomPack(pack)} disabled={pending || !canAfford} className={buyBtn}>
                    {isBuying(pack.id) ? (
                      "Opening…"
                    ) : canAfford ? (
                      packOnSale ? (
                        <span>
                          Buy &amp; Open · <span className="line-through opacity-60">{pack.price.toLocaleString()}</span>{" "}
                          {effectivePrice.toLocaleString()} P
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
                      <Link key="credit" href={`/cards/new?pack=${pack.id}`} className={dockBtn}>
                        Use a pack credit ({packCredits})
                      </Link>
                    ) : (
                      <button key="credit" type="button" disabled className={dockBtn}>
                        No pack credits
                      </button>
                    )
                  ) : (
                    <button
                      key="credit"
                      type="button"
                      onClick={() => handleBuyCustomPack(pack, "cardCredit")}
                      disabled={pending || packCredits < 1}
                      className={dockBtn}
                    >
                      {isBuying(pack.id, "cardCredit") ? "Opening…" : packCredits > 0 ? `Use a pack credit (${packCredits})` : "No pack credits"}
                    </button>
                  )
                );
              }
              if (forSale && !canAfford) {
                more.push(
                  <button key="topup" type="button" onClick={onOpenPCreditsTab} className={`${dockBtn} !border-amber-500/60 !text-amber-300`}>
                    Get {(effectivePrice - pCredits).toLocaleString()} more P
                  </button>
                );
              }
            } else {
              if (!standardAllowsCardCredits && pCredits >= effectiveStandardPrice) {
                // Paid for when it is opened: the member picks their car in the wizard, which charges the price.
                main = (
                  <Link href="/cards/new" className={buyBtn}>
                    Choose car &amp; open · {effectiveStandardPrice.toLocaleString()} P
                  </Link>
                );
              } else {
                main = (
                  <button type="button" onClick={handleBuyStandardPack} disabled={pending || pCredits < effectiveStandardPrice} className={buyBtn}>
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
                );
              }
              if (standardAllowsCardCredits && packCredits > 0) {
                more.push(
                  <Link key="open" href="/cards/new" className={dockBtn}>
                    Open a pack ({packCredits} ready) →
                  </Link>
                );
              }
              if (pCredits < effectiveStandardPrice) {
                more.push(
                  <button key="topup" type="button" onClick={onOpenPCreditsTab} className={`${dockBtn} !border-amber-500/60 !text-amber-300`}>
                    Get {(effectiveStandardPrice - pCredits).toLocaleString()} more P
                  </button>
                );
              }
            }
            return (
              <div className="space-y-2">
                {main}
                {more.length > 0 && <div className={`grid gap-2 ${more.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{more}</div>}
              </div>
            );
          })()}
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
        <span className="text-base font-black leading-tight tabular-nums">{value}</span>
      </span>
      <span className="mt-0.5 block text-[10px] font-bold leading-tight opacity-70">{label}</span>
    </li>
  );
}

/** The name, then the price on its own line (beside the name from sm: up). */
function TitleAndPrice({ name, price, effectivePrice, onSale }: { name: string; price: number; effectivePrice: number; onSale: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 sm:gap-3">
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

/** For packs that draw some cards from a car: a short note that a car is chosen when opening. */
function PackOddsNote({ pack }: { pack: TcgCustomPackWithCards }) {
  if (!pack.needsGeneration) return null;
  return (
    <p className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-300">
      Some cards are drawn from a car (yours, or community cars), so you pick a car when you open this pack.
    </p>
  );
}
