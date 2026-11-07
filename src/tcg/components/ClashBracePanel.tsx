"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DebuffCardDefinition } from "@/lib/crew-cards";
import { buzz } from "../ui/feedback";
import {
  BRACE_SECONDS,
  BRACE_START,
  BRACE_ZONE_HALF,
  DEFENCE_MAX_BLOCK,
  braceAccuracy,
  braceGust,
  braceInZone,
  braceStep,
  braceStrength,
  defenceShare,
  rollBracePhases,
  type BraceState,
} from "../debuff-impact";

/** For people who prefer reduced motion, the gusts are this much weaker. */
const REDUCED_MOTION_GUST = 0.6;
/** How long the result stays on screen before it is handed back. */
const RESULT_MS = 1000;
/** A long frame (a tab in the background) never moves the marker more than this many seconds at once. */
const MAX_FRAME_SECONDS = 0.05;
/** How much of the real wind the practice uses: off, half, three quarters, or the real thing. */
const PRACTICE_WIND_LEVELS = [0, 0.5, 0.75, 1] as const;
/** After Start, the game counts down 3, 2, 1 (this long each) before the wind begins. */
const COUNTDOWN_STEPS = 3;
const COUNTDOWN_STEP_MS = 700;

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

interface ClashBracePanelProps {
  cornerNumber: number;
  /** The debuff coming at the player, as dealt. */
  debuff: DebuffCardDefinition;
  /** The player's own car, for the heading. */
  subject: string;
  /** Called once with the player's accuracy, 0 to 1. */
  onSubmit: (accuracy: number) => void;
  /** Settle with an average result instead of playing. */
  onSkip: () => void;
}

const confirmClass =
  "flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] [touch-action:manipulation] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm";

const steerClass =
  "flex flex-1 cursor-pointer select-none items-center justify-center rounded-2xl border-2 border-cyan-400/60 bg-cyan-500/15 px-3 text-lg font-black uppercase tracking-wider text-cyan-100 [touch-action:none] transition-colors hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-cyan-400/40";

/**
 * "Brace": the DEFEND game, and nothing like Lock On. Gusts push a marker along a track and the player holds the left or right
 * button to counter-steer, keeping it inside the safe zone. The share of the time spent inside is the accuracy, and a perfect
 * brace blocks at most half of the debuff. Before the game starts there is a practice (nothing is scored) on the same track, with
 * the wind adjustable, so the player can get the feel of the buttons. The rival's own game is never shown.
 */
