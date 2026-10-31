"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * Embedded SumUp Card Widget checkout, presented as a full-screen modal. Renders
 * SumUp's card form inline (no redirect to a hosted page), so there's no "Back
 * to merchant website" tap for the buyer to miss.
 *
 * On a `success` response the widget's callback fires IN THE BROWSER. SumUp's
 * own docs warn that `success` doesn't guarantee the transaction succeeded, so
 * we don't trust it — we POST the checkout id to /api/marketplace/finalize,
 * which re-verifies the status server-side (and runs the same idempotent
 * finalizer the webhook uses). The webhook remains the safety net for the case
 * where the browser dies before this callback runs.
 */

const SDK_SRC = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";

type SumUpResponseType = "sent" | "invalid" | "auth-screen" | "error" | "success" | "fail";

interface SumUpMountConfig {
  id: string;
  checkoutId: string;
  onResponse: (type: SumUpResponseType, body: unknown) => void;
  onLoad?: () => void;
  amount?: string;
  currency?: string;
  locale?: string;
  country?: string;
  showEmail?: boolean;
  email?: string;
}

interface SumUpCardInstance {
  unmount: () => void;
}

declare global {
  interface Window {
    SumUpCard?: { mount: (config: SumUpMountConfig) => SumUpCardInstance };
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.SumUpCard) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SumUp SDK failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SumUp SDK failed to load"));
    document.body.appendChild(script);
  });
  return sdkPromise;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

type State = "loading" | "ready" | "finalising" | "wallet_pending" | "paid" | "error";

