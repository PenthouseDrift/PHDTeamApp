"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSteering, type ControlMode } from "../controls/useSteering";
import { ChaseRenderer, type DriveView } from "../replay/chase-renderer";
import { carColourFromImage, tierColour } from "../replay/car-colour";
import { DT, Driver, TICKS, angleLimit, encodeTrace, gateList, prepareDrive, type DriveStep } from "../replay/drive-sim";
import { themeFor } from "../replay/theme";
import { skillMultiplierFor } from "../skill";
import type { TourDriveSpec } from "../types";
import { heading, muted, panel, primaryBtn, secondaryBtn } from "./tour-ui";

/**
 * The drive: a drift run through three corners, seen from behind your car. The car drives itself forward; you steer (tilt
 * the phone, drag a finger, or use the arrow keys) to hold the green drift line, clip the cones and stay a hair off the
 * wall without touching it. What you did is recorded and sent to the server, which runs the same driving simulation to
 * score it. Nothing here decides a result.
 */

const COUNTDOWN_SECONDS = 3;
const MODE_LABEL: Record<ControlMode, string> = { tilt: "Tilt phone", touch: "Touch slider", keys: "Arrow keys" };

type Phase = "ready" | "countdown" | "driving" | "finishing";

interface Banner {
  text: string;
  tone: "good" | "bad" | "neutral";
  at: number;
}

