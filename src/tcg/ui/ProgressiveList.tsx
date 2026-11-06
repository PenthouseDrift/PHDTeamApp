"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A long list that draws a screenful at a time. It starts with `batch` items and adds more as the player nears the end,
 * so a deck of 95 cards (each a heavy, layered card) does not all have to be built on a phone at once. Items that have
 * scrolled far off screen also skip layout and paint. There is a visible "Show more" button too, for anyone whose
 * browser or assistive technology does not scroll the page in the usual way.
 *
 * `resetKey` should change when the list is a different list (a filter or sort changed) so it starts from the top again.
 */
export function ProgressiveList<T>({
  items,
  render,
  getKey,
  resetKey,
  batch = 18,
  className = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
  label,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  resetKey?: string;
  batch?: number;
  className?: string;
  /** Names the list for screen readers. */
  label?: string;
}) {
  const [state, setState] = useState({ key: resetKey ?? "", shown: batch });
  // A different list starts from the beginning again (state set while rendering, which React allows for this).
  if (state.key !== (resetKey ?? "")) setState({ key: resetKey ?? "", shown: batch });

  const sentinel = useRef<HTMLDivElement>(null);
  const shown = Math.min(state.shown, items.length);
  const more = items.length - shown;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || more <= 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setState((s) => ({ ...s, shown: s.shown + batch }));
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, batch, shown]);

  return (
    <>
      <ul role="list" aria-label={label} className={className}>
        {items.slice(0, shown).map((item, i) => (
          <li key={getKey(item)} className="gx-cv-auto min-w-0">
            {render(item, i)}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <div ref={sentinel} className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, shown: s.shown + batch }))}
            className="gx-tap min-h-11 rounded-xl border border-zinc-700 bg-zinc-800 px-5 text-xs font-black uppercase tracking-wide text-zinc-200"
          >
            Show more ({more} left)
          </button>
        </div>
      )}
    </>
  );
}
