"use client";

import { useMemo, useState } from "react";
import { rarityLabel } from "@/lib/card-roll";
import type { DriftClashLeaderboardEntry } from "@/tcg/types";

type LeaderboardSort = "power" | "mythics" | "wins";

export function DriftClashLeaderboard({
  entries,
  currentUserId,
}: {
  entries: DriftClashLeaderboardEntry[];
  currentUserId: string;
}) {
  const [sortBy, setSortBy] = useState<LeaderboardSort>("power");

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

  return (
    <div className="space-y-5">
      {/* Header & Sort Bar */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
              Shared Cross-App Rankings · Penthouse Drift &amp; DriftClash
            </span>
            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100 sm:text-2xl">
              🏆 DriftClash Hall of Fame
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Live rankings across all collectors based on deck power, Mythic &amp; Legend pulls, and Tandem Clash wins.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "power", label: "⚡ Collector Power" },
                { id: "mythics", label: "💎 Mythics & Legends" },
                { id: "wins", label: "⚔️ Clash Wins" },
              ] as const
            ).map((tab) => {
              const active = sortBy === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id)}
                  className={`min-h-9 rounded-xl px-3 text-xs font-black transition-colors ${
                    active
                      ? "bg-amber-500 text-black shadow-sm"
                      : "border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Leaderboard List */}
      {sorted.length === 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
            No collectors on the leaderboard yet. Open your first pack to claim the #1 spot!
          </p>
        </section>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((entry, idx) => {
            const rank = idx + 1;
            const isMe = entry.userId === currentUserId;
            const medal =
              rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

            return (
              <div
                key={entry.userId}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 transition-all ${
                  isMe
                    ? "border-amber-500 bg-amber-500/10 shadow-sm"
                    : rank <= 3
                      ? "border-amber-500/30 bg-white dark:bg-zinc-900"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                      rank === 1
                        ? "bg-amber-400 text-black"
                        : rank === 2
                          ? "bg-zinc-300 text-black"
                          : rank === 3
                            ? "bg-amber-700 text-white"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {medal}
                  </div>

                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {entry.driverName.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                        {entry.driverName}
                      </span>
                      {isMe && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-black">
                          YOU
                        </span>
                      )}
                      <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {entry.rankIcon} Lv.{entry.level} {entry.rankTitle}
                      </span>
                    </div>
                    {entry.topCard && (
                      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        Ace Card: <strong className="text-zinc-700 dark:text-zinc-200">{entry.topCard.carName}</strong> ({rarityLabel(entry.topCard.tier)})
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats Pills */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="rounded-xl bg-zinc-100 px-3 py-1.5 text-center dark:bg-zinc-950">
                    <span className="block text-[9px] font-bold uppercase text-zinc-400">
                      Power
                    </span>
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                      ⚡ {entry.collectorPower.toLocaleString()}
                    </span>
                  </div>

                  <div className="rounded-xl bg-zinc-100 px-3 py-1.5 text-center dark:bg-zinc-950">
                    <span className="block text-[9px] font-bold uppercase text-zinc-400">
                      Mythic / Legend
                    </span>
                    <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                      💎 {entry.mythicCount} · 👑 {entry.legendCount}
                    </span>
                  </div>

                  <div className="rounded-xl bg-zinc-100 px-3 py-1.5 text-center dark:bg-zinc-950">
                    <span className="block text-[9px] font-bold uppercase text-zinc-400">
                      Clash Wins
                    </span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      ⚔️ {entry.clashWins}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

