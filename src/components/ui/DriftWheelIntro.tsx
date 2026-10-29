"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface DriftWheelIntroProps {
  /**
   * If true, checks sessionStorage to run once per browser session on initial load.
   * Default: false (or controlled via triggerDriftWheelIntro)
   */
  autoPlayInitial?: boolean;
  /**
   * Controlled open state (optional)
   */
  isOpen?: boolean;
  /**
   * Callback invoked when the animation completes or is skipped.
   */
  onComplete?: () => void;
}

const SESSION_STORAGE_KEY = "phd_drift_wheel_intro_seen_v1";

/**
 * Programmatically trigger the drift wheel animation from anywhere (e.g. clicking "Play Tandem Clash").
 */
export function triggerDriftWheelIntro(onComplete?: () => void) {
  if (typeof window === "undefined") {
    onComplete?.();
    return;
  }
  const evt = new CustomEvent("phd:trigger-drift-wheel", {
    detail: { onComplete },
  });
  window.dispatchEvent(evt);
}

export function DriftWheelIntro({
  autoPlayInitial = false,
  isOpen: controlledIsOpen,
  onComplete: controlledOnComplete,
}: DriftWheelIntroProps) {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [phase, setPhase] = useState<"still" | "rev" | "smoke" | "drift" | "fade">("still");
  const onCompleteRef = useRef<(() => void) | undefined>(controlledOnComplete);
  onCompleteRef.current = controlledOnComplete;

  const callbackQueue = useRef<(() => void)[]>([]);

  const startAnimation = useCallback((cb?: () => void) => {
    if (cb) callbackQueue.current.push(cb);
    if (onCompleteRef.current) callbackQueue.current.push(onCompleteRef.current);

    // Check prefers-reduced-motion: if user wants reduced motion, skip quickly
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsActive(false);
      const callbacks = [...callbackQueue.current];
      callbackQueue.current = [];
      callbacks.forEach((c) => c());
      return;
    }

    setIsActive(true);
    setPhase("still");
  }, []);

  const finishAnimation = useCallback(() => {
    setIsActive(false);
    setPhase("still");
    const callbacks = [...callbackQueue.current];
    callbackQueue.current = [];
    callbacks.forEach((c) => c());
  }, []);

  // Listen for programmatic trigger events
  useEffect(() => {
    function handleCustomEvent(e: Event) {
      const customEvent = e as CustomEvent<{ onComplete?: () => void }>;
      startAnimation(customEvent.detail?.onComplete);
    }
    window.addEventListener("phd:trigger-drift-wheel", handleCustomEvent);
    return () => {
      window.removeEventListener("phd:trigger-drift-wheel", handleCustomEvent);
    };
  }, [startAnimation]);

  // Initial load auto-play check
  useEffect(() => {
    if (!autoPlayInitial) return;
    try {
      const hasSeen = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!hasSeen) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
        // Slight 100ms delay so DOM renders cleanly
        const t = setTimeout(() => {
          startAnimation();
        }, 80);
        return () => clearTimeout(t);
      }
    } catch {
      // Ignore storage errors (private browsing, cookies blocked)
    }
  }, [autoPlayInitial, startAnimation]);

  // Controlled isOpen support
  useEffect(() => {
    if (controlledIsOpen !== undefined) {
      if (controlledIsOpen && !isActive) {
        startAnimation();
      } else if (!controlledIsOpen && isActive) {
        finishAnimation();
      }
    }
  }, [controlledIsOpen, isActive, startAnimation, finishAnimation]);

  // Handle phase progressions when active
  useEffect(() => {
    if (!isActive) return;

    // Timeline:
    // 0.0s - 0.75s: STILL (Wheel resting on track with spotlight & camera focus)
    // 0.75s - 1.35s: REV (Wheel begins rapid acceleration spin with speed blur)
    // 1.35s - 1.95s: SMOKE (Massive tyre burnout smoke plume billows out)
    // 1.95s - 2.65s: DRIFT (Wheel tilts with camber, screeches off-screen, etching skid marks)
    // 2.65s - 3.15s: FADE (Overlay fades seamlessly to reveal the app/game)
    // 3.15s: Finish & unmount

    const t1 = setTimeout(() => setPhase("rev"), 750);
    const t2 = setTimeout(() => setPhase("smoke"), 1350);
    const t3 = setTimeout(() => setPhase("drift"), 1950);
    const t4 = setTimeout(() => setPhase("fade"), 2650);
    const t5 = setTimeout(() => {
      finishAnimation();
    }, 3150);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [isActive, finishAnimation]);

  // Keyboard shortcut: ESC to skip
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finishAnimation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, finishAnimation]);

  if (!isActive) return null;

  const isSpinning = phase === "rev" || phase === "smoke" || phase === "drift" || phase === "fade";
  const isSmokin = phase === "smoke" || phase === "drift" || phase === "fade";
  const isDrifting = phase === "drift" || phase === "fade";
  const isFading = phase === "fade";

  return (
    <div
      role="dialog"
      aria-label="Penthouse Drift Intro"
      className={`fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden bg-black transition-opacity duration-500 select-none ${
        isFading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <style>{`
        @keyframes wheelSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes wheelSpinHyperspeed {
          from { transform: rotate(0deg); }
          to { transform: rotate(1080deg); }
        }
        @keyframes smokePuff1 {
          0% { transform: translate(0, 0) scale(0.3); opacity: 0; }
          20% { opacity: 0.85; }
          60% { transform: translate(-80px, -40px) scale(1.6); opacity: 0.7; }
          100% { transform: translate(-180px, -90px) scale(2.8); opacity: 0; }
        }
        @keyframes smokePuff2 {
          0% { transform: translate(0, 0) scale(0.2); opacity: 0; }
          25% { opacity: 0.9; }
          65% { transform: translate(-120px, -20px) scale(2.0); opacity: 0.65; }
          100% { transform: translate(-260px, -60px) scale(3.5); opacity: 0; }
        }
        @keyframes smokePuff3 {
          0% { transform: translate(0, 0) scale(0.4); opacity: 0; }
          30% { opacity: 0.95; }
          70% { transform: translate(60px, -35px) scale(1.8); opacity: 0.6; }
          100% { transform: translate(140px, -80px) scale(3.0); opacity: 0; }
        }
        @keyframes sparksFly {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { opacity: 0.9; }
          100% { transform: translate(-120px, 30px) scale(0); opacity: 0; }
        }
        @keyframes skidMarkDraw {
          0% { stroke-dashoffset: 1200; opacity: 0; }
          15% { opacity: 0.9; }
          100% { stroke-dashoffset: 0; opacity: 0.85; }
        }
        @keyframes asphaltShake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, -2px); }
          80% { transform: translate(2px, 2px); }
        }
        @keyframes beamPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
      `}</style>

      {/* Skip Button */}
      <button
        type="button"
        onClick={finishAnimation}
        className="fixed top-5 right-5 z-[100000] flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-zinc-950/80 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-400 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:scale-105 hover:border-amber-400 hover:bg-zinc-900 active:scale-95"
      >
        <span>Skip</span>
        <span className="text-amber-300">⚡</span>
      </button>

      {/* Asphalt & Stadium Drift Environment */}
      <div
        className={`absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-zinc-950 ${
          isSpinning && !isDrifting ? "animate-[asphaltShake_0.08s_infinite]" : ""
        }`}
      >
        {/* Track Ground Horizon Line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

        {/* Asphalt Texture Grid / Ground Lines */}
        <div
          className="absolute inset-x-0 bottom-0 top-[45%] opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(245, 158, 11, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)",
            backgroundSize: "60px 30px",
            perspective: "400px",
            transform: "rotateX(65deg) translateZ(0)",
          }}
        />

        {/* Drift Stadium Spotlight Beam */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full bg-gradient-to-b from-amber-500/15 via-orange-600/10 to-transparent blur-3xl animate-[beamPulse_2s_infinite_ease-in-out]"
        />
      </div>

      {/* Tire Tread Skid Marks (revealed when the wheel drifts away) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="skidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#050505" stopOpacity="0.1" />
            <stop offset="25%" stopColor="#09090b" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#18181b" stopOpacity="0.75" />
          </linearGradient>

          {/* Tire Tread Pattern Mask */}
          <pattern id="tireTreadPattern" width="16" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="2" x2="16" y2="2" stroke="#1c1917" strokeWidth="2" />
            <line x1="2" y1="0" x2="6" y2="8" stroke="#000000" strokeWidth="3" />
            <line x1="10" y1="0" x2="14" y2="8" stroke="#000000" strokeWidth="3" />
          </pattern>
        </defs>

        {isDrifting && (
          <g className="transition-opacity duration-300">
            {/* Primary Curved Outer Skid Mark (Tyre 1) */}
            <path
              d="M 960 635 C 1040 645, 1180 620, 1360 560 C 1540 500, 1780 430, 2100 370"
              fill="none"
              stroke="url(#skidGrad)"
              strokeWidth="38"
              strokeLinecap="round"
              strokeDasharray="1200"
              style={{ animation: "skidMarkDraw 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            />
            {/* Tread Grooves Overlay 1 */}
            <path
              d="M 960 635 C 1040 645, 1180 620, 1360 560 C 1540 500, 1780 430, 2100 370"
              fill="none"
              stroke="url(#tireTreadPattern)"
              strokeWidth="32"
              strokeLinecap="round"
              strokeDasharray="1200"
              style={{ animation: "skidMarkDraw 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            />

            {/* Inner Parallel Skid Mark (Tyre 2) */}
            <path
              d="M 930 675 C 1010 685, 1150 660, 1330 600 C 1510 540, 1750 470, 2070 410"
              fill="none"
              stroke="url(#skidGrad)"
              strokeWidth="36"
              strokeLinecap="round"
              strokeDasharray="1200"
              style={{ animation: "skidMarkDraw 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            />
            {/* Tread Grooves Overlay 2 */}
            <path
              d="M 930 675 C 1010 685, 1150 660, 1330 600 C 1510 540, 1750 470, 2070 410"
              fill="none"
              stroke="url(#tireTreadPattern)"
              strokeWidth="30"
              strokeLinecap="round"
              strokeDasharray="1200"
              style={{ animation: "skidMarkDraw 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            />
          </g>
        )}
      </svg>

      {/* Main Wheel Assembly Container */}
      <div
        className="relative z-20 flex flex-col items-center justify-center"
        style={{
          transform: isDrifting
            ? "translate(140vw, -120px) rotate(42deg) scale(0.85)"
            : phase === "smoke"
            ? "translate(-12px, 4px) rotate(-11deg) skewX(-4deg)"
            : phase === "rev"
            ? "translate(-4px, 1px) rotate(-2deg)"
            : "translate(0, 0)",
          transition: isDrifting
            ? "transform 0.85s cubic-bezier(0.22, 1, 0.36, 1)"
            : "transform 0.35s ease-out",
        }}
      >
        {/* Contact Patch Shadow */}
        <div
          className={`absolute -bottom-8 h-12 w-72 rounded-[100%] bg-black/80 blur-md transition-all duration-300 ${
            isSpinning ? "scale-x-125 opacity-90" : "scale-x-100 opacity-70"
          }`}
        />

        {/* Billowing Smoke Puffs (At Contact Patch) */}
        {isSmokin && (
          <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 z-30">
            {/* Puff 1: Dense Left Swirl */}
            <div
              className="absolute -top-12 -left-16 h-36 w-36 rounded-full bg-gradient-to-tr from-zinc-300/80 via-white/70 to-transparent blur-xl"
              style={{ animation: "smokePuff1 1.2s ease-out infinite" }}
            />
            {/* Puff 2: Deep Rear Cloud */}
            <div
              className="absolute -top-16 -left-28 h-44 w-44 rounded-full bg-gradient-to-r from-zinc-200/90 via-zinc-400/60 to-transparent blur-2xl"
              style={{ animation: "smokePuff2 1.4s ease-out infinite" }}
            />
            {/* Puff 3: Amber Track Highlight Swirl */}
            <div
              className="absolute -top-8 -left-6 h-32 w-32 rounded-full bg-gradient-to-br from-amber-200/60 via-orange-300/40 to-transparent blur-lg"
              style={{ animation: "smokePuff3 1.1s ease-out infinite" }}
            />
            {/* Puff 4: Ambient Thick Blanket */}
            <div
              className="absolute -top-20 -left-36 h-56 w-72 rounded-full bg-zinc-300/40 blur-3xl"
              style={{ animation: "smokePuff2 1.5s ease-out infinite 0.2s" }}
            />

            {/* Glowing Friction Embers / Sparks */}
            <div
              className="absolute top-2 -left-8 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_#f59e0b]"
              style={{ animation: "sparksFly 0.4s ease-out infinite" }}
            />
            <div
              className="absolute top-0 -left-12 h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_#ea580c]"
              style={{ animation: "sparksFly 0.5s ease-out infinite 0.15s" }}
            />
            <div
              className="absolute top-4 -left-4 h-2.5 w-2.5 rounded-full bg-yellow-300 shadow-[0_0_12px_#fde047]"
              style={{ animation: "sparksFly 0.35s ease-out infinite 0.08s" }}
            />
          </div>
        )}

        {/* Wheel SVG Unit */}
        <div className="relative h-[280px] w-[280px] sm:h-[320px] sm:w-[320px]">
          {/* Rotating Rim + Tyre Assembly */}
          <div
            className="h-full w-full"
            style={{
              animation:
                phase === "smoke" || phase === "drift" || phase === "fade"
                  ? "wheelSpinHyperspeed 0.22s linear infinite"
                  : phase === "rev"
                  ? "wheelSpin 0.38s cubic-bezier(0.4, 0, 0.2, 1) infinite"
                  : "none",
            }}
          >
            <svg
              className="h-full w-full drop-shadow-[0_15px_35px_rgba(0,0,0,0.9)]"
              viewBox="0 0 320 320"
            >
              <defs>
                {/* Tyre Rubber Gradient */}
                <radialGradient id="tyreRubberGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="68%" stopColor="#141416" />
                  <stop offset="84%" stopColor="#1c1d22" />
                  <stop offset="93%" stopColor="#101012" />
                  <stop offset="100%" stopColor="#080809" />
                </radialGradient>

                {/* Stepped Polished Rim Dish Gradient */}
                <radialGradient id="rimDishGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0a0a0c" />
                  <stop offset="50%" stopColor="#18181b" />
                  <stop offset="78%" stopColor="#3f3f46" />
                  <stop offset="85%" stopColor="#71717a" />
                  <stop offset="92%" stopColor="#a1a1aa" />
                  <stop offset="97%" stopColor="#27272a" />
                  <stop offset="100%" stopColor="#09090b" />
                </radialGradient>

                {/* Bronze/Gold Metallic Spoke Gradient */}
                <linearGradient id="bronzeSpokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="45%" stopColor="#d97706" />
                  <stop offset="80%" stopColor="#92400e" />
                  <stop offset="100%" stopColor="#451a03" />
                </linearGradient>

                {/* Ventilated Brake Rotor Pattern */}
                <radialGradient id="rotorMetal" cx="50%" cy="50%" r="50%">
                  <stop offset="55%" stopColor="#52525b" />
                  <stop offset="75%" stopColor="#71717a" />
                  <stop offset="85%" stopColor="#3f3f46" />
                  <stop offset="90%" stopColor="#27272a" />
                </radialGradient>

                {/* Circular Text Path for Tyre Sidewall Lettering */}
                <path
                  id="tyreSidewallPath"
                  d="M 160, 160 m -134, 0 a 134,134 0 1,1 268,0 a 134,134 0 1,1 -268,0"
                  fill="none"
                />
              </defs>

              {/* 1. Tyre Outer Rubber Body */}
              <circle cx="160" cy="160" r="158" fill="url(#tyreRubberGrad)" stroke="#09090b" strokeWidth="3" />

              {/* Outer Tread Ribs & Grooves */}
              <circle
                cx="160"
                cy="160"
                r="152"
                fill="none"
                stroke="#09090b"
                strokeWidth="4"
                strokeDasharray="6 4"
                opacity="0.8"
              />
              <circle
                cx="160"
                cy="160"
                r="144"
                fill="none"
                stroke="#000000"
                strokeWidth="2.5"
              />

              {/* Tyre Sidewall Racing Lettering */}
              <text
                fill="#d4af37"
                fontSize="8.5"
                fontWeight="900"
                letterSpacing="3"
                opacity="0.85"
              >
                <textPath href="#tyreSidewallPath" startOffset="10%">
                  PENTHOUSE DRIFT SPEC-R • 245/40R18 • COMP-V DRIFT TYRE
                </textPath>
              </text>
              <text
                fill="#ffffff"
                fontSize="8"
                fontWeight="800"
                letterSpacing="3"
                opacity="0.65"
              >
                <textPath href="#tyreSidewallPath" startOffset="60%">
                  TANDEM CLASH EDITION • MAXIMUM ANGLE • 100 PSI
                </textPath>
              </text>

              {/* 2. Deep-Dish Polished Metallic Rim Lip */}
              <circle cx="160" cy="160" r="122" fill="url(#rimDishGrad)" stroke="#52525b" strokeWidth="2" />
              <circle cx="160" cy="160" r="114" fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.4" />

              {/* 3. Cross-Drilled Brake Rotor Behind Spokes */}
              <circle cx="160" cy="160" r="98" fill="url(#rotorMetal)" stroke="#18181b" strokeWidth="2" />
              {/* Rotor Drill Holes */}
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                <g key={deg} transform={`rotate(${deg} 160 160)`}>
                  <circle cx="160" cy="80" r="2" fill="#18181b" opacity="0.8" />
                  <circle cx="165" cy="88" r="2" fill="#18181b" opacity="0.8" />
                  <circle cx="155" cy="94" r="2" fill="#18181b" opacity="0.8" />
                  <line x1="158" y1="74" x2="162" y2="102" stroke="#27272a" strokeWidth="1" strokeDasharray="3 3" />
                </g>
              ))}

              {/* 4. Deep-Dish 6-Spoke Drift Rim (Work Meister / TE37 Style) */}
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <g key={`spoke-${deg}`} transform={`rotate(${deg} 160 160)`}>
                  {/* Spoke drop shadow for 3D depth */}
                  <polygon
                    points="148,160 152,56 168,56 172,160"
                    fill="#18181b"
                    transform="translate(2, 3)"
                    opacity="0.7"
                  />
                  {/* Bronze/Gold Metallic Spoke Face */}
                  <polygon
                    points="148,160 152,58 168,58 172,160"
                    fill="url(#bronzeSpokeGrad)"
                    stroke="#fbbf24"
                    strokeWidth="0.75"
                  />
                  {/* Spoke Center Bevel Rib */}
                  <line
                    x1="160"
                    y1="64"
                    x2="160"
                    y2="150"
                    stroke="#fef08a"
                    strokeWidth="1.5"
                    opacity="0.8"
                  />
                  {/* Rim Perimeter Stepped Lug Rivet */}
                  <circle cx="160" cy="50" r="2.5" fill="#e4e4e7" stroke="#3f3f46" strokeWidth="1" />
                </g>
              ))}

              {/* Motion Blur Spoke Streaks (visible when spinning fast) */}
              {isSpinning && (
                <circle
                  cx="160"
                  cy="160"
                  r="92"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="32"
                  opacity="0.35"
                  strokeDasharray="18 12"
                />
              )}

              {/* 5. Center Hub Bezel */}
              <circle cx="160" cy="160" r="46" fill="#09090b" stroke="#f59e0b" strokeWidth="2.5" />
              <circle cx="160" cy="160" r="41" fill="#18181b" stroke="#71717a" strokeWidth="1" />

              {/* 5 Lug Nuts in Circular Hub */}
              {[0, 72, 144, 216, 288].map((deg) => (
                <circle
                  key={`lug-${deg}`}
                  cx={160 + 28 * Math.cos((deg * Math.PI) / 180)}
                  cy={160 + 28 * Math.sin((deg * Math.PI) / 180)}
                  r="4"
                  fill="#d4af37"
                  stroke="#78350f"
                  strokeWidth="1"
                />
              ))}

              {/* Center Cap Base Disc */}
              <circle cx="160" cy="160" r="22" fill="#000000" stroke="#f59e0b" strokeWidth="2" />
            </svg>

            {/* Center Cap "P" Logo Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/80 bg-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Penthouse P"
                  className="h-8 w-8 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cinematic Title Caption */}
        <div className="mt-8 flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 bg-gradient-to-r from-transparent to-amber-500" />
            <span className="text-xs font-black uppercase tracking-[0.3em] text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]">
              PENTHOUSE DRIFT
            </span>
            <span className="h-0.5 w-6 bg-gradient-to-l from-transparent to-amber-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
            {phase === "still" && "STAGING ON GRID..."}
            {phase === "rev" && "WARMING REAR TYRES..."}
            {phase === "smoke" && "FULL THROTTLE BURNOUT..."}
            {(phase === "drift" || phase === "fade") && "SENDING IT SIDEWAYS! 🏁"}
          </span>
        </div>
      </div>
    </div>
  );
}

