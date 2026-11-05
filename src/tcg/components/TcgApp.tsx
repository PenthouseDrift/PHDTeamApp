"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CardCollection } from "@/components/member-cards/CardCollection";
import type { MemberCard } from "@/lib/card-roll";
import type { TandemClashChallenge } from "@/tcg/challenges-types";
import type { ComingSoonCard } from "@/lib/coming-soon";
import type { ShowcaseRareCard } from "@/tcg/storage";
import { P_CREDIT_BUNDLES } from "@/tcg/config";
import { DAILY_CLASH_WIN_REWARD_PCREDITS, getCollectorProgress } from "@/tcg/progression";
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
import { GameBottomNav, type GameNavItem } from "./GameBottomNav";
import { TcgHome } from "./TcgHome";
import { DriftClashLeaderboard } from "./DriftClashLeaderboard";
import { TcgMarketplace } from "./TcgMarketplace";
import { TcgPackStore } from "./TcgPackStore";
import { TcgPCreditsShop } from "./TcgPCreditsShop";

// Tandem Tour is loaded only when its tab is opened, so the rest of the game does not get heavier.
const TourTab = dynamic(() => import("@/tcg/tour/components/TourTab").then((m) => m.TourTab), {
  ssr: false,
  loading: () => <p className="text-xs text-zinc-500" role="status">Loading Tandem Tour…</p>,
});

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
    id: "home",
    label: "Home",
    shortLabel: "Home",
    icon: "🏁",
    badge: ({ dailyWinAvailable }) => (dailyWinAvailable ? `+${DAILY_CLASH_WIN_REWARD_PCREDITS}P` : null),
  },
  {
    id: "tour",
    label: "Tour",
    shortLabel: "Tour",
    icon: "🏎️",
  },
  {
    id: "collection",
    label: "My Deck",
    shortLabel: "Deck",
    icon: "🃏",
    badge: ({ cards }) => String(cards),
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
    shortLabel: "P-Credits",
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
  initialTab = "home",
  initialCards,
  initialPackCredits,
  initialPCredits,
  initialStandardPackPrice,
  initialStandardPackSalePrice = null,
  initialStandardAllowsCardCredits = true,
  initialPCreditBundles = P_CREDIT_BUNDLES,
  initialCustomPacks,
  initialListings,
  initialClashOpponent,
  initialClashStats,
  initialLeaderboard = [],
  hasEarlyAccess = false,
  checkoutConfirmed = false,
  initialChallenges = [],
  initialCompletedChallengeIds = [],
  initialRareCards = [],
  initialComingSoon = [],
  hasTourAccess = false,
}: {
  userId: string;
  isAdmin?: boolean;
  initialTab?: TcgTab;
  initialCards: MemberCard[];
  initialPackCredits: number;
  initialPCredits: number;
  initialStandardPackPrice: number;
  initialStandardPackSalePrice?: number | null;
  /** False when pack credit opening is switched off for the Standard Pack (it is paid for in P-Credits when opened). */
  initialStandardAllowsCardCredits?: boolean;
  initialPCreditBundles?: PCreditBundle[];
  initialCustomPacks: TcgCustomPackWithCards[];
  initialListings: TcgMarketListing[];
  initialClashOpponent: ClashOpponent;
  initialClashStats: ClashPlayerStats;
  initialLeaderboard?: DriftClashLeaderboardEntry[];
  hasEarlyAccess?: boolean;
  checkoutConfirmed?: boolean;
  initialChallenges?: TandemClashChallenge[];
  initialCompletedChallengeIds?: string[];
  initialRareCards?: ShowcaseRareCard[];
  initialComingSoon?: ComingSoonCard[];
  /** Whether to show the Tandem Tour tab (an admin, or open to this member). */
  hasTourAccess?: boolean;
}) {
  const [tab, setTab] = useState<TcgTab>(initialTab);
  const [cards, setCards] = useState<MemberCard[]>(initialCards);
  const [packCredits, setPackCredits] = useState<number>(initialPackCredits);
  const [pCredits, setPCredits] = useState<number>(initialPCredits);
  const [listings, setListings] = useState<TcgMarketListing[]>(initialListings);
  const [clashStats, setClashStats] = useState<ClashPlayerStats>(initialClashStats);
  // Which view the play section on Home is showing: the two play buttons, or the full challenges list.
  const [lobbyTab, setLobbyTab] = useState<"quick" | "challenges">("quick");

  const progress = useMemo(
    () => getCollectorProgress(cards, clashStats.wins, cards.length),
    [cards, clashStats.wins]
  );

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  // The same sections and badges as the header panel, for the bar fixed to the bottom of a phone screen.
  const visibleTabs = TABS.filter((t) => t.id !== "tour" || hasTourAccess);
  const navItems: GameNavItem[] = visibleTabs.map((t) => ({
    id: t.id,
    label: t.label,
    shortLabel: t.shortLabel,
    icon: t.icon,
    badge:
      t.badge?.({
        cards: cards.length,
        listings: listings.length,
        packs: initialCustomPacks.length + 1,
        dailyWinAvailable: !clashStats.dailyWinClaimed,
        hasEarlyAccess,
      }) ?? null,
    urgent: t.id === "home" && !clashStats.dailyWinClaimed,
  }));

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

          <div className="flex items-center gap-1.5 shrink-0 rounded-md bg-zinc-900 px-2 py-0.5 font-bold text-zinc-300">
            <span>
              ⚔️ <strong className="text-emerald-400">{clashStats.wins}W</strong>/{clashStats.losses}L
            </span>
            {clashStats.streak > 0 && (
              <span className="text-amber-400">🔥{clashStats.streak}</span>
            )}
          </div>
        </div>

        {/* Game navigation for tablets and desktop. On phones the same sections are the bar fixed above the main tabs. */}
        <nav
          aria-label="DriftClash game navigation"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
          className="mt-3 hidden gap-1.5 rounded-2xl bg-zinc-900/90 p-1.5 md:grid"
        >
          {visibleTabs.map((t) => {
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
                        : t.id === "home" && !clashStats.dailyWinClaimed
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

      <GameBottomNav items={navItems} active={tab} onSelect={(id) => setTab(id as TcgTab)} />

      {checkoutConfirmed && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:text-sm"
        >
          Your P-Credits purchase was confirmed and added to your shared balance! A confirmation email has been sent to you.
        </div>
      )}

      {/* Active Tab Content */}
      {tab === "home" && (
        <TcgHome
          showShowcase={lobbyTab === "quick"}
          challenges={initialChallenges}
          completedIds={initialCompletedChallengeIds}
          packs={initialCustomPacks}
          standardPackPrice={initialStandardPackPrice}
          standardPackSalePrice={initialStandardPackSalePrice}
          rareCards={initialRareCards}
          comingSoon={initialComingSoon}
          packCredits={packCredits}
          onOpenChallenges={() => {
            setLobbyTab("challenges");
            document.getElementById("tcg-home")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onOpenStore={() => setTab("store")}
        >

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
            lobbyTab={lobbyTab}
            onLobbyTabChange={setLobbyTab}
          />

        </TcgHome>
      )}

      {tab === "tour" && hasTourAccess && (
        <TourTab
          onBalances={({ pCredits: nextP, packCredits: nextPack }) => {
            setPCredits(nextP);
            setPackCredits(nextPack);
          }}
          onKitsUsed={(ids) => setCards((prev) => prev.filter((c) => !ids.includes(c.id)))}
        />
      )}

      {tab === "collection" && (
        <div className="space-y-4">
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

      {tab === "store" && (
        <TcgPackStore
          pCredits={pCredits}
          packCredits={packCredits}
          standardPackPrice={initialStandardPackPrice}
          standardPackSalePrice={initialStandardPackSalePrice}
          standardAllowsCardCredits={initialStandardAllowsCardCredits}
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
