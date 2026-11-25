"use client";

import { nextLockedTier, rewardLabel, type BattlePassView } from "@/tcg/battle-pass/config";

const fmt = (n: number) => n.toLocaleString("en-GB");

/**
 * The Battle Pass on the game's top bar: this month's XP, and the next reward with how far away it is. Gifts that are ready
 * to open show as a green tag. Tapping it opens the Battle Pass tab.
 */
export function BattlePassStrip({ view, onOpen }: { view: BattlePassView; onOpen: () => void }) {
  const next = nextLockedTier(view);
  const xp = Math.min(view.xp, view.maxXp);
  const pct = Math.min(100, (xp / view.maxXp) * 100);
  const ready = view.readyCount;

  const nextText = next
    ? next.reward
      ? `${next.reward.kind === "pcredits" ? "🪙" : "🎟️"} ${rewardLabel(next.reward)}`
      : "❓ Mystery gift"
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Battle Pass: ${fmt(xp)} of ${fmt(view.maxXp)} XP this month.${
        ready > 0 ? ` ${ready} gift${ready === 1 ? "" : "s"} ready to open.` : ""
      }${next ? ` Next reward ${next.reward ? rewardLabel(next.reward) : "is a mystery gift"} in ${fmt(next.xp - view.xp)} XP.` : " Every gift reached."} Open the Battle Pass`}
      className={`gx-tap relative mt-2 block w-full rounded-xl border px-3 py-2 text-left transition-colors sm:mt-3 ${
        ready > 0 ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15" : "border-zinc-800 bg-zinc-900/60 hover:border-amber-500/40 hover:bg-zinc-900"
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide">
        <span className="text-amber-400">
          <span aria-hidden>🎖️</span> Battle Pass
        </span>
        <span className="tabular-nums text-zinc-300">
          {fmt(xp)}
          <span className="text-zinc-500"> / {fmt(view.maxXp)} XP</span>
        </span>
      </span>

      <span aria-hidden className="mt-1.5 block h-2 overflow-hidden rounded-full bg-zinc-800">
        <span className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </span>

      <span className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-bold text-zinc-200">
          {next ? (
            <>
              <span className="text-zinc-400">Next: </span>
              {nextText}
              <span className="font-semibold text-zinc-400"> · {fmt(next.xp - view.xp)} XP to go</span>
            </>
          ) : (
            <span className="text-emerald-300">Every gift reached this month</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {ready > 0 && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-black">🎁 {ready} ready</span>}
          <span aria-hidden className="text-zinc-500">
            ›
          </span>
        </span>
      </span>
    </button>
  );
}
