"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { FULL_ART_TIERS, type FullArtTier } from "@/lib/full-art-card";
import { RARITY_RANK, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyCardFromMarket, unlistCardFromMarket } from "@/tcg/actions";
import type { TcgMarketListing } from "@/tcg/types";
import { BottomSheet, sheetDanger, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { ProgressiveList } from "@/tcg/ui/ProgressiveList";
import { useToast } from "@/tcg/ui/Toast";
import { buzz } from "@/tcg/ui/feedback";

type MarketSort = "newest" | "price_asc" | "price_desc" | "rarity_desc";

interface MarketFilters {
  tier: FullArtTier | "all";
  onlyMine: boolean;
  affordable: boolean;
  sort: MarketSort;
  search: string;
}

const STORAGE_KEY = "gx-market-filters";
const DEFAULT_FILTERS: MarketFilters = { tier: "all", onlyMine: false, affordable: false, sort: "newest", search: "" };

const SORT_OPTIONS: { id: MarketSort; label: string }[] = [
  { id: "newest", label: "Newest listed" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
  { id: "rarity_desc", label: "Highest rarity" },
];

/** Reads the saved filters (kept for the browser session so they survive switching game tabs). */
function loadFilters(): MarketFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw) as Partial<MarketFilters>;
    const tierOk = p.tier === "all" || FULL_ART_TIERS.some((t) => t.id === p.tier);
    const sortOk = SORT_OPTIONS.some((s) => s.id === p.sort);
    return {
      tier: tierOk && p.tier ? p.tier : "all",
      onlyMine: p.onlyMine === true,
      affordable: p.affordable === true,
      sort: sortOk && p.sort ? p.sort : "newest",
      search: typeof p.search === "string" ? p.search.slice(0, 80) : "",
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const chipBase =
  "gx-tap inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-colors";
const chipOn = "border-amber-500 bg-amber-500 text-black";
const chipOff = "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800";

/** A small spinner that takes the button's text colour, so it shows on amber and rose buttons alike. */
function BtnSpinner() {
  return (
    <span
      aria-hidden
      className="gx-spinner inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`gx-tap flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left transition-colors ${
        checked ? "border-amber-500 bg-amber-500/10" : "border-zinc-700 bg-zinc-900"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-zinc-100">{label}</span>
        {hint && <span className="block text-xs text-zinc-400">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-amber-500" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow motion-safe:transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function TcgMarketplace({
  userId,
  pCredits,
  listings,
  onListingsChange,
  onCardPurchased,
  onCardUnlisted,
  onOpenPCreditsTab,
}: {
  userId: string;
  pCredits: number;
  listings: TcgMarketListing[];
  onListingsChange: (next: TcgMarketListing[]) => void;
  onCardPurchased: (card: MemberCard, newPCredits: number, listingId: string) => void;
  onCardUnlisted: (cardId: string, updatedCard: MemberCard | null) => void;
  onOpenPCreditsTab: () => void;
}) {
  const toast = useToast();
  const [filters, setFilters] = useState<MarketFilters>(loadFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<TcgMarketListing | null>(null);
  const [unlistTarget, setUnlistTarget] = useState<TcgMarketListing | null>(null);
  /** The last purchase / unlist error, shown inside whichever sheet is open. */
  const [sheetError, setSheetError] = useState<string | null>(null);
  /** Listing ids with a purchase or unlist in flight, so only that tile or sheet shows the busy state. */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

  // Actions finish after an await, so they must filter the list as it is then, not as it was when they started.
  const listingsRef = useRef(listings);
  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* storage unavailable (private mode); filters just won't persist */
    }
  }, [filters]);

  const patchFilters = useCallback((patch: Partial<MarketFilters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const { tier: tierFilter, onlyMine, affordable, sort } = filters;
  const deferredSearch = useDeferredValue(filters.search);

  const myCount = useMemo(() => listings.filter((l) => l.sellerId === userId).length, [listings, userId]);
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of listings) counts[l.card.tier] = (counts[l.card.tier] ?? 0) + 1;
    return counts;
  }, [listings]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return listings
      .filter((l) => {
        const mine = l.sellerId === userId;
        if (onlyMine && !mine) return false;
        if (affordable && !mine && l.price > pCredits) return false;
        if (tierFilter !== "all" && l.card.tier !== tierFilter) return false;
        if (q) {
          const hay = `${l.card.name} ${l.card.driver} ${l.card.team} ${l.sellerName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "price_asc") return a.price - b.price || b.createdAt - a.createdAt;
        if (sort === "price_desc") return b.price - a.price || b.createdAt - a.createdAt;
        if (sort === "rarity_desc") {
          return RARITY_RANK[b.card.tier] - RARITY_RANK[a.card.tier] || a.price - b.price;
        }
        return b.createdAt - a.createdAt;
      });
  }, [listings, onlyMine, affordable, pCredits, userId, tierFilter, deferredSearch, sort]);

  const activeFilterCount =
    (tierFilter !== "all" ? 1 : 0) + (onlyMine ? 1 : 0) + (affordable ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const anyActive = activeFilterCount > 0 || filters.search.trim() !== "";
  const resetKey = `${tierFilter}|${onlyMine}|${affordable}|${sort}|${deferredSearch.trim().toLowerCase()}`;

  function setBusy(id: string, busy: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openDetails(listing: TcgMarketListing) {
    setSheetError(null);
    setSelectedListing(listing);
  }

  function askUnlist(listing: TcgMarketListing) {
    setSheetError(null);
    setSelectedListing(null);
    setUnlistTarget(listing);
  }

  async function handleBuy(listing: TcgMarketListing) {
    if (pendingIds.has(listing.id)) return;
    setSheetError(null);
    setBusy(listing.id, true);
    try {
      const res = await buyCardFromMarket(listing.id);
      if (res.success) {
        onListingsChange(listingsRef.current.filter((l) => l.id !== listing.id));
        onCardPurchased(res.data.card, res.data.pCredits, listing.id);
        setSelectedListing(null);
        buzz(20);
        toast(
          `Card purchased: ${res.data.card.name} (${rarityLabel(res.data.card.tier)}) for ${listing.price.toLocaleString()} P. It is in your collection.`,
          "success"
        );
      } else {
        setSheetError(res.error);
        toast(res.error, "error");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete the purchase. Please try again.";
      setSheetError(message);
      toast(message, "error");
    } finally {
      setBusy(listing.id, false);
    }
  }

  async function handleUnlist(listing: TcgMarketListing) {
    if (pendingIds.has(listing.id)) return;
    setSheetError(null);
    setBusy(listing.id, true);
    try {
      const res = await unlistCardFromMarket(listing.cardId);
      if (res.success) {
        onListingsChange(listingsRef.current.filter((l) => l.id !== listing.id));
        onCardUnlisted(listing.cardId, res.data.card);
        setUnlistTarget(null);
        toast(`Unlisted "${listing.card.name}" from the Marketplace.`, "success");
      } else {
        setSheetError(res.error);
        toast(res.error, "error");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not unlist the card. Please try again.";
      setSheetError(message);
      toast(message, "error");
    } finally {
      setBusy(listing.id, false);
    }
  }

  const detailPending = selectedListing ? pendingIds.has(selectedListing.id) : false;
  const unlistPending = unlistTarget ? pendingIds.has(unlistTarget.id) : false;

  return (
    <div className="space-y-4">
      {/* Intro (scrolls away; the balance and controls live in the sticky bar below) */}
      <section className="px-1">
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Card Marketplace</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Buy cards listed by other members with P-Credits, or list your own from My Cards.
        </p>
      </section>

      {/* One sticky bar: search, filters, balance and tier chips */}
      <section
        aria-label="Marketplace controls"
        className="sticky gx-sticky-top z-[35] space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-lg backdrop-blur"
      >
        <div className="flex items-center gap-2">
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={filters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            placeholder="Search car, driver, team, seller…"
            aria-label="Search marketplace listings"
            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-base text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="gx-tap relative inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-black text-zinc-100 hover:bg-zinc-800"
          >
            <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span
                aria-label={`${activeFilterCount} active`}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-black"
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 pl-3 pr-1">
            <span className="text-xs font-black text-zinc-100">
              <span aria-hidden>🪙 </span>
              <span className="sr-only">Balance </span>
              {pCredits.toLocaleString()} P
            </span>
            <button
              type="button"
              onClick={onOpenPCreditsTab}
              className="gx-tap inline-flex h-9 items-center rounded-full bg-amber-500 px-3 text-xs font-black text-black hover:bg-amber-400"
            >
              + Top up
            </button>
          </div>
          <div className="relative min-w-0 flex-1">
            <div role="group" aria-label="Filter by rarity" className="no-scrollbar flex gap-2 overflow-x-auto pr-8">
              <button
                type="button"
                aria-pressed={tierFilter === "all"}
                onClick={() => patchFilters({ tier: "all" })}
                className={`${chipBase} ${tierFilter === "all" ? chipOn : chipOff}`}
              >
                All ({listings.length})
              </button>
              {FULL_ART_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tierFilter === t.id}
                  onClick={() => patchFilters({ tier: t.id })}
                  className={`${chipBase} ${tierFilter === t.id ? chipOn : chipOff}`}
                >
                  {t.label} ({tierCounts[t.id] ?? 0})
                </button>
              ))}
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent"
            />
          </div>
        </div>
      </section>

      {/* Results line */}
      <div className="flex min-h-11 items-center justify-between gap-3 px-1" aria-live="polite">
        <p className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "listing" : "listings"}
        </p>
        {anyActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="gx-tap min-h-11 rounded-xl px-3 text-xs font-black text-amber-600 hover:underline dark:text-amber-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Listings Grid */}
      {filtered.length === 0 ? (
        <section className={`${panel} space-y-3 py-10 text-center`}>
          <p className="text-base font-black text-zinc-900 dark:text-zinc-100">
            {listings.length === 0 ? "Nothing is listed yet" : "No cards match these filters"}
          </p>
          <p className="mx-auto max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            {listings.length === 0
              ? "No cards are on the Marketplace right now. Open a card in My Cards to list it for P-Credits."
              : "Try a different search, or clear the filters to see every listing."}
          </p>
          {anyActive && (
            <button type="button" onClick={clearFilters} className={`${sheetPrimary} mx-auto !flex-none`}>
              Clear filters
            </button>
          )}
        </section>
      ) : (
        <ProgressiveList
          items={filtered}
          getKey={(l) => l.id}
          resetKey={resetKey}
          batch={12}
          label="Marketplace listings"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          render={(item) => {
            const isMine = item.sellerId === userId;
            const canAfford = pCredits >= item.price;
            const busy = pendingIds.has(item.id);
            return (
              <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-3">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => openDetails(item)}
                    aria-label={`Inspect ${item.card.name}`}
                    className="block w-full rounded-xl transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 motion-safe:hover:-translate-y-1"
                  >
                    <FullArtCard card={item.card} className="drop-shadow-md" />
                  </button>
                  <div className="px-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        {rarityLabel(item.card.tier)}
                      </span>
                      <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        by {isMine ? "You" : item.sellerName}
                      </span>
                    </div>
                    <p className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">{item.card.name}</p>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  <div className="mb-2 px-1">
                    <span className="block text-[11px] font-semibold text-zinc-500">Price</span>
                    <span className="block text-base font-black leading-tight text-amber-600 dark:text-amber-400">
                      {item.price.toLocaleString()} <span className="text-xs font-extrabold">P</span>
                    </span>
                  </div>
                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => askUnlist(item)}
                      disabled={busy}
                      className="gx-tap inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {busy ? (
                        <>
                          <BtnSpinner /> Unlisting…
                        </>
                      ) : (
                        "Unlist"
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDetails(item)}
                      disabled={busy}
                      className={`gx-tap inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black transition-colors disabled:opacity-50 ${
                        canAfford
                          ? "bg-amber-500 text-black hover:bg-amber-400"
                          : "border border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {busy ? (
                        <>
                          <BtnSpinner /> Buying…
                        </>
                      ) : canAfford ? (
                        "Buy"
                      ) : (
                        "Inspect"
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Filters sheet */}
      {filtersOpen && (
        <BottomSheet
          title="Filters"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "listing" : "listings"} match`}
          onClose={() => setFiltersOpen(false)}
          footer={
            <div className="flex gap-2 pb-2">
              <button type="button" onClick={clearFilters} disabled={!anyActive} className={sheetSecondary}>
                Reset
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)} className={sheetPrimary}>
                Show {filtered.length} {filtered.length === 1 ? "listing" : "listings"}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">Rarity</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={tierFilter === "all"}
                  onClick={() => patchFilters({ tier: "all" })}
                  className={`${chipBase} ${tierFilter === "all" ? chipOn : chipOff}`}
                >
                  All tiers ({listings.length})
                </button>
                {FULL_ART_TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tierFilter === t.id}
                    onClick={() => patchFilters({ tier: t.id })}
                    className={`${chipBase} ${tierFilter === t.id ? chipOn : chipOff}`}
                  >
                    {t.label} ({tierCounts[t.id] ?? 0})
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 id="gx-market-sort" className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                Sort by
              </h3>
              <div role="radiogroup" aria-labelledby="gx-market-sort" className="grid gap-2">
                {SORT_OPTIONS.map((o) => {
                  const on = sort === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => patchFilters({ sort: o.id })}
                      className={`gx-tap flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-bold transition-colors ${
                        on ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-200"
                      }`}
                    >
                      {o.label}
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          on ? "border-amber-400" : "border-zinc-600"
                        }`}
                      >
                        {on && <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Toggle
                label={`My listings (${myCount})`}
                hint="Only cards you have listed"
                checked={onlyMine}
                onChange={(v) => patchFilters({ onlyMine: v })}
              />
              <Toggle
                label="Affordable only"
                hint={`Price up to ${pCredits.toLocaleString()} P`}
                checked={affordable}
                onChange={(v) => patchFilters({ affordable: v })}
              />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Inspect / confirm purchase */}
      {selectedListing && (
        <BottomSheet
          size="lg"
          title={selectedListing.card.name}
          subtitle={`${rarityLabel(selectedListing.card.tier)} Card · Seller: ${
            selectedListing.sellerId === userId ? "You" : selectedListing.sellerName
          }`}
          onClose={() => {
            setSheetError(null);
            setSelectedListing(null);
          }}
          dismissible={!detailPending}
          footer={
            <div className="space-y-2 pb-2">
              {sheetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm font-bold text-rose-100"
                >
                  {sheetError}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-zinc-300">
                  Price{" "}
                  <strong className="text-base font-black text-amber-400">
                    {selectedListing.price.toLocaleString()} P
                  </strong>
                </span>
                <span className="text-xs text-zinc-400">
                  Balance <strong className="text-zinc-100">{pCredits.toLocaleString()} P</strong>
                </span>
              </div>
              {selectedListing.sellerId !== userId && pCredits < selectedListing.price && (
                <p className="text-xs font-semibold text-rose-300">
                  You need {(selectedListing.price - pCredits).toLocaleString()} more P-Credits to buy this card.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSheetError(null);
                    setSelectedListing(null);
                  }}
                  disabled={detailPending}
                  className={sheetSecondary}
                >
                  Cancel
                </button>
                {selectedListing.sellerId === userId ? (
                  <button type="button" onClick={() => askUnlist(selectedListing)} className={sheetPrimary}>
                    Remove listing
                  </button>
                ) : pCredits >= selectedListing.price ? (
                  <button
                    type="button"
                    onClick={() => void handleBuy(selectedListing)}
                    disabled={detailPending}
                    className={sheetPrimary}
                  >
                    {detailPending ? (
                      <>
                        <BtnSpinner /> Purchasing…
                      </>
                    ) : (
                      "Confirm purchase"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListing(null);
                      onOpenPCreditsTab();
                    }}
                    className={sheetPrimary}
                  >
                    + Top up
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr]">
            <div className="mx-auto w-full max-w-[12rem] md:max-w-none">
              <FullArtCard card={selectedListing.card} className="drop-shadow-2xl" />
            </div>
            <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-2 text-sm">
              <dt className="font-bold text-zinc-400">Driver</dt>
              <dd>{selectedListing.card.driver || "—"}</dd>
              <dt className="font-bold text-zinc-400">Team</dt>
              <dd>{selectedListing.card.team || "—"}</dd>
              <dt className="font-bold text-zinc-400">Chassis</dt>
              <dd>
                {selectedListing.card.ability?.trim() ||
                  (selectedListing.card as { chassis?: string }).chassis?.trim() ||
                  selectedListing.card.name ||
                  "—"}
              </dd>
              <dt className="font-bold text-zinc-400">Specs</dt>
              <dd>{selectedListing.card.effect || "—"}</dd>
            </dl>
          </div>
        </BottomSheet>
      )}

      {/* Confirm unlist */}
      {unlistTarget && (
        <BottomSheet
          size="md"
          tone="rose"
          title="Unlist this card?"
          subtitle={unlistTarget.card.name}
          onClose={() => {
            setSheetError(null);
            setUnlistTarget(null);
          }}
          dismissible={!unlistPending}
          footer={
            <div className="space-y-2 pb-2">
              {sheetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm font-bold text-rose-100"
                >
                  {sheetError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSheetError(null);
                    setUnlistTarget(null);
                  }}
                  disabled={unlistPending}
                  className={sheetSecondary}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleUnlist(unlistTarget)}
                  disabled={unlistPending}
                  className={sheetDanger}
                >
                  {unlistPending ? (
                    <>
                      <BtnSpinner /> Unlisting…
                    </>
                  ) : (
                    "Unlist"
                  )}
                </button>
              </div>
            </div>
          }
        >
          <p className="text-sm text-zinc-300">
            This removes your {rarityLabel(unlistTarget.card.tier)} card from the Marketplace for{" "}
            <strong className="text-amber-400">{unlistTarget.price.toLocaleString()} P</strong>. It goes back to your
            collection and you can list it again any time.
          </p>
        </BottomSheet>
      )}
    </div>
  );
}
