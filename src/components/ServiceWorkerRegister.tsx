"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (!cancelled) await registration.update();
      } catch (error) {
        if (!cancelled) console.error("Service worker registration failed:", error);
      }
    }

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}