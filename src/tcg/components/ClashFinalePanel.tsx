"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buzz } from "../ui/feedback";
import {
  ALLOCATION_BASE,
  ALLOCATION_POOL,
  FINALE_MODE_INFO,
  FINALE_STATS,
  FINALE_STAT_LABEL,
  allocationTotal,
  proportionalAllocation,
  timingAccuracy,
  timingMaxPoints,
  timingPassSeconds,
  type FinaleAllocation,
  type FinaleChoice,
  type FinaleMode,
  type FinaleStat,
  type FinaleWeights,
} from "../finale";
import type { CornerFinalStats } from "../progression";

/** For people who prefer reduced motion, every pass takes this many times longer. */
const REDUCED_MOTION_SLOWDOWN = 2.2;
/** How long the result of a timing run stays on screen before the finale is settled. */
const TIMING_RESULT_MS = 900;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface ClashFinalePanelProps {
  mode: FinaleMode;
  cornerNumber: number;
  carName: string;
  /** The player's own stats for this corner (after Crew, track and debuffs). The rival's are never passed in. */
  playerStats: CornerFinalStats;
  /** What each stat's judge is worth in the Setup Allocation game (dealt at random, the same for both sides). */
  weights: FinaleWeights;
  onSubmit: (choice: FinaleChoice) => void;
  /** Settle the finale with default picks. */
  onSkip: () => void;
}

/**
 * The last decision on a corner. Shows the player's own stats and keeps the rival's hidden. Calls `onSubmit` once, with
 * the player's pick.
 */
export function ClashFinalePanel({ mode, cornerNumber, carName, playerStats, weights, onSubmit, onSkip }: ClashFinalePanelProps) {
  const info = FINALE_MODE_INFO[mode];
  // The main action of each mode is portalled into this footer so it stays pinned at the bottom while the rest scrolls.
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finale-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-cyan-400/70 bg-zinc-950 text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] sm:max-h-[90dvh] sm:rounded-3xl sm:border-b-2"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
          <div className="gx-safe-t sm:pt-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1">
              <span className="text-xs" aria-hidden>
                {info.icon}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
                Corner {cornerNumber} · Final showdown
              </span>
            </div>
            <h3 id="finale-title" className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              {info.title}
            </h3>
            <p className="mt-1 text-sm text-zinc-300">{info.blurb}</p>
            <p className="mt-1 text-[11px] font-bold text-zinc-400">
              {mode === "allocation"
                ? `Your ${carName}'s own stats don't count here: every stat starts at ${ALLOCATION_BASE} for both sides.`
                : `Your ${carName}. The rival car's stats are hidden until the reveal.`}
            </p>
          </div>

          <div className="mt-4">
            {mode === "stat_duel" && <StatDuel playerStats={playerStats} onSubmit={onSubmit} footerEl={footerEl} />}
            {mode === "allocation" && <Allocation weights={weights} onSubmit={onSubmit} footerEl={footerEl} />}
            {mode === "timing" && <Timing playerStats={playerStats} onSubmit={onSubmit} footerEl={footerEl} />}
          </div>
        </div>

        <div className="gx-safe-b shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 sm:px-6 sm:pb-5">
          <div ref={setFooterEl} />
          <button
            type="button"
            onClick={onSkip}
            className="gx-tap mt-1 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-xl px-3 text-xs font-bold text-zinc-400 [touch-action:manipulation] hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            Skip (auto-pick for me)
          </button>
        </div>
      </div>
    </div>
  );
}

/** Puts a mode's main action into the pinned footer (nothing until the footer has mounted). */
function Pinned({ footerEl, children }: { footerEl: HTMLDivElement | null; children: React.ReactNode }) {
  return footerEl ? createPortal(children, footerEl) : null;
}

const confirmClass =
  "flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] [touch-action:manipulation] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm";

// ── 1. Stat Duel ────────────────────────────────────────────────────────────

function StatDuel({ playerStats, onSubmit, footerEl }: { playerStats: CornerFinalStats; onSubmit: (c: FinaleChoice) => void; footerEl: HTMLDivElement | null }) {
  const [picked, setPicked] = useState<FinaleStat | null>(null);
  return (
    <div>
      <div role="radiogroup" aria-label="Pick the stat to set against the rival's" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FINALE_STATS.map((stat) => {
          const selected = picked === stat;
          return (
            <button
              key={stat}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${FINALE_STAT_LABEL[stat]}, your value ${playerStats[stat]}, rival value hidden`}
              onClick={() => setPicked(stat)}
              className={`gx-tap flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-3 transition-all [touch-action:manipulation] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                selected
                  ? "-translate-y-0.5 border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">{FINALE_STAT_LABEL[stat]}</span>
              <span className="text-2xl font-black text-amber-300">{playerStats[stat]}</span>
              <span className="text-[11px] font-black text-rose-400" aria-hidden>
                vs ?
              </span>
            </button>
          );
        })}
      </div>
      <Pinned footerEl={footerEl}>
        <button
          type="button"
          disabled={picked === null}
          onClick={() => {
            if (!picked) return;
            buzz(15);
            onSubmit({ mode: "stat_duel", stat: picked });
          }}
          className={confirmClass}
        >
          {picked ? `Lock in ${FINALE_STAT_LABEL[picked]}` : "Choose a stat"}
          <span aria-hidden>→</span>
        </button>
      </Pinned>
    </div>
  );
}

