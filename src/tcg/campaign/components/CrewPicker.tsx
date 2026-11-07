"use client";

import type { CSSProperties, Ref } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { MemberCard } from "@/lib/card-roll";
import { CREW_TO_PICK } from "../config";
import { tierSlotOf } from "../deal";
import type { RolledTier } from "../types";
import { CardCarousel } from "./CardCarousel";
import { ROLL_STYLE } from "./rolls";

const panel = "rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-sm sm:p-5";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-xs font-black uppercase tracking-wide text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Step 3 of entering the cup: three Crew cards from the six dealt, picked the same way as the cars. The six are dealt by
 * rolling a rarity for each slot (see deal.ts), can be re-rolled, and fly in and turn over with the same animation.
 */
export function CrewPicker({
  sectionRef,
  crew,
  rolls,
  picked,
  onToggle,
  onReroll,
  rerollsLeft,
  rerolling,
  busy,
  revealing,
  onSkipReveal,
  dealKey,
  focus,
  onFocus,
}: {
  sectionRef: Ref<HTMLElement>;
  crew: MemberCard[];
  rolls: RolledTier[];
  picked: string[];
  onToggle: (id: string) => void;
  onReroll: () => void;
  rerollsLeft: number;
  rerolling: boolean;
  /** Something else is going on, so the buttons are off. */
  busy: boolean;
  revealing: boolean;
  onSkipReveal: () => void;
  dealKey: number;
  focus: { index: number; tick: number } | null;
  onFocus: (index: number) => void;
}) {
  const full = picked.length >= CREW_TO_PICK;
  const mid = (crew.length - 1) / 2;
  return (
    <section ref={sectionRef} className={`${panel} scroll-mt-16 !px-0 !pb-3`} aria-label="Choose your Crew cards">
      <div className="flex items-center justify-between gap-2 px-3.5">
        <div className="min-w-0">
          <h3 className="text-base font-black leading-tight">
            Pick {CREW_TO_PICK} Crew cards of {crew.length}
          </h3>
          <p className="text-[11px] text-zinc-400">They come with you for the whole cup. Swipe to browse, then tap Pick.</p>
        </div>
        <button
          type="button"
          onClick={onReroll}
          disabled={busy || revealing || rerollsLeft <= 0}
          className={secondaryBtn}
          aria-label={`Re-roll your Crew cards, ${rerollsLeft} left`}
        >
          {rerolling ? "Dealing…" : `🎲 Re-roll · ${rerollsLeft}`}
        </button>
      </div>

      {/* On a new deal the Crew cards fly in, fan out for a moment, then spread into the carousel. A tap skips it. */}
      <div
        key={dealKey}
        style={{ "--step": "calc(min(16rem, 62vw) + 1rem)" } as CSSProperties}
        onClickCapture={(e) => {
          if (!revealing) return;
          e.stopPropagation();
          onSkipReveal();
        }}
      >
        <CardCarousel label="Your six Crew cards" focusIndex={focus}>
          {crew.map((card, i) => {
            const on = picked.includes(card.id);
            const rolled = rolls[i];
            const got = tierSlotOf(card);
            // While the deal plays, everything but the card itself stays hidden; it fades in once the cards have landed.
            const extra = revealing ? "opacity-0" : "transition-opacity duration-500";
            const slideStyle = { "--i": i, "--fan-x": `${(i - mid) * 22}px`, "--fan-r": `${(i - mid) * 9}deg` } as CSSProperties;
            return (
              <div key={card.id} style={slideStyle} className={`space-y-2 ${revealing ? "deal-slide" : ""}`} onClick={() => onFocus(i)}>
                {rolled && (
                  <p className={`${extra} text-center text-[11px] font-black uppercase tracking-wide text-zinc-400`}>
                    Slot {i + 1} · rolled <span className={ROLL_STYLE[rolled].text}>{ROLL_STYLE[rolled].label}</span>
                    {got !== rolled && <span className="text-zinc-500"> · none left, dealt {ROLL_STYLE[got].label}</span>}
                  </p>
                )}
                <div className={`relative rounded-2xl transition [perspective:1000px] ${on ? "ring-4 ring-amber-400" : ""}`}>
                  <div className={revealing ? "deal-front" : undefined}>
                    <FullArtCard card={card} className="drop-shadow-2xl" />
                  </div>
                  {revealing && (
                    <div aria-hidden className="deal-back absolute inset-0 z-20 overflow-hidden rounded-2xl border-2 border-cyan-400/70 bg-gradient-to-br from-zinc-800 via-zinc-950 to-black shadow-2xl">
                      <div className="absolute inset-2 rounded-xl border border-dashed border-cyan-400/40" />
                      <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(34,211,238,0.07)_10px_20px)]" />
                      <span className="absolute inset-0 flex items-center justify-center text-6xl text-cyan-300/80 drop-shadow">⚡</span>
                    </div>
                  )}
                  {on && (
                    <span className="absolute left-2 top-2 z-30 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-black text-black shadow">
                      ✓ Pick {picked.indexOf(card.id) + 1}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(card.id);
                  }}
                  disabled={!on && full}
                  aria-pressed={on}
                  className={`${extra} inline-flex min-h-12 w-full items-center justify-center rounded-xl px-3 text-sm font-black uppercase tracking-wide shadow transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? "border border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700" : "bg-amber-500 text-black hover:bg-amber-400"
                  }`}
                >
                  {on ? "Remove from picks" : full ? "Picks full: remove one" : "Pick this Crew card"}
                </button>
              </div>
            );
          })}
        </CardCarousel>
      </div>
    </section>
  );
}
