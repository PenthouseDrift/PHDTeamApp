"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { RARITY_RANK, rarityLabel } from "@/lib/card-roll";
import { tierInfo } from "@/lib/full-art-card";
import type { ReceivedCard } from "@/tcg/trade-types";
import { buzz } from "@/tcg/ui/feedback";

type Phase = "box" | "reveal" | "summary";

const noSubscription = () => () => {};
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** How big the glow behind a card is, by rarity: the rarer the card, the bigger the moment. */
const GLOW_SIZE: Record<string, number> = { mythic: 1.35, legend: 1.2, gold: 1.05, silver: 1, bronze: 0.95 };

/** "Sam", "Sam and Bea", "Sam, Bea and 2 others" */
function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "Someone";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** A ring of sparks that fly out from the middle. The positions are fixed, so it looks the same every time. */
function Sparks({ count = 16, reach = 150 }: { count?: number; reach?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.2;
        const distance = reach * (0.65 + ((i * 37) % 10) / 20);
        const style = {
          "--dx": `${Math.round(Math.cos(angle) * distance)}px`,
          "--dy": `${Math.round(Math.sin(angle) * distance)}px`,
          "--delay": `${(i % 4) * 0.04}s`,
        } as CSSProperties;
        return <span key={i} aria-hidden className="rc-spark" style={style} />;
      })}
    </>
  );
}

/**
 * Plays when a member is given cards: a gift or the card from a trade. A gift box drops in and opens (tap it, or it opens
 * itself), then each card comes out in turn with a glow that matches its rarity, and a last screen shows everything that
 * arrived. The button on the last screen is what makes it count as seen: until then it plays again next time.
 */
