"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardCollection } from "@/components/member-cards/CardCollection";
import type { MemberCard } from "@/lib/card-roll";
import { P_CREDIT_BUNDLES } from "@/tcg/config";
import {
  DAILY_CLASH_WIN_REWARD_PCREDITS,
  getCollectorProgress,
} from "@/tcg/progression";
import type {
  ClashOpponent,
  ClashPlayerStats,
  DriftClashLeaderboardEntry,
  PCreditBundle,
  TcgCustomPackWithCards,
  TcgMarketListing,
  TcgTab,
} from "@/tcg/types";
import { DriftClashArena } from "./DriftClashArena";
import { DriftClashLeaderboard } from "./DriftClashLeaderboard";
import { TcgMarketplace } from "./TcgMarketplace";
import { TcgPackStore } from "./TcgPackStore";
import { TcgPCreditsShop } from "./TcgPCreditsShop";

const TABS: Array<{
  id: TcgTab;
  label: string;
  shortLabel: string;
  icon: string;
  badge?: (ctx: {
    cards: number;
    listings: number;
    packs: number;
    dailyWinAvailable: boolean;
    hasEarlyAccess: boolean;
  }) => string | null;
}> = [
  {
    id: "collection",
    label: "My Deck",
    shortLabel: "Deck",
    icon: "🃏",
    badge: ({ cards }) => String(cards),
  },
  {
    id: "clash",
    label: "Clash Arena",
    shortLabel: "Clash",
    icon: "⚡",
    badge: ({ dailyWinAvailable }) =>
      dailyWinAvailable
        ? `+${DAILY_CLASH_WIN_REWARD_PCREDITS}P`
        : null,
  },
  {
    id: "store",
    label: "Pack Store",
    shortLabel: "Packs",
    icon: "🎁",
    badge: ({ packs }) => (packs > 0 ? String(packs) : null),
  },
  {
    id: "marketplace",
    label: "Marketplace",
    shortLabel: "Market",
    icon: "🏪",
    badge: ({ listings }) => (listings > 0 ? String(listings) : null),
  },
  {
    id: "p-credits",
    label: "P-Credits",
    shortLabel: "Bank",
    icon: "🪙",
  },
  {
    id: "leaderboard",
    label: "Hall of Fame",
    shortLabel: "Ranks",
    icon: "🏆",
  },
];

