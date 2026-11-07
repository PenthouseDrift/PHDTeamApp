"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DebuffCardDefinition } from "@/lib/crew-cards";
import { buzz } from "../ui/feedback";
import { TILT_SETUP_MIN_DEGREES, isTouchDevice, useTilt } from "../ui/useTilt";
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
/** Before the brace starts the player holds the phone steady for 3 short beats; that angle is then counted as straight. */
const COUNTDOWN_STEPS = 3;
const COUNTDOWN_STEP_MS = 380;

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
  "flex min-h-20 flex-1 cursor-pointer select-none items-center justify-center rounded-2xl border-2 border-cyan-400/60 bg-cyan-500/15 px-3 text-lg font-black uppercase tracking-wider text-cyan-100 [touch-action:none] transition-colors hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-cyan-400/40";

/**
 * "Brace": the DEFEND game, and nothing like Lock On. Gusts push a marker along a track and the player holds the left or right
 * button to counter-steer, keeping it inside the safe zone. The share of the time spent inside is the accuracy, and a perfect
 * brace blocks at most half of the debuff. The rival's own game is never shown.
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
  const inputRef = useRef<-1 | 0 | 1>(0);

  // Phone tilt: the further the phone is tipped, the harder the push. Buttons and keys still work, and win while held.
  const tilt = useTilt();
  const [push, setPush] = useState(0);
  const [touchLike] = useState(isTouchDevice);
  const [tiltNote, setTiltNote] = useState<string | null>(null);
  const [previewPush, setPreviewPush] = useState(0);
  const tiltReadRef = useRef(tilt.read);
  const tiltLiveRef = useRef(false);
  useEffect(() => {
    tiltReadRef.current = tilt.read;
    tiltLiveRef.current = tilt.enabled && tilt.seen && tilt.calibrated;
  }, [tilt.read, tilt.enabled, tilt.seen, tilt.calibrated]);

  // On the ready screen, show the tilt working live (relative to how the phone is held when this starts) so the player can see
  // that tipping the right side down moves the bar right, before the game begins.
  const setupActive = tilt.setup !== null;
  const tiltCalibrate = tilt.calibrate;
  useEffect(() => {
    if (state !== "ready" || !tilt.enabled || !tilt.calibrated || !tilt.seen || setupActive) return;
    tiltCalibrate();
    let frame = 0;
    const tick = () => {
      setPreviewPush(tiltReadRef.current());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, tilt.enabled, tilt.calibrated, tilt.seen, setupActive, tiltCalibrate]);
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
      // A held button or key counts first; otherwise the tilt of the phone sets how hard to push (-1 to 1).
      const held = inputRef.current;
      const input = held !== 0 ? held : tiltLiveRef.current ? tiltReadRef.current() : 0;
      s = braceStep(s, input, t, phases, strength, dt);
      if (braceInZone(s.x)) inZone += dt;
      t += dt;
      setPush(input);
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

  // If the panel goes away first (the player skipped), the pending hand-back must not fire.
  useEffect(
    () => () => {
      if (submitTimerRef.current !== null) window.clearTimeout(submitTimerRef.current);
    },
    []
  );

  // Arrow keys (or A and D) counter-steer, for keyboards.
  useEffect(() => {
    if (state !== "running") return;
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

  /**
   * Press Start: a short "hold steady" countdown, then the brace. The phone is calibrated at the END of the countdown, so the
   * tap on Start (which tips the phone) does not decide what counts as straight. iPhone asks for motion access again after a
   * reload, and it has to be asked for from this tap.
   */
  const start = async () => {
    setTiltNote(null);
    let tiltOn = tilt.enabled;
    if (tiltOn && tilt.needsPermission && tilt.permission !== "granted") tiltOn = await tilt.enable();
    if (tiltOn) {
      if (!(await tilt.waitForReading(1500))) {
        // No readings came: no motion sensor, or access was not given. The buttons still work.
        setTiltNote("This phone isn't sending any tilt readings, so use the buttons.");
      } else if (!tilt.calibrated) {
        // First time holding the phone this way: learn which way is which from a single tip.
        if (!(await tilt.measure())) {
          setTiltNote("I couldn't see a clear tip. Try again, or turn tilt off and use the buttons.");
          return;
        }
      }
    }
    setCount(COUNTDOWN_STEPS);
    setState("countdown");
  };

  const calibrate = tilt.calibrate;
  useEffect(() => {
    if (state !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
      } else {
        calibrate();
        setState("running");
      }
    }, COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [state, count, calibrate]);

  const inZoneNow = braceInZone(marker.x);
  const blocked = result === null ? 0 : Math.round(defenceShare(result) * 100);
  const verdict =
    result === null ? "" : `Held ${Math.round(result * 100)}% of the time · blocked ${blocked}% of the debuff`;
  const timeLeft = Math.max(0, BRACE_SECONDS - elapsed);

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
              Gusts push the marker around. Hold left or right (or tilt your phone) to counter-steer and keep it inside the green zone for as long as you can.
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
                  state === "ready" || inZoneNow
                    ? "border-emerald-200 bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)]"
                    : "border-rose-200 bg-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.9)]"
                }`}
                style={{ left: `${marker.x * 100}%` }}
              />
            </div>
            {/* The wind: which way the next push is coming from, so the player can get ahead of it. */}
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider text-zinc-400" aria-hidden>
              <span className={gust < -0.15 ? "text-sky-300" : "text-zinc-700"} style={{ opacity: gust < -0.15 ? Math.min(1, Math.abs(gust)) : 1 }}>
                ◀ wind
              </span>
              <span className="min-w-14 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-center text-zinc-200">
                {state === "done" ? "Done" : `${timeLeft.toFixed(1)}s`}
              </span>
              <span className={gust > 0.15 ? "text-sky-300" : "text-zinc-700"} style={{ opacity: gust > 0.15 ? Math.min(1, Math.abs(gust)) : 1 }}>
                wind ▶
              </span>
            </div>
            {/* How hard the player is pushing right now, from either the buttons or the tilt of the phone. */}
            {state === "running" && (
              <div className="relative mx-auto mt-2 h-2 w-44 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
                <div
                  className="absolute inset-y-0 bg-cyan-400"
                  style={{ left: push < 0 ? `${50 + push * 50}%` : "50%", width: `${Math.abs(push) * 50}%` }}
                />
                <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-500" />
              </div>
            )}
            {state === "running" && tilt.enabled && !tilt.seen && (
              <p className="mt-1 text-[11px] font-bold text-amber-300">No tilt detected on this device. Use the buttons below.</p>
            )}
            {state === "ready" && (touchLike || tilt.enabled) && (
              <div className="mx-auto mt-3 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-left">
                <p className="text-xs font-black text-cyan-200">📱 Tilt to steer</p>
                <p className="mt-0.5 text-[11px] font-bold text-zinc-400">
                  Tip the <strong className="text-zinc-200">right side of the screen down</strong> to push the marker right, and the left
                  side down to push it left. The further you tip, the harder you push. Hold your phone however you like (upright, flat or
                  sideways); the first time, you&apos;ll be asked to tip it once so the game learns your hold.
                </p>
                {tilt.setup && (
                  <div className="mt-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 p-2.5" aria-live="polite">
                    <p className="text-xs font-black text-cyan-100">
                      {tilt.setup.phase === "hold" && "Hold your phone steady…"}
                      {tilt.setup.phase === "tip" && "Now tip the RIGHT side of the screen down"}
                      {tilt.setup.phase === "done" && "Got it. Tilt is ready ✓"}
                      {tilt.setup.phase === "failed" && "Couldn't see a clear tip. Press Start to try again."}
                    </p>
                    {tilt.setup.phase === "tip" && (
                      <>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800" aria-hidden>
                          <div
                            className="h-full bg-cyan-400 transition-[width] duration-75"
                            style={{ width: `${Math.min(100, (tilt.setup.deviation / TILT_SETUP_MIN_DEGREES) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-zinc-400">Tip it a good way over and hold it there for a moment.</p>
                      </>
                    )}
                  </div>
                )}
                {!tilt.setup && tilt.enabled && tilt.calibrated && tilt.seen && (
                  <div className="mt-2" aria-hidden>
                    <p className="text-[11px] font-bold text-zinc-400">Try it: tip the right side down and the bar fills to the right.</p>
                    <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="absolute inset-y-0 bg-cyan-400"
                        style={{ left: previewPush < 0 ? `${50 + previewPush * 50}%` : "50%", width: `${Math.abs(previewPush) * 50}%` }}
                      />
                      <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-500" />
                    </div>
                  </div>
                )}
                {tiltNote && <p className="mt-2 text-[11px] font-bold text-amber-300">{tiltNote}</p>}
                {tilt.enabled && tilt.calibrated && !tilt.setup && (
                  <button
                    type="button"
                    onClick={() => tilt.resetCalibration()}
                    className="gx-tap mt-2 min-h-[44px] w-full cursor-pointer rounded-xl px-3 text-xs font-bold text-zinc-400 [touch-action:manipulation] hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    Wrong way round? Redo tilt setup
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (tilt.enabled ? tilt.disable() : void tilt.enable())}
                  aria-pressed={tilt.enabled}
                  className="gx-tap mt-2 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-xl border border-cyan-400/60 bg-cyan-500/15 px-3 text-xs font-black uppercase tracking-wider text-cyan-100 [touch-action:manipulation] hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {tilt.enabled ? "Tilt is on · tap to turn off" : "Use tilt"}
                </button>
                {tilt.enabled && tilt.needsPermission && tilt.permission !== "granted" && (
                  <p className="mt-1 text-[11px] font-bold text-cyan-300">Your phone will ask to allow motion access when you press Start. Choose Allow.</p>
                )}
                {tilt.permission === "denied" && (
                  <p className="mt-1 text-[11px] font-bold text-amber-300">Motion access was refused, so tilt can&apos;t be used. The buttons still work.</p>
                )}
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
                  <button
                    type="button"
                    onClick={() => void start()}
                    disabled={tilt.setup !== null && tilt.setup.phase !== "failed"}
                    className={confirmClass}
                    autoFocus
                  >
                    {tilt.setup && tilt.setup.phase !== "failed" ? "Setting up tilt…" : tilt.enabled && !tilt.calibrated && touchLike ? "Set up tilt & start" : "Start bracing"}
                    <span aria-hidden>→</span>
                  </button>
                )}
                {state === "countdown" && (
                  <button type="button" disabled className={`${confirmClass} min-h-14`} aria-live="assertive">
                    Hold steady… {count}
                  </button>
                )}
                {state === "running" && (
                  <div className="flex gap-2" role="group" aria-label="Counter-steer">
                    {([-1, 1] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        aria-label={dir === -1 ? "Counter-steer left (hold)" : "Counter-steer right (hold)"}
                        className={steerClass}
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
                )}
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
