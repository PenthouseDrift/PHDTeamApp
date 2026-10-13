"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps membership/wallet status reasonably fresh without hammering the DB.
 * Membership rarely changes (a purchase or an admin action), so instead of a
 * tight 60s poll on every open tab we:
 *   - only refresh while the tab is actually visible, and
 *   - refresh on a slow 5-minute cadence, plus once when the tab regains focus
 *     (which is what actually matters after returning from a payment flow).
 * This cuts the steady background Redis read volume dramatically.
 */
export function MembershipRefresh() {
  const router = useRouter();

  useEffect(() => {
    const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, REFRESH_MS);

    // Refresh when the user returns to the tab (e.g. back from checkout).
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
