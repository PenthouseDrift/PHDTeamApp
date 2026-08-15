"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

export function OfflineIndicator() {
  const isOnline = useSyncExternalStore(subscribe, getOnlineSnapshot, () => true);
  if (isOnline) return null;

  return (
    <div className="pwa-install-banner fixed top-0 left-0 right-0 z-50 bg-amber-500 text-zinc-900 text-center px-4 text-sm font-medium">
      You are offline. Some features may be unavailable until connectivity is restored.
    </div>
  );
}