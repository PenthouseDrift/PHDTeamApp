"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSteering, type ControlMode } from "../controls/useSteering";
import { themeFor } from "../replay/build-timeline";
import { DT, Driver, TICKS, TRACK_WEIGHT, encodeTrace, gateList, idealOffset, prepareDrive } from "../replay/drive-sim";
import { ReplayRenderer, type DriveView } from "../replay/renderer";
import { skillMultiplierFor } from "../skill";
import type { TourDriveSpec } from "../types";
import { heading, muted, panel, primaryBtn, secondaryBtn } from "./tour-ui";

/**
 * The drive: steer your car round the three corners. The car drives itself forward; you steer (tilt the phone, drag a
 * finger, or use the arrow keys) to stay on the glowing racing line and pass through the gates. What you did is recorded and
 * sent to the server, which runs the same driving simulation to score it. Nothing here decides a result.
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
  const scene = useMemo(
    () => ({ course: dc.course, theme: themeFor(spec.trackName), rivalKind: spec.rivalKind, names: { player: "You", rival: spec.rivalName } }),
    [dc, spec.trackName, spec.rivalKind, spec.rivalName]
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

    let renderer: ReplayRenderer;
    try {
      renderer = new ReplayRenderer(canvas, scene, `drive:${spec.round}:${spec.trackName}`);
    } catch {
      const id = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(id);
    }
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      renderer.resize(Math.max(200, r.width), Math.max(200, r.height), Math.min(window.devicePixelRatio || 1, 2));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrap);

    // ── The drive state ──
    let driver = new Driver(dc);
    const trace = new Int8Array(TICKS);
    let acc = 0;
    let prev = { s: dc.s[0], e: 0 };
    let cur = { s: dc.s[0], e: 0 };
    let last = { ev: 0, u: 0, speed: dc.v[0], lineScore: 1, wall: false };
    const gateState: Array<"upcoming" | "hit" | "miss"> = gates.map(() => "upcoming");
    let streak = 0;
    let wallFlash = 0;
    let banner: Banner | null = null;
    let leadGap = 0;
    let lastCorner = -1;
    let cornersDone = 0;
    const startedAt = { t: 0 };
    let raf = 0;
    let lastFrame = performance.now();

    const mult = (a: number) => skillMultiplierFor(a, spec.swing, spec.pivot);
    const cornerAccuracy = (c: number) => {
      const track = driver.scoreCount[c] > 0 ? driver.scoreSum[c] / driver.scoreCount[c] : 0.5;
      const gatePart = driver.gatesSeen[c] > 0 ? driver.gatesHit[c] / driver.gatesSeen[c] : track;
      return TRACK_WEIGHT * track + (1 - TRACK_WEIGHT) * gatePart;
    };
    const standing = () => {
      let p = 0;
      let r = 0;
      for (let c = 0; c < 3; c++) {
        const share = Math.min(1, driver.scoreCount[c] / cornerTicks[c]);
        p += (spec.paceBase.player[c] ?? 0) * mult(cornerAccuracy(c)) * share;
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
          driver = new Driver(dc);
          acc = 0;
          startedAt.t = now;
          setPhase("driving");
        }
      } else if (phaseNow === "driving" && !document.hidden) {
        acc += dt;
        while (acc >= DT && !driver.done) {
          const cmd = st.read();
          const k = driver.tick;
          trace[k] = Math.round(Math.max(-1, Math.min(1, cmd)) * 100);
          const step = driver.step(cmd);
          prev = cur;
          cur = { s: dc.s[Math.min(TICKS - 1, k)], e: step.e };
          last = { ev: step.ev, u: step.u, speed: dc.v[Math.min(TICKS - 1, k)], lineScore: step.score, wall: step.wall };
          streak = step.score > 0.8 ? streak + 1 : step.score < 0.5 ? 0 : streak;
          if (step.wall) {
            wallFlash = 1;
            say("WALL!", "bad", now);
            navigator.vibrate?.(35);
          }
          if (step.gateHit !== null) {
            const gi = gates.findIndex((g) => g.tick === k);
            if (gi >= 0) gateState[gi] = step.gateHit ? "hit" : "miss";
            if (step.gateHit) navigator.vibrate?.(8);
          }
          // Corner announcements, and a word on how the corner went.
          const corner = dc.corner[k];
          if (corner !== lastCorner) {
            if (lastCorner >= 0 && lastCorner < 3) {
              cornersDone = lastCorner + 1;
              const a = cornerAccuracy(lastCorner);
              say(a >= 0.9 ? "PERFECT LINE!" : a >= 0.75 ? "Clean corner" : a >= 0.5 ? "Okay, keep it tight" : "Sloppy, recover!", a >= 0.75 ? "good" : a >= 0.5 ? "neutral" : "bad", now);
            }
            if (corner >= 0) say(`Corner ${corner + 1}: ${spec.sectorNames[corner] ?? ""}`, "neutral", now);
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

      wallFlash = Math.max(0, wallFlash - dt * 2.5);
      const alpha = phaseNow === "driving" ? Math.min(1, acc / DT) : 1;
      const s = prev.s + (cur.s - prev.s) * alpha;
      const e = prev.e + (cur.e - prev.e) * alpha;

      const { p, r } = standing();
      // The rival sits ahead or behind according to who is winning, so the race can be felt.
      const targetGap = Math.max(-60, Math.min(60, (p - r) * 0.5));
      leadGap += (targetGap - leadGap) * (1 - Math.exp(-dt * 3));
      const rivalS = Math.max(0, s - leadGap);
      const t = phaseNow === "driving" ? driver.tick * DT : 0;
      const corner = dc.corner[Math.min(TICKS - 1, driver.tick)];
      const wobbleAmp = (1 - (spec.rivalAccuracy[Math.max(0, corner)] ?? spec.pivot)) * 9;
      const rivalE = idealOffset(dc.course, rivalS) + Math.sin(t * 1.9 + spec.round) * wobbleAmp * (corner >= 0 ? 1 : 0.4);

      const total = driver.scoreCount.reduce((a, b) => a + b, 0);
      const accuracyNow = total > 0 ? [0, 1, 2].reduce((sum, c) => sum + cornerAccuracy(c) * driver.scoreCount[c], 0) / total : 1;

      const view: DriveView = {
        player: { s, e, ev: last.ev, u: last.u, speed: last.speed, lineScore: last.lineScore, wall: last.wall },
        rival: { s: rivalS, e: rivalE, speed: last.speed },
        gates: gates.map((g, i) => ({ s: g.s, e: g.e, state: gateState[i] })),
        hud: {
          playerPoints: p,
          rivalPoints: r,
          accuracy: accuracyNow,
          streak,
          progress: driver.tick / TICKS,
          cornerIndex: Math.min(2, Math.max(0, phaseNow === "driving" || phaseNow === "finishing" ? Math.max(corner, cornersDone >= 3 ? 2 : 0) : 0)),
          steer: phaseNow === "ready" || phaseNow === "countdown" ? st.read() : last.u,
          countdown,
          banner: banner && (now - banner.at) / 1000 < 2 ? { text: banner.text, tone: banner.tone, age: (now - banner.at) / 1000 } : null,
          wallFlash,
          gateFlash: 0,
        },
      };
      renderer.renderDrive(view, dt);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.destroy();
    };
    // The drive is set up once for this spec; the live steering is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc, scene, gates, spec]);

  if (failed) {
    return (
      <div className={`${panel} space-y-2`} role="alert">
        <p className="text-sm font-bold text-red-600 dark:text-red-400">The drive couldn&apos;t start on this device (the drawing area isn&apos;t available).</p>
        <p className={muted}>Try another browser. The Round is still open.</p>
      </div>
    );
  }

  const touchMode = steering.mode === "touch" && (phase === "countdown" || phase === "driving" || phase === "ready");

  return (
    <section className="space-y-3" aria-label="Drive">
      <div ref={wrapRef} className="relative h-[72vh] max-h-[680px] min-h-[420px] w-full touch-none select-none overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-lg">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" role="img" aria-label="Top-down view of your car on the track. Steer left and right to stay on the racing line." />
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
      </div>

      {phase === "ready" && (
        <div className={`${panel} space-y-3`}>
          <div>
            <h3 className={heading}>Ready to drive?</h3>
            <p className={muted}>
              Your car drives itself. Steer left and right to stay on the green racing line and go through the gates. Corners push you to the outside, so lean into
              them. Better driving earns more points than a better car on its own.
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
                      ? "Tilt your phone left and right, like a steering wheel. Hold it how you like, then press Set straight."
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
          {steering.mode === "touch" && <p className={muted}>Put a finger on the screen and slide left or right. The middle is straight.</p>}
          {steering.mode === "keys" && <p className={muted}>Use the ← and → arrow keys (or A and D).</p>}

          <label className="flex items-center gap-3 text-xs font-bold text-zinc-700 dark:text-zinc-200">
            Sensitivity
            <input type="range" min={0.5} max={2} step={0.1} value={steering.sensitivity} onChange={(e) => steering.setSensitivity(Number(e.target.value))} className="w-40 accent-amber-500" aria-label="Steering sensitivity" />
            <span className={muted}>{steering.sensitivity.toFixed(1)}×</span>
          </label>

          <button type="button" className={primaryBtn} onClick={begin}>
            🏁 Start the drive
          </button>
        </div>
      )}
    </section>
  );
}

