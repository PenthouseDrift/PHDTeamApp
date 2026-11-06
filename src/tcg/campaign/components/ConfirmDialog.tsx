"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * The campaign's confirmation modal, used instead of the browser's confirm() box. It sits above the game stage, closes on
 * Escape or a click outside, keeps keyboard focus inside while open, and hands focus back to whatever opened it.
 * The safe choice (Cancel) is focused first.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action (a lost entry, leaving a battle). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        // Two buttons: keep focus cycling between them.
        const first = cancelRef.current;
        const last = confirmRef.current;
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="campaign-confirm-title"
        aria-describedby="campaign-confirm-body"
        className={`w-full max-w-md rounded-t-3xl border bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl ${
          danger ? "border-rose-500/50" : "border-amber-400/50"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 id="campaign-confirm-title" className="text-lg font-black">
          {title}
        </h4>
        <p id="campaign-confirm-body" className="mt-2 text-sm leading-relaxed text-zinc-300">
          {body}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm font-black uppercase tracking-wide text-zinc-100 transition hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black uppercase tracking-wide shadow transition ${
              danger ? "bg-rose-500 text-white hover:bg-rose-400" : "bg-amber-500 text-black hover:bg-amber-400"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
