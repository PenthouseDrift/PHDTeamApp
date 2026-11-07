"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phone tilt as a steering input, for the Brace defence game. A bigger tilt pushes harder (it is analog, not an on/off press).
 * The pure maths is exported so it can be checked without a phone. The chosen control is remembered on the device.
 *
 * A phone reports two tilt angles: `beta` (tipping toward or away from you) and `gamma` (left or right). Which one is "left or
 * right" depends on how the screen is turned, so `tiltRoll` picks the right one.
 */

/** The tilt that counts as a full push, in degrees from straight. */
export const TILT_FULL_DEGREES = 14;
/** Small movements around straight are ignored, in degrees. */
export const TILT_DEAD_ZONE_DEGREES = 1;
/** Each frame the reading moves this share of the way to the new value: enough to take the worst shake out of a hand-held phone, light enough to feel immediate. */
const SMOOTHING = 0.7;
/** "Straight" is the average of the tilt over this long just before the game starts, so the tap on Start does not skew it. */
const CALIBRATE_WINDOW_MS = 400;
const STORAGE_KEY = "clash-brace-tilt-v1";

const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** The left-right tilt in degrees (positive = tipped right) for the way the screen is turned, or null when there is no reading. */
export function tiltRoll(beta: number | null, gamma: number | null, screenAngle: number): number | null {
  if (beta === null || gamma === null) return null;
  switch (norm360(screenAngle)) {
    case 90:
      return beta;
    case 270:
      return -beta;
    case 180:
      return -gamma;
    default:
      return gamma;
  }
}

/** A push from -1 (full left) to 1 (full right) for a tilt, measured from the angle counted as straight. */
export function tiltInput(roll: number, neutral: number): number {
  let d = roll - neutral;
  // The angle wraps at 180 degrees on some phones.
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const magnitude = Math.max(0, Math.abs(d) - TILT_DEAD_ZONE_DEGREES);
  const u = (Math.sign(d) * magnitude) / (TILT_FULL_DEGREES - TILT_DEAD_ZONE_DEGREES);
  return Math.max(-1, Math.min(1, u));
}

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

const screenAngle = () =>
  typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : ((window as unknown as { orientation?: number }).orientation ?? 0);

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

export function useTilt() {
  const [enabled, setEnabled] = useState<boolean>(loadEnabled);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  // True once a real tilt reading has arrived, so the screen can tell "no sensor" from "not moved yet".
  const [seen, setSeen] = useState(false);

  const needsPermission =
    typeof window !== "undefined" && typeof (window.DeviceOrientationEvent as OrientationWithPermission | undefined)?.requestPermission === "function";

  const rollRef = useRef<number | null>(null);
  const neutralRef = useRef(0);
  const smoothRef = useRef(0);
  // The last second of readings, so "straight" can be the average of the moment before the game starts.
  const samplesRef = useRef<Array<{ at: number; roll: number }>>([]);

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const roll = tiltRoll(e.beta, e.gamma, screenAngle());
      if (roll === null) return;
      rollRef.current = roll;
      const now = performance.now();
      const samples = samplesRef.current;
      samples.push({ at: now, roll });
      while (samples.length > 0 && now - samples[0].at > 1000) samples.shift();
      setSeen((was) => was || true);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
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

  /** Count the way the phone has been held for the last moment as "straight" (the average of the last few hundred milliseconds). */
  const calibrate = useCallback(() => {
    const now = performance.now();
    const recent = samplesRef.current.filter((s) => now - s.at <= CALIBRATE_WINDOW_MS);
    if (recent.length > 0) {
      // Average on the circle's offset from the latest reading, so readings either side of the 180 degree wrap do not cancel out.
      const ref = recent[recent.length - 1].roll;
      const offset = recent.reduce((sum, s) => {
        let d = s.roll - ref;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return sum + d;
      }, 0);
      neutralRef.current = ref + offset / recent.length;
    } else if (rollRef.current !== null) {
      neutralRef.current = rollRef.current;
    }
    smoothRef.current = 0;
  }, []);

  /** The push right now, -1 to 1 (0 with no reading). Call once per frame. */
  const read = useCallback((): number => {
    if (rollRef.current === null) return 0;
    const raw = tiltInput(rollRef.current, neutralRef.current);
    smoothRef.current += (raw - smoothRef.current) * SMOOTHING;
    return smoothRef.current;
  }, []);

  return { enabled, seen, needsPermission, permission, enable, disable, calibrate, read };
}

export type Tilt = ReturnType<typeof useTilt>;
