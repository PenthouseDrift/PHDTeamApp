"use client";

import { useRef, useState } from "react";

interface ListingGalleryProps {
  images: string[];
  title: string;
  isSold?: boolean;
}

/**
 * Swipeable image gallery for the listing detail page. Uses native CSS
 * scroll-snap so touch devices get momentum swiping for free, with dot
 * indicators + a photo counter, and a thumbnail strip on larger screens.
 */
export function ListingGallery({ images, title, isSold = false }: ListingGalleryProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const pics = images.length > 0 ? images : [];
  const single = pics.length <= 1;

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  };

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-xl border border-zinc-200 dark:border-zinc-800 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {pics.length === 0 ? (
            <div className="flex aspect-square w-full flex-none items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
              No image
            </div>
          ) : (
            pics.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="relative aspect-square w-full flex-none snap-center bg-zinc-100 dark:bg-zinc-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${title} photo ${i + 1}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-cover"
                />
              </div>
            ))
          )}
        </div>

        {isSold && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
            <span className="rounded-md bg-red-500 px-4 py-1.5 text-base font-bold uppercase tracking-wide text-white">
              Sold
            </span>
          </div>
        )}

        {!single && (
          <>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
              {index + 1}/{pics.length}
            </span>
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
              {pics.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollTo(i)}
                  aria-label={`Go to photo ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? "w-5 bg-white" : "w-2 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Clickable thumbnails — tap one to view it large above. Scrolls
          horizontally on all screen sizes so it works on phones too. */}
      {!single && (
        <div className="mx-auto flex max-w-sm gap-2 overflow-x-auto pb-1 lg:max-w-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {pics.map((url, i) => (
            <button
              key={`thumb-${url}-${i}`}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`View photo ${i + 1}`}
              aria-current={i === index}
              className={`relative aspect-square h-16 w-16 flex-none overflow-hidden rounded-lg border transition-colors ${
                i === index
                  ? "border-amber-500 ring-1 ring-amber-500"
                  : "border-zinc-200 hover:border-amber-500/60 dark:border-zinc-700"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
