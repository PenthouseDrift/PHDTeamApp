"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { tierInfo } from "@/lib/full-art-card";
import type { MemberCard } from "@/lib/card-roll";
import { PackArt } from "@/tcg/components/PackArt";

/**
 * The card pack stage.
 *
 *  1. Loading: a little card car drifts round a ring while the card is drawn on the server. No pack is shown yet.
 *  2. Landed: as soon as everything is ready (and the loader has run for a moment), the pack pops in. The member slides a finger (or mouse) along the top of the pack to tear it open. A tap on the
 *     button below, or Enter on the pack, opens it too, for anyone who can't swipe.
 *  4. Opening: the top piece flies off, the pack shakes and drops away.
 *  5. Revealed: the card rises out and flips over with a burst in its rarity's colour.
 *
 * The pack looks the same whatever is inside, so the rarity is a surprise until the card flips.
 * With reduced motion, everything still happens in the same order but without the movement.
 */

type Anim = "loading" | "landed" | "opening" | "revealed";
type Stage = "loading" | "landed" | "opening" | "revealed";

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );

// [left %, top %, delay s]
const SPARKS: Array<[number, number, number]> = [
  [14, 22, 0], [86, 18, 0.3], [8, 52, 0.6], [92, 48, 0.9], [20, 80, 0.2], [80, 84, 0.5],
  [50, 8, 0.8], [36, 14, 1.1], [66, 10, 0.4], [30, 92, 0.7], [70, 92, 1], [4, 36, 1.3],
  [96, 70, 0.1], [26, 40, 1.2], [74, 36, 0.35], [52, 96, 0.95],
];
const SPARK_COUNT = { bronze: 0, silver: 6, gold: 10, legend: 16, mythic: 16 } as const;

/** Shown while the card is drawn. Honest about the wait, without promising a time it can't keep. */
const LOADING_MESSAGES = ["Pressing your card…", "Lining up the shot…", "Still working. This can take up to a minute…"];
/** Loading is shown for at least this long, so a quick draw doesn't flash the loader. */
const MIN_LOADING_MS = 1500;

/** How far down the pack the tear runs (% of its height): just under the crimped top seal. */
const TEAR_Y = 7.6;
const TEAR_STEPS = 22;
/** The ragged tear edge, from the right side of the pack to the left. */
const TEAR_EDGE = Array.from({ length: TEAR_STEPS + 1 }, (_, i) => ({
  x: 100 - (i * 100) / TEAR_STEPS,
  y: TEAR_Y + (((i * 37) % 5) - 2) * 0.35,
}));
const edgePoints = (points: typeof TEAR_EDGE) => points.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(",");
const TOP_CLIP = `polygon(0% 0%,100% 0%,${edgePoints(TEAR_EDGE)})`;
const BOTTOM_CLIP = `polygon(${edgePoints([...TEAR_EDGE].reverse())},100% 100%,0% 100%)`;
/** How far across the pack (as a share of its width) a finger must travel to finish the tear. */
const TEAR_TRAVEL = 0.8;
/** Let go past this far and the pack finishes tearing itself; let go earlier and it springs shut. */
const TEAR_COMMIT = 0.5;

function CardBack() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "63 / 88",
        borderRadius: "0.95rem",
        border: "3px solid #e8b923",
        background: "radial-gradient(120% 90% at 50% 20%, #2a2412 0%, #0d0d0d 60%, #050505 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
        boxShadow: "0 0 2rem rgba(232,185,35,0.35)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" style={{ width: "55%" }} />
      <span style={{ color: "#e8b923", fontWeight: 800, fontSize: "0.7rem", letterSpacing: "0.35em" }}>PHD DRIFT</span>
    </div>
  );
}

