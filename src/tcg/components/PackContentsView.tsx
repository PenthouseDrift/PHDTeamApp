"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel } from "@/lib/card-roll";
import { oneInFromPct } from "@/lib/pack-config";
import { getPackContentsAction } from "@/tcg/actions";
import type { PackContents, PackContentsTier } from "@/tcg/pack-contents";

/** 12.3456 -> "12.3%", 0.0123 -> "0.012%". Enough digits to tell small chances apart. */
function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0%";
  if (n >= 10) return `${Number(n.toFixed(1))}%`;
  if (n >= 0.1) return `${Number(n.toFixed(2))}%`;
  return `${Number(n.toPrecision(2))}%`;
}

function oddsText(pct: number): string {
  const oneIn = oneInFromPct(pct);
  if (oneIn === null) return "never";
  return oneIn <= 1.05 ? "every pull" : `about 1 in ${Number(oneIn.toFixed(oneIn < 10 ? 1 : 0))}`;
}

/** A stand-in for a card whose picture isn't known until the pack is opened. */
function MysteryTile({ tier, pct }: { tier: PackContentsTier["tier"]; pct: number }) {
  return (
    <li className="space-y-1.5">
      <div
        className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900 text-center text-zinc-300"
        style={{ aspectRatio: "63 / 88" }}
      >
        <span aria-hidden="true" className="text-4xl font-black text-amber-400">?</span>
        <span className="px-2 text-xs font-bold">Drawn from a car</span>
        <span className="px-2 text-[11px] text-zinc-400">when you open the pack</span>
      </div>
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-bold text-zinc-200">{rarityLabel(tier)}</span>
        <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-[11px] font-black text-zinc-200">{fmtPct(pct)} of {rarityLabel(tier)}</span>
      </div>
    </li>
  );
}

function ContentsBody({ contents }: { contents: PackContents }) {
  const hasSetCards = contents.tiers.some((t) => t.cards.length > 0);
  return (
    <div className="space-y-6">
      {contents.includes.length > 0 && (
        <section aria-label="Every pack includes">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Every pack includes</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-200">
            {contents.includes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {contents.tiers.length > 0 && (
        <section aria-label="Rarity odds" className="space-y-5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {hasSetCards ? "Cards by rarity" : "Rarity odds"}
            </h4>
            <p className="mt-1 text-xs text-zinc-400">
              The chance that a card from the pack is each rarity.
              {hasSetCards ? " Card chances are out of everything the pack gives out." : ""}
            </p>
          </div>

          {contents.tiers.map((t) => (
            <div key={t.tier} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-800 pb-1.5">
                <h5 className="text-base font-black text-zinc-100">{rarityLabel(t.tier)}</h5>
                <span className="text-xs font-bold text-amber-300">
                  {fmtPct(t.oddsPct)} · {oddsText(t.oddsPct)}
                </span>
              </div>

              {t.cards.length === 0 ? (
                <p className="text-xs text-zinc-400">These are drawn from a car when the pack is opened.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {t.cards.map(({ card, overallPct, rerolled }) => (
                    <li key={card.id ?? card.name} className="space-y-1.5">
                      <FullArtCard card={card} className="drop-shadow-lg" />
                      <div className="flex items-center justify-between gap-1 px-1 text-xs">
                        <span className="truncate font-bold text-zinc-200">{card.name}</span>
                        <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-300">
                          {fmtPct(overallPct)}
                        </span>
                      </div>
                      {rerolled && <p className="px-1 text-[11px] text-zinc-400">Stats are rolled fresh when you pull it</p>}
                    </li>
                  ))}
                  {t.drawnPct > 0 && <MysteryTile tier={t.tier} pct={t.drawnPct} />}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {contents.bonus && (
        <section aria-label="Bonus card" className="space-y-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Rare bonus card</h4>
            <p className="mt-1 text-xs text-zinc-400">
              {fmtPct(contents.bonus.chancePct)} of packs ({oddsText(contents.bonus.chancePct)}) also give one of these, as a Legend card (Mythic cards stay Mythic).
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {contents.bonus.cards.map(({ card, overallPct }) => (
              <li key={card.id ?? card.name} className="space-y-1.5">
                <FullArtCard card={card} className="drop-shadow-lg" />
                <div className="flex items-center justify-between gap-1 px-1 text-xs">
                  <span className="truncate font-bold text-zinc-200">{card.name}</span>
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-300">
                    {fmtPct(overallPct)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * What is in a pack: its rarities with their odds, the fixed cards on each (with their chances), the places where a card is
 * drawn from a car, and the rare bonus card. Loads when it appears. `fallback` is shown if it can't be loaded.
 */
export function PackContentsView({ packId, fallback }: { packId: string; fallback?: ReactNode }) {
  const [state, setState] = useState<{ packId: string; contents: PackContents | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPackContentsAction(packId)
      .then((res) => {
        if (cancelled) return;
        setState(res.success ? { packId, contents: res.data, error: null } : { packId, contents: null, error: res.error });
      })
      .catch(() => {
        if (!cancelled) setState({ packId, contents: null, error: "Could not load what's in this pack." });
      });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  // A reply for a different pack than the one now asked about counts as still loading.
  const current = state && state.packId === packId ? state : null;
  return (
    <div>
      <div role="status" aria-live="polite">
        {!current && <p className="text-sm text-zinc-400">Loading what&apos;s in this pack…</p>}
        {current?.error && <p className="mb-3 text-sm font-bold text-red-400">{current.error}</p>}
      </div>
      {current?.contents && <ContentsBody contents={current.contents} />}
      {current?.error && fallback}
    </div>
  );
}

/** A full-screen window showing what is in a pack, with an optional footer (a buy button, for example). */
export function PackContentsModal({
  packId,
  title,
  eyebrow,
  footer,
  onClose,
}: {
  packId: string;
  title: string;
  eyebrow?: string;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center overscroll-contain sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`What's in ${title}`}
    >
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex h-full w-full flex-col space-y-5 overflow-y-auto bg-zinc-950 p-5 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-amber-500/30 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            {eyebrow && <span className="text-xs font-bold uppercase tracking-widest text-amber-400">{eyebrow}</span>}
            <h3 className="text-2xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-zinc-700 px-4 text-xs font-bold hover:bg-zinc-800">
            Close
          </button>
        </div>
        <div className="flex-1">
          <PackContentsView packId={packId} />
        </div>
        {footer && <div className="border-t border-zinc-800 pt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
