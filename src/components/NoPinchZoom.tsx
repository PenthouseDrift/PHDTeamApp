"use client";

import { useEffect } from "react";

/**
 * Stops pinch-zoom and double-tap zoom while it is on the page, so the game feels like an app on a phone rather than a web page.
 * `userScalable: false` in the viewport covers Android; iPhone Safari ignores it, so the pinch gesture is also stopped here.
 * Everything is undone when the component goes away (for example when leaving the game for the rest of the site), and scrolling,
 * taps and one-finger gestures are untouched.
 */
export function NoPinchZoom() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.touchAction;
    // Allow dragging to scroll, but not pinching or double-tap zooming.
    root.style.touchAction = "pan-x pan-y";

    const stop = (e: Event) => e.preventDefault();
    // Safari fires these (non-standard) events for a pinch.
    const gestures = ["gesturestart", "gesturechange", "gestureend"] as const;
    for (const name of gestures) document.addEventListener(name, stop, { passive: false });
    // A touch with two or more fingers is a pinch everywhere else.
    const multiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchmove", multiTouch, { passive: false });

    return () => {
      root.style.touchAction = previous;
      for (const name of gestures) document.removeEventListener(name, stop);
      document.removeEventListener("touchmove", multiTouch);
    };
  }, []);
  return null;
}
