"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBattlePassAction, openBattlePassGiftAction, type OpenGiftResult } from "@/tcg/battle-pass/actions";
import { rewardLabel, type BattlePassTierView, type BattlePassView } from "@/tcg/battle-pass/config";
import { BattlePassGiftReveal } from "@/tcg/battle-pass/components/BattlePassGiftReveal";
import { TabSkeleton } from "@/tcg/ui/Shimmer";

/** Time left until the pass starts again, like "12d 4h" or "3h 20m". */
function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const fmt = (n: number) => n.toLocaleString("en-GB");

function RewardIcon({ kind }: { kind: "pcredits" | "packcredits" }) {
  return (
    <span aria-hidden className="text-xl">
      {kind === "pcredits" ? "🪙" : "🎟️"}
    </span>
  );
}

/**
 * The monthly Battle Pass: this month's XP on a ladder from 0 to the top, every gift on it laid out in order, and a button
 * for each gift that has been reached but not opened. It loads its own numbers when it opens (XP is earned in other tabs), and
 * tells the game when the wallet or the count of waiting gifts changes.
 */
export function BattlePassTab({
  isAdmin,
  initialView = null,
  onBalances,
  onViewChange,
}: {
  isAdmin: boolean;
  /** The pass as the page loaded it, shown straight away while the latest is fetched. */
  initialView?: BattlePassView | null;
  onBalances: (balances: { pCredits: number; packCredits: number }) => void;
  /** Called with the latest pass whenever it is loaded or a gift is opened, so the rest of the game stays in step. */
  onViewChange: (view: BattlePassView) => void;
}) {
  const [view, setView] = useState<BattlePassView | null>(initialView);
  const hasView = useRef(initialView !== null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The gift being opened right now.
  const [opening, setOpening] = useState<string | null>(null);

  // The latest callback, kept in a ref so a new function on every render of the parent can't restart the load below.
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  });
  const apply = useCallback((next: BattlePassView) => {
    setView(next);
    onViewChangeRef.current(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getBattlePassAction()
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          hasView.current = true;
          apply(res.data);
        } else if (!hasView.current) setError(res.error);
      })
      .catch(() => {
        if (!cancelled && !hasView.current) setError("Could not load the Battle Pass.");
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // The countdown ticks once a minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-300">
        {error}
      </p>
    );
  }
  if (!view) return <TabSkeleton label="Loading the Battle Pass" />;

  if (view.tiers.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="text-3xl" aria-hidden>
          🎖️
        </p>
        <h2 className="mt-2 text-lg font-black text-zinc-900 dark:text-zinc-100">The Battle Pass isn&apos;t open right now</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Check back soon. Your XP is still counting.</p>
      </section>
    );
  }

  const ready = view.tiers.filter((t) => t.state === "ready");
  const nextLocked = view.tiers.find((t) => t.state === "locked");
  const pct = Math.min(100, (view.xp / view.maxXp) * 100);
  const atTop = view.xp >= view.maxXp;
  const openingTier = opening ? view.tiers.find((t) => t.id === opening) : null;
  // Opening one gift moves on to the next waiting one, so there is always something to tap until they are all open.
  const nextReady = ready.find((t) => t.id !== opening);

  async function openGift(tierId: string) {
    const res = await openBattlePassGiftAction(tierId);
    if (res.success) {
      const data: OpenGiftResult = res.data;
      onBalances({ pCredits: data.pCredits, packCredits: data.packCredits });
      apply(data.view);
    }
    return res;
  }

  return (
    <div className="space-y-4">
      {!view.enabled && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {isAdmin ? "The Battle Pass is switched off, so only admins can see this. Gifts can't be opened yet." : "The Battle Pass isn't open right now."}
        </p>
      )}

      {/* ── This month ── */}
      <section
        aria-label="Your progress"
        className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4 text-white shadow-lg dark:border-zinc-800"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/15 blur-2xl" />
        <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300">Battle Pass · {view.monthLabel}</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums">
              {fmt(Math.min(view.xp, view.maxXp))}
              <span className="text-base font-bold text-zinc-400"> / {fmt(view.maxXp)} XP</span>
            </p>
          </div>
          <p className="text-xs font-bold text-zinc-300">
            <span aria-hidden>⏳</span> Resets in {timeLeft(view.resetsAt - now)}
          </p>
        </div>

        <div
          role="progressbar"
          aria-label="Battle Pass XP this month"
          aria-valuemin={0}
          aria-valuemax={view.maxXp}
          aria-valuenow={Math.min(view.xp, view.maxXp)}
          className="relative mt-3 h-3 overflow-hidden rounded-full bg-zinc-800"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="relative mt-2 text-xs text-zinc-300">
          {atTop
            ? "You've reached the top of the pass this month. Every gift is yours."
            : nextLocked
              ? `Next gift in ${fmt(nextLocked.xp - view.xp)} XP. Win Clash battles, challenges and Campaign rounds to earn XP.`
              : "Every gift is unlocked."}
        </p>
      </section>

      {/* ── Gifts waiting ── */}
      {ready.length > 0 && view.enabled && (
        <section aria-label="Gifts ready to open" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-black text-zinc-900 dark:text-zinc-100">
                <span aria-hidden>🎁</span> {ready.length} gift{ready.length === 1 ? "" : "s"} ready
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Tap to open one. They wait for you until you do.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpening(ready[0].id)}
              className="gx-tap inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-black text-black hover:bg-emerald-400"
            >
              Open a gift
            </button>
          </div>
        </section>
      )}

      {/* ── Every gift on the pass ── */}
      <section aria-label="All Battle Pass rewards">
        <h2 className="mb-2 px-1 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">All rewards</h2>
        <ol className="space-y-2">
          {view.tiers.map((t, i) => (
            <TierRow
              key={t.id}
              tier={t}
              index={i}
              isNext={nextLocked?.id === t.id}
              enabled={view.enabled}
              onOpen={() => setOpening(t.id)}
            />
          ))}
        </ol>
      </section>

      {openingTier && (
        <BattlePassGiftReveal
          key={openingTier.id}
          tierXp={openingTier.xp}
          secret={openingTier.secret}
          remaining={ready.filter((t) => t.id !== openingTier.id).length}
          onOpen={() => openGift(openingTier.id)}
          onClose={() => setOpening(null)}
          onNext={() => setOpening(nextReady?.id ?? null)}
        />
      )}
    </div>
  );
}

