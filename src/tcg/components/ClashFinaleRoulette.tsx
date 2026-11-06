"use client";

import { useEffect, useRef, useState } from "react";
import { FINALE_MODES, FINALE_MODE_INFO, type FinaleMode } from "../finale";

/** The first flick lasts this long; every later one lasts longer, so the draw slows to a stop. */
const FIRST_TICK_MS = 70;
/** How much longer each flick gets (ms per flick, squared). Gives a spin of about 2.5 seconds. */
const SLOWDOWN = 1.4;
/** How long the winning game stays lit before the finale starts. */
const LANDED_HOLD_MS = 1100;
/** With reduced motion there is no spin: the result shows and holds this long. */
const REDUCED_HOLD_MS = 1600;

interface ClashFinaleRouletteProps {
  /** The game that was drawn. The spin always lands on it. */
  mode: FinaleMode;
  cornerNumber: number;
  onDone: () => void;
}

/**
 * The draw for the corner's finale: the three games light up one after another, slowing down, and stop on the one
 * that was picked. Calls `onDone` once, after the winning game has been shown for a moment.
 */
export function ClashFinaleRoulette({ mode, cornerNumber, onDone }: ClashFinaleRouletteProps) {
  const target = FINALE_MODES.indexOf(mode);
  const [lit, setLit] = useState(0);
  const [landed, setLanded] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timers: number[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      timers.push(
        window.setTimeout(() => {
          setLit(target);
          setLanded(true);
        }, 0),
        window.setTimeout(() => onDoneRef.current(), REDUCED_HOLD_MS)
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    }

    // Flick through the games, round and round, so the last flick lands on the drawn one: after `flicks` flicks the
    // lit game is (flicks - 1) % 3, which is `target` when flicks = 13 + target.
    const flicks = 13 + target;
    let elapsed = 0;
    for (let i = 0; i < flicks; i++) {
      elapsed += FIRST_TICK_MS + SLOWDOWN * i * i;
      const index = i % FINALE_MODES.length;
      const last = i === flicks - 1;
      timers.push(
        window.setTimeout(() => {
          setLit(index);
          if (last) setLanded(true);
        }, elapsed)
      );
    }
    timers.push(window.setTimeout(() => onDoneRef.current(), elapsed + LANDED_HOLD_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [target]);

  const info = FINALE_MODE_INFO[mode];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-lg rounded-3xl border-2 border-cyan-400/70 bg-zinc-950 p-4 text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] sm:p-6"
      >
        <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
            Corner {cornerNumber} · Drawing the final showdown
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" aria-hidden>
          {FINALE_MODES.map((m, i) => {
            const isLit = lit === i;
            const isWinner = landed && isLit;
            return (
              <div
                key={m}
                className={`flex min-h-[7rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1.5 py-4 transition-all duration-75 ${
                  isWinner
                    ? "scale-105 border-amber-400 bg-amber-500/20 shadow-[0_0_35px_rgba(245,158,11,0.7)]"
                    : isLit
                      ? "border-cyan-300 bg-cyan-500/20 shadow-[0_0_25px_rgba(34,211,238,0.5)]"
                      : "border-zinc-800 bg-zinc-900/60 opacity-60"
                }`}
              >
                <span className="text-3xl">{FINALE_MODE_INFO[m].icon}</span>
                <span className="text-[11px] font-black uppercase leading-tight tracking-wider text-white sm:text-xs">
                  {FINALE_MODE_INFO[m].title}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 min-h-6 text-sm font-black uppercase tracking-wider text-amber-300">
          {landed ? `${info.icon} ${info.title}!` : "Drawing…"}
        </p>
      </div>
    </div>
  );
}
