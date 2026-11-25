"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { FullArtCardData } from "@/lib/full-art-card";
import { PackArt } from "@/tcg/components/PackArt";

export interface CarouselPack {
  id: string;
  name: string;
  variant: "standard" | "custom";
  cardsLabel: string;
  extraLabel?: string;
  heroCard?: FullArtCardData;
  /** Shown as a sale burst on the pack when above 0. */
  discountPct?: number;
  /** The price as text for the pack's button, for example "100 P". */
  priceLabel?: string;
}

/** How far a swipe has to travel (px) to count as a swipe and not a tap. */
const SWIPE_PX = 40;

/**
 * Choosing a pack: the selected pack shown large, with big previous and next buttons, and every pack listed by name underneath so
 * none is hidden off to the side. Pick one with a tap on its name, the arrow buttons, a swipe, or the arrow keys. Which pack is
 * selected is owned by the caller, so the page can show that pack's price, contents and buttons around it.
 */
export function PackPicker({ packs, selectedId, onSelect }: { packs: CarouselPack[]; selectedId: string; onSelect: (id: string) => void }) {
  const selectedIndex = Math.max(0, packs.findIndex((p) => p.id === selectedId));
  const selected = packs[selectedIndex];
  const many = packs.length > 1;
  const dragStartX = useRef<number | null>(null);
  const radios = useRef<Array<HTMLButtonElement | null>>([]);

  if (!selected) return null;

  const go = (index: number, focus = false) => {
    const next = Math.min(packs.length - 1, Math.max(0, index));
    if (next === selectedIndex) return;
    onSelect(packs[next].id);
    if (focus) radios.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      go((selectedIndex + step + packs.length) % packs.length, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0, true);
    } else if (e.key === "End") {
      e.preventDefault();
      go(packs.length - 1, true);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStartX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) >= SWIPE_PX) go(selectedIndex + (dx < 0 ? 1 : -1));
  };

  const arrowBtn =
    "gx-tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 bg-white text-3xl font-black text-zinc-800 shadow-md transition-colors hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-4">
      {/* The selected pack, large. Swiping sideways changes pack; the page still scrolls up and down. */}
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartX.current = null;
        }}
        style={{ touchAction: "pan-y" }}
        className="flex select-none items-center justify-center gap-2 sm:gap-6"
      >
        {many && (
          <button type="button" onClick={() => go(selectedIndex - 1)} disabled={selectedIndex === 0} aria-label="Previous pack" className={arrowBtn}>
            <span aria-hidden>‹</span>
          </button>
        )}
        <div key={selected.id} className="gx-fade-up w-[min(58vw,16rem)] sm:w-64">
          <PackArt
            name={selected.name}
            variant={selected.variant}
            cardsLabel={selected.cardsLabel}
            extraLabel={selected.extraLabel}
            heroCard={selected.heroCard}
            discountPct={selected.discountPct}
          />
        </div>
        {many && (
          <button type="button" onClick={() => go(selectedIndex + 1)} disabled={selectedIndex === packs.length - 1} aria-label="Next pack" className={arrowBtn}>
            <span aria-hidden>›</span>
          </button>
        )}
      </div>

      {many && (
        <>
          <p className="text-center text-sm font-bold tabular-nums text-zinc-600 dark:text-zinc-300" aria-hidden>
            Pack {selectedIndex + 1} of {packs.length}
          </p>
          {/* Every pack by name, so they can all be seen and reached without swiping. */}
          <div role="radiogroup" aria-label="Choose a pack" onKeyDown={onKeyDown} className="flex flex-wrap justify-center gap-2">
            {packs.map((pack, index) => {
              const active = pack.id === selected.id;
              return (
                <button
                  key={pack.id}
                  ref={(el) => {
                    radios.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelect(pack.id)}
                  className={`gx-tap inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70 ${
                    active
                      ? "border-amber-500 bg-amber-500 text-black"
                      : "border-zinc-300 bg-white text-zinc-800 hover:border-amber-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <span>{pack.name}</span>
                  {pack.priceLabel && <span className={`text-xs font-bold ${active ? "text-black/70" : "text-zinc-500 dark:text-zinc-400"}`}>{pack.priceLabel}</span>}
                  {pack.discountPct ? (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-black text-white">-{pack.discountPct}%</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
