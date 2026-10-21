"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface ShareButtonProps {
  /** Absolute URL to share. */
  url: string;
  /** Share sheet title. */
  title: string;
  /** Share sheet body text (shown before the URL in most targets). */
  text?: string;
  /** Visual style: a full labelled button, or a compact icon-only button. */
  variant?: "button" | "icon";
  /** Extra classes for the trigger. */
  className?: string;
  /** Accessible label (used for the icon variant and as the button title). */
  label?: string;
}

/**
 * Reusable share control. Opens a modal with a QR code, a native "Share via…"
 * option (when the Web Share API is available) and a copy-link fallback. Pure
 * client-side — it shares whatever absolute `url` it's given, so it works for
 * the app itself or any listing without a server round-trip.
 */
export function ShareButton({
  url,
  title,
  text,
  variant = "button",
  className,
  label = "Share",
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Resolved once the modal is open (client-only), so SSR and first render match.
  const canNativeShare = open && typeof navigator !== "undefined" && "share" in navigator;

  useEffect(() => {
    if (open && url) {
      QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQr).catch(() => setQr(null));
    }
  }, [open, url]);

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* user cancelled or unsupported */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.readOnly = true;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareIcon = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 1 1 0-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 1 0 5.367-2.684 3 3 0 0 0-5.367 2.684Zm0 9.316a3 3 0 1 0 5.368 2.684 3 3 0 0 0-5.368-2.684Z"
      />
    </svg>
  );

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openModal}
          aria-label={label}
          title={label}
          className={
            className ??
            "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 bg-white/90 text-zinc-600 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }
        >
          {shareIcon}
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className={
            className ??
            "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          }
        >
          {shareIcon}
          {label}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
              {text && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{text}</p>}
            </div>

            {qr && (
              <div className="flex justify-center">
                <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR code for the share link" width={220} height={220} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {canNativeShare && (
                <button
                  type="button"
                  onClick={nativeShare}
                  className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Share via…
                </button>
              )}
              <button
                type="button"
                onClick={copyLink}
                className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                {copied ? "✓ Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
