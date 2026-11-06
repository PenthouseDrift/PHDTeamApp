"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBottomChromeHeight, useIsPhone } from "./useBottomChrome";

/** How much room a page needs at its end so the last thing on it can scroll clear of the dock. */
export function DockSpacer() {
  return <div aria-hidden className="h-24 md:hidden" />;
}

/**
 * The campaign's main buttons, kept where a thumb reaches. On a phone it is fixed to the bottom of the screen, sitting
 * directly above the app's bars (it is drawn on the page body for the same reason DriftClash's own bar is: the page is
 * wrapped in pull-to-refresh, whose transform would stop a fixed bar sticking). On larger screens it is a bar that
 * sticks to the bottom of the page content.
 */
export function ActionDock({ label, children }: { label: string; children: ReactNode }) {
  const phone = useIsPhone();
  const offset = useBottomChromeHeight();
  const body = (
    <div role="group" aria-label={label} className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2.5">
      {children}
    </div>
  );
  if (!phone) {
    return <div className="sticky bottom-3 z-20 rounded-2xl border border-amber-500/30 bg-zinc-950/95 shadow-xl backdrop-blur">{body}</div>;
  }
  return createPortal(
    <div
      style={{ bottom: offset }}
      className="fixed inset-x-0 z-30 border-t border-amber-500/40 bg-zinc-950/95 shadow-[0_-8px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm"
    >
      {body}
    </div>,
    document.body
  );
}

/** Buttons for the dock. The main one grows to fill the row; at least 48px tall for a thumb. */
export const dockPrimary =
  "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black uppercase tracking-wide text-black shadow transition active:scale-[0.98] hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
export const dockSecondary =
  "inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 text-xs font-black uppercase tracking-wide text-zinc-200 transition active:scale-[0.98] hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";
export const dockDanger =
  "inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-950/50 px-3.5 text-xs font-black uppercase tracking-wide text-rose-200 transition active:scale-[0.98] hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-50";
