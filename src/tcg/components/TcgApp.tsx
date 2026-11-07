"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardCollection } from "@/components/member-cards/CardCollection";
import type { MemberCard } from "@/lib/card-roll";
import type { TandemClashChallenge } from "@/tcg/challenges-types";
import type { ComingSoonCard } from "@/lib/coming-soon";
import type { ShowcaseRareCard } from "@/tcg/storage";
import { P_CREDIT_BUNDLES } from "@/tcg/config";
import { DAILY_CLASH_WIN_REWARD_PCREDITS, getCollectorProgress } from "@/tcg/progression";
import { getGameXpProgress } from "@/tcg/game-xp";
import type {
  ClashOpponent,
  ClashPlayerStats,
  DriftClashLeaderboardEntry,
  PCreditBundle,
  TcgCustomPackWithCards,
  TcgMarketListing,
  TcgTab,
} from "@/tcg/types";
import { loadClashOpponentAction } from "@/tcg/clash";
import { DriftClashArena } from "./DriftClashArena";
import { GameBottomNav, type GameNavItem } from "./GameBottomNav";
import { PlayBanner, PlayHub, type PlayMode } from "./PlayHub";
import { TcgHome } from "./TcgHome";
import { DriftClashLeaderboard } from "./DriftClashLeaderboard";
import { TcgMarketplace } from "./TcgMarketplace";
import { TcgPackStore } from "./TcgPackStore";
import { TcgPCreditsShop } from "./TcgPCreditsShop";
import { buzz } from "@/tcg/ui/feedback";
import { useStickyTopOffset } from "@/tcg/ui/useBottomChrome";
import { TabSkeleton } from "@/tcg/ui/Shimmer";
import { ToastProvider } from "@/tcg/ui/Toast";

// Tandem Tour is loaded only when its tab is opened, so the rest of the game does not get heavier.
const TourTab = dynamic(() => import("@/tcg/tour/components/TourTab").then((m) => m.TourTab), {
  ssr: false,
  loading: () => <TabSkeleton label="Loading Tandem Tour" />,
});

// Drift Campaign (admin only for now) is loaded the same way.
const CampaignTab = dynamic(() => import("@/tcg/campaign/components/CampaignTab").then((m) => m.CampaignTab), {
  ssr: false,
  loading: () => <TabSkeleton label="Loading Drift Campaign" />,
});

