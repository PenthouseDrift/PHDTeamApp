"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** True on a phone-width screen (under 768px, the point where DriftClash moves its sections to the bottom bar). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(max-width: 767px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false
  );
}

/**
 * How tall the bars fixed to the bottom of a phone screen are: the app's tab bar plus DriftClash's section bar. Anything
 * of ours that needs to sit on the bottom edge of the visible page sits this far up, so it is never hidden behind them.
 * The heights include the phone's safe area. 0 on larger screens, where neither bar is shown.
 */
export function useBottomChromeHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const find = () =>
      [document.querySelector<HTMLElement>(".pwa-bottom-nav"), document.querySelector<HTMLElement>('nav[aria-label="DriftClash sections"]')].filter(
        (el): el is HTMLElement => Boolean(el)
      );
    const measure = () => setHeight(Math.round(find().reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)));

    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const watch = () => {
      resize?.disconnect();
      for (const el of find()) resize?.observe(el);
      measure();
    };
    watch();
    // DriftClash's own bar is added to the page a moment after this mounts.
    const mutations = new MutationObserver(watch);
    mutations.observe(document.body, { childList: true });
    window.addEventListener("resize", measure);
    return () => {
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return height;
}
