"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __phdInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Global script-level listener to capture beforeinstallprompt even if Chrome fires before React mounts
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__phdInstallPrompt = e as BeforeInstallPromptEvent;
  });
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideAlert, setShowGuideAlert] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (installed as PWA)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);

    setIsStandalone(!!standalone);
    if (standalone) return;

    // iOS detection
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    const isMobile =
      /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

    // Retrieve global prompt if captured early
    if (typeof window !== "undefined" && window.__phdInstallPrompt) {
      setDeferredPrompt(window.__phdInstallPrompt);
    }

    const modalDismissed = localStorage.getItem("phd-install-modal-dismissed");
    const bannerDismissed = localStorage.getItem("phd-install-banner-dismissed");

    if (!bannerDismissed || Date.now() - Number(bannerDismissed) >= 7 * 24 * 60 * 60 * 1000) {
      setShowBanner(true);
    }

    if (isMobile && (!modalDismissed || Date.now() - Number(modalDismissed) >= 3 * 24 * 60 * 60 * 1000)) {
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 800);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      if (typeof window !== "undefined") window.__phdInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    const activePrompt =
      deferredPrompt || (typeof window !== "undefined" ? window.__phdInstallPrompt : null);

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (choice.outcome === "accepted") {
          setShowModal(false);
          setShowBanner(false);
        }
        setDeferredPrompt(null);
        if (typeof window !== "undefined") window.__phdInstallPrompt = null;
      } catch (err) {
        console.error("Failed to prompt install:", err);
      }
    } else {
      // If browser doesn't allow programmatic prompt (e.g. iOS Safari), show step-by-step guide
      setShowGuideAlert(true);
      if (!showModal) setShowModal(true);
    }
  }

  function handleDismissModal() {
    setShowModal(false);
    localStorage.setItem("phd-install-modal-dismissed", Date.now().toString());
  }

  function handleDismissBanner() {
    setShowBanner(false);
    localStorage.setItem("phd-install-banner-dismissed", Date.now().toString());
  }

  if (isStandalone) return null;

  return (
    <>
      {/* 1. Top Quick Install Banner */}
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 z-[9990] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-black px-4 py-2.5 shadow-md">
          <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/icons/icon-192.png"
                alt=""
                className="w-8 h-8 rounded-lg shrink-0 border border-black/20 shadow-xs object-cover"
              />
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold truncate leading-tight">Install Penthouse Drift</p>
                <p className="text-[10px] font-medium opacity-90 truncate leading-tight">
                  {isIOS ? "Tap Share → Add to Home Screen" : "Get 1-tap track app access & alerts"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-black text-amber-400 px-3.5 py-1.5 text-xs font-black hover:bg-zinc-900 active:scale-95 transition-all shadow-xs flex items-center gap-1"
              >
                <span>⚡</span> Install
              </button>
              <button
                onClick={handleDismissBanner}
                className="p-1 opacity-75 hover:opacity-100 transition-opacity"
                aria-label="Dismiss banner"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Initial Load PWA Install Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom-4 duration-300 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={handleDismissModal}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* App Header */}
            <div className="flex items-center gap-3.5 pt-1">
              <div className="relative shrink-0">
                <img
                  src="/icons/icon-192.png"
                  alt="Penthouse Drift"
                  className="w-14 h-14 rounded-2xl shadow-md border border-zinc-200 dark:border-zinc-700 object-cover"
                />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-black ring-2 ring-white dark:ring-zinc-900">
                  ✓
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                  Install Penthouse Drift
                </h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                  Official Track App
                </p>
              </div>
            </div>

            {/* Benefits List */}
            <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-100 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="text-base shrink-0">🔔</span>
                <div>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">Lock Screen Notifications</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Get track alerts &amp; event updates even when closed.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 border-t border-zinc-200/60 dark:border-zinc-700/60 pt-2.5">
                <span className="text-base shrink-0">⚡</span>
                <div>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">1-Tap Home Screen Access</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Instant full-screen launch without browser bars.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300 border-t border-zinc-200/60 dark:border-zinc-700/60 pt-2.5">
                <span className="text-base shrink-0">🎟️</span>
                <div>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">Fast Track Check-In</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Quick QR code access for fast gate check-ins.</p>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={handleInstall}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 px-4 py-3.5 text-sm font-black text-black shadow-lg hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span>⚡</span>
              <span>Install App Now</span>
            </button>

            {/* Step-by-Step Instructions (iOS or browser fallback) */}
            {(isIOS || showGuideAlert) && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2 animate-in fade-in duration-200">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📲</span> {isIOS ? "iOS Safari Instructions:" : "Browser Installation:"}
                </p>
                {isIOS ? (
                  <ol className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1 list-decimal list-inside pl-1">
                    <li>
                      Tap <span className="font-bold text-zinc-900 dark:text-zinc-100">Share</span> (
                      <span className="inline-block px-1 rounded bg-zinc-200 dark:bg-zinc-800 text-xs">📤</span>
                      ) in Safari.
                    </li>
                    <li>
                      Select <span className="font-bold text-zinc-900 dark:text-zinc-100">Add to Home Screen</span> (
                      <span className="inline-block px-1 rounded bg-zinc-200 dark:bg-zinc-800 text-xs font-bold">➕</span>
                      ).
                    </li>
                  </ol>
                ) : (
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                    Tap your browser menu (<span className="font-bold">⋮</span> or <span className="font-bold">Share</span>) and select <span className="font-bold text-amber-700 dark:text-amber-300">&quot;Add to Home screen&quot;</span> or <span className="font-bold text-amber-700 dark:text-amber-300">&quot;Install App&quot;</span>.
                  </p>
                )}
              </div>
            )}

            {/* Secondary Action / Dismiss */}
            <button
              onClick={handleDismissModal}
              className="w-full rounded-xl bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 py-2.5 text-xs font-bold text-zinc-600 dark:text-zinc-400 transition-colors"
            >
              {isIOS || showGuideAlert ? "Got It, Continue to Web" : "Maybe Later"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
