"use client";

import { useEffect, useState, type ReactNode } from "react";

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

/**
 * Which browser the user is viewing in, on iOS specifically. This drives the
 * install instructions because iOS only exposes "Add to Home Screen" in certain
 * browsers, and the steps differ between them:
 *  - "safari"  → Share menu in the bottom toolbar (the classic flow).
 *  - "chrome"  → Chrome/Edge on iOS 16.4+ can install via the Share button in
 *                 the address bar. Different location to Safari's.
 *  - "in-app"  → Embedded web views (Instagram, Facebook, TikTok, Gmail, etc.)
 *                 CANNOT install at all. This is the single biggest cause of
 *                 "the install button does nothing" reports.
 *  - "other"   → Firefox/Brave/etc. on iOS: no Add to Home Screen support.
 */
type IOSBrowser = "safari" | "chrome" | "in-app" | "other";

function detectIOSBrowser(): IOSBrowser {
  const ua = navigator.userAgent;

  // In-app browsers first — they masquerade with extra UA tokens. If any match,
  // the user is trapped in a web view that can't install.
  const inAppTokens = [
    "FBAN", "FBAV", "FB_IAB", // Facebook
    "Instagram",
    "Line/",
    "Twitter",
    "Snapchat",
    "TikTok", "musical_ly", "BytedanceWebview",
    "Pinterest",
    "LinkedInApp",
    "GSA/", // Google app
  ];
  if (inAppTokens.some((token) => ua.includes(token))) return "in-app";

  // Chrome (CriOS) and Edge (EdgiOS) on iOS can install since iOS 16.4+.
  if (/CriOS|EdgiOS/.test(ua)) return "chrome";

  // Real Safari: has "Safari" and "Version/" and is not one of the above.
  if (/Safari/.test(ua) && /Version\//.test(ua)) return "safari";

  // Firefox (FxiOS), Brave, and anything else: no install path on iOS.
  return "other";
}

function iosGuideSubtitle(browser: IOSBrowser): string {
  switch (browser) {
    case "safari":
      return "Use Safari's Share menu";
    case "chrome":
      return "Use the Share button in the address bar";
    case "in-app":
      return "Open in Safari to continue";
    case "other":
      return "Open in Safari or Chrome to continue";
  }
}

// Returns the ordered install steps tailored to the detected iOS browser.
// Safari and Chrome both support Add to Home Screen but expose Share in
// different places; in-app/other browsers must first bounce to Safari.
function iosStepsForBrowser(browser: IOSBrowser): ReactNode[] {
  const shareThenAdd = (shareLocation: ReactNode): ReactNode[] => [
    shareLocation,
    <>Scroll down and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</>,
    <>Launch Penthouse Drift from its new Home Screen icon.</>,
  ];

  switch (browser) {
    case "safari":
      return shareThenAdd(
        <>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> in Safari&apos;s bottom toolbar.</>
      );
    case "chrome":
      return shareThenAdd(
        <>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> in Chrome&apos;s address bar (top right).</>
      );
    case "in-app":
      return [
        <>Tap the <strong>•••</strong> (or browser) menu in this app, then choose <strong>Open in Safari</strong> / <strong>Open in browser</strong>.</>,
        <>In Safari, tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> in the bottom toolbar.</>,
        <>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</>,
        <>Launch Penthouse Drift from its new Home Screen icon.</>,
      ];
    case "other":
      return [
        <>Copy this page&apos;s link and open it in <strong>Safari</strong> (Chrome and Edge also work on newer iOS).</>,
        <>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> in Safari&apos;s bottom toolbar.</>,
        <>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</>,
        <>Launch Penthouse Drift from its new Home Screen icon.</>,
      ];
  }
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
  const [iosBrowser, setIosBrowser] = useState<IOSBrowser>("safari");
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const ios = isIOSDevice();
    const mobile = isMobileDevice();
    const updateStandalone = () => setIsStandalone(isStandaloneMode());
    const initialize = window.requestAnimationFrame(() => {
      setIsIOS(ios);
      if (ios) setIosBrowser(detectIOSBrowser());
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
                {!isIOS
                  ? "Get quick full-screen app access"
                  : iosBrowser === "in-app"
                    ? "Open in Safari to install"
                    : iosBrowser === "other"
                      ? "Open in Safari or Chrome to install"
                      : "Add to your Home Screen"}
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
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">{iosGuideSubtitle(iosBrowser)}</p>
              </div>
            </div>

            {(iosBrowser === "in-app" || iosBrowser === "other") && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {iosBrowser === "in-app" ? (
                  <>You&apos;re viewing inside another app&apos;s browser, which can&apos;t install apps. Open this page in <strong>Safari</strong> first.</>
                ) : (
                  <>This browser can&apos;t add apps to the Home Screen on iOS. Open this page in <strong>Safari</strong> (or Chrome) first.</>
                )}
              </div>
            )}

            <ol className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
              {iosStepsForBrowser(iosBrowser).map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="font-black text-amber-500">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
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