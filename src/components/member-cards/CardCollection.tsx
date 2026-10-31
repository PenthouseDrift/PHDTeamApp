"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { DeleteCardButton } from "@/components/member-cards/DeleteCardButton";
import { keepCard, rerollCard } from "@/actions/member-cards";
import {
  DEFAULT_SORT_DIRECTION,
  canRerollCard,
  rarityLabel,
  sortCards,
  type CardSortKey,
  type MemberCard,
  type SortDirection,
} from "@/lib/card-roll";
import { ART_STYLES } from "@/lib/card-maker";
import { FULL_ART_TIERS } from "@/lib/full-art-card";
import { QUICK_SELL_PRICES, getQuickSellPrice } from "@/tcg/config";
import {
  listCardOnMarket,
  quickSellCard,
  unlistCardFromMarket,
  applyMaintenanceRepairAction,
} from "@/tcg/actions";
import { isCarBroken, canRepairCarWithMaintenanceCard } from "@/lib/mechanical-faults";
import type { TcgMarketListing } from "@/tcg/types";
import { PitGarageRepairModal } from "./PitGarageRepairModal";

/**
 * "My cards": the member's collection. Sort by total power, rarity, or newest; tap a card for a
 * large view with its details. A card that was just opened can still be kept or re-rolled once from the
 * large view.
 */

const SORTS: Array<{ key: CardSortKey; label: string }> = [
  { key: "power", label: "Total Power" },
  { key: "rarity", label: "Rarity" },
  { key: "newest", label: "Newest" },
];

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

const formatDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function CardCollection({
  initialCards,
  credits,
  pCredits = 0,
  canDelete = false,
  onCardsChange,
  onPCreditsChange,
  onListingCreated,
  onListingRemoved,
}: {
  initialCards: MemberCard[];
  credits: number;
  pCredits?: number;
  /** Admins only: show a delete button in the large view. The server checks the role again. */
  canDelete?: boolean;
  onCardsChange?: (cards: MemberCard[]) => void;
  onPCreditsChange?: (nextPCredits: number) => void;
  onListingCreated?: (listing: TcgMarketListing) => void;
  onListingRemoved?: (cardId: string) => void;
}) {
  const [cards, setCards] = useState(initialCards);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<CardSortKey>("power");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [quickSellTarget, setQuickSellTarget] = useState<MemberCard | null>(null);
  const [quickSellError, setQuickSellError] = useState<string | null>(null);
  const [quickSellPending, startQuickSellTransition] = useTransition();
  const [now] = useState(() => Date.now());

  // Sync when parent passes updated cards (e.g. after buying a card on the Marketplace or opening a Custom Pack)
  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  // Lock body scroll and close on Escape while the Quick Sell modal is open
  useEffect(() => {
    if (!quickSellTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !quickSellPending) setQuickSellTarget(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [quickSellTarget, quickSellPending]);

  const filteredCards = useMemo(
    () =>
      tierFilter === "all"
        ? cards
        : tierFilter === "crew"
          ? cards.filter((c) => c.cardType === "crew" || Boolean(c.crewCardId))
          : tierFilter === "maintenance"
            ? cards.filter((c) => c.cardType === "maintenance")
            : cards.filter((c) => c.tier === tierFilter),
    [cards, tierFilter]
  );
  const sorted = useMemo(
    () => sortCards(filteredCards, sortKey, direction),
    [filteredCards, sortKey, direction]
  );
  const tally = useMemo(() => {
    const counts: Record<string, number> = {
      bronze: 0,
      silver: 0,
      gold: 0,
      legend: 0,
      mythic: 0,
      crew: 0,
      maintenance: 0,
    };
    for (const c of cards) {
      counts[c.tier] = (counts[c.tier] ?? 0) + 1;
      if (c.cardType === "crew" || c.crewCardId) counts.crew += 1;
      if (c.cardType === "maintenance") counts.maintenance += 1;
    }
    return counts;
  }, [cards]);

  const openIndex = openId ? sorted.findIndex((c) => c.id === openId) : -1;
  const openCard = openIndex >= 0 ? sorted[openIndex] : null;

  const replaceCard = (next: MemberCard) => {
    setCards((list) => {
      const updated = list.map((c) => (c.id === next.id ? next : c));
      onCardsChange?.(updated);
      return updated;
    });
  };
  const removeCard = (id: string) => {
    setCards((list) => {
      const updated = list.filter((c) => c.id !== id);
      onCardsChange?.(updated);
      return updated;
    });
    setOpenId(null);
  };

  function chooseSort(key: CardSortKey) {
    setSortKey(key);
    setDirection(DEFAULT_SORT_DIRECTION[key]);
  }

  function confirmGridQuickSell() {
    if (!quickSellTarget) return;
    const target = quickSellTarget;
    setQuickSellError(null);
    startQuickSellTransition(async () => {
      const res = await quickSellCard(target.id);
      if (res.success) {
        if (target.listedPrice) onListingRemoved?.(target.id);
        onPCreditsChange?.(res.data.pCredits);
        removeCard(target.id);
        setQuickSellTarget(null);
      } else {
        setQuickSellError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3.5">
      {/* Compact Unopened Pack Banner (only takes 1 slim row on mobile) */}
      {credits > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0" aria-hidden>
              🎟️
            </span>
            <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100 sm:text-sm">
              {credits} Unopened Pack{credits === 1 ? "" : "s"} Ready!
            </p>
          </div>
          <Link
            href="/cards/new"
            className="shrink-0 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-black text-black shadow-sm transition-colors hover:bg-amber-400"
          >
            Open Pack →
          </Link>
        </div>
      )}

      {cards.length === 0 ? (
        <section className={`${panel} space-y-3 py-10 text-center`}>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">No cards in your deck yet</h2>
          <p className="mx-auto max-w-md text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
            Check in at the track or visit the Pack Store to open a pack and forge a custom Full-Art card of your drift car.
          </p>
          <div>
            <Link href="/cards/new" className={primary}>
              {credits > 0 ? "Open your first pack" : "Forge a card"}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Compact Mobile-Friendly Filter & Sort Bar */}
          <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {/* Rarity Filter Strip (Horizontally Scrollable on Mobile) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setTierFilter("all")}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black transition-colors ${
                  tierFilter === "all"
                    ? "bg-amber-500 text-black shadow-sm"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                All ({cards.length})
              </button>
              <button
                type="button"
                onClick={() => setTierFilter(tierFilter === "crew" ? "all" : "crew")}
                className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  tierFilter === "crew"
                    ? "bg-cyan-500 text-black shadow-sm"
                    : "bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-300"
                }`}
              >
                <span>⚡ Crew</span>
                <span className="opacity-75">({tally.crew ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setTierFilter(tierFilter === "maintenance" ? "all" : "maintenance")
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                  tierFilter === "maintenance"
                    ? "bg-purple-500 text-white shadow-sm"
                    : "bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:bg-purple-500/15 dark:text-purple-300"
                }`}
              >
                <span>🛠️ Repairs</span>
                <span className="opacity-75">({tally.maintenance ?? 0})</span>
              </button>
              {[...FULL_ART_TIERS].reverse().map((t) => {
                const count = tally[t.id] ?? 0;
                const active = tierFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTierFilter(active ? "all" : t.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                      active
                        ? "bg-amber-500 text-black shadow-sm"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full border border-black/20"
                      style={{
                        background:
                          t.id === "legend"
                            ? "conic-gradient(#7df9ff, #a78bfa, #ff7ad9, #ffd75e, #7df9ff)"
                            : t.id === "mythic"
                              ? "linear-gradient(135deg, #fb7185, #e11d48 55%, #4c0519)"
                              : `linear-gradient(135deg, ${t.palette.light}, ${t.palette.accent} 55%, ${t.palette.dark})`,
                      }}
                    />
                    <span>{t.label}</span>
                    <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Sort Strip */}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <div
                className="flex items-center gap-1 overflow-x-auto no-scrollbar"
                role="group"
                aria-label="Sort cards by"
              >
                <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Sort:
                </span>
                {SORTS.map((s) => {
                  const active = sortKey === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => chooseSort(s.key)}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        active
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}
                aria-label={`Sort order: ${direction === "asc" ? "ascending" : "descending"}. Tap to reverse.`}
                className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-black text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {direction === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-label="Your cards">
            {sorted.map((c) => {
              const payout = getQuickSellPrice(c);
              const broken = isCarBroken(c);
              return (
                <li key={c.id} className="space-y-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenId(c.id)}
                      className="block w-full rounded-2xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
                      aria-label={`View ${c.name}, ${rarityLabel(c.tier)} card`}
                    >
                      <FullArtCard card={c} className="drop-shadow-lg" />
                    </button>
                    {c.listedPrice ? (
                      <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-amber-300 bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-black shadow-md">
                        Listed · {c.listedPrice.toLocaleString()} P
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSellError(null);
                        setQuickSellTarget(c);
                      }}
                      className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-extrabold text-zinc-800 shadow-sm transition-colors hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-500/60 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
                    >
                      <span>Quick sell</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black ${
                        broken
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}>
                        +{payout} P
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {quickSellTarget &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center overscroll-contain sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-sell-dialog-title"
          >
            {/* Full-viewport backdrop */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => {
                if (!quickSellPending) setQuickSellTarget(null);
              }}
              aria-hidden="true"
            />

            {/* Full-screen overlay on mobile, centered window modal on sm+ */}
            <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto bg-zinc-950 p-6 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm: justify-start sm:space-y-5 sm:rounded-3xl sm:border sm:border-amber-500/30">
              <div className="flex items-center justify-between sm:hidden">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  Quick Sell Card
                </span>
                <button
                  type="button"
                  onClick={() => setQuickSellTarget(null)}
                  disabled={quickSellPending}
                  className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-300"
                >
                  Close
                </button>
              </div>

              <div className="my-auto space-y-5 sm:my-0">
                <div className="mx-auto w-48 sm:w-44">
                  <FullArtCard card={quickSellTarget} className="drop-shadow-2xl" />
                </div>

                <div className="space-y-2 text-center">
                  <h3 id="quick-sell-dialog-title" className="text-xl font-black sm:text-lg">
                    Quick sell &ldquo;{quickSellTarget.name}&rdquo;?
                  </h3>
                  <p className="mx-auto max-w-xs text-xs leading-relaxed text-zinc-400">
                    You will receive{" "}
                    <strong className="text-amber-400">
                      +{getQuickSellPrice(quickSellTarget)} P-Credits
                    </strong>{" "}
                    instantly. This permanently deletes the card from your collection.
                  </p>
                  {isCarBroken(quickSellTarget) && (
                    <p className="mt-2 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-2.5 py-1.5">
                      ⚠️ Reduced payout ({getQuickSellPrice(quickSellTarget)} P) because this car needs repair.
                    </p>
                  )}
                </div>

                {quickSellError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs font-semibold text-red-400"
                  >
                    {quickSellError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4 sm:pt-1">
                <button
                  type="button"
                  onClick={() => setQuickSellTarget(null)}
                  disabled={quickSellPending}
                  className="min-h-12 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmGridQuickSell}
                  disabled={quickSellPending}
                  className="min-h-12 flex-1 rounded-xl bg-amber-500 px-4 text-xs font-black text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  {quickSellPending
                    ? "Selling…"
                    : `Confirm (+${getQuickSellPrice(quickSellTarget)} P)`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <CardViewer
        card={openCard}
        allCards={cards}
        index={openIndex}
        total={sorted.length}
        now={now}
        pCredits={pCredits}
        onClose={() => setOpenId(null)}
        onMove={(step) => {
          const next = sorted[openIndex + step];
          if (next) setOpenId(next.id);
        }}
        onChange={replaceCard}
        canDelete={canDelete}
        onDeleted={removeCard}
        onRepairApplied={(repairedCar, usedKitId) => {
          setCards((list) => {
            const updated = list
              .filter((c) => c.id !== usedKitId)
              .map((c) => (c.id === repairedCar.id ? repairedCar : c));
            onCardsChange?.(updated);
            return updated;
          });
        }}
        onPCreditsChange={onPCreditsChange}
        onListingCreated={onListingCreated}
        onListingRemoved={onListingRemoved}
      />
    </div>
  );
}

/** The large view of one card, in a native dialog (focus is kept inside it and Escape closes it). */
function CardViewer({
  card,
  allCards = [],
  index,
  total,
  now,
  onClose,
  onMove,
  onChange,
  canDelete,
  onDeleted,
  onRepairApplied,
  onPCreditsChange,
  onListingCreated,
  onListingRemoved,
}: {
  card: MemberCard | null;
  allCards?: MemberCard[];
  index: number;
  total: number;
  now: number;
  pCredits?: number;
  onClose: () => void;
  onMove: (step: -1 | 1) => void;
  onChange: (card: MemberCard) => void;
  canDelete: boolean;
  onDeleted: (id: string) => void;
  onRepairApplied?: (car: MemberCard, usedKitId: string) => void;
  onPCreditsChange?: (nextPCredits: number) => void;
  onListingCreated?: (listing: TcgMarketListing) => void;
  onListingRemoved?: (cardId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmQuickSell, setConfirmQuickSell] = useState(false);
  const [listPriceText, setListPriceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [repairPending, setRepairPending] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const [shownId, setShownId] = useState<string | null>(null);

  const matchingConsumables = useMemo(() => {
    if (!card || !isCarBroken(card)) return [];
    return allCards.filter((m) => canRepairCarWithMaintenanceCard(card, m));
  }, [card, allCards]);

  const faultedCarsMatchingThisKit = useMemo(() => {
    if (!card || card.cardType !== "maintenance") return [];
    return allCards.filter((c) => canRepairCarWithMaintenanceCard(c, card));
  }, [card, allCards]);

  async function handleApplyRepair(carId: string, kitId: string) {
    setRepairPending(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await applyMaintenanceRepairAction({
        carCardId: carId,
        maintenanceCardId: kitId,
      });
      if (res.success) {
        setStatusMessage(
          res.data.fullyRepaired
            ? `✅ Car fully repaired! Restored to full battle-ready status.`
            : `✅ Maintenance applied! Cooldown reduced to ${res.data.car.fault?.battlesRemaining} battle(s).`
        );
        onRepairApplied?.(res.data.car, kitId);
        if (card?.id === carId) {
          onChange(res.data.car);
        } else if (card?.id === kitId) {
          onDeleted(kitId);
        }
      } else {
        setError(res.error || "Repair failed");
      }
    } catch {
      setError("Failed to apply repair");
    } finally {
      setRepairPending(false);
    }
  }

  // A different card starts without a half-finished re-roll prompt or an old error.
  if ((card?.id ?? null) !== shownId) {
    setShownId(card?.id ?? null);
    setConfirm(false);
    setConfirmQuickSell(false);
    setShowRepairModal(false);
    setError(null);
    setStatusMessage(null);
    setListPriceText(card ? String(getQuickSellPrice(card) * 2) : "");
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (card && !dialog.open) dialog.showModal();
    if (!card && dialog.open) dialog.close();
  }, [card]);

  // Arrow keys step through the cards.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onMove(-1);
      if (e.key === "ArrowRight") onMove(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onMove]);

  const styles = card ? card.styleIds.map((id) => ART_STYLES.find((s) => s.id === id)?.label).filter(Boolean) : [];
  const pendingChoice = card ? canRerollCard(card, now) : false;

  function keep() {
    if (!card) return;
    startTransition(async () => {
      const res = await keepCard(card.id);
      if (res.success) onChange(res.data.card);
      else setError(res.error);
    });
  }

  function reroll() {
    if (!card) return;
    setConfirm(false);
    setError(null);
    startTransition(async () => {
      const res = await rerollCard(card.id);
      if (res.success) onChange(res.data.card);
      else setError(res.error);
    });
  }

  function handleQuickSell() {
    if (!card) return;
    setError(null);
    setStatusMessage(null);
    startTransition(async () => {
      const res = await quickSellCard(card.id);
      if (res.success) {
        if (card.listedPrice) onListingRemoved?.(card.id);
        onPCreditsChange?.(res.data.pCredits);
        onDeleted(card.id);
      } else {
        setError(res.error);
      }
    });
  }

  function handleListForSale() {
    if (!card) return;
    setError(null);
    setStatusMessage(null);
    const price = Math.round(Number(listPriceText));
    startTransition(async () => {
      const res = await listCardOnMarket(card.id, price);
      if (res.success) {
        onChange(res.data.card);
        onListingCreated?.(res.data.listing);
        setStatusMessage(`Listed on the Marketplace for ${res.data.listing.price.toLocaleString()} P-Credits.`);
      } else {
        setError(res.error);
      }
    });
  }

  function handleUnlist() {
    if (!card) return;
    setError(null);
    setStatusMessage(null);
    startTransition(async () => {
      const res = await unlistCardFromMarket(card.id);
      if (res.success) {
        const updatedCard: MemberCard = res.data.card ?? { ...card, listingId: undefined, listedPrice: undefined };
        onChange(updatedCard);
        onListingRemoved?.(card.id);
        setStatusMessage("Removed from the Marketplace.");
      } else {
        setError(res.error);
      }
    });
  }

  const quickSellPayout = card ? getQuickSellPrice(card) : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="card-viewer-title"
      className="fixed inset-0 m-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none border-0 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:w-[min(60rem,94vw)] sm:rounded-3xl sm:border sm:border-amber-500/30"
    >
      {card &&
        (showRepairModal && isCarBroken(card) ? (
          <PitGarageRepairModal
            car={card}
            allCards={allCards}
            onBack={() => setShowRepairModal(false)}
            onClose={() => {
              setShowRepairModal(false);
              onClose();
            }}
            onRepairSuccess={(updatedCar, usedKitId) => {
              setStatusMessage(
                !updatedCar.fault
                  ? "✅ Car fully repaired! Restored to full battle-ready status."
                  : `✅ Maintenance applied! Cooldown reduced to ${updatedCar.fault.battlesRemaining} battle(s).`
              );
              onRepairApplied?.(updatedCar, usedKitId);
              onChange(updatedCar);
              setShowRepairModal(false);
            }}
          />
        ) : (
          <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="mx-auto w-full max-w-[22rem]">
            <FullArtCard card={card} className="drop-shadow-2xl" />
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">{rarityLabel(card.tier)} card</p>
                <h2 id="card-viewer-title" className="text-2xl font-black">
                  {card.name}
                </h2>
              </div>
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800">
                Close
              </button>
            </div>

            {card.cardType === "maintenance" ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="font-bold text-zinc-400">Card Type</dt>
                <dd className="font-bold text-purple-400">🛠️ Pit Garage Maintenance Consumable</dd>
                <dt className="font-bold text-zinc-400">Target Fault</dt>
                <dd className="font-bold text-amber-300">{card.team || "Mechanical Fault"}</dd>
                <dt className="font-bold text-zinc-400">Repair Power</dt>
                <dd className="font-bold text-emerald-400">
                  {(card.repairBattles ?? 0) >= 5
                    ? "Instant Full Repair (Clears Fault)"
                    : `-${card.repairBattles ?? 1} Battles from Cooldown`}
                </dd>
                <dt className="font-bold text-zinc-400">Effect</dt>
                <dd className="leading-relaxed text-zinc-200">{card.effect || "—"}</dd>
                <dt className="font-bold text-zinc-400">Opened</dt>
                <dd>{formatDate(card.createdAt)}</dd>
              </dl>
            ) : card.cardType === "crew" || card.crewCardId ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="font-bold text-zinc-400">Card Type</dt>
                <dd className="font-bold text-cyan-300">⚡ Tactical Crew Modifier (Clash Slot 4)</dd>
                <dt className="font-bold text-zinc-400">Category</dt>
                <dd>{card.driver || "Pit Crew"}</dd>
                <dt className="font-bold text-zinc-400">Crew Set</dt>
                <dd>{card.team || "Crew Set"}</dd>
                <dt className="font-bold text-zinc-400">Trigger</dt>
                <dd className="font-semibold text-amber-300">{card.ability || "—"}</dd>
                <dt className="font-bold text-zinc-400">Track Effect</dt>
                <dd className="leading-relaxed text-zinc-200">{card.effect || "—"}</dd>
                <dt className="font-bold text-zinc-400">Opened</dt>
                <dd>{formatDate(card.createdAt)}</dd>
                {card.packName ? (
                  <>
                    <dt className="font-bold text-zinc-400">Pack</dt>
                    <dd className="text-amber-300 font-semibold">{card.packName}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="font-bold text-zinc-400">Driver</dt>
                <dd>{card.driver || "—"}</dd>
                <dt className="font-bold text-zinc-400">Team</dt>
                <dd>{card.team || "—"}</dd>
                <dt className="font-bold text-zinc-400">Chassis</dt>
                <dd>{card.ability?.trim() || (card as { chassis?: string }).chassis?.trim() || card.name || "—"}</dd>
                <dt className="font-bold text-zinc-400">Durability</dt>
                <dd>
                  {card.fault && card.fault.battlesRemaining > 0 ? (
                    <span className="font-bold text-rose-400">
                      ⚠️ {card.fault.name} · Sits out {card.fault.battlesRemaining} battle(s)
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-400">
                      🔋 {card.battlesRemaining ?? card.maxBattles ?? 6} / {card.maxBattles ?? 6} Battles Ready
                    </span>
                  )}
                </dd>
                <dt className="font-bold text-zinc-400">About</dt>
                <dd>{card.effect || "—"}</dd>
                <dt className="font-bold text-zinc-400">Art style</dt>
                <dd>{styles.length > 0 ? styles.join(" + ") : "Tier default"}</dd>
                <dt className="font-bold text-zinc-400">Opened</dt>
                <dd>{formatDate(card.createdAt)}</dd>
                {card.packName ? (
                  <>
                    <dt className="font-bold text-zinc-400">Pack</dt>
                    <dd className="text-amber-300 font-semibold">{card.packName}</dd>
                  </>
                ) : null}
              </dl>
            )}

            {/* Repair Controls for a Broken Car */}
            {isCarBroken(card) && (
              <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-zinc-950 to-black p-4 space-y-3 shadow-lg">
                <div className="flex items-center gap-3 text-rose-300">
                  <span className="text-3xl shrink-0 animate-pulse">⚠️</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-black text-sm text-white uppercase tracking-wider">
                        Mechanical Breakdown
                      </h4>
                      <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-300 shrink-0">
                        Sits out {card.fault?.battlesRemaining} battle(s)
                      </span>
                    </div>
                    <p className="text-xs text-rose-200/90 leading-relaxed mt-0.5">
                      {card.fault?.name} — Must sit out {card.fault?.battlesRemaining} battle(s) in maintenance, or use a matching repair kit from your Pit Garage.
                    </p>
                  </div>
                </div>

                {/* Single Prominent Repair Button */}
                <button
                  type="button"
                  onClick={() => setShowRepairModal(true)}
                  className="w-full min-h-12 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 px-5 py-3 text-sm font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <span>🔧</span>
                  <span>Repair In Pit Garage</span>
                  {matchingConsumables.length > 0 ? (
                    <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs text-black font-black">
                      {matchingConsumables.length} Available
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-950/80 border border-rose-500/40 px-2.5 py-0.5 text-[10px] text-rose-200 font-bold">
                      0 Kits
                    </span>
                  )}
                  <span className="text-base font-black">→</span>
                </button>
              </div>
            )}

            {/* Repair Controls for a Maintenance Consumable Card */}
            {card.cardType === "maintenance" && (
              <div className="rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-purple-300">
                  <span className="text-2xl">🛠️</span>
                  <div>
                    <h4 className="font-black text-sm text-white">Apply to Broken RC Drift Car</h4>
                    <p className="text-xs text-purple-200/90 leading-relaxed">
                      Use this consumable to repair a car with an active {card.team || "matching"} fault.
                    </p>
                  </div>
                </div>
                {faultedCarsMatchingThisKit.length > 0 ? (
                  <div className="space-y-1.5 pt-1 border-t border-purple-500/20">
                    {faultedCarsMatchingThisKit.map((car) => (
                      <div
                        key={car.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 border border-zinc-700 p-2.5"
                      >
                        <div>
                          <span className="font-black text-xs text-white block">{car.name}</span>
                          <span className="text-[11px] text-rose-400">
                            {car.fault?.name} · Sits out {car.fault?.battlesRemaining} battle(s)
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={repairPending}
                          onClick={() => handleApplyRepair(car.id, card.id)}
                          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black uppercase text-black hover:bg-emerald-400 disabled:opacity-50"
                        >
                          {repairPending ? "..." : "Repair This Car"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic pt-1 border-t border-purple-500/20">
                    None of your cars currently have an active {card.team || "matching"} fault. Keep this kit in your pit inventory until needed!
                  </p>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
                {error}
              </p>
            )}

            {statusMessage && (
              <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-300">
                {statusMessage}
              </p>
            )}

            {/* TCG Trading & Quick Sell Controls */}
            <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Sell or Trade Card
                </p>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                  Quick Sell: {quickSellPayout} P-Credits
                </span>
              </div>

              {card.listedPrice ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div>
                    <p className="text-xs font-bold text-amber-300">
                      Listed on Marketplace for {card.listedPrice.toLocaleString()} P-Credits
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Another member can buy this card at your asking price.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnlist}
                    disabled={pending}
                    className="min-h-10 rounded-xl border border-amber-400/50 bg-zinc-900 px-3.5 text-xs font-bold text-amber-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Unlist card
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="market-price-input" className="block text-xs font-semibold text-zinc-300">
                    List on Marketplace (set your price in P-Credits)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[9rem]">
                      <input
                        id="market-price-input"
                        type="number"
                        min={5}
                        max={100000}
                        step={5}
                        value={listPriceText}
                        onChange={(e) => setListPriceText(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 pr-20 text-sm font-bold text-zinc-100 focus:border-amber-500 focus:outline-none"
                        placeholder="Price"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">
                        P-Credits
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleListForSale}
                      disabled={pending}
                      className={primary}
                    >
                      List for sale
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Sell section */}
              <div className="border-t border-zinc-800 pt-3">
                {confirmQuickSell ? (
                  <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-xs font-bold text-red-200">
                      Quick sell this {rarityLabel(card.tier)} card for {quickSellPayout} P-Credits?
                    </p>
                    {isCarBroken(card) && (
                      <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                        ⚠️ Reduced payout ({quickSellPayout} P) because this car needs repair.
                      </p>
                    )}
                    <p className="text-[11px] text-red-300/90">
                      This permanently deletes the card from your collection and immediately credits {quickSellPayout} P-Credits to your balance.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleQuickSell}
                        disabled={pending}
                        className="min-h-10 rounded-xl bg-red-600 px-3.5 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {pending ? "Selling…" : `Confirm Quick Sell (+${quickSellPayout} P-Credits)`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmQuickSell(false)}
                        disabled={pending}
                        className="min-h-10 rounded-xl border border-zinc-700 px-3.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-zinc-400">
                      Don&apos;t want to wait for a buyer? Instant payout ({rarityLabel(card.tier)} = {quickSellPayout} P-Credits).
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmQuickSell(true)}
                      disabled={pending}
                      className="min-h-10 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 text-xs font-extrabold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      Quick Sell (+{quickSellPayout} P-Credits)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {pendingChoice && (
              <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-sm font-bold">
                  This card is new. Keep it, or re-roll it once. A re-roll replaces it with a brand new card, rarity included.
                </p>
                {confirm ? (
                  <div className="space-y-2">
                    <p className="text-sm">You will lose this {rarityLabel(card.tier)} card. This can only be done once.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={primary} onClick={reroll} disabled={pending}>
                        Yes, re-roll it
                      </button>
                      <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800" onClick={() => setConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primary} onClick={keep} disabled={pending}>
                      Keep this card
                    </button>
                    <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800" onClick={() => setConfirm(true)} disabled={pending}>
                      Re-roll once
                    </button>
                  </div>
                )}
                {pending && <p role="status" className="text-xs text-zinc-300">Working on it… this can take up to a minute.</p>}
              </div>
            )}

            {canDelete && <DeleteCardButton key={card.id} cardId={card.id} onDeleted={onDeleted} />}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40" onClick={() => onMove(-1)} disabled={index <= 0}>
                ← Previous
              </button>
              <span className="text-xs text-zinc-400">
                {index + 1} of {total}
              </span>
              <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40" onClick={() => onMove(1)} disabled={index >= total - 1}>
                Next →
              </button>
            </div>
          </div>
        </div>
      ))}
    </dialog>
  );
}