function TierRow({
  tier,
  index,
  isNext,
  enabled,
  onOpen,
}: {
  tier: BattlePassTierView;
  index: number;
  isNext: boolean;
  enabled: boolean;
  onOpen: () => void;
}) {
  const { state, reward, secret } = tier;
  const mystery = reward === null;
  const tone =
    state === "ready"
      ? "border-emerald-500/60 bg-emerald-500/10"
      : state === "opened"
        ? "border-zinc-200 bg-zinc-50 opacity-80 dark:border-zinc-800 dark:bg-zinc-900/60"
        : isNext
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";

  const body = (
    <>
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${
          state === "opened" ? "bg-emerald-500 text-black" : state === "ready" ? "bg-emerald-400 text-black" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {state === "opened" ? "✓" : index + 1}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-zinc-100">
          {mystery ? (
            <>
              <span aria-hidden className="text-xl">
                ❓
              </span>
              <span>Mystery gift</span>
            </>
          ) : (
            <>
              <RewardIcon kind={reward.kind} />
              <span>{rewardLabel(reward)}</span>
            </>
          )}
          {secret && !mystery && (
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-violet-600 dark:text-violet-300">Was a mystery</span>
          )}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {fmt(tier.xp)} XP{isNext ? " · up next" : ""}
        </span>
      </span>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${
          state === "ready" ? "bg-emerald-500 text-black" : state === "opened" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {state === "ready" ? (enabled ? "Open" : "Ready") : state === "opened" ? "Opened" : "🔒 Locked"}
      </span>
    </>
  );

  return (
    <li>
      {state === "ready" && enabled ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open the gift unlocked at ${fmt(tier.xp)} XP`}
          className={`gx-tap flex w-full items-center gap-3 rounded-2xl border p-3 transition-colors hover:border-emerald-400 ${tone}`}
        >
          {body}
        </button>
      ) : (
        <div className={`flex items-center gap-3 rounded-2xl border p-3 ${tone}`}>{body}</div>
      )}
    </li>
  );
}
