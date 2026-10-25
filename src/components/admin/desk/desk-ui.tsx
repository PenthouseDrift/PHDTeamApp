"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet on phones, centred card on larger screens. Portalled to <body>
 * so it covers the shell's top bar and bottom tabs, locks body scroll, closes
 * on Escape or a backdrop tap, and respects the iOS home-indicator inset.
 */
export function SheetFrame({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the lock/focus effect on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog unless a field (e.g. autoFocus) already has it.
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div ref={panelRef} tabIndex={-1} className="relative flex max-h-[90dvh] w-full flex-col outline-none overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-w-md sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-5 pb-3 pt-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-zinc-900 dark:text-zinc-100">{title}</h2>
            {subtitle && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** One clear control for whether money has changed hands. */
export function PaymentToggle({
  payLater,
  onChange,
  disabled,
}: {
  payLater: boolean;
  onChange: (payLater: boolean) => void;
  disabled?: boolean;
}) {
  const base = "min-h-11 flex-1 rounded-lg px-3 text-sm font-bold transition-colors disabled:opacity-50";
  return (
    <div role="group" aria-label="Payment" className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cash or card payment</p>
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!payLater}
          onClick={() => onChange(false)}
          className={`${base} ${!payLater ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-700 dark:text-emerald-300" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          Collected now
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={payLater}
          onClick={() => onChange(true)}
          className={`${base} ${payLater ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-700 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          Pay later
        </button>
      </div>
      {payLater && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          They&apos;ll show as Unpaid in today&apos;s list until you mark them paid.
        </p>
      )}
    </div>
  );
}
