"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "phd-install-banner-dismissed";
const DISMISS_TIME = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isMobileDevice() {
  return isIOSDevice() || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_TIME;
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const ios = isIOSDevice();
    const mobile = isMobileDevice();
    const updateStandalone = () => setIsStandalone(isStandaloneMode());
    const initialize = window.requestAnimationFrame(() => {
      setIsIOS(ios);
      updateStandalone();
      if (mobile && ios && !isStandaloneMode() && !wasRecentlyDismissed()) setShowBanner(true);
    });

    const handleInstallPrompt = (event: Event) => {
      if (!mobile) return;
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (!wasRecentlyDismissed()) setShowBanner(true);
    };
    const handleInstalled = () => {
      setIsStandalone(true);
      setShowBanner(false);
      setShowGuide(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode.addEventListener("change", updateStandalone);

    return () => {
      window.cancelAnimationFrame(initialize);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode.removeEventListener("change", updateStandalone);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) {
      if (isIOS) setShowGuide(true);
      else setShowBanner(false);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setShowBanner(false);
    } catch (error) {
      console.error("Failed to prompt install:", error);
    } finally {
      setDeferredPrompt(null);
    }
  }

  function dismissBanner() {
    setShowBanner(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }

  if (isStandalone || !showBanner) return null;

  return (
    <>
      <div className="pwa-install-banner fixed top-0 left-0 right-0 z-[9990] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-black px-4 shadow-md">
        <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg shrink-0 border border-black/20 object-cover" />
            <div className="min-w-0 text-left">
              <p className="text-xs font-bold truncate leading-tight">Install Penthouse Drift</p>
              <p className="text-[10px] font-medium opacity-90 truncate leading-tight">
                {isIOS ? "Add to your Home Screen from the Share menu" : "Get quick full-screen app access"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleInstall} className="rounded-lg bg-black text-amber-400 px-3.5 py-1.5 text-xs font-black active:scale-95 transition-transform">
              Install
            </button>
            <button onClick={dismissBanner} className="p-1 opacity-75 hover:opacity-100" aria-label="Dismiss install banner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="pwa-modal-safe fixed inset-0 z-[99999] flex items-center justify-center px-4 bg-black/75 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <div className="w-full max-w-sm max-h-full overflow-y-auto rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-5 relative text-left">
            <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 text-zinc-400 p-1.5" aria-label="Close installation guide">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3.5 pr-8">
              <img src="/icons/icon-192.png" alt="Penthouse Drift" className="w-14 h-14 rounded-2xl border border-zinc-200 dark:border-zinc-700" />
              <div>
                <h2 id="install-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Install on iPhone or iPad</h2>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Use Safari&apos;s Share menu</p>
              </div>
            </div>

            <ol className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
              <li className="flex gap-3"><span className="font-black text-amber-500">1</span><span>Open this page in <strong>Safari</strong> if you are currently using an in-app browser.</span></li>
              <li className="flex gap-3"><span className="font-black text-amber-500">2</span><span>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> in Safari&apos;s toolbar.</span></li>
              <li className="flex gap-3"><span className="font-black text-amber-500">3</span><span>Scroll down and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</span></li>
              <li className="flex gap-3"><span className="font-black text-amber-500">4</span><span>Launch Penthouse Drift from its new Home Screen icon.</span></li>
            </ol>

            <p className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400">
              Notifications can be enabled after launching the installed app on supported iOS and iPadOS versions.
            </p>
            <button onClick={() => setShowGuide(false)} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-black text-black active:scale-[0.98] transition-transform">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}