export function PackOpening({
  ready,
  card,
  bonus = null,
  crew = null,
  featured = null,
  maintenance = null,
  packName = "Standard Pack",
  packVariant = "standard",
  onRevealed,
}: {
  /** The card has been drawn and saved, so the pack can be opened. */
  ready: boolean;
  /** The card the member made. Its rarity sets the colour of the burst. */
  card: MemberCard | null;
  /** The second card from the community pool, shown after the first in the same carousel. */
  bonus?: MemberCard | null;
  /** The tactical Crew Modifier card included in every Standard Pack. */
  crew?: MemberCard | null;
  /** The rare bonus card from the admin's pullable set, shown last. */
  featured?: MemberCard | null;
  /** The Maintenance Consumable card for repairing mechanical faults. */
  maintenance?: MemberCard | null;
  /** The name printed on the pack. */
  packName?: string;
  packVariant?: "standard" | "custom";
  /** Called once the card has finished revealing, so the page can show what to do next. */
  onRevealed: () => void;
}) {
  const reduced = useReducedMotion();
  const hasPack = ready && Boolean(card);
  const [anim, setAnim] = useState<Anim>("loading");
  // Loading shows for a moment at least, unless everything was ready from the start.
  const [minDone, setMinDone] = useState(hasPack);
  const [messageIndex, setMessageIndex] = useState(0);
  // Tearing: how far (0 to 1), which way (1 = from the left, -1 = from the right) and whether a finger is down.
  const [progress, setProgress] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const stage: Stage = anim === "loading" ? (hasPack && minDone ? "landed" : "loading") : anim;

  const slides = card
    ? [
        card,
        ...(bonus ? [bonus] : []),
        ...(crew ? [crew] : []),
        ...(featured ? [featured] : []),
        ...(maintenance ? [maintenance] : []),
      ]
    : [];
  const scroller = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);

  /** Which card is in the middle, worked out from how far the carousel has scrolled. */
  const onScroll = () => {
    const el = scroller.current;
    const first = el?.children[0] as HTMLElement | undefined;
    const second = el?.children[1] as HTMLElement | undefined;
    if (!el || !first || !second) return;
    const step = second.offsetLeft - first.offsetLeft;
    setSlide(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / step))));
  };

  const goTo = (index: number) => {
    const el = scroller.current;
    const target = el?.children[Math.max(0, Math.min(slides.length - 1, index))] as HTMLElement | undefined;
    if (!el || !target) return;
    el.scrollTo({ left: target.offsetLeft - (el.clientWidth - target.clientWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  };
  // Kept in a ref so a parent that re-renders with a new callback doesn't restart the timers.
  const revealed = useRef(onRevealed);
  useEffect(() => {
    revealed.current = onRevealed;
  }, [onRevealed]);

  // The shortest the loader shows for.
  useEffect(() => {
    if (minDone) return;
    const t = setTimeout(() => setMinDone(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, [minDone]);

  // The loading messages move on every few seconds and stop on the last one.
  useEffect(() => {
    if (stage !== "loading") return;
    const t = setInterval(() => setMessageIndex((i) => Math.min(i + 1, LOADING_MESSAGES.length - 1)), 2600);
    return () => clearInterval(t);
  }, [stage]);

  // loading -> landed -> (tear) -> opening -> revealed -> done
  useEffect(() => {
    const ms = reduced
      ? stage === "opening" || stage === "revealed"
        ? 300
        : 0
      : stage === "opening"
        ? 1250
        : stage === "revealed"
          ? 1800
          : 0;
    if (!ms) return;
    const t = setTimeout(() => {
      if (stage === "opening") setAnim("revealed");
      else if (stage === "revealed") revealed.current();
    }, ms);
    return () => clearTimeout(t);
  }, [stage, reduced]);

  // ── Tearing the pack open ──
  const tearRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; width: number } | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const dirLocked = useRef(false);
  const progressRef = useRef(0);

  const setTear = (value: number) => {
    progressRef.current = value;
    setProgress(value);
  };

  /** Finish the tear and open the pack. */
  const finishTear = () => {
    if (stage !== "landed") return;
    drag.current = null;
    setDragging(false);
    setTear(1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(20);
    setAnim("opening");
  };

  const onTearDown = (e: PointerEvent<HTMLDivElement>) => {
    if (stage !== "landed") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, width: tearRef.current?.getBoundingClientRect().width ?? 160 };
    dirLocked.current = false;
    setDragging(true);
  };
  const onTearMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    // The first real movement decides which end the tear starts from.
    if (!dirLocked.current && Math.abs(dx) > 6) {
      dirLocked.current = true;
      dirRef.current = dx > 0 ? 1 : -1;
      setDir(dirRef.current);
    }
    if (!dirLocked.current) return;
    const next = Math.max(0, Math.min(1, (dx * dirRef.current) / (d.width * TEAR_TRAVEL)));
    setTear(next);
    if (next >= 1) finishTear();
  };
  const onTearUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (progressRef.current >= TEAR_COMMIT) finishTear();
    else setTear(0);
  };
  const onTearKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      dirRef.current = 1;
      setDir(1);
      finishTear();
    }
  };
  /** The button under the pack: opens it without a swipe. */
  const openWithoutSwipe = () => {
    dirRef.current = 1;
    setDir(1);
    finishTear();
  };

  const info = card ? tierInfo(card.tier) : null;
  const glow = info?.palette.glow ?? "#fbbf24";
  const isLegend = card?.tier === "legend" || card?.tier === "mythic";
  const sparks = card ? SPARK_COUNT[card.tier] : 0;

  const showPack = stage === "landed" || stage === "opening";
  const tearing = stage === "opening";
  const cardsLabel = `${slides.length} CARD${slides.length === 1 ? "" : "S"}`;
  const caption = stage === "landed" ? "Slide your finger across the top of the pack to tear it open" : "";
  const pack = <PackArt bare name={packName} variant={packVariant} cardsLabel={cardsLabel} />;
  const tearVars = {
    "--p": progress,
    "--dir": dir,
    "--hinge": dir === 1 ? "100%" : "0%",
    "--tear-y": `${TEAR_Y}%`,
  } as CSSProperties;

  return (
    <div className="pc-stage" style={{ "--pc-glow": glow } as CSSProperties}>
      <div className="pc-track" aria-hidden />

      {/* Loading: no pack yet, just a car drifting round a ring */}
      {stage === "loading" && (
        <div className="pc-center pc-fade-in" style={{ top: "44%" }}>
          <div className="pc-loader" aria-hidden>
            <div className="pc-loader-ring" />
            <div className="pc-loader-orbit">
              <div className="pc-loader-car">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" />
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pc-loader-logo" src="/logo.png" alt="" />
          </div>
          <div className="pc-loader-bar" aria-hidden>
            <span />
          </div>
        </div>
      )}

      {showPack && (
        <>
          {/* The pack, cut in two along the tear line */}
          <div className="pc-center" style={{ top: "45%" }}>
            <div className="pc-pack-drop">
              <div
                ref={tearRef}
                className={`pc-tear ${stage === "landed" && !dragging && progress === 0 ? "pc-tear-idle" : ""} ${dragging ? "pc-tear-dragging" : ""}`}
                style={tearVars}
              >
                <div className={`pc-tear-piece ${tearing ? "pc-tear-bottom-open" : ""}`} style={{ clipPath: BOTTOM_CLIP }} aria-hidden>
                  {pack}
                </div>
                <div className="pc-tear-gap" aria-hidden />
                <div className={`pc-tear-piece pc-tear-top ${tearing ? "pc-tear-top-gone" : ""}`} style={{ clipPath: TOP_CLIP }} aria-hidden>
                  {pack}
                </div>
                <div
                  className="pc-tear-line"
                  aria-hidden
                  style={{ ...(dir === 1 ? { left: 0 } : { right: 0 }), opacity: progress > 0 && !tearing ? 1 : 0 }}
                />
                {stage === "landed" && progress === 0 && !dragging && (
                  <div className="pc-swipe-hint" aria-hidden>
                    <span className="pc-swipe-trail" />
                    <span className="pc-swipe-finger">👆</span>
                  </div>
                )}
                {stage === "landed" && (
                  <div
                    className="pc-swipe-zone"
                    role="button"
                    tabIndex={0}
                    aria-label="Open your card pack. Slide across the top of the pack, or press Enter."
                    onPointerDown={onTearDown}
                    onPointerMove={onTearMove}
                    onPointerUp={onTearUp}
                    onPointerCancel={onTearUp}
                    onKeyDown={onTearKey}
                  />
                )}
              </div>
            </div>
          </div>
          {tearing && <div className="pc-flash pc-flash-quick" aria-hidden />}
        </>
      )}

      {/* Under the pack: what to do next, announced to screen readers */}
      <div className="absolute inset-x-0 bottom-[4%] z-10 flex flex-col items-center gap-2 px-4 text-center">
        {stage === "loading" ? (
          <>
            <p className="text-sm font-bold text-amber-200" aria-hidden>
              {LOADING_MESSAGES[messageIndex]}
            </p>
            <p role="status" className="sr-only">
              Pressing your card. This can take up to a minute.
            </p>
          </>
        ) : (
          <p role="status" aria-live="polite" className="text-sm font-bold text-amber-200">
            {caption}
          </p>
        )}
        {stage === "landed" && (
          <button
            type="button"
            onClick={openWithoutSwipe}
            className="min-h-11 rounded-full border border-amber-400/50 bg-black/70 px-4 text-xs font-bold text-amber-200 hover:bg-amber-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Or tap here to open it
          </button>
        )}
      </div>

      {/* The reveal */}
      {anim === "revealed" && card && (
        <>
          <span className="sr-only" role="status">
            {card.bonus
              ? `You got a ${info?.label} community card: ${card.name}.`
              : `You got a ${info?.label} card: ${card.name}.`}
            {bonus
              ? card.bonus
                ? ` Your pack also had a second ${tierInfo(bonus.tier).label} community card: ${bonus.name}.`
                : ` Your pack also had a ${tierInfo(bonus.tier).label} community card: ${bonus.name}.`
              : ""}
            {crew ? ` Plus a ${tierInfo(crew.tier).label} Crew Modifier card: ${crew.name}.` : ""}
            {featured ? ` A rare ${tierInfo(featured.tier).label} bonus card also dropped: ${featured.name}.` : ""}
            {maintenance ? ` Plus a ${tierInfo(maintenance.tier).label} Maintenance Consumable: ${maintenance.name}.` : ""}
          </span>
          <div className={`pc-rays ${isLegend ? "pc-rays-rainbow" : ""}`} aria-hidden style={card.tier === "bronze" ? { display: "none" } : undefined} />
          <div className="pc-burst" aria-hidden />
          <div className="pc-burst pc-burst-2" aria-hidden />
          {SPARKS.slice(0, sparks).map(([l, t, d], i) => (
            <span key={i} className="pc-spark" aria-hidden style={{ left: `${l}%`, top: `${t}%`, "--d": `${d}s` } as CSSProperties} />
          ))}
          {/* The cards in a row you can swipe through. The first one rises and flips over; the others fade in after it. */}
          <div
            ref={scroller}
            className="pc-carousel"
            onScroll={onScroll}
            tabIndex={0}
            role="group"
            aria-roledescription="carousel"
            aria-label="Your cards"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                goTo(slide + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                goTo(slide - 1);
              }
            }}
          >
            {slides.map((c, i) => (
              <div key={c.id} className="pc-slide" role="group" aria-roledescription="slide" aria-label={`Card ${i + 1} of ${slides.length}`}>
                {i === 0 ? (
                  <div className="pc-rise">
                    <div className="pc-flip">
                      <div className="pc-flip-inner">
                        <div className="pc-face">
                          <FullArtCard card={c} className="drop-shadow-2xl" />
                        </div>
                        <div className="pc-face pc-face-back">
                          <CardBack />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pc-slide-in">
                    <FullArtCard card={c} className="drop-shadow-2xl" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {slides.length > 1 && (
            <div className="pc-slide-in absolute inset-x-0 bottom-[4%] z-10 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => goTo(slide - 1)}
                disabled={slide === 0}
                aria-label="Previous card"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/60 bg-black/60 text-lg font-black text-amber-300 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="min-w-14 text-center text-xs font-bold text-amber-200" aria-hidden>
                {slide + 1} / {slides.length}
              </span>
              <button
                type="button"
                onClick={() => goTo(slide + 1)}
                disabled={slide === slides.length - 1}
                aria-label="Next card"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/60 bg-black/60 text-lg font-black text-amber-300 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
