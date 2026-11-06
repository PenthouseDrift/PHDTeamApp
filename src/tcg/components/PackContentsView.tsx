"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { FullArtCardData } from "@/lib/full-art-card";
import { rarityLabel } from "@/lib/card-roll";
import { getPackContentsAction } from "@/tcg/actions";
import type { PackContents, PackContentsTier } from "@/tcg/pack-contents";
import { BottomSheet } from "@/tcg/ui/BottomSheet";
import { CardGridSkeleton, Shimmer } from "@/tcg/ui/Shimmer";

/** A stand-in for a card whose picture isn't known until the pack is opened. */
function MysteryTile({ tier }: { tier: PackContentsTier["tier"] }) {
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
      <div className="px-1 text-xs">
        <span className="font-bold text-zinc-200">{rarityLabel(tier)}</span>
      </div>
    </li>
  );
}

/** A card that opens larger when tapped or clicked. */
function ZoomableCard({ card, onZoom }: { card: FullArtCardData; onZoom: (card: FullArtCardData) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZoom(card)}
      aria-label={`View ${card.name} larger`}
      className="block w-full cursor-zoom-in rounded-xl text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <FullArtCard card={card} className="drop-shadow-lg" />
    </button>
  );
}

/**
 * How many card viewers are open. The pack window behind a viewer listens for Escape too (and runs first, because it was
 * opened first), so it checks this and leaves itself open while a card is being viewed.
 */
let openLightboxes = 0;

/** One card shown large over everything else. Closes on a tap anywhere, the Close button or Escape. */
function CardLightbox({ card, onClose }: { card: FullArtCardData; onClose: () => void }) {
  useEffect(() => {
    openLightboxes += 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only this window closes, not the pack window behind it.
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      openLightboxes -= 1;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-3 bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        style={{ top: "max(1rem, env(safe-area-inset-top))", right: "max(1rem, env(safe-area-inset-right))" }}
        className="gx-tap absolute flex h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900 px-4 text-xs font-bold text-zinc-100 hover:bg-zinc-800"
      >
        Close
      </button>
      {/* As wide as fits: the screen's width or height, whichever is tighter, and no bigger than 26rem. */}
      <div style={{ width: "min(88vw, calc((100dvh - 8rem) * 63 / 88), 26rem)" }} onClick={(e) => e.stopPropagation()}>
        <FullArtCard card={card} showDurability={false} className="drop-shadow-2xl" />
      </div>
      <p className="text-sm font-bold text-zinc-200">
        {card.name} · {rarityLabel(card.tier)}
      </p>
    </div>,
    document.body
  );
}

function ContentsBody({ contents }: { contents: PackContents }) {
  const [zoomed, setZoomed] = useState<FullArtCardData | null>(null);
  const hasSetCards = contents.tiers.some((t) => t.cards.length > 0);
  const bonus = contents.bonus;
  return (
    <div className="space-y-6">
      {bonus && (
        <p className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 p-3 text-sm text-zinc-100">
          <span className="font-black text-fuchsia-300">★ Bonus card: </span>
          Some packs also give a rare bonus card. It is one of the {bonus.cards.length} shown at the bottom of this list.
        </p>
      )}

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
        <section aria-label="Rarities" className="space-y-5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {hasSetCards ? "Cards by rarity" : "Rarities"}
            </h4>
            <p className="mt-1 text-xs text-zinc-400">The rarities a card from this pack can be.</p>
          </div>

          {contents.tiers.map((t) => (
            <div key={t.tier} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-800 pb-1.5">
                <h5 className="text-base font-black text-zinc-100">{rarityLabel(t.tier)}</h5>
              </div>

              {t.cards.length === 0 ? (
                <p className="text-xs text-zinc-400">These are drawn from a car when the pack is opened.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {t.cards.map(({ card, rerolled }) => (
                    <li key={card.id ?? card.name} className="space-y-1.5">
                      <ZoomableCard card={card} onZoom={setZoomed} />
                      <div className="px-1 text-xs">
                        <span className="block truncate font-bold text-zinc-200">{card.name}</span>
                      </div>
                      {rerolled && <p className="px-1 text-[11px] text-zinc-400">Stats are rolled fresh when you pull it</p>}
                    </li>
                  ))}
                  {t.drawn && <MysteryTile tier={t.tier} />}
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
              Some packs also give one of these, as a Legend card (Mythic cards stay Mythic).
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {contents.bonus.cards.map(({ card }) => (
              <li key={card.id ?? card.name} className="space-y-1.5">
                <ZoomableCard card={card} onZoom={setZoomed} />
                <div className="px-1 text-xs">
                  <span className="block truncate font-bold text-zinc-200">{card.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {zoomed && <CardLightbox card={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

/**
 * What is in a pack: its rarities, the fixed cards on each, the places where a card is drawn from a car, and the rare bonus
 * card. No odds are shown. Loads when it appears. `fallback` is shown if it can't be loaded.
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
      {!current && (
        <div className="space-y-4">
          <Shimmer className="h-4 w-2/3" />
          <Shimmer className="h-3 w-1/2" />
          <CardGridSkeleton count={4} className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4" label="Loading what's in this pack" />
        </div>
      )}
      <div role="status" aria-live="polite">
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
  // A card viewer opened from inside this window takes the Escape key first; this window stays open behind it.
  const close = useCallback(() => {
    if (openLightboxes > 0) return;
    onClose();
  }, [onClose]);

  return (
    <BottomSheet title={title} subtitle={eyebrow} onClose={close} footer={footer} size="full" fullHeight>
      <PackContentsView packId={packId} />
    </BottomSheet>
  );
}
