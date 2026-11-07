"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phone tilt as a steering input, for the Brace defence game. A bigger tilt pushes harder (it is analog, not an on/off press).
 *
 * Phones report tilt as two Euler angles (`beta` and `gamma`). Those misbehave: which one is "left and right" and which way is
 * positive changes with how the phone is held, and when the phone is upright they jump about wildly (gimbal lock). So instead
 * of using the angles, this works out which way gravity points in the phone's own frame, which changes smoothly however the phone
 * is held, and uses one of its two sideways components as the tilt.
 *
 * Which component is "left and right" depends on how the phone is held, and the sign depends on the platform, so the player is
 * asked ONCE per way of holding the phone to tip the right side of the screen down. The hook sees which component moved, which
 * way, and how far the player naturally tips, and saves that on the device. The pure maths is exported so it can be checked
 * without a phone.
 */

/** Used until the player's own range is known, and the limits for it, in degrees. */
export const TILT_DEFAULT_FULL_DEGREES = 14;
export const TILT_MIN_FULL_DEGREES = 8;
export const TILT_MAX_FULL_DEGREES = 24;
/** Small movements around straight are ignored, in degrees. */
export const TILT_DEAD_ZONE_DEGREES = 1;
/** Each frame the reading moves this share of the way to the new value: takes the worst shake out, still feels immediate. */
const SMOOTHING = 0.7;
/** "Straight" is the average over this long just before the game starts, so the tap on Start does not skew it. */
const NEUTRAL_WINDOW_MS = 400;
/** Setup: hold steady this long, then tip. A tip of at least this many degrees, held this long, is accepted. */
const SETUP_HOLD_MS = 600;
export const TILT_SETUP_MIN_DEGREES = 12;
const SETUP_STABLE_MS = 300;
const SETUP_TIMEOUT_MS = 9000;
/** The player's range is this share of how far they tipped in setup (so the end of a comfortable tip is a full push). */
const SETUP_RANGE_SHARE = 0.65;

const STORAGE_KEY = "clash-brace-tilt-v1";
const CAL_KEY = "clash-brace-tilt-cal-v2";

/** The two sideways components of gravity in the phone's own frame: `x` along the phone's width, `y` along its length. */
export interface Gravity {
  x: number;
  y: number;
}
export type TiltAxis = "x" | "y";
export interface TiltCalibration {
  axis: TiltAxis;
  /** 1 if the reading rises when the right side of the screen goes down, -1 if it falls. */
  sign: 1 | -1;
  /** Degrees of tilt that count as a full push. */
  full: number;
}
export interface TiltSetupProgress {
  phase: "hold" | "tip" | "done" | "failed";
  /** How far the phone has been tipped so far, in degrees. */
  deviation: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Which way gravity points in the phone's own frame, from the angles the phone reports (the standard device-orientation
 * convention). `x` is how much of gravity lies along the phone's width (the phone's right side is lower when it is positive), and
 * `y` how much lies along its length (the phone's top is lower when it is positive). Both run -1 to 1 and change smoothly in every hold.
 */
export function gravityFromAngles(beta: number, gamma: number): Gravity {
  const b = rad(beta);
  const g = rad(gamma);
  return { x: Math.cos(b) * Math.sin(g), y: -Math.sin(b) };
}

/** A gravity component as a tilt in degrees. */
export const tiltDegrees = (component: number): number => deg(Math.asin(clamp(component, -1, 1)));

/**
 * Work out the calibration from where the phone was held steady and where the player tipped it. The component that moved the most
 * is the one that matters, the direction it moved is "right side down", and the player's range comes from how far they went. Null
 * when they have not tipped far enough yet.
 */
export function detectCalibration(neutral: Gravity, tipped: Gravity): TiltCalibration | null {
  // Which component is the left-right one is decided by the raw change: when the phone is upright and rolled like a wheel, BOTH
  // components move, but the left-right one moves far more in raw terms (the other only shifts by the tiny curve of a cosine).
  const rawX = Math.abs(tipped.x - neutral.x);
  const rawY = Math.abs(tipped.y - neutral.y);
  const axis: TiltAxis = rawX >= rawY ? "x" : "y";
  const d = tiltDegrees(tipped[axis]) - tiltDegrees(neutral[axis]);
  if (Math.abs(d) < TILT_SETUP_MIN_DEGREES) return null;
  return {
    axis,
    sign: d > 0 ? 1 : -1,
    full: clamp(Math.abs(d) * SETUP_RANGE_SHARE, TILT_MIN_FULL_DEGREES, TILT_MAX_FULL_DEGREES),
  };
}

/** A push from -1 (full left) to 1 (full right) for a tilt of `roll` degrees from straight (positive = right side down). */
export function tiltInput(roll: number, full: number = TILT_DEFAULT_FULL_DEGREES): number {
  const magnitude = Math.max(0, Math.abs(roll) - TILT_DEAD_ZONE_DEGREES);
  const u = (Math.sign(roll) * magnitude) / Math.max(1, full - TILT_DEAD_ZONE_DEGREES);
  return clamp(u, -1, 1);
}

/** The average gravity over the last `windowMs` of readings, or null if there were none. */
export function averageGravity(samples: Array<Gravity & { at: number }>, now: number, windowMs: number): Gravity | null {
  const recent = samples.filter((s) => now - s.at <= windowMs);
  if (recent.length === 0) return null;
  return {
    x: recent.reduce((sum, s) => sum + s.x, 0) / recent.length,
    y: recent.reduce((sum, s) => sum + s.y, 0) / recent.length,
  };
}

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

const screenAngle = () =>
  norm360(typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : ((window as unknown as { orientation?: number }).orientation ?? 0));

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A phone or tablet (a touch screen as the main pointer). A laptop with a touch screen does not count, since it has no tilt sensor. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : "ontouchstart" in window;
}

