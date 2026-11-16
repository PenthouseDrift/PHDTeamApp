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
}

/** Packs further than this from the selected one are hidden, so a long shelf stays tidy. */
const VISIBLE_EACH_SIDE = 3;
/** How far a swipe has to travel (px) to count as a swipe and not a tap. */
const SWIPE_PX = 36;

/**
 * The packs fanned out like a hand of cards, with the selected one raised in the middle. Swipe, use the arrow buttons or the
 * left and right arrow keys to change pack; tap a pack beside the middle one to bring it forward. Which pack is selected is
 * owned by the caller, so it can show that pack's contents and buttons around the fan.
 */
export function PackCarousel({
  packs,
  selectedId,
  onSelect,
  scale = 1,
}: {
  packs: CarouselPack[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 1 is the compact size; the caller can grow the fan when the screen has room to spare. */
  scale?: number;
}) {
  const selectedIndex = Math.max(0, packs.findIndex((p) => p.id === selectedId));
  // Where a press started (to tell a swipe from a tap), and whether the click that ends a swipe should be ignored.
  const dragStartX = useRef<number | null>(null);
  const swallowNextClick = useRef(false);
  const many = packs.length > 1;

  const go = (index: number) => {
    const next = Math.min(packs.length - 1, Math.max(0, index));
    if (next !== selectedIndex && packs[next]) onSelect(packs[next].id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(selectedIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(selectedIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(packs.length - 1);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStartX.current = e.clientX;
    swallowNextClick.current = false;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) >= SWIPE_PX) {
      // Swiping left brings the next pack forward. The click that ends a swipe must not also select the pack under the finger.
      go(selectedIndex + (dx < 0 ? 1 : -1));
      swallowNextClick.current = true;
    }
  };

  const arrowBtn =
    "gx-tap absolute top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900/90 text-lg font-black text-zinc-100 shadow-lg transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className="relative">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Packs"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartX.current = null;
        }}
        // pan-y: the page still scrolls up and down; sideways movement is the swipe.
        style={{ touchAction: "pan-y", height: `${10.5 * scale}rem` }}
        className="relative mx-auto w-full max-w-xl select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      >
        {packs.map((pack, index) => {
          const offset = index - selectedIndex;
          const distance = Math.abs(offset);
          const hidden = distance > VISIBLE_EACH_SIDE;
          const selected = offset === 0;
          return (
            <button
              key={pack.id}
              type="button"
              tabIndex={selected ? 0 : -1}
              aria-label={`${pack.name}, pack ${index + 1} of ${packs.length}${selected ? ", selected" : ""}`}
              aria-current={selected ? "true" : undefined}
              aria-hidden={hidden || undefined}
              onClick={() => {
                if (swallowNextClick.current) {
                  swallowNextClick.current = false;
                  return;
                }
                onSelect(pack.id);
              }}
              // Each pack hangs from a point below it, so turning it splays the row into a fan.
              style={{
                transform: `translateX(calc(-50% + ${offset * 2.6 * scale}rem)) translateY(${distance * distance * 0.3 * scale}rem) rotate(${offset * 9}deg) scale(${
                  selected ? 1.06 : 0.86
                })`,
                transformOrigin: "50% 115%",
                width: `${4.75 * scale}rem`,
                top: `${0.5 * scale}rem`,
                zIndex: 50 - distance,
                opacity: hidden ? 0 : 1,
                pointerEvents: hidden ? "none" : undefined,
                filter: selected ? undefined : `brightness(${distance === 1 ? 0.7 : 0.55})`,
              }}
              className="absolute left-1/2 rounded-md outline-none motion-safe:transition-[transform,opacity,filter] motion-safe:duration-300 motion-safe:ease-out focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <PackArt
                name={pack.name}
                variant={pack.variant}
                cardsLabel={pack.cardsLabel}
                extraLabel={pack.extraLabel}
                heroCard={pack.heroCard}
                discountPct={pack.discountPct}
              />
            </button>
          );
        })}
      </div>

      {many && (
        <>
          <button type="button" onClick={() => go(selectedIndex - 1)} disabled={selectedIndex === 0} aria-label="Previous pack" className={`${arrowBtn} left-1`}>
            <span aria-hidden>‹</span>
          </button>
          <button
            type="button"
            onClick={() => go(selectedIndex + 1)}
            disabled={selectedIndex === packs.length - 1}
            aria-label="Next pack"
            className={`${arrowBtn} right-1`}
          >
            <span aria-hidden>›</span>
          </button>
          <span
            className="pointer-events-none absolute bottom-1 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-black tabular-nums text-zinc-300"
            aria-live="polite"
          >
            {selectedIndex + 1} / {packs.length}
          </span>
        </>
      )}
    </div>
  );
}
