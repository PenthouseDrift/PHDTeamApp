"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type FinaleAllocation,
  type FinaleChoice,
  type FinaleMode,
  type FinaleStat,
  type FinaleWeights,
} from "../finale";
import type { CornerFinalStats } from "../progression";

/** How long (seconds) the marker takes to cross the bar once. */
const SWEEP_SECONDS = 1.1;
/** Slower for people who prefer reduced motion. */
const SWEEP_SECONDS_REDUCED = 2.4;
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
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finale-title"
        className="relative my-auto w-full max-w-lg rounded-3xl border-2 border-cyan-400/70 bg-zinc-950 p-4 text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] sm:p-6"
      >
        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1">
          <span className="text-xs" aria-hidden>
            {info.icon}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 sm:text-[11px]">
            Corner {cornerNumber} · Final showdown
          </span>
        </div>
        <h3 id="finale-title" className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
          {info.title}
        </h3>
        <p className="mt-1 text-xs text-zinc-400">{info.blurb}</p>
        <p className="mt-1 text-[11px] font-bold text-zinc-500">
          {mode === "allocation"
            ? `Your ${carName}'s own stats don't count here: every stat starts at ${ALLOCATION_BASE} for both sides.`
            : `Your ${carName}. The rival car's stats are hidden until the reveal.`}
        </p>

        <div className="mt-4">
          {mode === "stat_duel" && <StatDuel playerStats={playerStats} onSubmit={onSubmit} />}
          {mode === "allocation" && <Allocation weights={weights} onSubmit={onSubmit} />}
          {mode === "timing" && <Timing playerStats={playerStats} onSubmit={onSubmit} />}
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-3 cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-bold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Skip (auto-pick for me)
        </button>
      </div>
    </div>
  );
}

const confirmClass =
  "mt-4 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm";

// ── 1. Stat Duel ────────────────────────────────────────────────────────────

function StatDuel({ playerStats, onSubmit }: { playerStats: CornerFinalStats; onSubmit: (c: FinaleChoice) => void }) {
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
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl border-2 px-2 py-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                selected
                  ? "-translate-y-0.5 border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{FINALE_STAT_LABEL[stat]}</span>
              <span className="text-2xl font-black text-amber-300">{playerStats[stat]}</span>
              <span className="text-[10px] font-black text-rose-400" aria-hidden>
                vs ?
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" disabled={picked === null} onClick={() => picked && onSubmit({ mode: "stat_duel", stat: picked })} className={confirmClass}>
        {picked ? `Lock in ${FINALE_STAT_LABEL[picked]}` : "Choose a stat"}
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

// ── 2. Setup Allocation ───────────────────────────────────────────────────

function Allocation({ weights, onSubmit }: { weights: FinaleWeights; onSubmit: (c: FinaleChoice) => void }) {
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
      <p className="mb-2 text-xs font-black text-zinc-200" aria-live="polite">
        Setup points left: <span className={left === 0 ? "text-emerald-300" : "text-amber-300"}>{left}</span> / {ALLOCATION_POOL}
      </p>
      <p className="mb-2 text-[10px] font-bold text-zinc-500">
        Each stat is a judge worth a different award. Beat the rival&apos;s stat to win its award.
      </p>
      <ul className="space-y-1.5">
        {FINALE_STATS.map((stat) => (
          <li key={stat} className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
            <span className="w-14 text-left text-[10px] font-black uppercase tracking-wider text-zinc-400">{FINALE_STAT_LABEL[stat]}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                weights[stat] === biggest
                  ? "border-amber-400 bg-amber-500/20 text-amber-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-300"
              }`}
              aria-label={`worth ${weights[stat]} points`}
            >
              {weights[stat]} pts
            </span>
            <span className="text-sm font-black text-zinc-300">{ALLOCATION_BASE}</span>
            <span className="text-xs font-black text-emerald-300">{alloc[stat] > 0 ? `+${alloc[stat]}` : ""}</span>
            <span className="text-xs font-black text-zinc-600" aria-hidden>
              vs ?
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => change(stat, -1)}
                disabled={alloc[stat] === 0}
                aria-label={`Take a point off ${FINALE_STAT_LABEL[stat]}`}
                className="h-9 w-9 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 text-lg font-black text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-black text-amber-300" aria-label={`${FINALE_STAT_LABEL[stat]} total ${ALLOCATION_BASE + alloc[stat]}`}>
                {ALLOCATION_BASE + alloc[stat]}
              </span>
              <button
                type="button"
                onClick={() => change(stat, 1)}
                disabled={left === 0}
                aria-label={`Add a point to ${FINALE_STAT_LABEL[stat]}`}
                className="h-9 w-9 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 text-lg font-black text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onSubmit({ mode: "allocation", allocation: alloc, weights })} className={confirmClass}>
        {left > 0 ? `Lock in setup (${left} unspent)` : "Lock in setup"}
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

// ── 3. Timing mini-game ───────────────────────────────────────────────────

function Timing({ playerStats, onSubmit }: { playerStats: CornerFinalStats; onSubmit: (c: FinaleChoice) => void }) {
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
  const sweep = reducedMotion ? SWEEP_SECONDS_REDUCED : SWEEP_SECONDS;

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

  // The marker sweeps left to right and back. Each full sweep takes a point off, until none are left.
  useEffect(() => {
    if (state !== "running") return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const sweeps = (now - startedAt) / 1000 / sweep;
      const phase = sweeps % 2;
      const next = phase < 1 ? phase : 2 - phase;
      posRef.current = next;
      setPos(next);
      const made = Math.floor(sweeps);
      if (made !== passesRef.current) {
        passesRef.current = made;
        setPasses(made);
      }
      if (made >= maxPoints) {
        timeOutRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, sweep, maxPoints]);

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
      <div className="relative mx-auto h-10 w-full overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-900" aria-hidden>
        <div className="absolute inset-y-0 left-[3%] right-[3%] bg-gradient-to-r from-rose-900/60 via-amber-500/30 to-rose-900/60" />
        <div className="absolute inset-y-0 left-[35%] right-[35%] bg-amber-400/20" />
        <div className="absolute inset-y-0 left-[47%] right-[47%] bg-emerald-400/70" />
        <div
          className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Points available</span>
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
        Every full pass of the marker takes 1 point off. At 0 the run ends by itself and scores 0.
        {reducedMotion ? " Reduced motion is on, so the marker moves slowly." : ""}
      </p>
      <p className="mt-1 min-h-5 text-sm font-black text-amber-300" aria-live="assertive">
        {result
          ? result.timedOut
            ? "Out of points · +0 pts"
            : `${Math.round(result.accuracy * 100)}% · +${earned} pts`
          : ""}
      </p>
      {state === "ready" && (
        <button type="button" onClick={() => setState("running")} className={confirmClass} autoFocus>
          Start run
          <span aria-hidden>→</span>
        </button>
      )}
      {state === "running" && (
        <button ref={stopButtonRef} type="button" onClick={stop} className={confirmClass}>
          Stop! (Space)
        </button>
      )}
    </div>
  );
}