/** The sections opened from the Play page. The Play entry in the navigation stays selected while one of these is open. */
const PLAY_SECTIONS: TcgTab[] = ["play", "clash", "tour", "campaign"];

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
  // One entry for every game mode (Tandem Clash, challenges, Tour, Campaign). They are opened from the Play page.
  {
    id: "play",
    label: "Play",
    shortLabel: "Play",
    icon: "🎮",
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
  initialClashStats,
  initialLeaderboard = [],
  hasEarlyAccess = false,
  checkoutConfirmed = false,
  initialChallenges = [],
  initialCompletedChallengeIds = [],
  initialRareCards = [],
  initialComingSoon = [],
  hasTourAccess = false,
  tourAdminPreview = false,
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
  /** Tour is only showing because this member is an admin (it is not switched on for members yet). */
  tourAdminPreview?: boolean;
}) {
  const [tab, setTab] = useState<TcgTab>(initialTab);
  const [cards, setCards] = useState<MemberCard[]>(initialCards);
  const [packCredits, setPackCredits] = useState<number>(initialPackCredits);
  const [pCredits, setPCredits] = useState<number>(initialPCredits);
  const [listings, setListings] = useState<TcgMarketListing[]>(initialListings);
  const [clashStats, setClashStats] = useState<ClashPlayerStats>(initialClashStats);
  // Which view the play section on Home is showing: the two play buttons, or the full challenges list.
  const [lobbyTab, setLobbyTab] = useState<"quick" | "challenges">("quick");
  // Goes up each time Tandem Clash is opened from the Play page, so the arena starts a game instead of showing its lobby.
  const [autoStart, setAutoStart] = useState(0);
  // The rival for Tandem Clash, picked when that screen opens (see the effect below).
  const [clashOpponent, setClashOpponent] = useState<ClashOpponent | null>(null);
  const [opponentFailed, setOpponentFailed] = useState(false);
  // On a phone the player's stats (cards by rarity, power, wins) fold away under the level bar; tap the bar to open them.
  const [hudOpen, setHudOpen] = useState(false);
  // Sticky filter and wallet bars stick just under whatever covers the top of the page; this measures how far that reaches.
  const rootRef = useRef<HTMLDivElement>(null);
  useStickyTopOffset(rootRef);

  // When the page's data is refreshed (pull to refresh, or a server action that revalidates), the server's copy replaces
  // what this screen is holding, so the wallet, deck, listings and stats are never stale. This is state set while
  // rendering, which React allows for exactly this "props changed" case.
  const [synced, setSynced] = useState({ initialTab, initialCards, initialPackCredits, initialPCredits, initialListings, initialClashStats });
  if (
    synced.initialTab !== initialTab ||
    synced.initialCards !== initialCards ||
    synced.initialPackCredits !== initialPackCredits ||
    synced.initialPCredits !== initialPCredits ||
    synced.initialListings !== initialListings ||
    synced.initialClashStats !== initialClashStats
  ) {
    if (synced.initialTab !== initialTab) setTab(initialTab);
    if (synced.initialCards !== initialCards) setCards(initialCards);
    if (synced.initialPackCredits !== initialPackCredits) setPackCredits(initialPackCredits);
    if (synced.initialPCredits !== initialPCredits) setPCredits(initialPCredits);
    if (synced.initialListings !== initialListings) setListings(initialListings);
    if (synced.initialClashStats !== initialClashStats) setClashStats(initialClashStats);
    setSynced({ initialTab, initialCards, initialPackCredits, initialPCredits, initialListings, initialClashStats });
  }

  const drift = useMemo(() => getGameXpProgress(clashStats.gameXp), [clashStats.gameXp]);
  const progress = useMemo(
    () => getCollectorProgress(cards, clashStats.wins, cards.length),
    [cards, clashStats.wins]
  );

  /** Go to a section: a light tap buzz, and the page starts at the top of the new section instead of mid-scroll. */
  const selectTab = useCallback((next: TcgTab) => {
    setTab(next);
    if (next !== "clash") setClashOpponent(null);
    buzz(8);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".pwa-protected-content")?.scrollTo?.({ top: 0 });
      window.scrollTo?.({ top: 0 });
    });
  }, []);

  // The same sections and badges as the header panel, for the bar fixed to the bottom of a phone screen.
  const visibleTabs = TABS;
  // A Tour or Campaign link the member has no access to lands on the Play page instead of an empty screen.
  const view: TcgTab = (tab === "tour" && !hasTourAccess) || (tab === "campaign" && !isAdmin) ? "play" : tab;
  const navActive: TcgTab = PLAY_SECTIONS.includes(view) ? "play" : view;

  // The rival for Tandem Clash is picked when that screen opens, not on every page load: picking one reads and scores a lot of
  // cards. It is dropped on leaving, so each visit gets a fresh rival.
  const needOpponent = view === "clash" && !clashOpponent;
  useEffect(() => {
    if (!needOpponent || opponentFailed) return;
    let cancelled = false;
    loadClashOpponentAction()
      .then((res) => {
        if (cancelled) return;
        if (res.success) setClashOpponent(res.data);
        else setOpponentFailed(true);
      })
      .catch(() => {
        if (!cancelled) setOpponentFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needOpponent, opponentFailed]);

  /** Open one of the game modes listed on the Play page. */
  const openPlayMode = useCallback(
    (mode: PlayMode) => {
      if (mode === "quick" || mode === "challenges") {
        setLobbyTab(mode);
        if (mode === "quick") setAutoStart((n) => n + 1);
        selectTab("clash");
      } else {
        selectTab(mode);
      }
    },
    [selectTab]
  );
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
    <ToastProvider>
    <div ref={rootRef} className="space-y-3 pb-4 sm:space-y-5 sm:pb-8">
      {/* The HUD: one row on a phone (level, rank and XP on the left, wallet on the right); your stats open when you tap the level bar. */}
      <header className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-2.5 text-white shadow-lg dark:border-zinc-800 sm:rounded-3xl sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/15 blur-2xl" />

        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHudOpen((open) => !open)}
            aria-expanded={hudOpen}
            aria-controls="gx-hud-details"
            aria-label={`Level ${progress.level}, ${progress.rankTitle}. ${hudOpen ? "Hide" : "Show"} your stats`}
            className="gx-tap flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left sm:pointer-events-none"
          >
            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-black shadow-md shadow-amber-500/20">
              <span className="text-[10px] font-black uppercase leading-none opacity-80">LV</span>
              <span className="text-base font-black leading-tight">{progress.level}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black uppercase tracking-wide text-amber-400">
                {progress.rankIcon} {progress.rankTitle}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span className="gx-grow block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${progress.progressPct}%` }} />
                </span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-zinc-400">
                  {progress.xp.toLocaleString()}/{progress.nextLevelXp.toLocaleString()} XP
                </span>
              </span>
              {/* Drift XP: earned from playing games (margin of wins, clean sweeps, challenges, campaign rounds) */}
              <span className="mt-1 flex items-center gap-2" role="img" aria-label={`Drift level ${drift.level}, ${drift.intoLevel} of ${drift.forLevel} XP`}>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-700"
                    style={{ width: `${drift.progressPct}%` }}
                  />
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tabular-nums text-emerald-300">
                  Drift Lv {drift.level} · {drift.intoLevel}/{drift.forLevel}
                </span>
              </span>
            </span>
            <span aria-hidden className={`shrink-0 text-lg text-zinc-500 transition-transform sm:hidden ${hudOpen ? "rotate-180" : ""}`}>
              ⌄
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => selectTab("p-credits")}
              aria-label={`${pCredits.toLocaleString()} P-Credits. Open the P-Credits shop`}
              className="gx-tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 text-left transition-colors hover:bg-amber-500/25"
            >
              <span aria-hidden className="text-sm">🪙</span>
              <span className="text-sm font-black tabular-nums text-white">{pCredits.toLocaleString()}</span>
              <span aria-hidden className="rounded bg-amber-500 px-1.5 text-xs font-black text-black">+</span>
            </button>
            <Link
              href="/cards/new"
              aria-label={`${packCredits} pack credits. Forge a pack`}
              className="gx-tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-2.5 text-left transition-colors hover:border-amber-500/50 hover:bg-zinc-800"
            >
              <span aria-hidden className="text-sm">🎟️</span>
              <span className="text-sm font-black tabular-nums text-white">{packCredits}</span>
              <span className="hidden rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-black uppercase text-black sm:inline">Forge</span>
            </Link>
          </div>
        </div>

        {/* Your stats: cards by rarity, power, wins. Folded away on a phone until the level bar is tapped. */}
        <div
          id="gx-hud-details"
          className={`relative ${hudOpen ? "mt-2.5 flex" : "hidden sm:mt-3 sm:flex"} gx-fade-up items-center justify-between gap-2 overflow-x-auto border-t border-zinc-800/90 pt-2.5 text-[11px] no-scrollbar`}
        >
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-md bg-zinc-800 px-2 py-1 font-extrabold text-zinc-200">⚡ {progress.totalPower.toLocaleString()}</span>
            <span className="rounded-md bg-fuchsia-500/20 px-2 py-1 font-extrabold text-fuchsia-300">💎 {progress.tierCounts.mythic}</span>
            <span className="rounded-md bg-amber-500/20 px-2 py-1 font-extrabold text-amber-300">👑 {progress.tierCounts.legend}</span>
            <span className="rounded-md bg-yellow-500/20 px-2 py-1 font-extrabold text-yellow-300">🥇 {progress.tierCounts.gold}</span>
            <span className="rounded-md bg-zinc-800 px-2 py-1 font-bold text-zinc-300">🥈 {progress.tierCounts.silver}</span>
            <span className="rounded-md bg-orange-950/80 px-2 py-1 font-bold text-orange-300">🥉 {progress.tierCounts.bronze}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-2 py-1 font-bold text-zinc-300">
            <span>
              ⚔️ <strong className="text-emerald-400">{clashStats.wins}W</strong>/{clashStats.losses}L
            </span>
            {clashStats.streak > 0 && <span className="text-amber-400">🔥{clashStats.streak}</span>}
          </div>
        </div>

        {/* Game navigation for tablets and desktop. On phones the same sections are the bar fixed above the main tabs. */}
        <nav
          aria-label="DriftClash game navigation"
          style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
          className="mt-3 hidden gap-1.5 rounded-2xl bg-zinc-900/90 p-1.5 md:grid"
        >
          {visibleTabs.map((t) => {
            const active = navActive === t.id;
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
                onClick={() => selectTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-black transition-all ${
                  active
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <span aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
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

      <GameBottomNav items={navItems} active={navActive} onSelect={(id) => selectTab(id as TcgTab)} />

      {checkoutConfirmed && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:text-sm"
        >
          Your P-Credits purchase was confirmed and added to your shared balance! A confirmation email has been sent to you.
        </div>
      )}

      {/* Active Tab Content: a short fade-up when the section changes */}
      <div key={view} className="gx-tab-enter space-y-3 sm:space-y-5">
      {/* Campaign draws its own back button, so Withdraw can sit on the same row. */}
      {(view === "clash" || view === "tour") && (
        <button
          type="button"
          onClick={() => selectTab("play")}
          className="gx-tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-black uppercase tracking-wider text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span aria-hidden>←</span> Play
        </button>
      )}

      {/* The Play page: every game mode in one place. */}
      {view === "play" && (
        <PlayHub
          onSelect={openPlayMode}
          wins={clashStats.wins}
          losses={clashStats.losses}
          streak={clashStats.streak}
          dailyWinAvailable={!clashStats.dailyWinClaimed}
          liveChallenges={initialChallenges.filter((c) => !initialCompletedChallengeIds.includes(c.id)).length}
          hasTourAccess={hasTourAccess}
          tourAdminPreview={tourAdminPreview}
          isAdmin={isAdmin}
        />
      )}

      {/* The game's landing page: a Play button to the Play page, then live challenges, packs and rare cards.
          Tandem Clash itself ("clash") shows the arena on its own, with a way back to Play. */}
      {(view === "home" || view === "clash") && (
        <TcgHome
          showShowcase={view === "home"}
          challenges={initialChallenges}
          completedIds={initialCompletedChallengeIds}
          packs={initialCustomPacks}
          standardPackPrice={initialStandardPackPrice}
          standardPackSalePrice={initialStandardPackSalePrice}
          rareCards={initialRareCards}
          comingSoon={initialComingSoon}
          packCredits={packCredits}
          onOpenChallenges={() => openPlayMode("challenges")}
          onOpenStore={() => selectTab("store")}
        >
          {view === "home" ? (
            <PlayBanner
              onPlay={() => selectTab("play")}
              wins={clashStats.wins}
              losses={clashStats.losses}
              streak={clashStats.streak}
              dailyWinAvailable={!clashStats.dailyWinClaimed}
            />
          ) : !clashOpponent ? (
            opponentFailed ? (
              <div role="alert" className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-center">
                <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Could not find a rival. Try again.</p>
                <button
                  type="button"
                  onClick={() => setOpponentFailed(false)}
                  className="gx-tap inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-black text-black hover:bg-amber-400"
                >
                  Try again
                </button>
              </div>
            ) : (
              <TabSkeleton label="Finding a rival" />
            )
          ) : (
            <DriftClashArena
              cards={cards}
              initialOpponent={clashOpponent}
              initialStats={clashStats}
              hasEarlyAccess={hasEarlyAccess}
              isAdmin={isAdmin}
              userId={userId}
              pCredits={pCredits}
              onPCreditsChange={setPCredits}
              onStatsChange={setClashStats}
              onCardsChange={setCards}
              onOpenStoreTab={() => selectTab("store")}
              lobbyTab={lobbyTab}
              onLobbyTabChange={setLobbyTab}
              autoStart={autoStart}
              onLeave={() => selectTab("play")}
            />
          )}
        </TcgHome>
      )}

      {view === "tour" && (
        <TourTab
          onBalances={({ pCredits: nextP, packCredits: nextPack }) => {
            setPCredits(nextP);
            setPackCredits(nextPack);
          }}
          onKitsUsed={(ids) => setCards((prev) => prev.filter((c) => !ids.includes(c.id)))}
        />
      )}

      {view === "campaign" && <CampaignTab
          onBack={() => selectTab("play")}
          onGameXp={(total) => setClashStats((prev) => ({ ...prev, gameXp: total }))}
          cards={cards}
          pCredits={pCredits}
          onPCreditsChange={setPCredits}
          onKitUsed={(kitId) => setCards((prev) => prev.filter((c) => c.id !== kitId))}
          onCardsWorn={(worn) => {
            const byId = new Map(worn.map((c) => [c.id, c]));
            setCards((prev) => prev.map((c) => byId.get(c.id) ?? c));
          }}
        />}

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
          onOpenPCreditsTab={() => selectTab("p-credits")}
          onOpenCollectionTab={() => selectTab("collection")}
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
          onOpenPCreditsTab={() => selectTab("p-credits")}
        />
      )}

      {tab === "p-credits" && (
        <TcgPCreditsShop
          pCredits={pCredits}
          bundles={initialPCreditBundles}
          isAdmin={isAdmin}
          onPCreditsChange={setPCredits}
          onOpenStoreTab={() => selectTab("store")}
          onOpenMarketplaceTab={() => setTab("marketplace")}
          onOpenCollectionTab={() => selectTab("collection")}
        />
      )}

      {tab === "leaderboard" && (
        <DriftClashLeaderboard
          entries={initialLeaderboard}
          currentUserId={userId}
        />
      )}
      </div>
    </div>
    </ToastProvider>
  );
}
