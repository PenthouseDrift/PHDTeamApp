"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { tierInfo } from "@/lib/full-art-card";
import { RARITY_RANK, type MemberCard } from "@/lib/card-roll";
import { PackArt } from "@/tcg/components/PackArt";

/**
 * Lay out the cards of a store pack for the reveal. Its Crew and Repair Kit cards go last, after the cards from the pack
 * itself, so that however many a pack gives they are never mistaken for the car cards or the bonus pull.
 */
export function splitStorePackCards(cards: MemberCard[]): {
  card: MemberCard | null;
  bonus: MemberCard | null;
  featured: MemberCard | null;
  extras: MemberCard[];
} {
  const isUtility = (c: MemberCard) => c.cardType === "crew" || c.cardType === "maintenance";
  const main = cards.filter((c) => !isUtility(c));
  return {
    card: main[0] ?? null,
    bonus: main[1] ?? null,
    featured: main[2] ?? null,
    // Any card after the third, such as the pack's bonus pull, then the Crew and Repair Kit cards.
    extras: [...main.slice(3), ...cards.filter(isUtility)],
  };
}

/**
 * The best card of a pack, which the reveal builds up to and the text about the pull is written for. Only the car cards
 * compete: a pack's Crew and Repair Kit cards come with every pack, so they would otherwise often outrank the car. On a tie
 * the earlier card wins, so the member's own car comes before the bonus cards.
 */
export function bestCardOf(cards: Array<MemberCard | null | undefined>): MemberCard | null {
  let best: MemberCard | null = null;
  for (const c of cards) {
    if (!c || c.cardType === "crew" || c.cardType === "maintenance") continue;
    if (!best || RARITY_RANK[c.tier] > RARITY_RANK[best.tier]) best = c;
  }
  return best;
}

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

/**
 * The reveal timeline, in seconds. The cards come out of the pack face down and fan out, turn over one at a time with the best
 * card last (the burst goes off as it turns), hold for a beat, then spread into the row you swipe through. Every card gets its
 * own delays as CSS variables (see .pd-* in globals.css).
 */
const DEAL = { rise: 0.7, riseGap: 0.09, flipGap: 0.28, backTurn: 0.22, frontTurn: 0.28, heroBackTurn: 0.3, heroFrontTurn: 0.5, hold: 0.7, spread: 0.8, spreadGap: 0.07 };
/** A Legend (or Mythic) pull gets a longer build-up before the card turns, a slower turn, and more time to enjoy it. */
const LEGEND = { build: 1.6, backTurn: 0.55, frontTurn: 1, hold: 2.2 };

function dealPlan(count: number, heroIndex: number, legendary: boolean) {
  const mid = (count - 1) / 2;
  const flipsStart = (count - 1) * DEAL.riseGap + DEAL.rise + 0.25;
  // The best card turns last. The others turn in the order they sit.
  let others = 0;
  const ranks = Array.from({ length: count }, (_, i) => (i === heroIndex ? count - 1 : others++));
  const build = legendary ? LEGEND.build : 0;
  const heroBackTurn = legendary ? LEGEND.backTurn : DEAL.heroBackTurn;
  const heroFrontTurn = legendary ? LEGEND.frontTurn : DEAL.heroFrontTurn;
  const heroBack = flipsStart + (count - 1) * DEAL.flipGap + build;
  const heroEnd = heroBack + heroBackTurn + heroFrontTurn;
  const spreadStart = heroEnd + (legendary ? LEGEND.hold : DEAL.hold);
  const end = spreadStart + (count - 1) * DEAL.spreadGap + DEAL.spread;
  const styles = ranks.map((rank, i) => {
    const isHero = i === heroIndex;
    const backAt = isHero ? heroBack : flipsStart + rank * DEAL.flipGap;
    const backTurn = isHero ? heroBackTurn : DEAL.backTurn;
    return {
      "--k": heroIndex - i,
      "--fan-x": `${(i - mid) * 22}px`,
      "--fan-r": `${(i - mid) * 9}deg`,
      "--in-delay": `${(i * DEAL.riseGap).toFixed(2)}s`,
      "--back-delay": `${backAt.toFixed(2)}s`,
      "--back-dur": `${backTurn}s`,
      "--front-delay": `${(backAt + backTurn).toFixed(2)}s`,
      "--front-dur": `${isHero ? heroFrontTurn : DEAL.frontTurn}s`,
      "--spread-delay": `${(spreadStart + i * DEAL.spreadGap).toFixed(2)}s`,
    } as CSSProperties;
  });
  const burstAt = heroBack + heroBackTurn + 0.1;
  return {
    styles,
    end,
    burstAt,
    // Legend pulls only: when the build-up starts and how long it lasts, and when the card is face up.
    chargeAt: heroBack - build,
    chargeFor: build,
    auraAt: heroBack + heroBackTurn,
  };
}

