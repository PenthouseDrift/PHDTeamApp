"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * A line in the client-side basket. We keep a small display snapshot (title,
 * variant name, unit price, image) so the basket page renders instantly, but
 * the server ALWAYS re-validates stock + price at checkout — the snapshot is
 * never trusted for money or availability.
 */
export interface BasketLine {
  listingId: string;
  variantId?: string;
  /** Display title (listing title, or "Title — Variant"). */
  label: string;
  unitPrice: number;
  image?: string;
  quantity: number;
  /** Max buyable at the time it was added (for the qty stepper ceiling). */
  maxQuantity: number;
}

interface BasketContextValue {
  lines: BasketLine[];
  count: number;
  total: number;
  /** Add (or increment) a line. Returns the new quantity for that line. */
  add: (line: Omit<BasketLine, "quantity">, qty?: number) => void;
  setQuantity: (listingId: string, variantId: string | undefined, qty: number) => void;
  remove: (listingId: string, variantId: string | undefined) => void;
  clear: () => void;
  has: (listingId: string, variantId: string | undefined) => boolean;
}

const BasketContext = createContext<BasketContextValue | null>(null);

const STORAGE_KEY = "phd:marketplace:basket:v1";

function sameLine(l: BasketLine, listingId: string, variantId: string | undefined): boolean {
  return l.listingId === listingId && (l.variantId ?? "") === (variantId ?? "");
}

function readStoredLines(): BasketLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.listingId === "string")
      .map((l) => ({
        listingId: String(l.listingId),
        variantId: l.variantId ? String(l.variantId) : undefined,
        label: String(l.label ?? "Item"),
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
        image: l.image ? String(l.image) : undefined,
        quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
        maxQuantity: Math.max(1, Math.floor(Number(l.maxQuantity) || 1)),
      }));
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialiser reads localStorage once on the client (guards SSR). This
  // avoids a load-effect + setState (which triggers cascading-render lint).
  const [lines, setLines] = useState<BasketLine[]>(readStoredLines);

  // Persist on change. Safe to run on the server pass (no-op without window).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [lines]);

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(parsed)) setLines(parsed);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((line: Omit<BasketLine, "quantity">, qty = 1) => {
    const addQty = Math.max(1, Math.floor(qty) || 1);
    setLines((prev) => {
      const idx = prev.findIndex((l) => sameLine(l, line.listingId, line.variantId));
      if (idx >= 0) {
        const next = [...prev];
        const existing = next[idx];
        const cap = Math.max(1, line.maxQuantity || existing.maxQuantity);
        next[idx] = {
          ...existing,
          // Refresh the display snapshot in case price/label changed.
          label: line.label,
          unitPrice: line.unitPrice,
          image: line.image,
          maxQuantity: cap,
          quantity: Math.min(cap, existing.quantity + addQty),
        };
        return next;
      }
      const cap = Math.max(1, line.maxQuantity || 1);
      return [...prev, { ...line, quantity: Math.min(cap, addQty), maxQuantity: cap }];
    });
  }, []);

  const setQuantity = useCallback(
    (listingId: string, variantId: string | undefined, qty: number) => {
      setLines((prev) => {
        const n = Math.floor(qty);
        if (n <= 0) return prev.filter((l) => !sameLine(l, listingId, variantId));
        return prev.map((l) =>
          sameLine(l, listingId, variantId)
            ? { ...l, quantity: Math.min(Math.max(1, l.maxQuantity), n) }
            : l
        );
      });
    },
    []
  );

  const remove = useCallback((listingId: string, variantId: string | undefined) => {
    setLines((prev) => prev.filter((l) => !sameLine(l, listingId, variantId)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const has = useCallback(
    (listingId: string, variantId: string | undefined) =>
      lines.some((l) => sameLine(l, listingId, variantId)),
    [lines]
  );

  const value = useMemo<BasketContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const total = Math.round(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;
    return { lines, count, total, add, setQuantity, remove, clear, has };
  }, [lines, add, setQuantity, remove, clear, has]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketContextValue {
  const ctx = useContext(BasketContext);
  if (!ctx) {
    throw new Error("useBasket must be used within a BasketProvider");
  }
  return ctx;
}
