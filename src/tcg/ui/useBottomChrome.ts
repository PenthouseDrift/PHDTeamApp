"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

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

/** The nearest ancestor that scrolls vertically, or null when the whole window scrolls. */
function scrollerOf(start: HTMLElement | null): HTMLElement | null {
  let el = start;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

/** Only elements that can be a fixed or sticky bar are looked at, so measuring stays cheap on a page full of cards. */
const BAR_CANDIDATES =
  'header, nav, aside, [class~="fixed"], [class~="sticky"], [class*=":fixed"], [class*=":sticky"], .pwa-mobile-header, .pwa-install-banner';

/**
 * Works out how far past the top of the scrolling area's content a sticky bar must stick to clear the fixed bars over the
 * page, and publishes it as the CSS variable `--gx-sticky-top` (used by `.gx-sticky-top`). Usually that is 0: the app
 * reserves space for its fixed header as padding inside the scrolling area, and a sticky bar sits inside that padding. It
 * becomes more only when something reaches further down than the padding does. So this measures instead of guessing: it
 * finds the scrolling area and its padding, finds the fixed or sticky bars that cover its top edge (the app header, an
 * install banner), and uses how far they reach past the padding. It re-measures when the window changes size or the page's bars come and go.
 *
 * Pass an element inside the page, so the scrolling area above it can be found.
 */
export function useStickyTopOffset(anchor: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      const scroller = scrollerOf(anchor.current);
      const portTop = scroller ? scroller.getBoundingClientRect().top : 0;
      // A sticky bar is placed from the inside of the scrolling area's padding, not from its outer edge. The app reserves room
      // for its fixed header with exactly that padding, so a bar with `top: 0` already sits just under the header. Only what
      // reaches past the padding (a taller banner, say) needs adding.
      let contentTop = portTop;
      if (scroller) {
        const style = getComputedStyle(scroller);
        contentTop += (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0);
      }
      let covered = contentTop;
      for (const el of document.querySelectorAll<HTMLElement>(BAR_CANDIDATES)) {
        if (anchor.current?.contains(el)) continue; // our own sticky bars are not what we are clearing
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        // A bar across the top: wide, touching the top of the scrolling area, and not a bottom bar.
        if (rect.width < window.innerWidth * 0.5 || rect.height <= 0 || rect.height > 220) continue;
        if (rect.top > portTop + 8 || rect.bottom <= portTop) continue;
        covered = Math.max(covered, rect.bottom);
      }
      root.style.setProperty("--gx-sticky-top", `${Math.max(0, Math.round(covered - contentTop))}px`);
    };
    // At most one measurement every quarter second, however busy the page is.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
      }, 250);
    };
    measure();
    // A banner can slide in a moment after the page loads.
    const settle = [setTimeout(measure, 500), setTimeout(measure, 1800)];
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    // Only bars being added or removed matter, not every class change on the page.
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      settle.forEach(clearTimeout);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      root.style.removeProperty("--gx-sticky-top");
    };
  }, [anchor]);
}