export function DriveScreen({ spec, onFinish, sendFailed = false }: { spec: TourDriveSpec; onFinish: (recording: string) => void; /** The last attempt to send the drive failed, so offer to try again. */ sendFailed?: boolean }) {
  const [recording, setRecording] = useState<string | null>(null);
  const steering = useSteering();
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const steeringRef = useRef(steering);
  useEffect(() => {
    steeringRef.current = steering;
  }, [steering]);

  const dc = useMemo(() => prepareDrive(spec.sectorIds), [spec.sectorIds]);
  const gates = useMemo(() => gateList(dc), [dc]);
  // How much angle the tyres can take. The server works it out again itself; this copy is only for the warnings on screen.
  const limit = spec.angleLimit ?? angleLimit(spec.tyres ?? 100, 12);
  const scene = useMemo(
    () => ({ course: dc.course, theme: themeFor(spec.trackName), rivalKind: spec.rivalKind, names: { player: "You", rival: spec.rivalName }, carColour: tierColour(spec.carTier) }),
    [dc, spec.trackName, spec.rivalKind, spec.rivalName, spec.carTier]
  );
  // How many ticks count towards each corner, to turn the running totals into a share of the corner done.
  const cornerTicks = useMemo(() => {
    const counts = [0, 0, 0];
    for (let k = 0; k < TICKS; k++) if (dc.corner[k] >= 0) counts[dc.corner[k]]++;
    return counts.map((c) => Math.max(1, c));
  }, [dc]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhaseState] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const countdownStart = useRef(0);
  const [failed, setFailed] = useState(false);

  function setPhase(p: Phase) {
    phaseRef.current = p;
    setPhaseState(p);
  }

  function begin() {
    steering.calibrate();
    countdownStart.current = performance.now();
    setPhase("countdown");
    // A phone held still doesn't count as "using" the screen, so ask it not to sleep.
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request("screen").catch(() => null);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: ChaseRenderer;
    try {
      renderer = new ChaseRenderer(canvas, scene, `drive:${spec.round}:${spec.trackName}`);
    } catch {
      const id = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(id);
    }
    // Paint the car the colour of the card picked. It starts in the rarity colour until the picture has been read.
    let unmounted = false;
    if (spec.carImageUrl) {
      void carColourFromImage(spec.carImageUrl).then((colour) => {
        if (colour && !unmounted) renderer.setCarColour(colour);
      });
    }
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      renderer.resize(Math.max(200, r.width), Math.max(200, r.height), Math.min(window.devicePixelRatio || 1, 2));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrap);

    // ── The drive state ──
    let driver = new Driver(dc, limit);
    const trace = new Int8Array(TICKS);
    let acc = 0;
    let prev = { s: dc.s[0], e: dc.ideal[0], a: 0 };
    let cur = prev;
    let last: DriveStep | null = null;
    const gateState: Array<"upcoming" | "hit" | "miss"> = gates.map(() => "upcoming");
    const ticksIn = [0, 0, 0];
    let streak = 0;
    let wallFlash = 0;
    let burstFlash = 0;
    let banner: Banner | null = null;
    let lastWarn = -10_000;
    let sweet = 0;
    let lastSweet = -10_000;
    let lastCorner = -1;
    let cornersDone = 0;
    let raf = 0;
    let lastFrame = performance.now();

    const mult = (a: number) => skillMultiplierFor(a, spec.swing, spec.pivot);
    const standing = () => {
      let p = 0;
      let r = 0;
      for (let c = 0; c < 3; c++) {
        const share = Math.min(1, ticksIn[c] / cornerTicks[c]);
        p += (spec.paceBase.player[c] ?? 0) * mult(driver.cornerAccuracy(c, false)) * share;
        r += (spec.paceBase.rival[c] ?? 0) * mult(spec.rivalAccuracy[c] ?? spec.pivot) * share;
      }
      return { p, r };
    };
    const say = (text: string, tone: Banner["tone"], now: number) => {
      banner = { text, tone, at: now };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const st = steeringRef.current;
      const phaseNow = phaseRef.current;
      let countdown: number | null = null;

      if (phaseNow === "countdown") {
        const left = COUNTDOWN_SECONDS - (now - countdownStart.current) / 1000;
        countdown = left;
        if (left <= -0.6) {
          driver = new Driver(dc, limit);
          acc = 0;
          setPhase("driving");
        }
      } else if (phaseNow === "driving" && !document.hidden) {
        acc += dt;
        while (acc >= DT && !driver.done) {
          const cmd = st.read();
          const k = driver.tick;
          trace[k] = Math.round(Math.max(-1, Math.min(1, cmd)) * 100);
          const step = driver.step(cmd);
          last = step;
          prev = cur;
          cur = { s: dc.s[Math.min(TICKS - 1, k)], e: dc.ideal[Math.min(TICKS - 1, k)], a: step.a };
          if (step.corner >= 0) ticksIn[step.corner]++;
          streak = step.value > 0.8 ? streak + 1 : step.value < 0.4 ? 0 : streak;

          if (step.wall) {
            wallFlash = 1;
            say("SPUN INTO THE WALL! Penalty", "bad", now);
            navigator.vibrate?.([60, 30, 60]);
          } else if (step.burst) {
            burstFlash = 1;
            say("TYRE BURST! Car damaged", "bad", now);
            navigator.vibrate?.([90, 40, 90]);
          } else if (step.lock === "none") {
            if (step.r > 1 && now - lastWarn > 1400) {
              lastWarn = now;
              say("OVER THE LIMIT! Ease off", "bad", now);
              navigator.vibrate?.(20);
            } else if (step.strain > 0.4 && step.r <= 1 && now - lastWarn > 2200) {
              lastWarn = now;
              say("NEAR THE LIMIT", "neutral", now);
              navigator.vibrate?.(8);
            }
            // Holding it right at the edge without going over earns a shout.
            sweet = step.r >= 0.9 && step.r <= 1 ? sweet + 1 : 0;
            if (sweet >= 24 && now - lastSweet > 3500) {
              lastSweet = now;
              say("MAX DRIFT!", "good", now);
              sweet = 0;
            }
          }
          if (step.gateHit) navigator.vibrate?.(8);
          if (step.gateHit !== null) {
            const gi = gates.findIndex((g) => g.tick === k);
            if (gi >= 0) gateState[gi] = step.gateHit ? "hit" : "miss";
          }
          // Corner announcements, and a word on how the corner went.
          const corner = dc.corner[k];
          if (corner !== lastCorner) {
            if (lastCorner >= 0 && lastCorner < 3 && !step.wall && !step.burst) {
              cornersDone = lastCorner + 1;
              const a = driver.cornerAccuracy(lastCorner, false);
              say(a >= 0.9 ? "PERFECT DRIFT!" : a >= 0.75 ? "Clean corner" : a >= 0.5 ? "Okay, give it more angle" : "Too tame, commit!", a >= 0.75 ? "good" : a >= 0.5 ? "neutral" : "bad", now);
            }
            if (corner >= 0 && (!banner || now - banner.at > 1500)) say(`Corner ${corner + 1}: ${spec.sectorNames[corner] ?? ""}`, "neutral", now);
            lastCorner = corner;
          }
          acc -= DT;
        }
        if (driver.done) {
          cornersDone = 3;
          setPhase("finishing");
          const text = encodeTrace(trace);
          setRecording(text);
          onFinishRef.current(text);
        }
      }

      wallFlash = Math.max(0, wallFlash - dt * 1.8);
      burstFlash = Math.max(0, burstFlash - dt * 1.4);
      const alpha = phaseNow === "driving" ? Math.min(1, acc / DT) : 1;
      const s = prev.s + (cur.s - prev.s) * alpha;
      const e = prev.e + (cur.e - prev.e) * alpha;
      const angle = prev.a + (cur.a - prev.a) * alpha;

      const { p, r } = standing();
      const corner = dc.corner[Math.min(TICKS - 1, driver.tick)];
      const tickNow = Math.min(TICKS - 1, driver.tick);
      const total = driver.weightSum.reduce((a, b) => a + b, 0);
      const accuracyNow = total > 0 ? [0, 1, 2].reduce((sum, c) => sum + driver.cornerAccuracy(c, false) * driver.weightSum[c], 0) / total : 1;

      const view: DriveView = {
        player: { s, e, angle, speed: dc.v[tickNow] },
        gates: gates.map((g, i) => ({ s: g.s, e: g.e, state: gateState[i] })),
        hud: {
          playerPoints: p,
          rivalPoints: r,
          accuracy: accuracyNow,
          streak,
          progress: driver.tick / TICKS,
          cornerIndex: Math.min(2, Math.max(0, phaseNow === "driving" || phaseNow === "finishing" ? Math.max(corner, cornersDone >= 3 ? 2 : 0) : 0)),
          angle: phaseNow === "ready" || phaseNow === "countdown" ? st.read() : angle,
          limit,
          lean: dc.dir[tickNow],
          strain: last && phaseNow === "driving" ? last.strain : 0,
          stress: last && phaseNow === "driving" ? last.stress : 0,
          lock: last && phaseNow === "driving" ? last.lock : "none",
          countdown,
          banner: banner && (now - banner.at) / 1000 < 2 ? { text: banner.text, tone: banner.tone, age: (now - banner.at) / 1000 } : null,
          wallFlash,
          burstFlash,
          tyres: spec.tyres ?? 100,
          // Points are worth between 1x and 4x depending on the angle held, nothing special while out of control.
          multiplier: last && phaseNow === "driving" ? 1 + 3 * last.value : 1,
        },
      };
      renderer.renderDrive(view, dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      unmounted = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.destroy();
    };
    // The drive is set up once for this spec; the live steering is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc, scene, gates, spec, limit]);

  if (failed) {
    return (
      <div className={`${panel} space-y-2`} role="alert">
        <p className="text-sm font-bold text-red-600 dark:text-red-400">The drive couldn&apos;t start on this device (the drawing area isn&apos;t available).</p>
        <p className={muted}>Try another browser. The Round is still open.</p>
      </div>
    );
  }

  const touchMode = steering.mode === "touch" && (phase === "countdown" || phase === "driving");

  return (
    <section aria-label="Drive">
      <div ref={wrapRef} className="relative h-[72vh] max-h-[680px] min-h-[420px] w-full touch-none select-none overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-lg">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" role="img" aria-label="View from behind your car as it drifts the track. Tilt left or right to set the drift angle and keep it just under the limit." />
        {touchMode && <div className="absolute inset-0" {...steering.pointerHandlers} aria-hidden />}
        {phase === "finishing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60" role="status">
            {sendFailed && recording ? (
              <div className="space-y-2 rounded-xl bg-zinc-900 px-4 py-3 text-center">
                <p className="text-sm font-black text-white">Your drive couldn&apos;t be sent.</p>
                <button type="button" className={primaryBtn} onClick={() => onFinish(recording)}>
                  Send it again
                </button>
              </div>
            ) : (
              <p className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-black text-white">Scoring your drive…</p>
            )}
          </div>
        )}
        {phase === "ready" && (
          <div className="absolute inset-0 z-10 flex touch-pan-y items-start overflow-y-auto bg-black/55 p-2 sm:items-center sm:p-4" role="dialog" aria-label="Ready to drive">
            <div className={`${panel} mx-auto w-full max-w-xl space-y-3 !bg-white/95 shadow-2xl dark:!bg-zinc-900/95`}>
            <div>
              <h3 className={heading}>Ready to drive?</h3>
              <p className={muted}>
                Your car follows the drift line by itself. Tilt toward the bend to hang the tail out: more angle means a bigger multiplier (×1 up to ×4 at your limit). Near the
                limit the screen glows and shakes. A little over and a tyre bursts. Way over and you hit the wall. Flick across between corners.
              </p>
              <p className={muted}>
                {spec.tyres !== undefined && spec.angleLimit !== undefined
                  ? `Your tyres are at ${Math.round(spec.tyres)}%, so your grip limit is ${Math.round(spec.angleLimit * 100)}% of full tilt. Worn tyres lower it.`
                  : "Worn tyres and a low grip stat lower your limit."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="How you will steer">
              {(["tilt", "touch", "keys"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={steering.mode === m}
                  onClick={() => (m === "tilt" ? void steering.enableTilt() : steering.setMode(m))}
                  className={`min-h-11 rounded-xl border-2 px-4 text-sm font-black ${
                    steering.mode === m ? "border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-zinc-100" : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {m === "tilt" ? "📱 " : m === "touch" ? "👆 " : "⌨️ "}
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            {steering.mode === "tilt" && (
              <div className="space-y-2">
                <p className={muted}>
                  {steering.permission === "denied"
                    ? "Motion access was refused. Allow it in your browser settings, or use the touch slider."
                    : steering.needsPermission && steering.permission !== "granted"
                      ? "Tap Tilt phone to allow motion. Your phone will ask once."
                      : steering.tiltSeen
                        ? "Tilt your phone left and right to set the drift angle. Hold it how you like, then press Set straight."
                        : "Waiting for your phone's motion sensor… If nothing moves, use the touch slider."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={secondaryBtn} onClick={steering.calibrate} disabled={!steering.tiltSeen}>
                    Set straight
                  </button>
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                    <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={steering.flip} onChange={(e) => steering.setFlip(e.target.checked)} />
                    Reverse left and right
                  </label>
                </div>
              </div>
            )}
            {steering.mode === "touch" && <p className={muted}>Put a finger on the screen and slide left or right to set the angle. The middle is no angle. Slide back to the middle to straighten up.</p>}
            {steering.mode === "keys" && <p className={muted}>Hold ← or → (or A and D) to lean further that way. Let go to hold the angle. Hold the other arrow to bring it back.</p>}

            <label className="flex items-center gap-3 text-xs font-bold text-zinc-700 dark:text-zinc-200">
              Sensitivity
              <input type="range" min={0.5} max={2} step={0.1} value={steering.sensitivity} onChange={(e) => steering.setSensitivity(Number(e.target.value))} className="w-40 accent-amber-500" aria-label="Steering sensitivity" />
              <span className={muted}>{steering.sensitivity.toFixed(1)}×</span>
            </label>

            <button type="button" className={primaryBtn} onClick={begin}>
              🏁 Start the drive
            </button>
          </div>
          </div>
        )}
      </div>
    </section>
  );
}

