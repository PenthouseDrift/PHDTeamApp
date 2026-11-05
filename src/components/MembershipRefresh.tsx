"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps what a signed-in member sees (check-in open or closed, membership, wallet) from going stale.
 *
 * A phone app that was backgrounded is usually resumed as the same frozen page, not reloaded, so
 * server-rendered state such as "Check-in is open" can be from yesterday. To fix that we:
 *   - refresh when the app comes back to the front after being away for a little while
 *     (visibilitychange, and pageshow for a page restored from the back/forward cache),
 *   - refresh on a slow 5-minute cadence while the app is visible, so a check-in window that opens
 *     or closes while the screen is on is picked up too.
 * Refreshing re-renders the server components and keeps client state, so nothing in progress is lost.
 */
const REFRESH_MS = 5 * 60 * 1000; // visible-app cadence
const AWAY_MS = 20 * 1000; // shorter trips (e.g. a payment popup) are covered by the pages themselves

export function MembershipRefresh() {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const awayFor = hiddenAt === null ? Infinity : Date.now() - hiddenAt;
      hiddenAt = null;
      if (awayFor >= AWAY_MS) router.refresh();
    };

    // A page restored from the back/forward cache is not reloaded, and may be a day old.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
