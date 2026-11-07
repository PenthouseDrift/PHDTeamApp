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
export const TILT_FULL_DEGREES = 22;
/** Small movements around straight are ignored, in degrees. */
export const TILT_DEAD_ZONE_DEGREES = 2;
/** Each frame the reading moves this share of the way to the new value, which takes the shake out of a hand-held phone. */
const SMOOTHING = 0.4;
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

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
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

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const roll = tiltRoll(e.beta, e.gamma, screenAngle());
      if (roll === null) return;
      rollRef.current = roll;
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
        if (res !== "granted") return false;
      } catch {
        setPermission("denied");
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

  /** Count the way the phone is held right now as "straight". */
  const calibrate = useCallback(() => {
    if (rollRef.current !== null) neutralRef.current = rollRef.current;
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