/** Gold, white and rainbow flecks that rain down over a Legend pull. [left %, delay s, fall s, size rem, colour, drift px] */
const CONFETTI: Array<[number, number, number, number, string, number]> = Array.from({ length: 34 }, (_, i) => [
  (i * 29 + 7) % 100,
  ((i * 13) % 17) * 0.09,
  2.4 + ((i * 7) % 6) * 0.3,
  0.35 + ((i * 5) % 4) * 0.12,
  ["#ffd75e", "#ffffff", "#7df9ff", "#ff7ad9", "#a78bfa", "#fbbf24"][i % 6],
  ((i * 17) % 9 - 4) * 12,
]);

export function PackOpening({
  ready,
  card,
  bonus = null,
  crew = null,
  featured = null,
  maintenance = null,
  extras = [],
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
  /** Any further cards in the pack (a custom pack's fourth card, such as its bonus pull), shown last. */
  extras?: MemberCard[];
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
        ...extras,
      ]
    : [];
  // The reveal is built around the best card in the pack: it is the one that rises and flips, in its own colours.
  const hero = bestCardOf(slides) ?? card;
  const heroIndex = Math.max(0, hero ? slides.indexOf(hero) : 0);
  const scroller = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const legendPull = hero?.tier === "legend" || hero?.tier === "mythic";
  const plan = dealPlan(slides.length, heroIndex, legendPull);

  // The row starts on the best card, so the flip happens there. The scroll event this causes updates the counter and arrows.
  useLayoutEffect(() => {
    if (anim !== "revealed") return;
    const el = scroller.current;
    const target = el?.children[heroIndex] as HTMLElement | undefined;
    if (!el || !target) return;
    el.scrollTo({ left: target.offsetLeft - (el.clientWidth - target.clientWidth) / 2, behavior: "instant" });
  }, [anim, heroIndex]);

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

  // The follow-up buttons are shown by the parent once this has been called. It only ever runs once, whether the sequence
  // finished by itself or the member tapped Skip.
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  // The cards deal out of the pack face down. Skipping, or reduced motion, uses the simpler reveal below.
  const dealt = !reduced && !skipped;
  const doneRef = useRef(false);
  const complete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    revealed.current();
  };

  // loading -> landed -> (tear) -> opening -> revealed -> done
  useEffect(() => {
    const ms = reduced
      ? stage === "opening" || stage === "revealed"
        ? 300
        : 0
      : stage === "opening"
        ? 1250
        : stage === "revealed"
          ? Math.round(plan.end * 1000) + 300
          : 0;
    if (!ms) return;
    const t = setTimeout(() => {
      if (stage === "opening") setAnim("revealed");
      else if (stage === "revealed") complete();
    }, ms);
    return () => clearTimeout(t);
  }, [stage, reduced, plan.end]);

  // A Legend pull buzzes the phone as the card turns: a rising knock, then one long pulse.
  useEffect(() => {
    if (anim !== "revealed" || !dealt || !legendPull) return;
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const t = setTimeout(() => navigator.vibrate([40, 50, 40, 50, 40, 50, 220]), plan.burstAt * 1000);
    return () => {
      clearTimeout(t);
      navigator.vibrate(0);
    };
  }, [anim, dealt, legendPull, plan.burstAt]);

  /** Skip the rest of the show: the card is shown straight away and the follow-up buttons appear. */
  const skip = () => {
    if (stage !== "opening" && stage !== "revealed") return;
    setSkipped(true);
    setAnim("revealed");
    complete();
  };

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

  // The burst, rays and sparks are those of the best card in the pack.
  const info = hero ? tierInfo(hero.tier) : null;
  const glow = info?.palette.glow ?? "#fbbf24";
  const isLegend = legendPull;
  const sparks = hero ? SPARK_COUNT[hero.tier] : 0;

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
    <div
      className={`pc-stage ${dealt && legendPull && anim === "revealed" ? "pl-shake" : ""}`}
      // On short phones the stage may not be taller than the screen, or the buttons around it would be pushed off.
      style={
        {
          "--pc-glow": glow,
          minHeight: "min(30rem, 62dvh)",
          height: "min(76dvh, 36rem)",
          "--pl-at": `${plan.burstAt.toFixed(2)}s`,
          "--pl-charge-at": `${plan.chargeAt.toFixed(2)}s`,
          "--pl-charge-for": `${plan.chargeFor}s`,
          "--pl-aura-at": `${plan.auraAt.toFixed(2)}s`,
        } as CSSProperties
      }
    >
      <div className="pc-track" aria-hidden />

      {/* Skip: the card fade-in and the timer before the next buttons appear take a few seconds, so this lets the member move on. */}
      {(stage === "opening" || stage === "revealed") && !done && (
        <button
          type="button"
          onClick={skip}
          className="absolute right-2 top-2 z-30 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-amber-400/40 bg-black/50 px-4 text-xs font-bold text-amber-200/90 backdrop-blur-sm hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Skip
        </button>
      )}

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
                <div className={`pc-tear-gap ${tearing ? "pc-tear-gap-off" : ""}`} aria-hidden />
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
            {hero && hero !== card ? `Your best card is a ${info?.label} card: ${hero.name}. ` : ""}
            {card.bonus
              ? `You got a ${tierInfo(card.tier).label} community card: ${card.name}.`
              : `You got a ${tierInfo(card.tier).label} card: ${card.name}.`}
            {bonus
              ? card.bonus
                ? ` Your pack also had a second ${tierInfo(bonus.tier).label} community card: ${bonus.name}.`
                : ` Your pack also had a ${tierInfo(bonus.tier).label} community card: ${bonus.name}.`
              : ""}
            {crew ? ` Plus a ${tierInfo(crew.tier).label} Crew Modifier card: ${crew.name}.` : ""}
            {featured ? ` A rare ${tierInfo(featured.tier).label} bonus card also dropped: ${featured.name}.` : ""}
            {maintenance ? ` Plus a ${tierInfo(maintenance.tier).label} Maintenance Consumable: ${maintenance.name}.` : ""}
            {extras
              .map((extra) =>
                extra.cardType === "crew"
                  ? ` Plus a ${tierInfo(extra.tier).label} Crew Modifier card: ${extra.name}.`
                  : extra.cardType === "maintenance"
                    ? ` Plus a ${tierInfo(extra.tier).label} Maintenance Consumable: ${extra.name}.`
                    : ` Plus a ${tierInfo(extra.tier).label} card: ${extra.name}.`
              )
              .join("")}
          </span>
          {legendPull && dealt && (
            <>
              {/* The room goes dark while the card charges, then lights up when it turns */}
              <div className="pl-dim" aria-hidden />
              <div className="pl-beams" aria-hidden />
              <div className="pl-ring" aria-hidden />
              <div className="pl-ring pl-ring-2" aria-hidden />
              <div className="pl-ring pl-ring-3" aria-hidden />
              <div className="pl-flash" aria-hidden />
              {CONFETTI.map(([left, delay, fall, size, color, drift], i) => (
                <span
                  key={i}
                  className="pl-confetti"
                  aria-hidden
                  style={{ left: `${left}%`, width: `${size}rem`, height: `${size * 1.6}rem`, background: color, "--d": `${delay}s`, "--fall": `${fall}s`, "--drift": `${drift}px` } as CSSProperties}
                />
              ))}
            </>
          )}
          {legendPull && (
            <div className={`pl-banner ${dealt ? "" : "pl-banner-static"}`} aria-hidden>
              <span>★ {hero?.tier === "mythic" ? "Mythic" : "Legendary"} pull ★</span>
            </div>
          )}
          <div
            className={`pc-rays ${isLegend ? "pc-rays-rainbow" : ""}`}
            aria-hidden
            style={{ ...(hero?.tier === "bronze" ? { display: "none" } : null), ...(dealt ? { animationDelay: `${plan.burstAt + 0.1}s, 0s` } : null) }}
          />
          <div className="pc-burst" aria-hidden style={dealt ? { animationDelay: `${plan.burstAt}s` } : undefined} />
          <div className="pc-burst pc-burst-2" aria-hidden style={dealt ? { animationDelay: `${plan.burstAt + 0.25}s` } : undefined} />
          {SPARKS.slice(0, sparks).map(([l, t, d], i) => (
            <span key={i} className="pc-spark" aria-hidden style={{ left: `${l}%`, top: `${t}%`, "--d": `${d}s` } as CSSProperties} />
          ))}
          {/* The cards in a row you can swipe through. The best one rises and flips over; the others fade in after it. */}
          <div
            ref={scroller}
            className="pc-carousel"
            style={{ "--step": "calc(min(17rem, 62vw) + 1rem)", ...(dealt && !done ? { pointerEvents: "none" } : null) } as CSSProperties}
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
              <div
                key={c.id}
                className="pc-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`Card ${i + 1} of ${slides.length}`}
                style={dealt ? { position: "relative", zIndex: i === heroIndex ? slides.length + 1 : i } : undefined}
              >
                {dealt ? (
                  <div className="pd-slide" style={plan.styles[i]}>
                    {/* A Legend card shakes and glows harder while the others are already turned, then keeps a pulsing aura. */}
                    <div className={`relative [perspective:1000px] ${legendPull && i === heroIndex ? "pl-charge" : ""}`}>
                      <div className="pd-front">
                        <FullArtCard card={c} className="drop-shadow-2xl" />
                      </div>
                      <div aria-hidden className="pd-back pointer-events-none absolute inset-0 z-20">
                        <CardBack />
                      </div>
                    </div>
                  </div>
                ) : i === heroIndex && skipped ? (
                  <FullArtCard card={c} className="drop-shadow-2xl" />
                ) : i === heroIndex ? (
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
                  <div className="pc-slide-in" style={skipped ? { animation: "none" } : undefined}>
                    <FullArtCard card={c} className="drop-shadow-2xl" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {slides.length > 1 && (
            <div
              className="pc-slide-in absolute inset-x-0 bottom-[4%] z-10 flex items-center justify-center gap-3"
              style={skipped ? { animation: "none" } : dealt ? { animationDelay: `${plan.end}s` } : undefined}
            >
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
