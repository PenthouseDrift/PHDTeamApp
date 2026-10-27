"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-move and pinch / scroll-to-zoom for the picture on a card.
 *
 * It is a transparent layer laid exactly over the card's image window. The card renders the
 * picture with `object-fit: cover`, `object-position: X% Y%` and `scale(zoom)` about the same
 * X% Y% point, so for a point of the picture at pixel `px` the on-screen position is
 *     screen = px * z - X * k(z)        where k(z) = (L * (z - 1) + overflow * z) / 100
 * (L = window size on that axis, overflow = how much the cover-fitted picture spills over it).
 * That is linear in X, so a drag of d pixels is just ΔX = -d / k, and zooming about a chosen
 * screen point solves for the X that keeps that point still. Same maths on the Y axis.
 */

/** Where the layer sits on the card, in the card's own cqw units. */
export interface AdjusterArea {
  left: string | number;
  top: string | number;
  width: string;
  height: string;
}

/** The original card's image window. */
export const ORIGINAL_WINDOW: AdjusterArea = { left: "7.4cqw", top: "18cqw", width: "85.2cqw", height: "71.6cqw" };
/** The whole card (100cqw wide, 100 * 88 / 63 tall), for full art cards. */
export const FULL_CARD_AREA: AdjusterArea = { left: 0, top: 0, width: "100cqw", height: "139.7cqw" };

export interface ImageView {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 100;
const MAX_ZOOM = 300;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Metrics {
  /** Image box size, px (layout size, ignoring the zoom transform). */
  w: number;
  h: number;
  /** Cover-fit overflow, px. */
  ox: number;
  oy: number;
  /** Offset of the image box inside the overlay (the window has a border), px. */
  left: number;
  top: number;
}

function measure(layer: HTMLElement): Metrics | null {
  const img = layer.parentElement?.querySelector<HTMLImageElement>("[data-card-image]");
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const w = img.clientWidth;
  const h = img.clientHeight;
  if (!w || !h) return null;
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const layerRect = layer.getBoundingClientRect();
  return {
    w,
    h,
    ox: Math.max(0, img.naturalWidth * cover - w),
    oy: Math.max(0, img.naturalHeight * cover - h),
    // The overlay covers the bordered window; the picture's box starts a border-width in.
    left: (layerRect.width - w) / 2,
    top: (layerRect.height - h) / 2,
  };
}

const sens = (len: number, overflow: number, z: number) => (len * (z - 1) + overflow * z) / 100;

/** Move the picture by (dx, dy) px, as if dragged. */
function pan(v: ImageView, m: Metrics, dx: number, dy: number): ImageView {
  const z = v.zoom / 100;
  const kx = sens(m.w, m.ox, z);
  const ky = sens(m.h, m.oy, z);
  return {
    ...v,
    x: kx > 1e-6 ? clamp(v.x - dx / kx, 0, 100) : v.x,
    y: ky > 1e-6 ? clamp(v.y - dy / ky, 0, 100) : v.y,
  };
}

/** Change zoom by `ratio` while keeping the picture point under (cx, cy) (image-box px) still. */
function zoomAbout(v: ImageView, m: Metrics, ratio: number, cx: number, cy: number): ImageView {
  const z0 = v.zoom / 100;
  const zoom = clamp(v.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
  const z1 = zoom / 100;
  const axis = (pos: number, len: number, overflow: number, c: number) => {
    const k1 = sens(len, overflow, z1);
    if (k1 <= 1e-6) return pos;
    const px = (c + pos * sens(len, overflow, z0)) / z0; // picture point currently under c
    return clamp((px * z1 - c) / k1, 0, 100);
  };
  return { x: axis(v.x, m.w, m.ox, cx), y: axis(v.y, m.h, m.oy, cy), zoom };
}

export function ImageAdjuster({
  value,
  onChange,
  touchEnabled,
  area = ORIGINAL_WINDOW,
}: {
  value: ImageView;
  onChange: (v: ImageView) => void;
  /** The part of the card the picture fills. Defaults to the original card's image window. */
  area?: AdjusterArea;
  /** Touch / pen only drag the picture while this is on, so the page can still scroll normally. */
  touchEnabled: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ mx: number; my: number; dist: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  const commit = useCallback(
    (v: ImageView) => {
      const next = { x: round1(v.x), y: round1(v.y), zoom: Math.round(v.zoom) };
      latest.current = next;
      onChange(next);
    },
    [onChange]
  );

  const summary = () => {
    const pts = [...pointers.current.values()];
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { mx, my, dist };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" && !touchEnabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = summary();
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !layer.current || !last.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = measure(layer.current);
    if (!m) return;
    const now = summary();
    const prev = last.current;
    let v = latest.current;
    if (pointers.current.size >= 2 && prev.dist > 0 && now.dist > 0) {
      const rect = layer.current.getBoundingClientRect();
      v = zoomAbout(v, m, now.dist / prev.dist, prev.mx - rect.left - m.left, prev.my - rect.top - m.top);
    }
    v = pan(v, m, now.mx - prev.mx, now.my - prev.my);
    last.current = now;
    commit(v);
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size === 0) {
      last.current = null;
      setDragging(false);
    } else {
      // One finger left after a pinch: carry on dragging from where it is.
      last.current = summary();
    }
  };

  // Wheel / trackpad pinch zoom about the cursor. Needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const m = measure(el);
      if (!m) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ratio = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      commit(zoomAbout(latest.current, m, ratio, e.clientX - rect.left - m.left, e.clientY - rect.top - m.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [commit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1;
    const v = latest.current;
    switch (e.key) {
      case "ArrowLeft": commit({ ...v, x: clamp(v.x + step, 0, 100) }); break;
      case "ArrowRight": commit({ ...v, x: clamp(v.x - step, 0, 100) }); break;
      case "ArrowUp": commit({ ...v, y: clamp(v.y + step, 0, 100) }); break;
      case "ArrowDown": commit({ ...v, y: clamp(v.y - step, 0, 100) }); break;
      case "+":
      case "=": commit({ ...v, zoom: clamp(v.zoom + 10, MIN_ZOOM, MAX_ZOOM) }); break;
      case "-":
      case "_": commit({ ...v, zoom: clamp(v.zoom - 10, MIN_ZOOM, MAX_ZOOM) }); break;
      default: return;
    }
    e.preventDefault();
  };

  return (
    <div
      ref={layer}
      role="group"
      tabIndex={0}
      aria-label="Card picture. Drag to move, scroll or pinch to zoom, or use the arrow keys and plus and minus."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      className={`absolute z-10 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        touchEnabled ? "ring-2 ring-amber-400/80 ring-offset-0" : ""
      }`}
      style={{
        left: area.left,
        top: area.top,
        width: area.width,
        height: area.height,
        cursor: dragging ? "grabbing" : "grab",
        // Touch scrolling is only taken over while "Move & zoom" is on.
        touchAction: touchEnabled ? "none" : "auto",
        userSelect: "none",
      }}
    />
  );
}