// ── 2. Setup Allocation ───────────────────────────────────────────────────

function Allocation({ weights, onSubmit, footerEl }: { weights: FinaleWeights; onSubmit: (c: FinaleChoice) => void; footerEl: HTMLDivElement | null }) {
  // Starts spread in proportion to what each judge is worth; change it however you like.
  const [alloc, setAlloc] = useState<FinaleAllocation>(() => proportionalAllocation(weights));
  const left = ALLOCATION_POOL - allocationTotal(alloc);
  const biggest = Math.max(...FINALE_STATS.map((s) => weights[s]));

  const change = (stat: FinaleStat, delta: number) =>
    setAlloc((prev) => {
      const next = { ...prev, [stat]: Math.max(0, prev[stat] + delta) };
      return allocationTotal(next) > ALLOCATION_POOL ? prev : next;
    });

  return (
    <div>
      <p className="mb-2 text-sm font-black text-zinc-200" aria-live="polite">
        Setup points left: <span className={left === 0 ? "text-emerald-300" : "text-amber-300"}>{left}</span> / {ALLOCATION_POOL}
      </p>
      <p className="mb-2 text-[11px] font-bold text-zinc-400">
        Each stat is a judge worth a different award. Beat the rival&apos;s stat to win its award.
      </p>
      <ul className="space-y-1.5">
        {FINALE_STATS.map((stat) => (
          <li key={stat} className="flex items-center gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-2 py-2 sm:gap-2 sm:px-2.5">
            <span className="w-12 shrink-0 text-left text-[11px] font-black uppercase tracking-wider text-zinc-400 sm:w-14">{FINALE_STAT_LABEL[stat]}</span>
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-black ${
                weights[stat] === biggest
                  ? "border-amber-400 bg-amber-500/20 text-amber-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300"
              }`}
              aria-label={`worth ${weights[stat]} points`}
            >
              {weights[stat]} pts
            </span>
            <span className="hidden text-sm font-black text-zinc-300 min-[400px]:inline">{ALLOCATION_BASE}</span>
            <span className="text-xs font-black text-emerald-300">{alloc[stat] > 0 ? `+${alloc[stat]}` : ""}</span>
            <span className="hidden text-xs font-black text-zinc-500 sm:inline" aria-hidden>
              vs ?
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => change(stat, -1)}
                disabled={alloc[stat] === 0}
                aria-label={`Take a point off ${FINALE_STAT_LABEL[stat]}`}
                className="gx-tap h-11 w-11 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 text-xl font-black text-white [touch-action:manipulation] hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <span className="w-9 text-center text-base font-black text-amber-300" aria-label={`${FINALE_STAT_LABEL[stat]} total ${ALLOCATION_BASE + alloc[stat]}`}>
                {ALLOCATION_BASE + alloc[stat]}
              </span>
              <button
                type="button"
                onClick={() => change(stat, 1)}
                disabled={left === 0}
                aria-label={`Add a point to ${FINALE_STAT_LABEL[stat]}`}
                className="gx-tap h-11 w-11 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 text-xl font-black text-white [touch-action:manipulation] hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Pinned footerEl={footerEl}>
        <button
          type="button"
          onClick={() => {
            buzz(15);
            onSubmit({ mode: "allocation", allocation: alloc, weights });
          }}
          className={confirmClass}
        >
          {left > 0 ? `Lock in setup (${left} unspent)` : "Lock in setup"}
          <span aria-hidden>→</span>
        </button>
      </Pinned>
    </div>
  );
}

// ── 3. Timing mini-game ───────────────────────────────────────────────────

function Timing({ playerStats, onSubmit, footerEl }: { playerStats: CornerFinalStats; onSubmit: (c: FinaleChoice) => void; footerEl: HTMLDivElement | null }) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<"ready" | "running" | "done">("ready");
  const [pos, setPos] = useState(0);
  // Full passes the marker has made from one side of the bar to the other. Each takes 1 point off.
  const [passes, setPasses] = useState(0);
  const [result, setResult] = useState<{ accuracy: number; passes: number; timedOut: boolean } | null>(null);
  const posRef = useRef(0);
  const passesRef = useRef(0);
  const stoppedRef = useRef(false);
  const submitTimerRef = useRef<number | null>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const maxPoints = timingMaxPoints(playerStats);
  const available = Math.max(0, maxPoints - passes);
  const slowdown = reducedMotion ? REDUCED_MOTION_SLOWDOWN : 1;

  /** Lock in the run and, after a moment to see the result, hand it to the finale. */
  const finishRun = useCallback(
    (accuracy: number, madePasses: number, timedOut: boolean) => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      setResult({ accuracy, passes: madePasses, timedOut });
      setState("done");
      submitTimerRef.current = window.setTimeout(
        () => onSubmit({ mode: "timing", accuracy, passes: madePasses }),
        TIMING_RESULT_MS
      );
    },
    [onSubmit]
  );

  const stop = useCallback(() => finishRun(timingAccuracy(posRef.current), passesRef.current, false), [finishRun]);

  // When every point has been taken off, the run carries on by itself and scores nothing.
  const timeOut = useCallback(() => finishRun(0, maxPoints, true), [finishRun, maxPoints]);
  const timeOutRef = useRef(timeOut);
  useEffect(() => {
    timeOutRef.current = timeOut;
  }, [timeOut]);

  // The marker crosses the bar again and again, starting very fast and slowing with every pass. Each full pass takes a
  // point off, until none are left.
  useEffect(() => {
    if (state !== "running") return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      // Which pass we are in, and how far through it.
      let made = 0;
      let passStart = 0;
      let duration = timingPassSeconds(0, maxPoints) * slowdown;
      while (made < maxPoints && elapsed >= passStart + duration) {
        passStart += duration;
        made += 1;
        duration = timingPassSeconds(made, maxPoints) * slowdown;
      }
      if (made >= maxPoints) {
        timeOutRef.current();
        return;
      }
      const through = (elapsed - passStart) / duration;
      // Even passes go left to right, odd ones come back.
      const next = made % 2 === 0 ? through : 1 - through;
      posRef.current = next;
      setPos(next);
      if (made !== passesRef.current) {
        passesRef.current = made;
        setPasses(made);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, slowdown, maxPoints]);

  // If the panel goes away first (the player skipped), the pending submit must not fire.
  useEffect(
    () => () => {
      if (submitTimerRef.current !== null) window.clearTimeout(submitTimerRef.current);
    },
    []
  );

  // Space or Enter stops the marker, wherever the focus is.
  useEffect(() => {
    if (state !== "running") return;
    stopButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, stop]);

  const earned = result ? Math.round(result.accuracy * Math.max(0, maxPoints - result.passes)) : 0;

  return (
    <div>
      <div className="relative mx-auto h-12 w-full overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-900" aria-hidden>
        <div className="absolute inset-y-0 left-[3%] right-[3%] bg-gradient-to-r from-rose-900/60 via-amber-500/30 to-rose-900/60" />
        <div className="absolute inset-y-0 left-[35%] right-[35%] bg-amber-400/20" />
        <div className="absolute inset-y-0 left-[47%] right-[47%] bg-emerald-400/70" />
        <div
          className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Points available</span>
        <span
          key={available}
          className={`min-w-8 rounded-xl border-2 px-2 py-0.5 text-lg font-black motion-safe:animate-in motion-safe:zoom-in-125 motion-safe:duration-200 ${
            available <= 2 ? "border-rose-500/70 bg-rose-500/15 text-rose-300" : "border-amber-400/60 bg-amber-500/10 text-amber-300"
          }`}
        >
          {available}
        </span>
      </div>
      <p className="mt-1 text-[11px] font-bold text-zinc-400">
        The marker starts very fast and slows down, but every full pass takes 1 point off. At 0 the run ends by itself and scores 0.
        {reducedMotion ? " Reduced motion is on, so the marker moves slowly." : ""}
      </p>
      <p className="mt-1 min-h-5 text-sm font-black text-amber-300" aria-live="assertive">
        {result
          ? result.timedOut
            ? "Out of points · +0 pts"
            : `${Math.round(result.accuracy * 100)}% · +${earned} pts`
          : ""}
      </p>
      <Pinned footerEl={footerEl}>
        {state === "ready" && (
          <button type="button" onClick={() => setState("running")} className={confirmClass} autoFocus>
            Start run
            <span aria-hidden>→</span>
          </button>
        )}
        {state === "running" && (
          // Reacts on pointer down so there is no tap delay; click still handles the keyboard (Space or Enter on the button).
          <button
            ref={stopButtonRef}
            type="button"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              buzz(20);
              stop();
            }}
            onClick={stop}
            className={`${confirmClass} min-h-16 select-none text-base`}
          >
            Stop! <span className="hidden text-xs font-bold opacity-80 sm:inline">(Space)</span>
          </button>
        )}
        {state === "done" && (
          <button type="button" disabled className={`${confirmClass} min-h-14`}>
            Locked in
          </button>
        )}
      </Pinned>
    </div>
  );
}
