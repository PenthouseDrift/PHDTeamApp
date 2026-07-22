"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);
    setIsStandalone(!!standalone);

    if (standalone) return; // Already installed

    // Check if dismissed recently
    const dismissed = localStorage.getItem("phd-install-dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return; // Dismissed within last 7 days
    }

    // iOS detection (no beforeinstallprompt on iOS)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      setShowBanner(true);
      return;
    }

    // Android/Desktop — listen for the install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    localStorage.setItem("phd-install-dismissed", Date.now().toString());
  }

  if (!showBanner || isStandalone) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-3 shadow-lg md:hidden">
      <div className="flex items-center justify-between gap-3 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Install PHD App</p>
            <p className="text-xs opacity-80 truncate">
              {isIOS ? "Tap Share → Add to Home Screen" : "Get the full experience"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="rounded-lg bg-black text-amber-500 px-3 py-1.5 text-xs font-bold hover:bg-zinc-900 transition-colors"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
