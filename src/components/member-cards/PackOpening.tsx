"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { tierInfo } from "@/lib/full-art-card";
import type { MemberCard } from "@/lib/card-roll";

/**
 * The card pack stage. A little card "car" drifts across a track and drops off a pack. The pack waits
 * (for the card to finish being drawn on the server), then the member taps it to open it: it shakes,
 * flashes and tears open, and the card rises out and flips over with a burst in its rarity's colour.
 *
 * The pack looks the same whatever is inside, so the rarity is a surprise until the card flips.
 * With reduced motion, everything still happens in the same order but without the movement.
 */

type Anim = "drifting" | "landed" | "opening" | "revealed";

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
  /** Called once the card has finished revealing, so the page can show what to do next. */
  onRevealed: () => void;
}) {
  const reduced = useReducedMotion();
  const [anim, setAnim] = useState<Anim>("drifting");
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
  const phase = anim === "landed" ? (ready && card ? "ready" : "waiting") : anim;

  // drifting -> landed -> (tap) -> opening -> revealed -> done
  useEffect(() => {
    const ms = reduced ? 300 : anim === "drifting" ? 2150 : anim === "opening" ? 1700 : anim === "revealed" ? 1800 : 0;
    if (!ms) return;
    const t = setTimeout(() => {
      if (anim === "drifting") setAnim("landed");
      else if (anim === "opening") setAnim("revealed");
      else if (anim === "revealed") revealed.current();
    }, ms);
    return () => clearTimeout(t);
  }, [anim, reduced]);

  const info = card ? tierInfo(card.tier) : null;
  const glow = info?.palette.glow ?? "#fbbf24";
  const isLegend = card?.tier === "legend" || card?.tier === "mythic";
  const sparks = card ? SPARK_COUNT[card.tier] : 0;

  const caption =
    phase === "drifting"
      ? "A card pack is on its way…"
      : phase === "waiting"
        ? "Pressing your card… this can take up to a minute."
        : phase === "ready"
          ? "Tap the pack to open it"
          : "";

  const packClass =
    phase === "opening" ? "pc-pack pc-pack-opening" : phase === "ready" ? "pc-pack pc-pack-ready" : "pc-pack pc-pack-waiting";

  return (
    <div className="pc-stage" style={{ "--pc-glow": glow } as CSSProperties}>
      <div className="pc-track" aria-hidden />

      {anim !== "revealed" && (
        <>
          {/* Skid mark and the drifting card car */}
          <svg className="pc-skid" viewBox="0 0 400 560" preserveAspectRatio="none" aria-hidden>
            <path pathLength="1" d="M-10 330 C 70 330, 150 300, 205 292 C 250 286, 300 300, 420 262" />
            <path pathLength="1" d="M-10 352 C 70 352, 150 322, 205 314 C 250 308, 300 322, 420 284" />
          </svg>
          {anim === "drifting" && (
            <div className="pc-car" aria-hidden>
              {[0, 0.15, 0.3, 0.45, 0.6].map((d) => (
                <span key={d} className="pc-puff" style={{ "--d": `${d}s` } as CSSProperties} />
              ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" />
            </div>
          )}

          {/* The pack */}
          <div className="pc-center">
            <div className="pc-pack-drop">
              <button
                type="button"
                className={packClass}
                onClick={() => phase === "ready" && setAnim("opening")}
                disabled={phase !== "ready"}
                aria-label={phase === "ready" ? "Open your card pack" : "Your card pack"}
              >
                <span className="pc-pack-lid" />
                <span className="pc-pack-body">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="" style={{ width: "58%", position: "relative" }} />
                  <span style={{ color: "#e8b923", fontWeight: 800, fontSize: "0.62rem", letterSpacing: "0.32em", position: "relative" }}>
                    PHD DRIFT
                  </span>
                  <span style={{ color: "#a1a1aa", fontWeight: 700, fontSize: "0.55rem", letterSpacing: "0.28em", position: "relative" }}>
                    CARD PACK
                  </span>
                </span>
                <span className="pc-pack-foot" />
              </button>
            </div>
          </div>
          {anim === "opening" && <div className="pc-flash" aria-hidden />}
        </>
      )}

      {/* Caption under the pack, announced to screen readers */}
      <p
        role="status"
        aria-live="polite"
        className={`absolute inset-x-0 bottom-[7%] z-10 px-4 text-center text-sm font-bold text-amber-200 ${phase === "ready" ? "pc-hint" : ""}`}
      >
        {caption}
      </p>

      {/* The reveal */}
      {anim === "revealed" && card && (
        <>
          <span className="sr-only" role="status">
            {`You got a ${info?.label} card: ${card.name}.`}
            {bonus ? ` Your pack also had a ${tierInfo(bonus.tier).label} community card: ${bonus.name}.` : ""}
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
