"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A row of cards you swipe through, one centred at a time, the same way the cards from a pack are shown when it is
 * opened: scroll-snapping on touch, arrow buttons and a "2 / 6" counter, and the left and right arrow keys. The cards on
 * either side peek in so it is clear there is more. Each child is one slide.
 */

const SLIDE_WIDTH = "min(16rem, 62vw)";

export function CardCarousel({
  label,
  children,
  focusIndex,
  onIndexChange,
}: {
  label: string;
  children: ReactNode;
  /** Scroll to this slide when it changes (for example when a slot in the tray is tapped). */
  focusIndex?: { index: number; tick: number } | null;
  onIndexChange?: (index: number) => void;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const scroller = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);

  const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Which card is in the middle, worked out from how far the row has scrolled. */
  const onScroll = () => {
    const el = scroller.current;
    const first = el?.children[0] as HTMLElement | undefined;
    const second = el?.children[1] as HTMLElement | undefined;
    if (!el || !first || !second) return;
    const step = second.offsetLeft - first.offsetLeft;
    const next = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / step)));
    setSlide(next);
    onIndexChange?.(next);
  };

  const goTo = useCallback(
    (index: number) => {
      const el = scroller.current;
      const target = el?.children[Math.max(0, Math.min(count - 1, index))] as HTMLElement | undefined;
      if (!el || !target) return;
      el.scrollTo({ left: target.offsetLeft - (el.clientWidth - target.clientWidth) / 2, behavior: reducedMotion() ? "auto" : "smooth" });
    },
    [count]
  );

  useEffect(() => {
    if (focusIndex) goTo(focusIndex.index);
  }, [focusIndex, goTo]);

  if (count === 0) return null;
  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        onKeyDown={(e) => {
          // Arrow keys move the row, unless focus is on a button inside a card.
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(slide + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(slide - 1);
          }
        }}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        // Side padding so the first and last card can sit in the middle.
        style={{ paddingInline: `calc(50% - ${SLIDE_WIDTH} / 2)` }}
      >
        {slides.map((child, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Card ${i + 1} of ${count}`}
            className="snap-center"
            style={{ flex: `0 0 ${SLIDE_WIDTH}` }}
          >
            {child}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goTo(slide - 1)}
            disabled={slide === 0}
            aria-label="Previous card"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/60 bg-black/60 text-lg font-black text-amber-300 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="min-w-14 text-center text-xs font-bold text-amber-200" aria-live="polite">
            {slide + 1} / {count}
          </span>
          <button
            type="button"
            onClick={() => goTo(slide + 1)}
            disabled={slide === count - 1}
            aria-label="Next card"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/60 bg-black/60 text-lg font-black text-amber-300 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
