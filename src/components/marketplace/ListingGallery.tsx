"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface ListingGalleryProps {
  images: string[];
  title: string;
  isSold?: boolean;
}

/**
 * Fullscreen, closable image viewer with simple zoom. Click/tap the image to
 * toggle 2.5x zoom; when zoomed, drag to pan. Closes via the X button, Escape,
 * or clicking the backdrop. No external dependency.
 */
/**
 * Route an image URL through Next's built-in image optimizer so it loads
 * same-origin (served under the app's own trusted certificate) rather than the
 * browser hitting the remote blob host directly — which fails on older devices
 * whose root store doesn't trust the blob host's cert chain.
 */
function optimizedSrc(url: string, width = 1920, quality = 90): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

function ImageZoomModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const toggleZoom = () =>
    setZoomed((z) => {
      if (z) setOffset({ x: 0, y: 0 });
      return !z;
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomed) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!zoomed || !dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — zoomable image`}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
        style={{ top: "max(1rem, env(safe-area-inset-top, 0px))" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
      <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
        {zoomed ? "Drag to pan · tap to zoom out" : "Tap image to zoom"}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(src)}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative z-[1] max-h-[90vh] max-w-[92vw] select-none object-contain transition-transform duration-200 ${
          zoomed ? "cursor-grab" : "cursor-zoom-in"
        }`}
        style={{
          transform: zoomed ? `scale(2.5) translate(${offset.x / 2.5}px, ${offset.y / 2.5}px)` : "none",
          touchAction: "none",
        }}
        draggable={false}
      />
    </div>
  );
}

/**
 * Swipeable image gallery for the listing detail page. Uses native CSS
 * scroll-snap so touch devices get momentum swiping for free, with dot
 * indicators + a photo counter, and a thumbnail strip on larger screens.
 */
export function ListingGallery({ images, title, isSold = false }: ListingGalleryProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  // Index of the image open in the fullscreen zoom viewer (null = closed).
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

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
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setZoomIndex(i)}
                aria-label={`Zoom ${title} photo ${i + 1}`}
                className="relative aspect-square w-full flex-none snap-center cursor-zoom-in bg-zinc-100 dark:bg-zinc-800"
              >
                <Image
                  src={url}
                  alt={`${title} photo ${i + 1}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority={i === 0}
                  className="object-cover"
                />
              </button>
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
              <Image src={url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {zoomIndex !== null && pics[zoomIndex] && (
        <ImageZoomModal
          src={pics[zoomIndex]}
          alt={`${title} photo ${zoomIndex + 1}`}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}
