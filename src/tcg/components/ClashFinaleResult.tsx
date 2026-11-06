"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOCATION_BASE,
  DEFAULT_ALLOCATION_WEIGHTS,
  FINALE_MODE_INFO,
  FINALE_STATS,
  FINALE_STAT_LABEL,
  sanitizeAllocation,
  timingMaxPoints,
  type FinaleOutcome,
} from "../finale";
import type { CornerFinalStats } from "../progression";

/** Time before the first row appears. */
const FIRST_ROW_MS = 500;
/** Time between rows. */
const ROW_MS = 800;
/** How long the points take to count up into the corner total. */
const TALLY_MS = 1400;
/** How long the finished tally stays up before the clash and the reveal start. */
const HOLD_MS = 2000;

interface Row {
  label: string;
  you: string;
  youSub?: string;
  rival: string;
  rivalSub?: string;
  /** Points this row is worth to each side (0 shows no badge). */
  youPts: number;
  rivalPts: number;
}

/** One line per comparison that decided the points: a stat each, a judge each, or a timing run each. */
function buildRows(outcome: FinaleOutcome, playerStats: CornerFinalStats, rivalStats: CornerFinalStats): Row[] {
  const { playerChoice: pc, rivalChoice: rc } = outcome;

  if (pc.mode === "stat_duel" && rc.mode === "stat_duel") {
    return [
      {
        label: `You picked ${FINALE_STAT_LABEL[pc.stat]}`,
        you: String(playerStats[pc.stat]),
        rival: String(rivalStats[pc.stat]),
        youPts: outcome.playerPoints,
        rivalPts: 0,
      },
      {
        label: `Rival picked ${FINALE_STAT_LABEL[rc.stat]}`,
        you: String(playerStats[rc.stat]),
        rival: String(rivalStats[rc.stat]),
        youPts: 0,
        rivalPts: outcome.rivalPoints,
      },
    ];
  }

  if (pc.mode === "allocation" && rc.mode === "allocation") {
    const pa = sanitizeAllocation(pc.allocation);
    const ra = sanitizeAllocation(rc.allocation);
    const weights = pc.weights ?? DEFAULT_ALLOCATION_WEIGHTS;
    return FINALE_STATS.map((stat) => {
      const you = ALLOCATION_BASE + pa[stat];
      const rival = ALLOCATION_BASE + ra[stat];
      return {
        label: `${FINALE_STAT_LABEL[stat]} · worth ${weights[stat]}`,
        you: String(you),
        youSub: `${ALLOCATION_BASE} + ${pa[stat]}`,
        rival: String(rival),
        rivalSub: `${ALLOCATION_BASE} + ${ra[stat]}`,
        youPts: you > rival ? weights[stat] : 0,
        rivalPts: rival > you ? weights[stat] : 0,
      };
    });
  }

  if (pc.mode === "timing" && rc.mode === "timing") {
    return [
      {
        label: "Your run",
        you: `${Math.round(pc.accuracy * 100)}%`,
        youSub: pc.passes >= timingMaxPoints(playerStats) ? "out of points" : `after ${pc.passes} ${pc.passes === 1 ? "pass" : "passes"}`,
        rival: "–",
        youPts: outcome.playerPoints,
        rivalPts: 0,
      },
      {
        label: "Rival's run",
        you: "–",
        rival: `${Math.round(rc.accuracy * 100)}%`,
        rivalSub: `after ${rc.passes} ${rc.passes === 1 ? "pass" : "passes"}`,
        youPts: 0,
        rivalPts: outcome.rivalPoints,
      },
    ];
  }
  return [];
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface ClashFinaleResultProps {
  outcome: FinaleOutcome;
  cornerNumber: number;
  /** Your car's stats and the rival's. Only the stats the finale compared are shown. */
  playerStats: CornerFinalStats;
  rivalStats: CornerFinalStats;
  /** Your corner score before and after the finale's points. */
  playerScoreBefore: number;
  playerScoreAfter: number;
  /** Called once, when the tally has finished and held (or the player continues). */
  onDone: () => void;
}

/**
 * What the finale decided, shown right after the player's pick: the comparison line by line, then both sides' points
 * counting up into the corner total. The rival's corner total stays hidden until the reveal that follows.
 */
export function ClashFinaleResult({
  outcome,
  cornerNumber,
  playerStats,
  rivalStats,
  playerScoreBefore,
  playerScoreAfter,
  onDone,
}: ClashFinaleResultProps) {
  const rows = buildRows(outcome, playerStats, rivalStats);
  const info = FINALE_MODE_INFO[outcome.mode];
  const [shownRows, setShownRows] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tallyStarted, setTallyStarted] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rowCount = rows.length;

    // The tally: both sides' points count up into the total.
    const startTally = () => {
      setTallyStarted(true);
      const startedAt = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / TALLY_MS);
        setProgress(easeOut(t));
        if (t < 1) frameRef.current = requestAnimationFrame(tick);
        else timers.push(window.setTimeout(finish, HOLD_MS));
      };
      frameRef.current = requestAnimationFrame(tick);
    };

    if (reduced) {
      // No motion: everything is shown at once and held a little longer to read.
      timers.push(
        window.setTimeout(() => {
          setShownRows(rowCount);
          setTallyStarted(true);
          setProgress(1);
        }, 0),
        window.setTimeout(finish, HOLD_MS + 2000)
      );
    } else {
      for (let i = 0; i < rowCount; i++) {
        timers.push(window.setTimeout(() => setShownRows(i + 1), FIRST_ROW_MS + i * ROW_MS));
      }
      timers.push(window.setTimeout(startTally, FIRST_ROW_MS + rowCount * ROW_MS + 300));
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      cancelAnimationFrame(frameRef.current);
    };
    // The outcome never changes while this panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const youPts = Math.round(outcome.playerPoints * progress);
  const rivalPts = Math.round(outcome.rivalPoints * progress);
  const yourTotal = Math.round(playerScoreBefore + (playerScoreAfter - playerScoreBefore) * progress);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finale-result-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-cyan-400/70 bg-zinc-950 text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] sm:max-h-[90dvh] sm:rounded-3xl sm:border-b-2"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
          <div className="gx-safe-t sm:pt-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1">
              <span className="text-xs" aria-hidden>
                {info.icon}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
                Corner {cornerNumber} · {info.title} result
              </span>
            </div>
            <h3 id="finale-result-title" className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              Comparison
            </h3>
          </div>
          <div className="mt-3 grid grid-cols-[1.1fr_1fr_1fr] gap-x-2 px-2 text-[11px] font-black uppercase tracking-wider text-zinc-400">
            <span className="text-left">&nbsp;</span>
            <span className="text-amber-300">You</span>
            <span className="text-rose-300">Rival</span>
          </div>
          <ul className="mt-1 space-y-1.5" aria-live="polite">
            {rows.map((row, i) => {
              const shown = i < shownRows;
              return (
                <li
                  key={`${row.label}-${i}`}
                  className={`grid grid-cols-[1.1fr_1fr_1fr] items-center gap-x-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-2 py-2 transition-all duration-300 ${
                    shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                  }`}
                  aria-hidden={!shown}
                >
                  <span className="text-left text-[11px] font-black uppercase leading-tight tracking-wide text-zinc-300">{row.label}</span>
                  <Cell value={row.you} sub={row.youSub} pts={row.youPts} tone="you" win={row.youPts > row.rivalPts} />
                  <Cell value={row.rival} sub={row.rivalSub} pts={row.rivalPts} tone="rival" win={row.rivalPts > row.youPts} />
                </li>
              );
            })}
          </ul>
          <div
            className={`mt-4 rounded-2xl border-2 border-amber-400/50 bg-amber-500/10 p-3 transition-opacity duration-300 ${
              tallyStarted ? "opacity-100" : "opacity-30"
            }`}
          >
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-300">Finale points</p>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-3xl font-black tabular-nums text-amber-300">{signed(youPts)}</p>
                <p className="text-[11px] font-bold text-zinc-300">
                  Your corner score <span className="text-sm font-black tabular-nums text-white">{yourTotal}</span>
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tabular-nums text-rose-300">{signed(rivalPts)}</p>
                <p className="text-[11px] font-bold text-zinc-400">Rival total revealed next</p>
              </div>
            </div>
          </div>
        </div>
        <div className="gx-safe-b shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 sm:px-6 sm:pb-5">
          <button
            type="button"
            autoFocus
            onClick={finish}
            className="gx-tap flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all [touch-action:manipulation] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] sm:text-sm"
          >
            <span>Reveal the rival</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Cell({
  value,
  sub,
  pts,
  tone,
  win,
}: {
  value: string;
  sub?: string;
  pts: number;
  tone: "you" | "rival";
  win: boolean;
}) {
  const colour = tone === "you" ? "text-amber-300" : "text-rose-300";
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className={`text-xl font-black ${win ? colour : "text-zinc-300"}`}>{value}</span>
      {sub && <span className="text-[11px] font-bold text-zinc-400">{sub}</span>}
      {pts !== 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
            pts > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {signed(pts)} pts
        </span>
      )}
    </span>
  );
}