export function ClashBracePanel({ cornerNumber, debuff, subject, onSubmit, onSkip }: ClashBracePanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<"ready" | "countdown" | "running" | "done">("ready");
  const [count, setCount] = useState(COUNTDOWN_STEPS);
  const [marker, setMarker] = useState<BraceState>(BRACE_START);
  const [gust, setGust] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [phases] = useState(() => rollBracePhases());
  // Which way the player is holding (-1 left, 0 none, 1 right), from the on-screen buttons or the keys.
  const inputRef = useRef<-1 | 0 | 1>(0);

  // Practice, before the game starts.
  const [windLevel, setWindLevel] = useState<(typeof PRACTICE_WIND_LEVELS)[number]>(1);
  const [practice, setPractice] = useState<BraceState>(BRACE_START);
  const [practiceGust, setPracticeGust] = useState(0);

  const stoppedRef = useRef(false);
  const submitTimerRef = useRef<number | null>(null);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const strength = braceStrength(debuff.tier) * (reducedMotion ? REDUCED_MOTION_GUST : 1);
  const { primary, secondary } = debuff.clash ?? { primary: "grip", secondary: "steer" };

  const finish = useCallback((accuracy: number) => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    inputRef.current = 0;
    setResult(accuracy);
    setState("done");
    submitTimerRef.current = window.setTimeout(() => onSubmitRef.current(accuracy), RESULT_MS);
  }, []);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  // The simulation runs on its own clock (`t`), advanced by each frame, so a stalled tab cannot throw the marker across the track.
  useEffect(() => {
    if (state !== "running") return;
    let frame = 0;
    let last = performance.now();
    let t = 0;
    let inZone = 0;
    let s: BraceState = { ...BRACE_START };
    const tick = (now: number) => {
      const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
      last = now;
      s = braceStep(s, inputRef.current, t, phases, strength, dt);
      if (braceInZone(s.x)) inZone += dt;
      t += dt;
      setMarker(s);
      setGust(braceGust(t, phases, strength) / (strength || 1));
      setElapsed(t);
      if (t >= BRACE_SECONDS) {
        finishRef.current(braceAccuracy(inZone, BRACE_SECONDS));
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, phases, strength]);

  // Practice: the same track and physics, live before the game starts, with the wind at the chosen share of the real strength.
  useEffect(() => {
    if (state !== "ready") return;
    let frame = 0;
    let last = performance.now();
    let t = 0;
    let atWall = 0;
    let s: BraceState = { ...BRACE_START };
    const windStrength = strength * windLevel;
    const tick = (now: number) => {
      const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
      last = now;
      s = braceStep(s, inputRef.current, t, phases, windStrength, dt);
      t += dt;
      // If the marker is left against a wall for a moment, put it back in the middle so the practice keeps going.
      if (Math.abs(s.x - 0.5) > 0.45) {
        atWall += dt;
        if (atWall > 1) {
          s = { ...BRACE_START };
          atWall = 0;
        }
      } else {
        atWall = 0;
      }
      setPractice(s);
      setPracticeGust(windStrength > 0 ? braceGust(t, phases, windStrength) / windStrength : 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, strength, windLevel, phases]);

  // If the panel goes away first (the player skipped), the pending hand-back must not fire.
  useEffect(
    () => () => {
      if (submitTimerRef.current !== null) window.clearTimeout(submitTimerRef.current);
    },
    []
  );

  // 3, 2, 1, then the game starts. The marker waits in the middle with no wind, and the timer has not started.
  useEffect(() => {
    if (state !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else setState("running");
    }, COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [state, count]);

  // Arrow keys (or A and D) counter-steer, for keyboards. They work in practice and through the countdown too.
  useEffect(() => {
    if (state === "done") return;
    const dirOf = (e: KeyboardEvent): -1 | 1 | 0 =>
      e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ? -1 : e.key === "ArrowRight" || e.key === "d" || e.key === "D" ? 1 : 0;
    const down = (e: KeyboardEvent) => {
      const d = dirOf(e);
      if (d !== 0) {
        e.preventDefault();
        inputRef.current = d;
      }
    };
    const up = (e: KeyboardEvent) => {
      const d = dirOf(e);
      if (d !== 0 && inputRef.current === d) inputRef.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state]);

  /** A counter-steer button went down (the pointer is captured so letting go anywhere is noticed). */
  const press = useCallback((dir: -1 | 1) => {
    inputRef.current = dir;
    buzz(10);
  }, []);
  /** A counter-steer button came up. Only clears the input if that button is the one still holding it. */
  const release = useCallback((dir: -1 | 1) => {
    if (inputRef.current === dir) inputRef.current = 0;
  }, []);

  /** Press Start: a short 3, 2, 1 first, so the player is ready with a thumb on each button when the wind begins. */
  const start = () => {
    setCount(COUNTDOWN_STEPS);
    setState("countdown");
  };

  // Before the game the track shows the practice marker; in the countdown the marker waits in the middle; then the real one.
  const shownMarker = state === "ready" ? practice : state === "countdown" ? BRACE_START : marker;
  const shownGust = state === "ready" ? practiceGust : state === "countdown" ? 0 : gust;
  const inZoneNow = braceInZone(shownMarker.x);
  const blocked = result === null ? 0 : Math.round(defenceShare(result) * 100);
  const verdict = result === null ? "" : `Held ${Math.round(result * 100)}% of the time · blocked ${blocked}% of the debuff`;
  const timeLeft = Math.max(0, BRACE_SECONDS - elapsed);

  /** The Left and Right buttons. Used in practice and in the game. */
  const steerButtons = (heightClass: string) => (
    <div className="flex gap-2" role="group" aria-label="Counter-steer">
      {([-1, 1] as const).map((dir) => (
        <button
          key={dir}
          type="button"
          aria-label={dir === -1 ? "Counter-steer left (hold)" : "Counter-steer right (hold)"}
          className={`${steerClass} ${heightClass}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            press(dir);
          }}
          onPointerUp={() => release(dir)}
          onPointerCancel={() => release(dir)}
          onLostPointerCapture={() => release(dir)}
        >
          {dir === -1 ? "◀ Left" : "Right ▶"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brace-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-cyan-400/70 bg-zinc-950 text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] sm:max-h-[90dvh] sm:rounded-3xl sm:border-b-2"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
          <div className="gx-safe-t sm:pt-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-500/15 px-3 py-1">
              <span className="text-xs" aria-hidden>
                🛡️
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">Corner {cornerNumber} · Defend</span>
            </div>
            <h3 id="brace-title" className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              Brace {subject}
            </h3>
            <p className="mt-1 text-sm text-zinc-300">
              Gusts push the marker around. Hold the Left or Right button to counter-steer and keep it inside the green zone for as long as you
              can.
            </p>
            <p className="mt-2 text-xs font-black text-amber-300">
              {debuff.icon} {debuff.name} · <span className="uppercase">{debuff.tier}</span> is coming at your car
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-zinc-400">
              It cuts your <span className="text-rose-300">{primary.toUpperCase()}</span> and, if the rival attacked well, your{" "}
              <span className="text-rose-300">{secondary.toUpperCase()}</span>. The best you can do is block {Math.round(DEFENCE_MAX_BLOCK * 100)}%.
            </p>
          </div>

          <div className="mt-5">
            <div className="relative mx-auto h-14 w-full overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-900" aria-hidden>
              <div
                className="absolute inset-y-0 border-x-2 border-emerald-400/80 bg-emerald-400/20"
                style={{ left: `${(0.5 - BRACE_ZONE_HALF) * 100}%`, right: `${(0.5 - BRACE_ZONE_HALF) * 100}%` }}
              />
              <div
                className={`absolute top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-lg ${
                  inZoneNow
                    ? "border-emerald-200 bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]"
                    : "border-rose-200 bg-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.9)]"
                }`}
                style={{ left: `${shownMarker.x * 100}%` }}
              />
            </div>
            {/* The wind: which way the next push is coming from, so the player can get ahead of it. */}
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider text-zinc-400" aria-hidden>
              <span className={shownGust < -0.15 ? "text-sky-300" : "text-zinc-700"} style={{ opacity: shownGust < -0.15 ? Math.min(1, Math.abs(shownGust)) : 1 }}>
                ◀ wind
              </span>
              <span className="min-w-14 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-center text-zinc-200">
                {state === "ready" ? "Practice" : state === "countdown" ? "Get ready" : state === "done" ? "Done" : `${timeLeft.toFixed(1)}s`}
              </span>
              <span className={shownGust > 0.15 ? "text-sky-300" : "text-zinc-700"} style={{ opacity: shownGust > 0.15 ? Math.min(1, Math.abs(shownGust)) : 1 }}>
                wind ▶
              </span>
            </div>

            {/* The countdown: a big number, so it can be seen from the corner of the eye while the thumbs find the buttons. */}
            {state === "countdown" && (
              <div className="mt-4" aria-live="assertive">
                <p
                  key={count}
                  className="text-7xl font-black leading-none text-cyan-200 drop-shadow-[0_0_24px_rgba(34,211,238,0.8)] motion-safe:animate-in motion-safe:zoom-in-150 motion-safe:duration-300"
                >
                  {count}
                </p>
                <p className="mt-2 text-[11px] font-bold text-zinc-400">Thumbs on Left and Right. The wind starts at zero.</p>
              </div>
            )}

            {/* Practice, before the game: the marker above is live. Nothing here is scored. */}
            {state === "ready" && (
              <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-3 text-left">
                <p className="text-xs font-black text-emerald-200">Practice (not scored)</p>
                <p className="mt-0.5 text-[11px] font-bold text-zinc-400">
                  Try the Left and Right buttons below. The marker above is live, so you can get the feel before the real thing. Change the wind
                  to try it gentler or at full strength.
                </p>
                <div className="mt-2 flex items-center gap-1.5" role="group" aria-label="Practice wind strength">
                  <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-zinc-400">Wind</span>
                  {PRACTICE_WIND_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={windLevel === level}
                      onClick={() => setWindLevel(level)}
                      className={`gx-tap min-h-[44px] flex-1 cursor-pointer rounded-xl border px-2 text-xs font-black uppercase tracking-wider [touch-action:manipulation] focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                        windLevel === level
                          ? "border-emerald-300 bg-emerald-500/25 text-emerald-100"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {level === 0 ? "Off" : level === 1 ? "Real" : `${level * 100}%`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] font-bold text-zinc-400">
              Left and right arrow keys (or A and D) work too.
              {reducedMotion ? " Reduced motion is on, so the gusts are gentler." : ""}
            </p>
            <p className="mt-1 min-h-5 text-sm font-black text-cyan-200" aria-live="assertive">
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
                  <div className="space-y-2">
                    {steerButtons("min-h-16")}
                    <button type="button" onClick={start} className={confirmClass} autoFocus>
                      Start bracing
                      <span aria-hidden>→</span>
                    </button>
                  </div>
                )}
                {(state === "countdown" || state === "running") && steerButtons("min-h-20")}
                {state === "done" && (
                  <button type="button" disabled className={`${confirmClass} min-h-14`}>
                    Braced
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
