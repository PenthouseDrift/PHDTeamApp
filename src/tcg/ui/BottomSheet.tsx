"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * DriftClash's one modal. On a phone it is a sheet that slides up from the bottom, with a grab handle, a title bar that
 * stays put, a body that scrolls, and a footer for the main buttons that is always on screen (so Buy, Confirm and List can
 * never be hidden at the end of a scroll). On larger screens the same thing is a centred dialog.
 *
 * It closes on Escape, a tap on the dim area, the Close button, or a swipe down on the title bar. It locks the page behind
 * it, keeps keyboard focus inside, hands focus back when it closes, and keeps clear of the notch and home indicator.
 */

type Size = "md" | "lg" | "full";

const WIDTH: Record<Size, string> = { md: "sm:max-w-md", lg: "sm:max-w-2xl", full: "sm:max-w-4xl" };

export function BottomSheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  dismissible = true,
  tone = "amber",
  fullHeight = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** The main buttons. Pinned to the bottom of the sheet. */
  footer?: ReactNode;
  size?: Size;
  /** False to stop the dim area, Escape and the swipe closing it (for example while a purchase is going through). */
  dismissible?: boolean;
  tone?: "amber" | "rose" | "emerald";
  /** Fill the screen height on phones (for long content such as a card viewer). */
  fullHeight?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const close = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const ring = tone === "rose" ? "border-rose-500/50" : tone === "emerald" ? "border-emerald-400/50" : "border-amber-400/40";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="gx-backdrop fixed inset-0 z-[10000] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" onClick={close}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        className={`gx-sheet flex w-full flex-col overflow-hidden rounded-t-3xl border bg-zinc-950 text-white shadow-2xl outline-none sm:rounded-3xl ${ring} ${WIDTH[size]} ${
          fullHeight ? "h-[94dvh] sm:h-auto" : ""
        } max-h-[94dvh] sm:max-h-[90dvh]`}
      >
        {/* Title bar: the grab handle and the swipe-down-to-close area. */}
        <div
          className="shrink-0 touch-none border-b border-zinc-800 px-4 pb-2.5 pt-2"
          onTouchStart={(e) => {
            dragStart.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (dragStart.current === null || !dismissible) return;
            setDrag(Math.max(0, e.touches[0].clientY - dragStart.current));
          }}
          onTouchEnd={() => {
            if (drag > 90) close();
            dragStart.current = null;
            setDrag(0);
          }}
        >
          <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-zinc-700 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-black leading-tight">
                {title}
              </h2>
              {subtitle && <p className="truncate text-xs text-zinc-400">{subtitle}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="gx-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-base font-black text-zinc-200 hover:bg-zinc-800"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>

        {footer && <div className="gx-safe-b shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Footer buttons for a BottomSheet: the main one grows, the others keep their size. 48px tall for a thumb. */
export const sheetPrimary =
  "gx-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black uppercase tracking-wide text-black shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
export const sheetSecondary =
  "gx-tap inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-xs font-black uppercase tracking-wide text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";
export const sheetDanger =
  "gx-tap inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-black uppercase tracking-wide text-white shadow hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50";
