"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DebuffCardDefinition } from "@/lib/crew-cards";
import { buzz } from "../ui/feedback";
import {
  RING_PERFECT_BAND,
  RING_START,
  RING_TARGET,
  attackBonus,
  baseCutFor,
  bonusMaxFor,
  debuffStatsFor,
  ringAccuracy,
  ringRadiusAt,
  ringSeconds,
} from "../debuff-impact";

/** For people who prefer reduced motion, the ring takes this many times longer to shrink. */
const REDUCED_MOTION_SLOWDOWN = 2.2;
/** How long the result stays on screen before it is handed back. */
const RESULT_MS = 900;

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

interface ClashImpactPanelProps {
  cornerNumber: number;
  /** The debuff as dealt (before the games decide how hard it lands). */
  debuff: DebuffCardDefinition;
  /** Whose car the debuff lands on, for the heading: "the rival's Skyline". */
  subject: string;
  /** Called once with the player's accuracy, 0 to 1. */
  onSubmit: (accuracy: number) => void;
  /** Settle with an average result instead of playing. */
  onSkip: () => void;
}

const confirmClass =
  "flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] [touch-action:manipulation] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm";

/**
 * "Lock On": the ATTACK game. A ring shrinks toward a target ring and the player taps to lock on. The debuff always cuts its
 * main stat by its base amount; a cleaner lock adds more off a second stat, and only a near-perfect lock adds the full bonus.
 * The rival's own game is never shown.
 */
export function ClashImpactPanel({ cornerNumber, debuff, subject, onSubmit, onSkip }: ClashImpactPanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<"ready" | "running" | "done">("ready");
  const [radius, setRadius] = useState(RING_START);
  const [result, setResult] = useState<{ accuracy: number; missed: boolean } | null>(null);
  const radiusRef = useRef(RING_START);
  const stoppedRef = useRef(false);
  const submitTimerRef = useRef<number | null>(null);
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const total = ringSeconds(debuff.tier) * (reducedMotion ? REDUCED_MOTION_SLOWDOWN : 1);
  const { primary, secondary } = debuff.clash ?? debuffStatsFor(debuff);
  const baseCut = debuff.clash?.baseCut ?? baseCutFor(debuff.tier);
  const bonusMax = debuff.clash?.bonusMax ?? bonusMaxFor(debuff.tier);

  /** Lock in the result and, after a moment to see it, hand it back. */
  const finish = useCallback((accuracy: number, missed: boolean) => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setResult({ accuracy, missed });
    setState("done");
    submitTimerRef.current = window.setTimeout(() => onSubmitRef.current(accuracy), RESULT_MS);
  }, []);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const tap = useCallback(() => finish(ringAccuracy(radiusRef.current), false), [finish]);

  // The ring shrinks from full size to nothing. If it is allowed to vanish, the lock is missed and scores 0.
  useEffect(() => {
    if (state !== "running") return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const next = ringRadiusAt(elapsed, total);
      radiusRef.current = next;
      setRadius(next);
      if (elapsed >= total) {
        finishRef.current(0, true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, total]);

  // If the panel goes away first (the player skipped), the pending hand-back must not fire.
  useEffect(
    () => () => {
      if (submitTimerRef.current !== null) window.clearTimeout(submitTimerRef.current);
    },
    []
  );

  // Space or Enter locks on, wherever the focus is.
  useEffect(() => {
    if (state !== "running") return;
    tapButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, tap]);

  const pct = result ? Math.round(result.accuracy * 100) : 0;
  const bonus = result ? attackBonus(debuff.tier, result.accuracy) : 0;
  const verdict = !result
    ? ""
    : result.missed
      ? `Missed the lock · +0 ${secondary.toUpperCase()}`
      : `${pct >= 90 ? "Perfect" : pct >= 60 ? "Good" : "Loose"} lock · ${pct}% · +${bonus} ${secondary.toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="impact-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-rose-500/70 bg-zinc-950 text-center shadow-[0_0_60px_rgba(244,63,94,0.35)] sm:max-h-[90dvh] sm:rounded-3xl sm:border-b-2"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
          <div className="gx-safe-t sm:pt-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-500/15 px-3 py-1">
              <span className="text-xs" aria-hidden>
                🎯
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">Corner {cornerNumber} · Attack</span>
            </div>
            <h3 id="impact-title" className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              Land the hit on {subject}
            </h3>
            <p className="mt-1 text-sm text-zinc-300">
              Tap when the shrinking ring matches the target ring. The lock zone is narrow, and only a near-perfect lock adds the full bonus.
            </p>
            <p className="mt-2 text-xs font-black text-amber-300">
              {debuff.icon} {debuff.name} · <span className="uppercase">{debuff.tier}</span>
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-zinc-400">
              Always <span className="text-rose-300">-{baseCut} {primary.toUpperCase()}</span>. Your lock can add up to{" "}
              <span className="text-rose-300">-{bonusMax} {secondary.toUpperCase()}</span> on top.
            </p>
          </div>

          <div className="mt-4">
            <div className="relative mx-auto aspect-square w-56 max-w-full sm:w-64" aria-hidden>
              {/* the target: the lock zone is the thick band around the ring */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-emerald-400/90 bg-emerald-400/10"
                style={{
                  width: `${(RING_TARGET + RING_PERFECT_BAND) * 100}%`,
                  height: `${(RING_TARGET + RING_PERFECT_BAND) * 100}%`,
                  borderWidth: 3,
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-emerald-200/70"
                style={{ width: `${RING_TARGET * 100}%`, height: `${RING_TARGET * 100}%` }}
              />
              {/* the shrinking ring */}
              {state !== "ready" && !(result && result.missed) && (
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.9)]"
                  style={{ width: `${radius * 100}%`, height: `${radius * 100}%` }}
                />
              )}
              {state === "ready" && <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60">{debuff.icon}</div>}
            </div>
            <p className="mt-3 text-[11px] font-bold text-zinc-400">
              The rival is bracing against your hit, so a good defence can still soften it.
              {reducedMotion ? " Reduced motion is on, so the ring moves slowly." : ""}
            </p>
            <p className="mt-1 min-h-5 text-sm font-black text-amber-300" aria-live="assertive">
              {verdict}
            </p>
          </div>
        </div>

        <div className="gx-safe-b shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 sm:px-6 sm:pb-5">
          <div ref={setFooterEl} />
          {footerEl &&
            createPortal(
              <>
                {state === "ready" && (
                  <button type="button" onClick={() => setState("running")} className={confirmClass} autoFocus>
                    Start
                    <span aria-hidden>→</span>
                  </button>
                )}
                {state === "running" && (
                  // Reacts on pointer down so there is no tap delay; click still handles the keyboard (Space or Enter on the button).
                  <button
                    ref={tapButtonRef}
                    type="button"
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      buzz(20);
                      tap();
                    }}
                    onClick={tap}
                    className={`${confirmClass} min-h-16 select-none text-base`}
                  >
                    Lock on! <span className="hidden text-xs font-bold opacity-80 sm:inline">(Space)</span>
                  </button>
                )}
                {state === "done" && (
                  <button type="button" disabled className={`${confirmClass} min-h-14`}>
                    Locked in
                  </button>
                )}
              </>,
              footerEl
            )}
          <button
            type="button"
            onClick={onSkip}
            className="gx-tap mt-1 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-xl px-3 text-xs font-bold text-zinc-400 [touch-action:manipulation] hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            Skip (average result)
          </button>
        </div>
      </div>
    </div>
  );
}
