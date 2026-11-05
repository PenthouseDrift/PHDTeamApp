"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { easeKeyboard, rollFromOrientation, steeringFromPointer, steeringFromRoll } from "./steering-math";

/**
 * Steering for the drive: tilt the phone, drag a finger, or use the arrow keys. `read()` gives the steering right now
 * (-1 to 1) and is called once per drive tick. The chosen mode, sensitivity and direction are remembered on the device.
 */

export type ControlMode = "tilt" | "touch" | "keys";

const STORAGE_KEY = "tour-controls-v1";

interface Saved {
  mode?: ControlMode;
  sensitivity?: number;
  flip?: boolean;
}

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

const isTouchDevice = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
const screenAngle = () => (typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : (window as unknown as { orientation?: number }).orientation ?? 0);

export function useSteering() {
  const [saved] = useState<Saved>(() => (typeof window === "undefined" ? {} : loadSaved()));
  const [mode, setModeState] = useState<ControlMode>(() => saved.mode ?? (isTouchDevice() ? "tilt" : "keys"));
  const [sensitivity, setSensitivityState] = useState(saved.sensitivity ?? 1);
  const [flip, setFlipState] = useState(saved.flip ?? false);
  const [tiltSeen, setTiltSeen] = useState(false);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const needsPermission = typeof window !== "undefined" && typeof (window.DeviceOrientationEvent as OrientationWithPermission | undefined)?.requestPermission === "function";

  // Live values read every tick; kept in refs so reading them costs nothing.
  const rollRef = useRef<number | null>(null);
  const neutralRef = useRef(0);
  const smoothRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const keyValueRef = useRef(0);
  const touchRef = useRef(0);
  const lastRef = useRef(0);
  const modeRef = useRef(mode);
  const sensRef = useRef(sensitivity);
  const flipRef = useRef(flip);
  useEffect(() => {
    modeRef.current = mode;
    sensRef.current = sensitivity;
    flipRef.current = flip;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, sensitivity, flip }));
    } catch {
      /* storage can be unavailable; the settings just won't be remembered */
    }
  }, [mode, sensitivity, flip]);

  // Tilt events (they only arrive on a device with a motion sensor, and on iPhone only after permission).
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const roll = rollFromOrientation(e.beta, e.gamma, screenAngle());
      if (roll === null) return;
      rollRef.current = roll;
      setTiltSeen((seen) => seen || true);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  // Keyboard.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") keysRef.current.left = down;
      else if (k === "arrowright" || k === "d") keysRef.current.right = down;
      else return;
      e.preventDefault();
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const setMode = useCallback((m: ControlMode) => setModeState(m), []);
  const setSensitivity = useCallback((v: number) => setSensitivityState(Math.max(0.5, Math.min(2, v))), []);
  const setFlip = useCallback((v: boolean) => setFlipState(v), []);

  /** Treat the way the phone is held right now as "straight". */
  const calibrate = useCallback(() => {
    if (rollRef.current !== null) neutralRef.current = rollRef.current;
    smoothRef.current = 0;
  }, []);

  /** iPhone asks for permission to read motion, and only when a button is tapped. Other phones just work. */
  const enableTilt = useCallback(async (): Promise<boolean> => {
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
    setModeState("tilt");
    return true;
  }, []);

  /** The steering right now, -1 to 1. */
  const read = useCallback((): number => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
    lastRef.current = now;
    const m = modeRef.current;
    if (m === "tilt") {
      if (rollRef.current === null) return 0;
      const raw = steeringFromRoll(rollRef.current, neutralRef.current, sensRef.current, flipRef.current);
      // A light smoothing takes the shake out of a hand-held phone without making it laggy.
      smoothRef.current += (raw - smoothRef.current) * 0.45;
      return smoothRef.current;
    }
    if (m === "keys") {
      const target = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
      keyValueRef.current = easeKeyboard(keyValueRef.current, target, dt);
      return flipRef.current ? -keyValueRef.current : keyValueRef.current;
    }
    return flipRef.current ? -touchRef.current : touchRef.current;
  }, []);

  /** Handlers to put on the surface that catches finger or mouse steering. */
  const pointerHandlers = useMemo(() => {
    const move = (e: React.PointerEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      touchRef.current = steeringFromPointer(e.clientX, r.left, r.width);
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        move(e);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (e.buttons || e.pointerType === "touch") move(e);
      },
      onPointerUp: () => {
        touchRef.current = 0;
      },
      onPointerCancel: () => {
        touchRef.current = 0;
      },
    };
  }, []);

  return {
    mode,
    setMode,
    sensitivity,
    setSensitivity,
    flip,
    setFlip,
    tiltSeen,
    needsPermission,
    permission,
    enableTilt,
    calibrate,
    read,
    pointerHandlers,
  };
}

export type Steering = ReturnType<typeof useSteering>;