export function ReceivedCardsReveal({ items, onDone }: { items: ReceivedCard[]; onDone: () => void }) {
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const [phase, setPhase] = useState<Phase>("box");
  const [opening, setOpening] = useState(false);
  const [index, setIndex] = useState(0);
  const finished = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  const many = items.length > 1;
  const current = items[Math.min(index, items.length - 1)];
  const senders = useMemo(() => [...new Set(items.map((i) => i.fromName))], [items]);
  const verb = items.every((i) => i.kind === "gift") ? "gifted you" : items.every((i) => i.kind === "trade") ? "traded you" : "sent you";
  // The best card sets the mood of the box.
  const best = useMemo(() => items.reduce((a, b) => (RARITY_RANK[b.card.tier] > RARITY_RANK[a.card.tier] ? b : a), items[0]), [items]);
  const shownTier = phase === "box" ? best?.card.tier : current?.card.tier;
  const glow = tierInfo(shownTier ?? "gold").palette.glow;

  // The box opens by itself after a moment, as well as when tapped. With reduced motion, skip straight to the cards.
  function open() {
    if (opening || phase !== "box") return;
    setOpening(true);
    buzz(25);
    window.setTimeout(() => setPhase("reveal"), reducedMotion ? 0 : 750);
  }
  useEffect(() => {
    if (!mounted || phase !== "box") return;
    const timer = window.setTimeout(open, reducedMotion ? 0 : 2400);
    return () => window.clearTimeout(timer);
    // `open` only reads the latest state it needs, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, phase, reducedMotion]);

  // Each new card, and the last screen, is a little buzz; focus goes to the main button so Enter always moves on.
  useEffect(() => {
    if (phase === "reveal") buzz(index === 0 ? 20 : 12);
    primary.current?.focus();
  }, [phase, index]);

  // The page behind stays still while this is on screen.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  function next() {
    if (index < items.length - 1) setIndex(index + 1);
    else if (many) setPhase("summary");
    else done();
  }
  function done() {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }

  // Right arrow / Enter move on; Escape skips to the end, but never counts as "seen".
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (phase === "reveal" && e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape" && phase !== "summary" && many) {
        e.preventDefault();
        setPhase("summary");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mounted || items.length === 0) return null;

  const isLast = index >= items.length - 1;
  const btn =
    "gx-tap inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-black uppercase tracking-wide transition-colors";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New cards received"
      className="rc-backdrop gx-safe-t gx-safe-b fixed inset-0 z-[10050] flex flex-col items-center justify-center overflow-hidden px-4 text-white"
      style={{ "--rc-glow": glow, "--rc-glow-size": GLOW_SIZE[shownTier ?? "gold"] ?? 1 } as CSSProperties}
    >
      <div aria-hidden className="rc-rays" />
      <p className="sr-only" aria-live="polite">
        {phase === "reveal" && current
          ? `${current.card.name}, ${rarityLabel(current.card.tier)}, from ${current.fromName}. Card ${index + 1} of ${items.length}.`
          : phase === "summary"
            ? `You received ${items.length} cards.`
            : `${nameList(senders)} ${verb} ${items.length} ${items.length === 1 ? "card" : "cards"}.`}
      </p>

      {phase === "box" && (
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="rc-text text-center" style={{ animationDelay: "0.5s" }}>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">You&apos;ve got mail</p>
            <h2 className="mt-1 text-2xl font-black sm:text-3xl">
              {items.length === 1 ? "A card for you!" : `${items.length} cards for you!`}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-300">
              <strong className="text-white">{nameList(senders)}</strong> {verb} {items.length === 1 ? "a card" : "some cards"}
            </p>
          </div>

          <button type="button" onClick={open} aria-label="Open the gift" className="relative rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70">
            <div className="rc-gift" data-open={opening} data-wobble={!opening}>
              <div className="rc-box">
                <div className="rc-body" />
                <div className="rc-lid">
                  <div className="rc-bow" />
                </div>
              </div>
              {opening && <Sparks count={18} reach={170} />}
            </div>
          </button>

          <p className="rc-text text-sm font-bold text-amber-300" style={{ animationDelay: "1.1s" }}>
            Tap the gift to open it
          </p>
        </div>
      )}

      {phase === "reveal" && current && (
        <div className="relative z-10 flex w-full flex-col items-center gap-4">
          <p key={`from-${index}`} className="rc-text text-center text-sm text-zinc-300" style={{ animationDelay: "0.2s" }}>
            <span aria-hidden>{current.kind === "gift" ? "🎁" : "🤝"}</span>{" "}
            {current.kind === "gift" ? "Gift from" : "Trade with"} <strong className="text-white">{current.fromName}</strong>
            {many && <span className="ml-2 text-xs font-bold text-zinc-500">{index + 1} / {items.length}</span>}
          </p>

          <button
            key={`card-${index}`}
            type="button"
            onClick={next}
            aria-label={isLast ? "Continue" : "Next card"}
            className="rc-card-stage block w-[min(68vw,17rem,calc((100dvh-17rem)*0.716))] cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
          >
            <span aria-hidden className="rc-card-glow" />
            <span className="rc-card rc-float block">
              <FullArtCard card={current.card} className="drop-shadow-2xl" />
            </span>
            <Sparks count={current.card.tier === "mythic" || current.card.tier === "legend" ? 22 : 14} reach={current.card.tier === "mythic" ? 210 : 160} />
          </button>

          <div key={`name-${index}`} className="rc-text text-center" style={{ animationDelay: "0.55s" }}>
            <p className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: glow }}>
              {rarityLabel(current.card.tier)}
            </p>
            <p className="mt-0.5 text-xl font-black">{current.card.name}</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            {many && !isLast && (
              <button type="button" onClick={() => setPhase("summary")} className={`${btn} border border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800`}>
                Skip
              </button>
            )}
            <button ref={primary} type="button" onClick={next} className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>
              {isLast ? (many ? "See them all" : "Add to my collection") : "Next card"}
            </button>
          </div>
        </div>
      )}

      {phase === "summary" && (
        <div className="relative z-10 flex max-h-full w-full max-w-xl flex-col items-center gap-4 py-4">
          <div className="rc-text text-center" style={{ animationDelay: "0s" }}>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Added to your collection</p>
            <h2 className="mt-1 text-2xl font-black">
              {items.length} new {items.length === 1 ? "card" : "cards"}
            </h2>
            <p className="mt-1 text-sm text-zinc-300">From {nameList(senders)}</p>
          </div>

          <ul className="grid min-h-0 w-full grid-cols-3 gap-3 overflow-y-auto overscroll-contain px-1 pb-1 sm:grid-cols-4">
            {items.map((item, i) => (
              <li key={item.card.id} className="rc-pop space-y-1" style={{ animationDelay: `${Math.min(i, 12) * 70}ms` }}>
                <FullArtCard card={item.card} className="drop-shadow-lg" />
                <p className="truncate text-center text-[11px] font-bold text-zinc-200">{item.card.name}</p>
              </li>
            ))}
          </ul>

          <button ref={primary} type="button" onClick={done} className={`${btn} w-full max-w-xs bg-amber-500 text-black hover:bg-amber-400`}>
            Add to my collection
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
