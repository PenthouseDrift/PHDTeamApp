"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { FULL_ART_TIERS, type FullArtTier } from "@/lib/full-art-card";
import { RARITY_RANK, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { buyCardFromMarket, unlistCardFromMarket } from "@/tcg/actions";
import type { TcgMarketListing } from "@/tcg/types";

type MarketSort = "newest" | "price_asc" | "price_desc" | "rarity_desc";

const panel =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";

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
  const [tierFilter, setTierFilter] = useState<FullArtTier | "all">("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MarketSort>("newest");
  const [selectedListing, setSelectedListing] = useState<TcgMarketListing | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings
      .filter((l) => {
        if (onlyMine && l.sellerId !== userId) return false;
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
  }, [listings, onlyMine, userId, tierFilter, search, sort]);

  function handleBuy(listing: TcgMarketListing) {
    setFeedback(null);
    startTransition(async () => {
      const res = await buyCardFromMarket(listing.id);
      if (res.success) {
        onListingsChange(listings.filter((l) => l.id !== listing.id));
        onCardPurchased(res.data.card, res.data.pCredits, listing.id);
        setSelectedListing(null);
        setFeedback({
          text: `Purchased "${res.data.card.name}" (${rarityLabel(res.data.card.tier)}) for ${listing.price.toLocaleString()} P-Credits! It is now in your collection.`,
        });
      } else {
        setFeedback({ text: res.error, error: true });
      }
    });
  }

  function handleUnlist(listing: TcgMarketListing) {
    setFeedback(null);
    startTransition(async () => {
      const res = await unlistCardFromMarket(listing.cardId);
      if (res.success) {
        onListingsChange(listings.filter((l) => l.id !== listing.id));
        onCardUnlisted(listing.cardId, res.data.card);
        setSelectedListing(null);
        setFeedback({ text: `Unlisted "${listing.card.name}" from the Marketplace.` });
      } else {
        setFeedback({ text: res.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Banner */}
      <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Card Marketplace</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Buy cards listed by other members using P-Credits, or list your own unwanted cards from My Cards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Your Balance
            </span>
            <span className="text-base font-black text-zinc-900 dark:text-zinc-100">
              {pCredits.toLocaleString()} P-Credits
            </span>
          </div>
          <button type="button" onClick={onOpenPCreditsTab} className={primaryBtn}>
            + Top Up
          </button>
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm font-bold ${
            feedback.error
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Filters */}
      <section className={`${panel} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search car, driver, team or seller…"
            className="min-h-10 flex-1 min-w-[14rem] rounded-xl border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={`min-h-10 rounded-xl border px-3.5 text-xs font-bold transition-colors ${
                onlyMine
                  ? "border-amber-500 bg-amber-500 text-black"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              My Listings ({listings.filter((l) => l.sellerId === userId).length})
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MarketSort)}
              aria-label="Sort marketplace listings"
              className="min-h-10 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="newest">Newest listed</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rarity_desc">Highest Rarity</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTierFilter("all")}
            className={`min-h-9 rounded-full border px-3.5 text-xs font-bold ${
              tierFilter === "all"
                ? "border-amber-500 bg-amber-500 text-black"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            All Tiers ({listings.length})
          </button>
          {FULL_ART_TIERS.map((t) => {
            const count = listings.filter((l) => l.card.tier === t.id).length;
            const active = tierFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTierFilter(t.id)}
                className={`min-h-9 rounded-full border px-3.5 text-xs font-bold ${
                  active
                    ? "border-amber-500 bg-amber-500 text-black"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {/* Listings Grid */}
      {filtered.length === 0 ? (
        <section className={`${panel} py-12 text-center space-y-2`}>
          <p className="text-base font-black text-zinc-900 dark:text-zinc-100">
            No cards matching your filter
          </p>
          <p className="mx-auto max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            {listings.length === 0
              ? "No cards are currently listed on the Marketplace. Open a card in My Cards to list it for P-Credits!"
              : "Try clearing your search or selecting All Tiers."}
          </p>
        </section>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => {
            const isMine = item.sellerId === userId;
            const canAfford = pCredits >= item.price;
            return (
              <li
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setSelectedListing(item)}
                    className="block w-full rounded-xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
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
                    <p className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {item.card.name}
                    </p>
                  </div>
                </div>

                <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-zinc-500">Price</span>
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                      {item.price.toLocaleString()} P-Credits
                    </span>
                  </div>
                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => handleUnlist(item)}
                      disabled={pending}
                      className="min-h-10 w-full rounded-xl border border-zinc-300 text-xs font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Unlist Card
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedListing(item)}
                      disabled={pending}
                      className={`min-h-10 w-full rounded-xl text-xs font-black transition-colors ${
                        canAfford
                          ? "bg-amber-500 text-black hover:bg-amber-400"
                          : "border border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {canAfford ? `Buy · ${item.price.toLocaleString()} P` : `Inspect (${item.price.toLocaleString()} P)`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Inspect / Confirm Purchase Modal */}
      {selectedListing &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center overscroll-contain sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Listing details"
          >
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => {
                if (!pending) setSelectedListing(null);
              }}
              aria-hidden="true"
            />
            <div className="relative z-10 grid h-full w-full gap-6 overflow-y-auto bg-zinc-950 p-5 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-amber-500/30 sm:p-7 md:grid-cols-[minmax(0,19rem)_1fr]">
              <div className="mx-auto w-full max-w-[19rem]">
                <FullArtCard card={selectedListing.card} className="drop-shadow-2xl" />
              </div>

              <div className="flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                        {rarityLabel(selectedListing.card.tier)} Card
                      </p>
                      <h3 className="text-2xl font-black">{selectedListing.card.name}</h3>
                      <p className="text-xs text-zinc-400">
                        Seller: <strong className="text-zinc-200">{selectedListing.sellerName}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedListing(null)}
                      disabled={pending}
                      className="min-h-10 rounded-xl border border-zinc-700 px-3.5 text-xs font-bold hover:bg-zinc-800"
                    >
                      Close
                    </button>
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="font-bold text-zinc-400">Driver</dt>
                    <dd>{selectedListing.card.driver || "—"}</dd>
                    <dt className="font-bold text-zinc-400">Team</dt>
                    <dd>{selectedListing.card.team || "—"}</dd>
                    <dt className="font-bold text-zinc-400">Chassis</dt>
                    <dd>{selectedListing.card.ability?.trim() || (selectedListing.card as { chassis?: string }).chassis?.trim() || selectedListing.card.name || "—"}</dd>
                    <dt className="font-bold text-zinc-400">Specs</dt>
                    <dd>{selectedListing.card.effect || "—"}</dd>
                  </dl>

                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Asking Price
                      </span>
                      <span className="text-2xl font-black text-amber-400">
                        {selectedListing.price.toLocaleString()} P-Credits
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">
                      Your balance: <strong>{pCredits.toLocaleString()} P-Credits</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {selectedListing.sellerId === userId ? (
                    <button
                      type="button"
                      onClick={() => handleUnlist(selectedListing)}
                      disabled={pending}
                      className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-black text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {pending ? "Unlisting…" : "Remove Listing from Marketplace"}
                    </button>
                  ) : pCredits >= selectedListing.price ? (
                    <button
                      type="button"
                      onClick={() => handleBuy(selectedListing)}
                      disabled={pending}
                      className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black hover:bg-amber-400 disabled:opacity-50"
                    >
                      {pending
                        ? "Purchasing…"
                        : `Confirm Purchase · ${selectedListing.price.toLocaleString()} P-Credits`}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-center text-xs font-semibold text-red-400">
                        You need {(selectedListing.price - pCredits).toLocaleString()} more P-Credits to buy this card.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedListing(null);
                          onOpenPCreditsTab();
                        }}
                        className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black hover:bg-amber-400"
                      >
                        Get More P-Credits
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

