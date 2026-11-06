"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { DeleteCardButton } from "@/components/member-cards/DeleteCardButton";
import { keepCard, rerollCard } from "@/actions/member-cards";
import {
  CARD_TYPE_FILTERS,
  DEFAULT_SORT_DIRECTION,
  canRerollCard,
  cardKind,
  rarityLabel,
  sortCards,
  type CardSortKey,
  type CardTypeFilter,
  type MemberCard,
  type SortDirection,
} from "@/lib/card-roll";
import { ART_STYLES } from "@/lib/card-maker";
import { FULL_ART_TIERS, type FullArtTierInfo } from "@/lib/full-art-card";
import { getQuickSellPrice } from "@/tcg/config";
import {
  listCardOnMarket,
  quickSellCard,
  unlistCardFromMarket,
  applyMaintenanceRepairAction,
} from "@/tcg/actions";
import { isCarBroken, canRepairCarWithMaintenanceCard } from "@/lib/mechanical-faults";
import type { TcgMarketListing } from "@/tcg/types";
import { BottomSheet, sheetDanger, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { ProgressiveList } from "@/tcg/ui/ProgressiveList";
import { BusyOverlay, LoadingNote, Spinner } from "@/tcg/ui/Shimmer";
import { useToast } from "@/tcg/ui/Toast";
import { buzz } from "@/tcg/ui/feedback";
import { useIsPhone } from "@/tcg/ui/useBottomChrome";
import { PitGarageRepairModal } from "./PitGarageRepairModal";

/**
 * "My cards": the member's collection. Search, filter and sort it from one bar that stays under the app header, tap a
 * card for a large view with its details. A card that was just opened can still be kept or re-rolled once from the
 * large view. On a phone the large view is a full-screen viewer with Previous / Next at the top, swipe between cards,
 * and List / Quick sell pinned to the bottom.
 */

const SORTS: Array<{ key: CardSortKey; label: string }> = [
  { key: "power", label: "Total Power" },
  { key: "rarity", label: "Rarity" },
  { key: "newest", label: "Newest" },
];

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const outlineBtn =
  "gx-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-100 hover:bg-zinc-800 disabled:opacity-50";
const navBtn =
  "gx-tap inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-700 text-base font-bold text-zinc-100 hover:bg-zinc-800 disabled:opacity-30";

// Filter chips: 44px tall, 12px text.
const chipBase =
  "gx-tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition-colors";
const chipOff = "bg-zinc-800 text-zinc-200 hover:bg-zinc-700";
const chipOnAmber = "bg-amber-500 text-black shadow-sm";
const chipOnLight = "bg-zinc-100 text-zinc-900 shadow-sm";

const formatDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// ── Filters that survive switching game tabs ────────────────────────────────────────────────────────────────────────
// Kept in sessionStorage and read through useSyncExternalStore: the server (and the first client render) use the
// defaults, so hydration always matches, then the saved choices appear straight after.

const FILTERS_KEY = "gx-deck-filters";

interface DeckFilters {
  search: string;
  tier: string;
  type: CardTypeFilter;
  sort: CardSortKey;
  dir: SortDirection;
}

const DEFAULT_FILTERS: DeckFilters = { search: "", tier: "all", type: "all", sort: "power", dir: "desc" };

const filterListeners = new Set<() => void>();
let memoryFilters = "";

function readFiltersRaw(): string {
  try {
    return window.sessionStorage.getItem(FILTERS_KEY) ?? memoryFilters;
  } catch {
    return memoryFilters;
  }
}

function subscribeFilters(listener: () => void): () => void {
  filterListeners.add(listener);
  return () => {
    filterListeners.delete(listener);
  };
}

function writeFilters(next: DeckFilters): void {
  const raw = JSON.stringify(next);
  memoryFilters = raw;
  try {
    window.sessionStorage.setItem(FILTERS_KEY, raw);
  } catch {
    // Private mode or storage full: the choices still last until the page is reloaded.
  }
  filterListeners.forEach((listener) => listener());
}

function parseFilters(raw: string): DeckFilters {
  if (!raw) return DEFAULT_FILTERS;
  try {
    const data = JSON.parse(raw) as Partial<DeckFilters> | null;
    if (!data || typeof data !== "object") return DEFAULT_FILTERS;
    const sort = SORTS.some((s) => s.key === data.sort) ? (data.sort as CardSortKey) : DEFAULT_FILTERS.sort;
    return {
      search: typeof data.search === "string" ? data.search.slice(0, 80) : "",
      tier: typeof data.tier === "string" && FULL_ART_TIERS.some((t) => t.id === data.tier) ? data.tier : "all",
      type: CARD_TYPE_FILTERS.some((t) => t.id === data.type) ? (data.type as CardTypeFilter) : "all",
      sort,
      dir: data.dir === "asc" || data.dir === "desc" ? data.dir : DEFAULT_SORT_DIRECTION[sort],
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function useDeckFilters() {
  const raw = useSyncExternalStore(subscribeFilters, readFiltersRaw, () => "");
  const filters = useMemo(() => parseFilters(raw), [raw]);
  const update = useCallback((patch: Partial<DeckFilters>) => {
    writeFilters({ ...parseFilters(readFiltersRaw()), ...patch });
  }, []);
  return [filters, update] as const;
}

function tierDot(t: FullArtTierInfo): string {
  return t.id === "legend"
    ? "conic-gradient(#7df9ff, #a78bfa, #ff7ad9, #ffd75e, #7df9ff)"
    : t.id === "mythic"
      ? "linear-gradient(135deg, #fb7185, #e11d48 55%, #4c0519)"
      : `linear-gradient(135deg, ${t.palette.light}, ${t.palette.accent} 55%, ${t.palette.dark})`;
}

function RarityChip({
  tier,
  count,
  active,
  onToggle,
}: {
  tier: FullArtTierInfo;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`${chipBase} ${active ? chipOnAmber : chipOff}`}
    >
      <span aria-hidden className="h-3 w-3 rounded-full border border-black/20" style={{ background: tierDot(tier) }} />
      <span>{tier.label}</span>
      <span className="opacity-75">({count})</span>
    </button>
  );
}

// ── The collection ──────────────────────────────────────────────────────────────────────────────────────────────────

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
  const toast = useToast();
  const [cards, setCards] = useState(initialCards);
  const [prevInitialCards, setPrevInitialCards] = useState(initialCards);
  const [filters, updateFilters] = useDeckFilters();
  const { tier: tierFilter, type: typeFilter, sort: sortKey, dir: direction } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [quickSellTarget, setQuickSellTarget] = useState<MemberCard | null>(null);
  const [quickSellError, setQuickSellError] = useState<string | null>(null);
  const [quickSellPending, startQuickSellTransition] = useTransition();
  const [now] = useState(() => Date.now());

  // Sync when parent passes updated cards (e.g. after buying a card on the Marketplace or opening a Custom Pack)
  if (prevInitialCards !== initialCards) {
    setPrevInitialCards(initialCards);
    setCards(initialCards);
  }

  // The list follows the search box a moment behind, so typing stays instant while a long grid catches up.
  const search = useDeferredValue(filters.search).trim().toLowerCase();

  const filteredCards = useMemo(
    () =>
      cards.filter((c) => {
        if (typeFilter !== "all" && cardKind(c) !== typeFilter) return false;
        if (tierFilter !== "all" && c.tier !== tierFilter) return false;
        if (search) {
          const haystack = `${c.name} ${c.driver ?? ""} ${c.team ?? ""} ${c.ability ?? ""}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      }),
    [cards, tierFilter, typeFilter, search]
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
    };
    for (const c of cards) {
      counts[c.tier] = (counts[c.tier] ?? 0) + 1;
    }
    return counts;
  }, [cards]);
  const typeTally = useMemo(() => {
    const counts: Record<CardTypeFilter, number> = { all: cards.length, car: 0, crew: 0, repair: 0 };
    for (const c of cards) {
      const kind = cardKind(c);
      if (kind !== "other") counts[kind] += 1;
    }
    return counts;
  }, [cards]);

  const rarityChips = useMemo(() => [...FULL_ART_TIERS].reverse(), []);
  const isFiltered = filters.search.trim() !== "" || tierFilter !== "all" || typeFilter !== "all";
  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (tierFilter !== "all" ? 1 : 0) +
    (sortKey !== DEFAULT_FILTERS.sort || direction !== DEFAULT_FILTERS.dir ? 1 : 0);
  const gridResetKey = `${tierFilter}|${typeFilter}|${sortKey}|${direction}|${search}`;

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
    updateFilters({ sort: key, dir: DEFAULT_SORT_DIRECTION[key] });
  }

  function clearFilters() {
    updateFilters({ search: "", tier: "all", type: "all" });
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
        buzz(15);
        toast(`Sold ${target.name} for +${getQuickSellPrice(target)} P`, "success");
      } else {
        setQuickSellError(res.error);
        toast(res.error, "error");
      }
    });
  }

  const openTile = useCallback((id: string) => setOpenId(id), []);
  const askQuickSell = useCallback((card: MemberCard) => {
    setQuickSellError(null);
    setQuickSellTarget(card);
  }, []);

  return (
    <div className="space-y-3.5">
      {/* Compact Unopened Pack Banner (only takes 1 slim row on mobile) */}
      {credits > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 px-3.5 py-2 shadow-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 text-lg" aria-hidden>
              🎟️
            </span>
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100 sm:text-sm">
              {credits} Unopened Pack{credits === 1 ? "" : "s"} Ready!
            </p>
          </div>
          <Link
            href="/cards/new"
            className="gx-tap inline-flex min-h-11 shrink-0 items-center rounded-xl bg-amber-500 px-4 text-xs font-black text-black shadow-sm transition-colors hover:bg-amber-400"
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
            <Link href="/cards/new" className={`${primary} min-h-12`}>
              {credits > 0 ? "Open your first pack" : "Forge a card"}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* One control bar that stays under the app header: search, filters, and the rarity quick chips. */}
          <div className="gx-sticky-top sticky z-[35] space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500"
                >
                  🔍
                </span>
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={filters.search}
                  onChange={(e) => updateFilters({ search: e.target.value })}
                  placeholder="Search name, driver, team…"
                  aria-label="Search your cards by name, driver, team or ability"
                  className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 pl-10 pr-3 text-base font-semibold text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-haspopup="dialog"
                aria-label={
                  activeFilterCount > 0 ? `Filters and sort, ${activeFilterCount} active` : "Filters and sort"
                }
                className="gx-tap relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 text-xs font-black text-zinc-100 hover:bg-zinc-700"
              >
                <span aria-hidden>⚙️</span>
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-black"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Rarity quick chips: one scrolling row, with a fade on the right edge to show there is more. */}
            <div
              className="no-scrollbar -mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5"
              role="group"
              aria-label="Filter by rarity"
              style={{
                maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)",
                WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)",
              }}
            >
              <button
                type="button"
                aria-pressed={tierFilter === "all"}
                onClick={() => updateFilters({ tier: "all" })}
                className={`${chipBase} ${tierFilter === "all" ? chipOnAmber : chipOff}`}
              >
                All rarities
              </button>
              {rarityChips.map((t) => (
                <RarityChip
                  key={t.id}
                  tier={t}
                  count={tally[t.id] ?? 0}
                  active={tierFilter === t.id}
                  onToggle={() => updateFilters({ tier: tierFilter === t.id ? "all" : t.id })}
                />
              ))}
              <span aria-hidden className="w-6 shrink-0" />
            </div>
          </div>

          <div className="flex min-h-6 items-center justify-between gap-3 px-1">
            <p role="status" aria-live="polite" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
              Showing {sorted.length} of {cards.length} card{cards.length === 1 ? "" : "s"}
            </p>
            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="gx-tap inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-black text-amber-500 hover:bg-amber-500/10"
              >
                Clear
              </button>
            )}
          </div>

          {sorted.length === 0 ? (
            <section className="space-y-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
              <p className="text-3xl" aria-hidden>
                🃏
              </p>
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">No cards match</h2>
              <p className="mx-auto max-w-xs text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
                {search
                  ? `Nothing in your deck matches “${filters.search.trim()}” with these filters.`
                  : "Nothing in your deck matches these filters."}{" "}
                Try something broader.
              </p>
              <button type="button" onClick={clearFilters} className={`${primary} min-h-12`}>
                Clear filters
              </button>
            </section>
          ) : (
            <ProgressiveList
              items={sorted}
              getKey={(c) => c.id}
              resetKey={gridResetKey}
              batch={18}
              label="Your cards"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
              render={(c) => <DeckTile card={c} onOpen={openTile} onQuickSell={askQuickSell} />}
            />
          )}
        </>
      )}

      {filtersOpen && (
        <BottomSheet
          title="Filter & sort"
          subtitle={`${sorted.length} of ${cards.length} cards`}
          onClose={() => setFiltersOpen(false)}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                className={sheetSecondary}
                onClick={() => updateFilters(DEFAULT_FILTERS)}
                disabled={!isFiltered && activeFilterCount === 0}
              >
                Reset all
              </button>
              <button type="button" className={sheetPrimary} onClick={() => setFiltersOpen(false)}>
                Show {sorted.length} card{sorted.length === 1 ? "" : "s"}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Card type</h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by card type">
                {CARD_TYPE_FILTERS.map((t) => {
                  const active = typeFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateFilters({ type: t.id })}
                      className={`${chipBase} ${active ? chipOnLight : chipOff}`}
                    >
                      {t.icon ? <span aria-hidden>{t.icon}</span> : null}
                      <span>{t.label}</span>
                      <span className="opacity-75">({typeTally[t.id]})</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Rarity <span className="font-bold normal-case tracking-normal text-zinc-500">(tap again to clear)</span>
              </h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by rarity">
                {rarityChips.map((t) => (
                  <RarityChip
                    key={t.id}
                    tier={t}
                    count={tally[t.id] ?? 0}
                    active={tierFilter === t.id}
                    onToggle={() => updateFilters({ tier: tierFilter === t.id ? "all" : t.id })}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Sort by</h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sort cards by">
                {SORTS.map((s) => {
                  const active = sortKey === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => chooseSort(s.key)}
                      className={`${chipBase} ${active ? chipOnLight : chipOff}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateFilters({ dir: direction === "asc" ? "desc" : "asc" })}
                  aria-label={`Sort order: ${direction === "asc" ? "ascending" : "descending"}. Tap to reverse.`}
                  className={`${chipBase} border border-zinc-600 bg-zinc-900 text-zinc-100 hover:bg-zinc-800`}
                >
                  {direction === "asc" ? "↑ Asc" : "↓ Desc"}
                </button>
              </div>
            </section>
          </div>
        </BottomSheet>
      )}

      {quickSellTarget && (
        <BottomSheet
          title="Quick sell card"
          subtitle={quickSellTarget.name}
          tone="rose"
          dismissible={!quickSellPending}
          onClose={() => setQuickSellTarget(null)}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                className={sheetSecondary}
                onClick={() => setQuickSellTarget(null)}
                disabled={quickSellPending}
              >
                Cancel
              </button>
              <button type="button" className={sheetDanger} onClick={confirmGridQuickSell} disabled={quickSellPending}>
                {quickSellPending && <Spinner className="h-4 w-4" />}
                {quickSellPending ? "Selling…" : `Confirm (+${getQuickSellPrice(quickSellTarget)} P)`}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="mx-auto w-40">
              <FullArtCard card={quickSellTarget} className="drop-shadow-2xl" />
            </div>

            <div className="space-y-2 text-center">
              <h3 className="text-lg font-black">Quick sell &ldquo;{quickSellTarget.name}&rdquo;?</h3>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-zinc-400">
                You will receive{" "}
                <strong className="text-amber-400">+{getQuickSellPrice(quickSellTarget)} P-Credits</strong> instantly.
                This permanently deletes the card from your collection.
              </p>
              {isCarBroken(quickSellTarget) && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-400">
                  ⚠️ Reduced payout ({getQuickSellPrice(quickSellTarget)} P) because this car needs repair.
                </p>
              )}
              {quickSellTarget.listedPrice ? (
                <p className="text-xs font-semibold text-amber-300">
                  This card is listed on the Marketplace. Selling it removes the listing.
                </p>
              ) : null}
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
        </BottomSheet>
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
        onRequestQuickSell={askQuickSell}
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

/**
 * One card in the grid. Memoised so opening a sheet or typing in the search box does not redraw every card. A soft
 * placeholder sits behind the card while its picture loads (the card covers it completely).
 */
const DeckTile = memo(function DeckTile({
  card: c,
  onOpen,
  onQuickSell,
}: {
  card: MemberCard;
  onOpen: (id: string) => void;
  onQuickSell: (card: MemberCard) => void;
}) {
  const payout = getQuickSellPrice(c);
  const broken = isCarBroken(c);
  return (
    <div className="space-y-2">
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-[2%] rounded-2xl bg-zinc-800 motion-safe:animate-pulse"
        />
        <button
          type="button"
          onClick={() => onOpen(c.id)}
          className="relative block w-full rounded-2xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          aria-label={`View ${c.name}, ${rarityLabel(c.tier)} card${c.listedPrice ? `, listed for ${c.listedPrice.toLocaleString()} P` : ""}`}
        >
          <FullArtCard card={c} className="drop-shadow-lg" />
        </button>
      </div>
      {c.listedPrice ? (
        <p className="truncate rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-center text-[11px] font-black text-amber-600 dark:text-amber-300">
          🏷️ Listed · {c.listedPrice.toLocaleString()} P
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onQuickSell(c)}
        className="gx-tap inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs font-extrabold text-zinc-800 shadow-sm transition-colors hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-500/60 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
      >
        <span>Quick sell</span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-black ${
            broken
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          +{payout} P
        </span>
      </button>
    </div>
  );
});

type Busy = null | "keep" | "reroll" | "list" | "unlist";

/** The label/value rows of the Details list, by kind of card. */
function detailRows(card: MemberCard, styles: string[]): Array<[string, ReactNode]> {
  const opened: [string, ReactNode] = ["Opened", formatDate(card.createdAt)];
  const pack: Array<[string, ReactNode]> = card.packName
    ? [["Pack", <span key="pack" className="font-semibold text-amber-300">{card.packName}</span>]]
    : [];
  if (card.cardType === "maintenance") {
    return [
      ["Card Type", <span key="t" className="font-bold text-purple-400">🛠️ Pit Garage Maintenance Consumable</span>],
      ["Target Fault", <span key="f" className="font-bold text-amber-300">{card.team || "Mechanical Fault"}</span>],
      [
        "Repair Power",
        <span key="p" className="font-bold text-emerald-400">
          {(card.repairBattles ?? 0) >= 5
            ? "Instant Full Repair (Clears Fault)"
            : `-${card.repairBattles ?? 1} Battles from Cooldown`}
        </span>,
      ],
      ["Effect", <span key="e" className="leading-relaxed text-zinc-200">{card.effect || "—"}</span>],
      opened,
    ];
  }
  if (card.cardType === "crew" || card.crewCardId) {
    return [
      ["Card Type", <span key="t" className="font-bold text-cyan-300">⚡ Tactical Crew Modifier (Clash Slot 4)</span>],
      ["Category", card.driver || "Pit Crew"],
      ["Crew Set", card.team || "Crew Set"],
      ["Trigger", <span key="g" className="font-semibold text-amber-300">{card.ability || "—"}</span>],
      ["Track Effect", <span key="e" className="leading-relaxed text-zinc-200">{card.effect || "—"}</span>],
      opened,
      ...pack,
    ];
  }
  return [
    ["Driver", card.driver || "—"],
    ["Team", card.team || "—"],
    ["Chassis", card.ability?.trim() || (card as { chassis?: string }).chassis?.trim() || card.name || "—"],
    [
      "Durability",
      card.fault && card.fault.battlesRemaining > 0 ? (
        <span key="d" className="font-bold text-rose-400">
          ⚠️ {card.fault.name} · Sits out {card.fault.battlesRemaining} battle(s)
        </span>
      ) : (
        <span key="d" className="font-bold text-emerald-400">
          🔋 {card.battlesRemaining ?? card.maxBattles ?? 6} / {card.maxBattles ?? 6} Battles Ready
        </span>
      ),
    ],
    ["About", card.effect || "—"],
    ["Art style", styles.length > 0 ? styles.join(" + ") : "Tier default"],
    opened,
    ...pack,
  ];
}

const barBtn =
  "gx-tap inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-center text-sm font-black leading-tight disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The large view of one card. A full-screen viewer on phones (a centred window from md up). Previous / Next and Close
 * are in a header that stays at the top, swiping the card also steps through the cards, and List / Quick sell are in a
 * bar that stays at the bottom. Escape closes it, the arrow keys step through the cards.
 *
 * It is a plain fixed layer, not a native dialog, so the sheets it opens (list price, quick sell) can sit on top of it.
 */
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
  onRequestQuickSell,
  onRepairApplied,
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
  onRequestQuickSell: (card: MemberCard) => void;
  onRepairApplied?: (car: MemberCard, usedKitId: string) => void;
  onPCreditsChange?: (nextPCredits: number) => void;
  onListingCreated?: (listing: TcgMarketListing) => void;
  onListingRemoved?: (cardId: string) => void;
}) {
  const toast = useToast();
  const isPhone = useIsPhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [listPriceText, setListPriceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [repairPending, setRepairPending] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const open = card !== null;

  const matchingConsumables = useMemo(() => {
    if (!card || !isCarBroken(card)) return [];
    return allCards.filter((m) => canRepairCarWithMaintenanceCard(card, m));
  }, [card, allCards]);

  const faultedCarsMatchingThisKit = useMemo(() => {
    if (!card || card.cardType !== "maintenance") return [];
    return allCards.filter((c) => canRepairCarWithMaintenanceCard(c, card));
  }, [card, allCards]);

  // A different card starts without a half-finished re-roll prompt or an old error.
  if ((card?.id ?? null) !== shownId) {
    setShownId(card?.id ?? null);
    setConfirm(false);
    setListOpen(false);
    setShowRepairModal(false);
    setError(null);
    setStatusMessage(null);
    setListPriceText(card ? String(getQuickSellPrice(card) * 2) : "");
  }

  // Take over the screen while open: lock the page behind, move focus in, and give it back on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      // A sheet that closes in the same moment restores the page lock itself; let that finish before unlocking.
      window.setTimeout(() => {
        if (!document.querySelector('[role="dialog"][aria-modal="true"]')) document.body.style.overflow = previousOverflow;
      }, 0);
      opener?.focus?.();
    };
  }, [open]);

  // Escape closes, the arrow keys step through the cards, Tab stays inside. A sheet on top handles its own keys first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      const active = document.activeElement;
      const inside = !!panel && !!active && panel.contains(active);
      if (e.key === "Escape") {
        if (!busy) onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = !!target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing && (inside || active === document.body)) {
        onMove(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (e.key === "Tab" && panel && inside) {
        const focusable = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, onMove]);

  if (!card) return null;
  if (typeof document === "undefined") return null;

  const styles = card.styleIds.map((id) => ART_STYLES.find((s) => s.id === id)?.label).filter((l): l is string => Boolean(l));
  const pendingChoice = canRerollCard(card, now);
  const quickSellPayout = getQuickSellPrice(card);
  const working = busy !== null || repairPending;
  const listPrice = Math.round(Number(listPriceText));
  const listPriceOk = Number.isFinite(listPrice) && listPrice > 0;

  function fail(message: string) {
    setError(message);
    toast(message, "error");
  }

  /** Runs one server action: blocks a second tap, shows what is happening, and reports a network failure. */
  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setStatusMessage(null);
    try {
      await task();
    } catch {
      fail("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

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
        const message = res.data.fullyRepaired
          ? `Car fully repaired! Restored to full battle-ready status.`
          : `Maintenance applied! Cooldown reduced to ${res.data.car.fault?.battlesRemaining} battle(s).`;
        setStatusMessage(`✅ ${message}`);
        toast(message, "success");
        buzz(20);
        onRepairApplied?.(res.data.car, kitId);
        if (card?.id === carId) {
          onChange(res.data.car);
        } else if (card?.id === kitId) {
          onDeleted(kitId);
        }
      } else {
        fail(res.error || "Repair failed");
      }
    } catch {
      fail("Failed to apply repair");
    } finally {
      setRepairPending(false);
    }
  }

  function keep() {
    if (!card) return;
    const target = card;
    void run("keep", async () => {
      const res = await keepCard(target.id);
      if (res.success) {
        onChange(res.data.card);
        toast("Card kept", "success");
      } else fail(res.error);
    });
  }

  function reroll() {
    if (!card) return;
    const target = card;
    setConfirm(false);
    void run("reroll", async () => {
      const res = await rerollCard(target.id);
      if (res.success) {
        onChange(res.data.card);
        buzz(20);
        toast("Re-rolled! Here is your new card.", "success");
      } else fail(res.error);
    });
  }

  function handleListForSale() {
    if (!card || !listPriceOk) return;
    const target = card;
    void run("list", async () => {
      const res = await listCardOnMarket(target.id, listPrice);
      if (res.success) {
        onChange(res.data.card);
        onListingCreated?.(res.data.listing);
        const message = `Listed on the Marketplace for ${res.data.listing.price.toLocaleString()} P-Credits.`;
        setStatusMessage(message);
        setListOpen(false);
        buzz(15);
        toast(message, "success");
      } else fail(res.error);
    });
  }

  function handleUnlist() {
    if (!card) return;
    const target = card;
    void run("unlist", async () => {
      const res = await unlistCardFromMarket(target.id);
      if (res.success) {
        const updatedCard: MemberCard = res.data.card ?? { ...target, listingId: undefined, listedPrice: undefined };
        onChange(updatedCard);
        onListingRemoved?.(target.id);
        setStatusMessage("Removed from the Marketplace.");
        toast("Removed from the Marketplace", "success");
      } else fail(res.error);
    });
  }

  // Swipe the card left/right to step through the deck. Mostly-vertical drags are left to the page (scrolling).
  function onSwipeEnd(e: ReactTouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && index < total - 1) onMove(1);
    else if (dx > 0 && index > 0) onMove(-1);
  }

  const repairing = showRepairModal && isCarBroken(card);
  const imageWidth = { "--card-w": "min(22rem, calc(60dvh * 0.716))" } as CSSProperties;

  return createPortal(
    <div
      className="gx-backdrop fixed inset-0 z-[9990] flex items-stretch justify-center bg-black/80 backdrop-blur-sm md:items-center md:p-6"
      onClick={(e) => {
        // A click on the dim area around the window (wide screens) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={repairing ? "pit-repair-title" : "card-viewer-title"}
        tabIndex={-1}
        className="gx-sheet flex h-[100dvh] w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 outline-none md:h-auto md:max-h-[92dvh] md:max-w-[60rem] md:rounded-3xl md:border md:border-amber-500/30"
      >
        {repairing ? (
          <PitGarageRepairModal
            car={card}
            allCards={allCards}
            onBack={() => setShowRepairModal(false)}
            onClose={() => {
              setShowRepairModal(false);
              onClose();
            }}
            onRepairSuccess={(updatedCar, usedKitId) => {
              const message = !updatedCar.fault
                ? "Car fully repaired! Restored to full battle-ready status."
                : `Maintenance applied! Cooldown reduced to ${updatedCar.fault.battlesRemaining} battle(s).`;
              setStatusMessage(`✅ ${message}`);
              toast(message, "success");
              onRepairApplied?.(updatedCar, usedKitId);
              onChange(updatedCar);
              setShowRepairModal(false);
            }}
          />
        ) : (
          <>
            {/* Top bar: Close, and Previous / n of total / Next, always in reach of the thumb. */}
            <header className="gx-safe-t flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 pb-2">
              <button type="button" onClick={onClose} className={outlineBtn}>
                <span aria-hidden>✕</span>
                <span>Close</span>
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous card"
                  onClick={() => onMove(-1)}
                  disabled={index <= 0}
                  className={navBtn}
                >
                  <span aria-hidden>←</span>
                </button>
                <span
                  role="status"
                  aria-live="polite"
                  className="min-w-[4.25rem] text-center text-sm font-black tabular-nums text-zinc-200"
                >
                  {index + 1} / {total}
                </span>
                <button
                  type="button"
                  aria-label="Next card"
                  onClick={() => onMove(1)}
                  disabled={index >= total - 1}
                  className={navBtn}
                >
                  <span aria-hidden>→</span>
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-6 md:p-7">
                <div className="md:sticky md:top-0 md:self-start">
                  <div
                    key={card.id}
                    style={imageWidth}
                    className="gx-fade-up mx-auto w-full max-w-(--card-w) touch-pan-y md:max-w-[22rem]"
                    onTouchStart={(e) => {
                      swipeStart.current =
                        e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
                    }}
                    onTouchEnd={onSwipeEnd}
                    onTouchCancel={() => {
                      swipeStart.current = null;
                    }}
                  >
                    <FullArtCard card={card} className="drop-shadow-2xl" />
                  </div>
                  {total > 1 && (
                    <p className="mt-2 text-center text-xs text-zinc-500 md:hidden">Swipe the card to see the next one</p>
                  )}
                </div>

                <div className="min-w-0 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400">{rarityLabel(card.tier)} card</p>
                    <h2 id="card-viewer-title" className="text-2xl font-black leading-tight">
                      {card.name}
                    </h2>
                  </div>

                  {card.listedPrice ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-sm font-bold text-amber-300">
                        🏷️ Listed on the Marketplace for {card.listedPrice.toLocaleString()} P-Credits
                      </p>
                      <p className="text-xs text-zinc-400">Another member can buy this card at your asking price.</p>
                    </div>
                  ) : null}

                  {error && !listOpen && (
                    <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
                      {error}
                    </p>
                  )}

                  {statusMessage && (
                    <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-300">
                      {statusMessage}
                    </p>
                  )}

                  {/* Repair Controls for a Broken Car */}
                  {isCarBroken(card) && (
                    <div className="space-y-3 rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-zinc-950 to-black p-4 shadow-lg">
                      <div className="flex items-start gap-3 text-rose-300">
                        <span className="shrink-0 text-3xl motion-safe:animate-pulse" aria-hidden>
                          ⚠️
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <h4 className="text-sm font-black uppercase tracking-wider text-white">Mechanical Breakdown</h4>
                            <span className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-black text-rose-300">
                              Sits out {card.fault?.battlesRemaining} battle(s)
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-rose-200/90">
                            {card.fault?.name} — Must sit out {card.fault?.battlesRemaining} battle(s) in maintenance, or use a matching repair kit from your Pit Garage.
                          </p>
                        </div>
                      </div>

                      {/* Single Prominent Repair Button */}
                      <button
                        type="button"
                        onClick={() => setShowRepairModal(true)}
                        className="gx-tap flex min-h-12 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/25 transition-all hover:brightness-110"
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden>🔧</span>
                          <span>Repair In Pit Garage</span>
                          <span aria-hidden className="text-base font-black">→</span>
                        </span>
                        {matchingConsumables.length > 0 ? (
                          <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-black text-black">
                            {matchingConsumables.length} Available
                          </span>
                        ) : (
                          <span className="rounded-full border border-rose-500/40 bg-rose-950/80 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                            0 Kits
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Repair Controls for a Maintenance Consumable Card */}
                  {card.cardType === "maintenance" && (
                    <div className="space-y-3 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
                      <div className="flex items-center gap-2.5 text-purple-300">
                        <span className="text-2xl" aria-hidden>
                          🛠️
                        </span>
                        <div>
                          <h4 className="text-sm font-black text-white">Apply to Broken RC Drift Car</h4>
                          <p className="text-xs leading-relaxed text-purple-200/90">
                            Use this consumable to repair a car with an active {card.team || "matching"} fault.
                          </p>
                        </div>
                      </div>
                      {faultedCarsMatchingThisKit.length > 0 ? (
                        <div className="space-y-2 border-t border-purple-500/20 pt-2">
                          {faultedCarsMatchingThisKit.map((car) => (
                            <div
                              key={car.id}
                              className="flex flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                            >
                              <div className="min-w-0">
                                <span className="block text-xs font-black text-white">{car.name}</span>
                                <span className="text-xs text-rose-400">
                                  {car.fault?.name} · Sits out {car.fault?.battlesRemaining} battle(s)
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => handleApplyRepair(car.id, card.id)}
                                className="gx-tap inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-black uppercase text-black hover:bg-emerald-400 disabled:opacity-50"
                              >
                                {repairPending && <Spinner className="h-4 w-4" />}
                                {repairPending ? "Repairing…" : "Repair This Car"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="border-t border-purple-500/20 pt-2 text-xs italic text-zinc-400">
                          None of your cars currently have an active {card.team || "matching"} fault. Keep this kit in your pit inventory until needed!
                        </p>
                      )}
                    </div>
                  )}

                  {pendingChoice && (
                    <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                      <p className="text-sm font-bold">
                        This card is new. Keep it, or re-roll it once. A re-roll replaces it with a brand new card, rarity included.
                      </p>
                      {confirm ? (
                        <div className="space-y-2">
                          <p className="text-sm">You will lose this {rarityLabel(card.tier)} card. This can only be done once.</p>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button type="button" className={`${primary} min-h-12 sm:min-h-11`} onClick={reroll} disabled={working}>
                              {busy === "reroll" && <Spinner className="h-4 w-4" />}
                              {busy === "reroll" ? "Re-rolling…" : "Yes, re-roll it"}
                            </button>
                            <button type="button" className={`${outlineBtn} min-h-12 sm:min-h-11`} onClick={() => setConfirm(false)} disabled={working}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button type="button" className={`${primary} min-h-12 sm:min-h-11`} onClick={keep} disabled={working}>
                            {busy === "keep" && <Spinner className="h-4 w-4" />}
                            {busy === "keep" ? "Keeping…" : "Keep this card"}
                          </button>
                          <button type="button" className={`${outlineBtn} min-h-12 sm:min-h-11`} onClick={() => setConfirm(true)} disabled={working}>
                            Re-roll once
                          </button>
                        </div>
                      )}
                      {(busy === "keep" || busy === "reroll") && <LoadingNote text="Working on it… this can take up to a minute." />}
                    </div>
                  )}

                  {/* The long list of details stays tucked away on a phone until asked for. */}
                  <details open={isPhone ? undefined : true} className="group rounded-2xl border border-zinc-800 bg-zinc-900/60">
                    <summary className="gx-tap flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-black marker:hidden [&::-webkit-details-marker]:hidden">
                      <span>Details</span>
                      <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180 motion-reduce:transition-none">
                        ▾
                      </span>
                    </summary>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-zinc-800 px-4 py-3 text-sm">
                      {detailRows(card, styles).map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="font-bold text-zinc-400">{label}</dt>
                          <dd className="min-w-0 break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>

                  {canDelete && <DeleteCardButton key={card.id} cardId={card.id} onDeleted={onDeleted} />}
                </div>
              </div>
            </div>

            {/* Bottom bar: the two things most often wanted, always on screen. */}
            <footer className="gx-safe-b shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-3 pt-2.5 backdrop-blur">
              <div className="mx-auto flex max-w-xl gap-2">
                {card.listedPrice ? (
                  <button
                    type="button"
                    onClick={handleUnlist}
                    disabled={working}
                    className={`${barBtn} border border-amber-400/50 bg-zinc-900 text-amber-200 hover:bg-zinc-800`}
                  >
                    {busy === "unlist" && <Spinner className="h-4 w-4" />}
                    {busy === "unlist" ? "Unlisting…" : "Unlist card"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setListOpen(true);
                    }}
                    disabled={working}
                    className={`${barBtn} bg-amber-500 text-black hover:bg-amber-400`}
                  >
                    List for sale
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRequestQuickSell(card)}
                  disabled={working}
                  className={`${barBtn} border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`}
                >
                  Quick sell +{quickSellPayout} P
                </button>
              </div>
            </footer>
          </>
        )}
      </div>

      {listOpen && (
        <BottomSheet
          title="List on Marketplace"
          subtitle={card.name}
          dismissible={busy !== "list"}
          onClose={() => setListOpen(false)}
          footer={
            <div className="flex gap-2">
              <button type="button" className={sheetSecondary} onClick={() => setListOpen(false)} disabled={busy === "list"}>
                Cancel
              </button>
              <button type="button" className={sheetPrimary} onClick={handleListForSale} disabled={busy === "list" || !listPriceOk}>
                {busy === "list" && <Spinner className="h-4 w-4" />}
                {busy === "list" ? "Listing…" : listPriceOk ? `List for ${listPrice.toLocaleString()} P` : "List for sale"}
              </button>
            </div>
          }
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleListForSale();
            }}
          >
            <label htmlFor="market-price-input" className="block text-sm font-semibold text-zinc-200">
              Set your price in P-Credits
            </label>
            <div className="relative">
              <input
                id="market-price-input"
                type="number"
                inputMode="numeric"
                min={5}
                max={100000}
                step={5}
                value={listPriceText}
                onChange={(e) => setListPriceText(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 pr-24 text-base font-bold text-zinc-100 focus:border-amber-500 focus:outline-none"
                placeholder="Price"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">
                P-Credits
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Another member can buy this card at your asking price. Don&apos;t want to wait? Quick sell pays {quickSellPayout} P-Credits right away.
            </p>
            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
                {error}
              </p>
            )}
          </form>
        </BottomSheet>
      )}

      {busy === "reroll" && <BusyOverlay label="Re-rolling your card…" hint="This can take up to a minute." />}
    </div>,
    document.body
  );
}