export function TcgApp({
  userId,
  isAdmin = false,
  initialTab = "collection",
  initialCards,
  initialPackCredits,
  initialPCredits,
  initialStandardPackPrice,
  initialStandardPackSalePrice = null,
  initialPCreditBundles = P_CREDIT_BUNDLES,
  initialCustomPacks,
  initialListings,
  initialClashOpponent,
  initialClashStats,
  initialLeaderboard = [],
  hasEarlyAccess = false,
  checkoutConfirmed = false,
}: {
  userId: string;
  isAdmin?: boolean;
  initialTab?: TcgTab;
  initialCards: MemberCard[];
  initialPackCredits: number;
  initialPCredits: number;
  initialStandardPackPrice: number;
  initialStandardPackSalePrice?: number | null;
  initialPCreditBundles?: PCreditBundle[];
  initialCustomPacks: TcgCustomPackWithCards[];
  initialListings: TcgMarketListing[];
  initialClashOpponent: ClashOpponent;
  initialClashStats: ClashPlayerStats;
  initialLeaderboard?: DriftClashLeaderboardEntry[];
  hasEarlyAccess?: boolean;
  checkoutConfirmed?: boolean;
}) {
  const [tab, setTab] = useState<TcgTab>(initialTab);
  const [cards, setCards] = useState<MemberCard[]>(initialCards);
  const [packCredits, setPackCredits] = useState<number>(initialPackCredits);
  const [pCredits, setPCredits] = useState<number>(initialPCredits);
  const [listings, setListings] = useState<TcgMarketListing[]>(initialListings);
  const [clashStats, setClashStats] = useState<ClashPlayerStats>(initialClashStats);

  const progress = useMemo(
    () => getCollectorProgress(cards, clashStats.wins, cards.length),
    [cards, clashStats.wins]
  );

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="space-y-4 pb-28 sm:space-y-5 sm:pb-8">
      {/* Compact Mobile-First Game HUD Banner */}
      <header className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-3.5 text-white shadow-lg dark:border-zinc-800 sm:rounded-3xl sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/15 blur-2xl" />

        {/* Row 1: Player Level & Power on Left, Wallet Pills on Right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-black shadow-md shadow-amber-500/20">
              <span className="text-[9px] font-black uppercase leading-none opacity-80">
                LV
              </span>
              <span className="text-sm font-black leading-tight">
                {progress.level}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-xs font-black uppercase tracking-wide text-amber-400 sm:text-sm">
                  {progress.rankIcon} {progress.rankTitle}
                </span>
                <span className="rounded-md border border-zinc-700 bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-black text-zinc-200">
                  ⚡ {progress.totalPower.toLocaleString()}
                </span>
              </div>

              {/* Compact XP Progress Bar */}
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 sm:w-36">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-zinc-400">
                  {progress.xp.toLocaleString()}/{progress.nextLevelXp.toLocaleString()} XP
                </span>
              </div>
            </div>
          </div>

          {/* Compact Currency Pills */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setTab("p-credits")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-left transition-colors hover:bg-amber-500/25"
            >
              <span className="text-xs" aria-hidden>
                🪙
              </span>
              <span className="text-xs font-black text-white">
                {pCredits.toLocaleString()}
              </span>
              <span className="rounded bg-amber-500 px-1 text-[10px] font-black text-black">
                +
              </span>
            </button>

            <Link
              href="/cards/new"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-2.5 py-1.5 text-left transition-colors hover:border-amber-500/50 hover:bg-zinc-800"
              title="Pack Credits — Tap to Forge a Pack"
            >
              <span className="text-xs" aria-hidden>
                🎟️
              </span>
              <span className="text-xs font-black text-white">
                {packCredits}
              </span>
              <span className="hidden rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-black sm:inline">
                Forge
              </span>
            </Link>
          </div>
        </div>

        {/* Row 2: Single-line Horizontal Scrollable Rarity & Clash Stats Strip */}
        <div className="mt-2.5 flex items-center justify-between gap-2 overflow-x-auto border-t border-zinc-800/90 pt-2 text-[10px] no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-md bg-fuchsia-500/20 px-1.5 py-0.5 font-extrabold text-fuchsia-300">
              💎 {progress.tierCounts.mythic}
            </span>
            <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 font-extrabold text-amber-300">
              👑 {progress.tierCounts.legend}
            </span>
            <span className="rounded-md bg-yellow-500/20 px-1.5 py-0.5 font-extrabold text-yellow-300">
              🥇 {progress.tierCounts.gold}
            </span>
            <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-bold text-zinc-300">
              🥈 {progress.tierCounts.silver}
            </span>
            <span className="rounded-md bg-orange-950/80 px-1.5 py-0.5 font-bold text-orange-300">
              🥉 {progress.tierCounts.bronze}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setTab("clash")}
            className="flex items-center gap-1.5 shrink-0 rounded-md bg-zinc-900 px-2 py-0.5 font-bold text-zinc-300 hover:text-white"
          >
            <span>
              ⚔️ <strong className="text-emerald-400">{clashStats.wins}W</strong>/{clashStats.losses}L
            </span>
            {clashStats.streak > 0 && (
              <span className="text-amber-400">🔥{clashStats.streak}</span>
            )}
          </button>
        </div>

        {/* Responsive Segmented Game Navigation (Visible across Mobile & Desktop) */}
        <nav
          aria-label="DriftClash game navigation"
          className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-zinc-900/90 p-1.5 sm:grid-cols-6"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const badgeText = t.badge?.({
              cards: cards.length,
              listings: listings.length,
              packs: initialCustomPacks.length + 1,
              dailyWinAvailable: !clashStats.dailyWinClaimed,
              hasEarlyAccess,
            });
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-black transition-all ${
                  active
                    ? "bg-amber-500 text-black shadow-sm"
                    : t.id === "clash"
                      ? "border border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <span aria-hidden>{t.icon}</span>
                <span className="sm:hidden">{t.shortLabel}</span>
                <span className="hidden sm:inline">{t.label}</span>
                {badgeText && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                      active
                        ? "bg-black/20 text-black"
                        : t.id === "clash" && !clashStats.dailyWinClaimed
                          ? "bg-emerald-500 text-black"
                          : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {checkoutConfirmed && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:text-sm"
        >
          Your P-Credits purchase was confirmed and added to your shared balance! A confirmation email has been sent to you.
        </div>
      )}

      {/* Active Tab Content */}
      {tab === "collection" && (
        <div className="space-y-4">
          {/* Quick Battle Arena CTA for Desktop/Tablet */}
          <section className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black p-4 shadow-lg sm:rounded-3xl sm:p-5">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/15 blur-2xl"
              aria-hidden
            />
            <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-black">
                    ⚡ Live Arena Ready
                  </span>
                  <span className="text-[11px] font-bold text-amber-400">
                    ⚔️ Tandem Clash · {clashStats.wins}W / {clashStats.losses}L
                  </span>
                  {!clashStats.dailyWinClaimed && (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                      +{DAILY_CLASH_WIN_REWARD_PCREDITS}P Win Bonus
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black text-white sm:text-lg">
                  Penthouse Tandem Clash Arena
                </h3>
                <p className="max-w-xl text-xs text-zinc-300">
                  Deploy 3 of your Car Cards and 3 Crew Advantage Cards. Spin for a randomised UK Drift venue and conquer Corners 1, 2 &amp; 3!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab("clash")}
                className="relative z-10 inline-flex min-h-12 shrink-0 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] sm:text-sm"
              >
                <span className="text-base">🎮</span>
                <span>Play Tandem Clash →</span>
              </button>
            </div>
          </section>

          <CardCollection
            initialCards={cards}
            credits={packCredits}
            pCredits={pCredits}
            canDelete={isAdmin}
            onCardsChange={setCards}
            onPCreditsChange={setPCredits}
            onListingCreated={(newListing) => {
              setListings((prev) => [
                newListing,
                ...prev.filter(
                  (l) => l.id !== newListing.id && l.cardId !== newListing.cardId
                ),
              ]);
            }}
            onListingRemoved={(cardId) => {
              setListings((prev) => prev.filter((l) => l.cardId !== cardId));
            }}
          />
        </div>
      )}

      {tab === "clash" && (
        <DriftClashArena
          cards={cards}
          initialOpponent={initialClashOpponent}
          initialStats={clashStats}
          hasEarlyAccess={hasEarlyAccess}
          isAdmin={isAdmin}
          userId={userId}
          pCredits={pCredits}
          onPCreditsChange={setPCredits}
          onStatsChange={setClashStats}
          onCardsChange={setCards}
          onOpenStoreTab={() => setTab("store")}
        />
      )}

      {tab === "store" && (
        <TcgPackStore
          pCredits={pCredits}
          packCredits={packCredits}
          standardPackPrice={initialStandardPackPrice}
          standardPackSalePrice={initialStandardPackSalePrice}
          customPacks={initialCustomPacks}
          isAdmin={isAdmin}
          onBalancesChange={({ pCredits: nextP, packCredits: nextPack }) => {
            setPCredits(nextP);
            setPackCredits(nextPack);
          }}
          onCustomCardsPulled={(pulledCards, nextPCredits) => {
            setPCredits(nextPCredits);
            setCards((prev) => [...pulledCards, ...prev]);
          }}
          onOpenPCreditsTab={() => setTab("p-credits")}
          onOpenCollectionTab={() => setTab("collection")}
        />
      )}

      {tab === "marketplace" && (
        <TcgMarketplace
          userId={userId}
          pCredits={pCredits}
          listings={listings}
          onListingsChange={setListings}
          onCardPurchased={(boughtCard, nextPCredits) => {
            setPCredits(nextPCredits);
            setCards((prev) => [
              boughtCard,
              ...prev.filter((c) => c.id !== boughtCard.id),
            ]);
          }}
          onCardUnlisted={(cardId, updatedCard) => {
            setCards((prev) =>
              prev.map((c) =>
                c.id === cardId
                  ? updatedCard ?? {
                      ...c,
                      listingId: undefined,
                      listedPrice: undefined,
                    }
                  : c
              )
            );
          }}
          onOpenPCreditsTab={() => setTab("p-credits")}
        />
      )}

      {tab === "p-credits" && (
        <TcgPCreditsShop
          pCredits={pCredits}
          bundles={initialPCreditBundles}
          isAdmin={isAdmin}
          onPCreditsChange={setPCredits}
          onOpenStoreTab={() => setTab("store")}
          onOpenMarketplaceTab={() => setTab("marketplace")}
          onOpenCollectionTab={() => setTab("collection")}
        />
      )}

      {tab === "leaderboard" && (
        <DriftClashLeaderboard
          entries={initialLeaderboard}
          currentUserId={userId}
        />
      )}
    </div>
  );
}
