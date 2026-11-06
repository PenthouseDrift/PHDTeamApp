"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBottomChromeHeight } from "./useBottomChrome";

/**
 * Short messages that appear where the player is looking (just above the bottom bars) and fade on their own. Use them
 * for "Card listed", "Pack bought" and for errors from a button, instead of a bar at the top of the page that may be
 * scrolled out of sight, or a browser alert. Anything the player must act on belongs in the screen itself.
 */

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}
interface ToastApi {
  toast: (text: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

/** The toast function. Safe to call anywhere; it does nothing if no provider is mounted. */
export function useToast(): ToastApi["toast"] {
  return useContext(ToastContext).toast;
}

const LIFETIME_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const offset = useBottomChromeHeight();

  const toast = useCallback((text: string, tone: Tone = "info") => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? LIFETIME_MS + 1500 : LIFETIME_MS);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            aria-live="polite"
            style={{ bottom: offset + 12 }}
            className="pointer-events-none fixed inset-x-0 z-[10003] flex flex-col items-center gap-2 px-3 sm:bottom-6"
          >
            {items.map((t) => (
              <div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                className={`gx-fade-up pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl backdrop-blur ${
                  t.tone === "error"
                    ? "border-rose-500/60 bg-rose-950/95 text-rose-100"
                    : t.tone === "success"
                      ? "border-emerald-500/60 bg-emerald-950/95 text-emerald-100"
                      : "border-zinc-600 bg-zinc-900/95 text-zinc-100"
                }`}
              >
                {t.tone === "success" ? "✓ " : t.tone === "error" ? "⚠ " : ""}
                {t.text}
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