export function EmbeddedCheckout({
  checkoutId,
  amount,
  currency,
  email,
  hostedUrl,
  onCancel,
  finalizeUrl = "/api/checkout/finalize",
  label = "Checkout",
  successTitle = "Payment received",
  successBody,
  doneHref = "/dashboard",
  doneLabel = "Continue",
  autoDoneLabel,
  onPaid,
}: {
  checkoutId: string;
  amount: number;
  currency: string;
  /** Direct SumUp hosted checkout URL enabling native Apple Pay & Google Pay */
  hostedUrl?: string;
  /** Buyer's email, pre-filled so SCA/3DS has it and the field is hidden. */
  email?: string;
  onCancel?: () => void;
  /** Fired once when the payment is finalised (used e.g. to clear a basket). */
  onPaid?: () => void;
  /** Server endpoint that verifies + finalizes the checkout. */
  finalizeUrl?: string;
  /** Short subtitle under "Secure checkout" (e.g. "Click & Collect"). */
  label?: string;
  /** Success-screen heading. */
  successTitle?: string;
  /** Success-screen body. Receives the collection/order ref when available. */
  successBody?: (ref: string | null, autoCheckedIn?: boolean) => string;
  /** Button label instead of `doneLabel` when auto check-in already checked the buyer in. */
  autoDoneLabel?: string;
  /** Where the success button sends the buyer. */
  doneHref?: string;
  /** Success button text. */
  doneLabel?: string;
}) {
  const router = useRouter();
  const containerId = "sumup-card";
  const cardRef = useRef<SumUpCardInstance | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [autoCheckedIn, setAutoCheckedIn] = useState(false);
  const [activeWallet, setActiveWallet] = useState<"apple" | "google" | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  const checkoutUrl = hostedUrl || (checkoutId ? `https://pay.sumup.com/b2c/Q${checkoutId}` : "");

  function stopWalletPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopWalletPolling();
  }, []);

  function handleWalletPay(wallet: "apple" | "google") {
    if (!checkoutUrl) return;
    setActiveWallet(wallet);
    setError(null);
    setState("wallet_pending");

    const popup = window.open(
      checkoutUrl,
      "sumup_wallet_checkout",
      "width=500,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes"
    );
    popupRef.current = popup;

    stopWalletPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(finalizeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutId }),
        });
        const data = await res.json();
        if (data && data.status === "paid") {
          stopWalletPolling();
          if (popupRef.current && !popupRef.current.closed) {
            try {
              popupRef.current.close();
            } catch {
              /* ignore */
            }
          }
          setOrderRef(data.orderRef || data.ref || null);
          setAutoCheckedIn(Boolean(data.autoCheckedIn));
          setState("paid");
          onPaid?.();
          cardRef.current?.unmount();
          router.refresh();
        }
      } catch {
        /* retry next poll interval */
      }
    }, 1800);
  }

  function cancelWalletPay() {
    stopWalletPolling();
    setActiveWallet(null);
    setState("ready");
  }
  // Portals only work after mount (no document on the server).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Lock body scroll + close on Escape (unless mid-finalise) while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "finalising" && state !== "paid") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, state]);

  useEffect(() => {
    // The #sumup-card target lives inside a portal that only renders once
    // `mounted` is true. Wait for it — otherwise SumUpCard.mount() runs before
    // the element exists in the DOM, silently fails, and the form never appears.
    if (!mounted) return;

    let cancelled = false;

    async function finalise() {
      setState("finalising");
      try {
        const res = await fetch(finalizeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.status === "paid") {
          // Marketplace endpoint returns `orderRef`; the generic one returns `ref`.
          setOrderRef(data.orderRef || data.ref || null);
          setAutoCheckedIn(Boolean(data.autoCheckedIn));
        } else {
          setOrderRef(null);
        }
        setState("paid");
        onPaid?.();
        cardRef.current?.unmount();
        router.refresh();
      } catch {
        if (!cancelled) {
          // Even on a network error here, the payment may have gone through and
          // the webhook will record it. Treat as paid-but-unconfirmed.
          setOrderRef(null);
          setState("paid");
          onPaid?.();
        }
      }
    }

    // Fallback: if the SDK's onLoad never fires (older SDK builds), reveal the
    // form after a short delay so the spinner can't hang forever.
    const loadFallback = setTimeout(() => {
      if (!cancelled) setState((s) => (s === "loading" ? "ready" : s));
    }, 4000);

    loadSdk()
      .then(() => {
        if (cancelled || !window.SumUpCard) return;
        cardRef.current = window.SumUpCard.mount({
          id: containerId,
          checkoutId,
          amount: amount.toFixed(2),
          currency,
          locale: "en-GB",
          country: "GB",
          // SCA/3-D Secure needs an email. When we know the buyer's email
          // (they're logged in), pass it directly — SumUp then hides the field.
          // Only fall back to showing an email input when we don't have one.
          ...(email ? { email } : { showEmail: true }),
          onLoad: () => {
            if (!cancelled) setState((s) => (s === "loading" ? "ready" : s));
          },
          onResponse: (type, body) => {
            // Log every widget response so the real SumUp error (e.g. a 3DS /
            // ACS rejection from ppipe.net) is visible, not just a bare console
            // line. Helpful while diagnosing test-mode card failures.
            console.log("[SumUp widget] response:", type, body);
            if (type === "success") {
              void finalise();
            } else if (type === "auth-screen") {
              // 3-D Secure challenge started — the widget shows the issuer's
              // authentication screen. Clear any stale error; the widget drives
              // the challenge UI itself, then emits success/fail afterwards.
              setError(null);
            } else if (type === "error" || type === "fail") {
              const detail =
                body && typeof body === "object"
                  ? (body as { message?: string; error_message?: string }).message ||
                    (body as { message?: string; error_message?: string }).error_message
                  : undefined;
              setError(
                detail
                  ? `Payment could not be completed: ${detail}`
                  : "Payment was not completed. In test mode, use one of SumUp's provided test card numbers."
              );
              // Reveal the form again so the buyer (or you, testing) can retry.
              setState((s) => (s === "finalising" ? "ready" : s));
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load the secure payment form.");
          setState("error");
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(loadFallback);
      try {
        cardRef.current?.unmount();
      } catch {
        // ignore unmount errors on teardown
      }
    };
  }, [mounted, checkoutId, amount, currency, email, finalizeUrl, router, onPaid]);


  const showSpinnerOverlay = state === "loading" || state === "finalising";

  if (!mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-stretch justify-center overscroll-contain sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Secure payment"
    >
      {/* Backdrop — full viewport, fixed so it can't be scrolled past. */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          // Dismissable anytime except mid-finalisation. On the paid screen a
          // backdrop tap refreshes the page behind as it closes.
          if (state === "finalising") return;
          if (state === "paid") router.refresh();
          onCancel?.();
        }}
        aria-hidden="true"
      />

      {/* Panel: full-screen sheet on mobile, centered dialog on larger screens */}
      <div className="relative z-10 flex h-full max-h-[100dvh] w-full max-w-md flex-col overflow-y-auto bg-white dark:bg-zinc-900 shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">Secure checkout</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pay £{amount.toFixed(2)} · {label}
            </p>
          </div>
          {state !== "finalising" && (
            <button
              type="button"
              onClick={() => {
                // On the success screen, closing should also refresh so the
                // page behind reflects the new balance/order.
                if (state === "paid") router.refresh();
                onCancel?.();
              }}
              aria-label="Close payment"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body — min height so the panel never collapses to an empty strip */}
        <div className="relative flex-1 p-5" style={{ minHeight: 260 }}>
          {state === "paid" ? (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-7 w-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">{successTitle}</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {successBody
                  ? successBody(orderRef, autoCheckedIn)
                  : orderRef
                    ? `Your order is confirmed. Collection reference ${orderRef} — speak to staff at Penthouse Drift to collect.`
                    : "Your order is being confirmed and will appear under My Orders shortly."}
              </p>
              <button
                type="button"
                onClick={() => {
                  // Close the modal first — otherwise navigating to a route the
                  // user is already on (e.g. /wallet) is a no-op and the overlay
                  // just stays put. Then navigate + refresh so the page reflects
                  // the new balance/membership.
                  onCancel?.();
                  router.push(doneHref);
                  router.refresh();
                }}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500"
              >
                {autoCheckedIn && autoDoneLabel ? autoDoneLabel : doneLabel}
              </button>
            </div>
          ) : (
            <>
              {error && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  {error}
                </p>
              )}

              {/* Express Digital Wallet (Apple Pay / Google Pay) */}
              {state === "wallet_pending" ? (
                <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 font-black text-amber-500 dark:text-amber-300 text-xs sm:text-sm">
                    <Spinner className="h-4 w-4 text-amber-500" />
                    <span>
                      Waiting for {activeWallet === "apple" ? "Apple Pay" : "Google Pay"} confirmation…
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    Complete your payment authorization in the secure SumUp window. This screen will automatically confirm and credit your balance as soon as payment is authorized.
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={cancelWalletPay}
                      className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Back to card form
                    </button>
                    {checkoutUrl && (
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-amber-600 dark:text-amber-400 underline hover:opacity-85"
                      >
                        Re-open window ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-400">
                    <span>Express Checkout</span>
                    <span className="text-amber-600 dark:text-amber-400 font-extrabold">Instant 1-Tap</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Apple Pay Button */}
                    <button
                      type="button"
                      onClick={() => handleWalletPay("apple")}
                      className="group flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-black px-3 py-2 text-white shadow-sm transition-all hover:bg-zinc-900 active:scale-[0.99] border border-black"
                      aria-label="Pay with Apple Pay"
                    >
                      <span className="text-sm font-semibold tracking-tight">Pay</span>
                    </button>

                    {/* Google Pay Button */}
                    <button
                      type="button"
                      onClick={() => handleWalletPay("google")}
                      className="group flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white shadow-sm transition-all hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-[0.99] border border-zinc-300 dark:border-zinc-700"
                      aria-label="Pay with Google Pay"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                      </svg>
                      <span className="text-xs font-bold font-sans">GPay</span>
                    </button>
                  </div>

                  <div className="relative my-3 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                    </div>
                    <span className="relative bg-white dark:bg-zinc-900 px-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Or pay with card
                    </span>
                  </div>
                </div>
              )}

              {/* SumUp mounts the card form into this element. It stays mounted
                  and visible so the SDK always has a sized target to render into
                  (hiding it with opacity-0 can make the widget collapse). The
                  spinner sits ABOVE it as an absolute overlay while loading or
                  finalising, then fades out to reveal the form. */}
              <div id={containerId} className="min-h-[220px]" />

              {/* Security and methods trust banner */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/80 pt-2.5">
                <span>🔒 Secured by SumUp · Pay · Google Pay · Visa · Mastercard · Amex</span>
              </div>

              {showSpinnerOverlay && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white dark:bg-zinc-900">
                  <Spinner className="h-8 w-8 text-amber-500" />
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {state === "finalising" ? "Confirming your payment…" : "Loading secure payment form…"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Portal to <body> so the modal escapes the app layout's stacking context and
  // covers the nav (sidebar/bottom bar) on every screen size.
  return createPortal(overlay, document.body);
}
