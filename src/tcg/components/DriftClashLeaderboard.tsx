"use client";

import { useMemo, useRef, useState } from "react";
import { rarityLabel } from "@/lib/card-roll";
import type { DriftClashLeaderboardEntry } from "@/tcg/types";
import { useBottomChromeHeight } from "@/tcg/ui/useBottomChrome";

type LeaderboardSort = "power" | "mythics" | "wins";

const SORT_TABS: { id: LeaderboardSort; label: string; icon: string }[] = [
  { id: "power", label: "Power", icon: "⚡" },
  { id: "mythics", label: "Rare cards", icon: "💎" },
  { id: "wins", label: "Wins", icon: "⚔️" },
];

/** The three numbers shown for a collector, in the order they are listed. */
function statsFor(entry: DriftClashLeaderboardEntry): Record<LeaderboardSort, { label: string; value: string; tone: string }> {
  return {
    power: {
      label: "Power",
      value: `⚡ ${entry.collectorPower.toLocaleString()}`,
      tone: "text-amber-600 dark:text-amber-400",
    },
    mythics: {
      label: "Mythic · Legend",
      value: `💎 ${entry.mythicCount} · 👑 ${entry.legendCount}`,
      tone: "text-zinc-900 dark:text-zinc-100",
    },
    wins: {
      label: "Clash wins",
      value: `⚔️ ${entry.clashWins.toLocaleString()}`,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
  };
}

function medalFor(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
}

function medalClass(rank: number): string {
  return rank === 1
    ? "bg-amber-400 text-black"
    : rank === 2
      ? "bg-zinc-300 text-black"
      : rank === 3
        ? "bg-amber-700 text-white"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export function DriftClashLeaderboard({
  entries,
  currentUserId,
}: {
  entries: DriftClashLeaderboardEntry[];
  currentUserId: string;
}) {
  const [sortBy, setSortBy] = useState<LeaderboardSort>("power");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const chromeHeight = useBottomChromeHeight();

  const sorted = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      if (sortBy === "mythics") {
        if (b.mythicCount !== a.mythicCount) return b.mythicCount - a.mythicCount;
        if (b.legendCount !== a.legendCount) return b.legendCount - a.legendCount;
        return b.collectorPower - a.collectorPower;
      }
      if (sortBy === "wins") {
        if (b.clashWins !== a.clashWins) return b.clashWins - a.clashWins;
        return b.collectorPower - a.collectorPower;
      }
      return b.collectorPower - a.collectorPower;
    });
    return copy;
  }, [entries, sortBy]);

  const myIndex = sorted.findIndex((e) => e.userId === currentUserId);
  const me = myIndex >= 0 ? sorted[myIndex] : null;
  const outsideList = sorted.length > 0 && !me && Boolean(currentUserId);

  function jumpToMe() {
    const row = rowRefs.current.get(currentUserId);
    if (!row) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    row.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <span className="text-[11px] font-black uppercase tracking-wider text-amber-500">
          Shared rankings · Penthouse Drift &amp; DriftClash
        </span>
        <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100 sm:text-2xl">🏆 DriftClash Hall of Fame</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Live rankings by deck power, Mythic &amp; Legend pulls, and Tandem Clash wins.
        </p>
      </section>

      {/* Sort: sticky segmented control */}
      <div
        role="group"
        aria-label="Rank collectors by"
        className="sticky gx-sticky-top z-[35] grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-1.5 shadow-lg backdrop-blur"
      >
        {SORT_TABS.map((tab) => {
          const active = sortBy === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSortBy(tab.id)}
              className={`gx-tap min-h-11 rounded-xl px-2 text-sm font-black transition-colors ${
                active ? "bg-amber-500 text-black shadow-sm" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <span aria-hidden>{tab.icon} </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {outsideList && (
        <p
          role="note"
          className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          You are outside the top {entries.length}. Open packs and win Clashes to climb the board.
        </p>
      )}

      {/* Leaderboard List */}
      {sorted.length === 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
            No collectors on the leaderboard yet. Open your first pack to claim the #1 spot!
          </p>
        </section>
      ) : (
        <>
          <ol className="space-y-2" aria-label="Leaderboard">
            {sorted.map((entry, idx) => {
              const rank = idx + 1;
              const isMe = entry.userId === currentUserId;
              const open = expandedId === entry.userId;
              const stats = statsFor(entry);
              const key = stats[sortBy];
              const others = SORT_TABS.filter((t) => t.id !== sortBy).map((t) => stats[t.id].value);
              const panelId = `gx-lb-${rank}-details`;

              return (
                <li
                  key={entry.userId}
                  ref={(el) => {
                    if (el) rowRefs.current.set(entry.userId, el);
                    else rowRefs.current.delete(entry.userId);
                  }}
                  className={`gx-cv-auto scroll-mt-32 overflow-hidden rounded-2xl border ${
                    isMe
                      ? "border-amber-500 bg-amber-500/10 shadow-sm"
                      : rank <= 3
                        ? "border-amber-500/30 bg-white dark:bg-zinc-900"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpandedId(open ? null : entry.userId)}
                    className="gx-tap flex min-h-[72px] w-full items-center gap-2.5 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black sm:h-10 sm:w-10 ${medalClass(rank)}`}
                    >
                      <span className="sr-only">Rank </span>
                      {medalFor(rank)}
                    </span>

                    {entry.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.avatarUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        className="h-10 w-10 shrink-0 rounded-full border border-zinc-300 object-cover dark:border-zinc-700"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {entry.driverName.slice(0, 1).toUpperCase()}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                          {entry.driverName}
                        </span>
                        {isMe && (
                          <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-black uppercase leading-none text-black">
                            You
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 sm:text-xs">
                        Lv.{entry.level} · {others.join(" · ")}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className={`block text-base font-black leading-tight ${key.tone}`}>{key.value}</span>
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        {key.label}
                      </span>
                    </span>

                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 shrink-0 text-zinc-400 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {open && (
                    <div id={panelId} className="space-y-2.5 border-t border-zinc-200/70 px-3 pb-3 pt-3 dark:border-zinc-800">
                      <div className="grid grid-cols-3 gap-2">
                        {SORT_TABS.map((t) => (
                          <div
                            key={t.id}
                            className="rounded-xl bg-zinc-100 px-2 py-2 text-center dark:bg-zinc-950"
                          >
                            <span className="block text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
                              {stats[t.id].label}
                            </span>
                            <span className={`block text-xs font-black ${stats[t.id].tone}`}>{stats[t.id].value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300">
                        {entry.rankIcon} {entry.rankTitle} · {entry.totalCards.toLocaleString()} cards ·{" "}
                        {entry.packsOpened.toLocaleString()} packs opened
                      </p>
                      {entry.topCard && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Ace card:{" "}
                          <strong className="text-zinc-700 dark:text-zinc-200">{entry.topCard.carName}</strong> (
                          {rarityLabel(entry.topCard.tier)})
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Pinned "your rank" bar, just above the bottom bars */}
          {me && (
            <div
              style={{ bottom: chromeHeight + 8 }}
              className="sticky z-20 flex items-center justify-between gap-3 rounded-2xl border border-amber-500 bg-zinc-950/95 p-2 pl-4 text-zinc-100 shadow-xl backdrop-blur"
            >
              <p className="min-w-0 truncate text-sm font-black">
                <span className="text-amber-400">Your rank #{myIndex + 1}</span>
                <span className="ml-2 text-xs font-bold text-zinc-300">{statsFor(me)[sortBy].value}</span>
              </p>
              <button
                type="button"
                onClick={jumpToMe}
                className="gx-tap min-h-11 shrink-0 rounded-xl bg-amber-500 px-4 text-xs font-black uppercase tracking-wide text-black hover:bg-amber-400"
              >
                Jump to me
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