/** Tilt is on by default on a phone. A choice the player has made on this device (on or off) always wins. */
function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "on") return true;
    if (saved === "off") return false;
  } catch {
    /* storage can be unavailable; fall back to the device default */
  }
  return isTouchDevice();
}

type CalibrationStore = Record<string, TiltCalibration>;

function loadCalibrations(): CalibrationStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(CAL_KEY) ?? "{}") as CalibrationStore;
    const out: CalibrationStore = {};
    for (const [angle, c] of Object.entries(raw)) {
      if (c && (c.axis === "x" || c.axis === "y") && (c.sign === 1 || c.sign === -1) && Number.isFinite(c.full)) {
        out[angle] = { axis: c.axis, sign: c.sign, full: clamp(c.full, TILT_MIN_FULL_DEGREES, TILT_MAX_FULL_DEGREES) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function useTilt() {
  const [enabled, setEnabled] = useState<boolean>(loadEnabled);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  // True once a real tilt reading has arrived, so the screen can tell "no sensor" from "not moved yet".
  const [seen, setSeen] = useState(false);
  const [angle, setAngle] = useState<number>(() => (typeof window === "undefined" ? 0 : screenAngle()));
  const [calibrations, setCalibrations] = useState<CalibrationStore>(loadCalibrations);
  const [setup, setSetup] = useState<TiltSetupProgress | null>(null);

  const needsPermission =
    typeof window !== "undefined" && typeof (window.DeviceOrientationEvent as OrientationWithPermission | undefined)?.requestPermission === "function";

  const latestRef = useRef<Gravity | null>(null);
  const samplesRef = useRef<Array<Gravity & { at: number }>>([]);
  const neutralRef = useRef(0);
  const smoothRef = useRef(0);
  const aliveRef = useRef(true);
  const calibration = calibrations[String(angle)] ?? null;
  const calibrationRef = useRef<TiltCalibration | null>(calibration);
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  useEffect(() => {
    aliveRef.current = true;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const now = performance.now();
      const g = gravityFromAngles(e.beta, e.gamma);
      latestRef.current = g;
      const samples = samplesRef.current;
      samples.push({ at: now, ...g });
      while (samples.length > 0 && now - samples[0].at > 1500) samples.shift();
      setSeen((was) => was || true);
    };
    // Turning the phone between portrait and landscape changes what the readings mean, so each way of holding it has its own setup.
    const onTurn = () => setAngle(screenAngle());
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("orientationchange", onTurn);
    screen.orientation?.addEventListener?.("change", onTurn);
    return () => {
      aliveRef.current = false;
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("orientationchange", onTurn);
      screen.orientation?.removeEventListener?.("change", onTurn);
    };
  }, []);

  const remember = useCallback((on: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      /* storage can be unavailable; the choice just won't be remembered */
    }
  }, []);

  /** Turn tilt on. iPhone asks permission to read motion, and only when this is called from a tap. Other phones just work. */
  const enable = useCallback(async (): Promise<boolean> => {
    const doe = window.DeviceOrientationEvent as OrientationWithPermission | undefined;
    if (doe && typeof doe.requestPermission === "function") {
      try {
        const res = await doe.requestPermission();
        setPermission(res);
        if (res !== "granted") {
          // Refused: use the buttons. This is not saved as the player's choice, so tilt works again if they allow it later.
          setEnabled(false);
          return false;
        }
      } catch {
        setPermission("denied");
        setEnabled(false);
        return false;
      }
    } else {
      setPermission("granted");
    }
    setEnabled(true);
    remember(true);
    return true;
  }, [remember]);

  const disable = useCallback(() => {
    setEnabled(false);
    remember(false);
  }, [remember]);

  /** Wait (up to `timeoutMs`) for the first tilt reading. False if the device never sends one (no sensor, or no permission). */
  const waitForReading = useCallback(async (timeoutMs: number): Promise<boolean> => {
    const until = performance.now() + timeoutMs;
    while (latestRef.current === null && performance.now() < until) await sleep(50);
    return latestRef.current !== null;
  }, []);

  /**
   * One-time setup for the way the phone is held now. The player holds steady, then tips the right side of the screen down. Resolves
   * true once a clear tip has been seen and saved, false if none came in time.
   */
  const measure = useCallback(async (): Promise<boolean> => {
    setSetup({ phase: "hold", deviation: 0 });
    await sleep(SETUP_HOLD_MS);
    const neutral = averageGravity(samplesRef.current, performance.now(), SETUP_HOLD_MS - 100);
    if (!neutral || !aliveRef.current) {
      if (aliveRef.current) setSetup({ phase: "failed", deviation: 0 });
      return false;
    }
    setSetup({ phase: "tip", deviation: 0 });
    const startedAt = performance.now();
    let stableSince = 0;
    let candidate: TiltCalibration | null = null;
    while (aliveRef.current && performance.now() - startedAt < SETUP_TIMEOUT_MS) {
      await sleep(50);
      const latest = latestRef.current;
      if (!latest) continue;
      const deviation = Math.max(
        Math.abs(tiltDegrees(latest.x) - tiltDegrees(neutral.x)),
        Math.abs(tiltDegrees(latest.y) - tiltDegrees(neutral.y))
      );
      setSetup({ phase: "tip", deviation });
      const found = detectCalibration(neutral, latest);
      // It has to be the same reading and direction for a moment, so a jolt does not count.
      if (found && candidate && found.axis === candidate.axis && found.sign === candidate.sign) {
        candidate = found;
        if (performance.now() - stableSince >= SETUP_STABLE_MS) {
          const next = { ...loadCalibrations(), [String(screenAngle())]: found };
          try {
            localStorage.setItem(CAL_KEY, JSON.stringify(next));
          } catch {
            /* storage can be unavailable; it just won't be remembered */
          }
          setCalibrations(next);
          setSetup({ phase: "done", deviation });
          await sleep(600);
          if (aliveRef.current) setSetup(null);
          return true;
        }
      } else {
        candidate = found;
        stableSince = found ? performance.now() : 0;
      }
    }
    if (aliveRef.current) setSetup({ phase: "failed", deviation: 0 });
    return false;
  }, []);

  /** Forget the setup for the way the phone is held now, so the next game asks for it again. */
  const resetCalibration = useCallback(() => {
    const next = { ...loadCalibrations() };
    delete next[String(screenAngle())];
    try {
      localStorage.setItem(CAL_KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
    setCalibrations(next);
  }, []);

  /** Count the way the phone has been held for the last moment as "straight". */
  const calibrate = useCallback(() => {
    const cal = calibrationRef.current;
    if (!cal) return;
    const avg = averageGravity(samplesRef.current, performance.now(), NEUTRAL_WINDOW_MS) ?? latestRef.current;
    if (avg) neutralRef.current = avg[cal.axis];
    smoothRef.current = 0;
  }, []);

  /** The raw tilt the phone is reporting right now, in degrees along each of its two sides, or null with no reading. For a live test display. */
  const peek = useCallback((): { x: number; y: number } | null => {
    const latest = latestRef.current;
    return latest ? { x: tiltDegrees(latest.x), y: tiltDegrees(latest.y) } : null;
  }, []);

  /** The push right now, -1 to 1 (0 with no reading or no setup). Call once per frame. */
  const read = useCallback((): number => {
    const cal = calibrationRef.current;
    const latest = latestRef.current;
    if (!cal || !latest) return 0;
    const roll = cal.sign * (tiltDegrees(latest[cal.axis]) - tiltDegrees(neutralRef.current));
    smoothRef.current += (tiltInput(roll, cal.full) - smoothRef.current) * SMOOTHING;
    return smoothRef.current;
  }, []);

  return {
    enabled,
    seen,
    needsPermission,
    permission,
    calibrated: calibration !== null,
    setup,
    enable,
    disable,
    waitForReading,
    measure,
    resetCalibration,
    calibrate,
    peek,
    read,
  };
}

export type Tilt = ReturnType<typeof useTilt>;
