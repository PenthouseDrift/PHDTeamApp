"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { ART_STYLES } from "@/lib/card-maker";
import {
  tierArtPrompt,
  tierInfo,
  type FullArtCardData,
  type FullArtTier,
} from "@/lib/full-art-card";
import { QUESTION_IMAGE, stylePrompt, styleToPreviewCard, type PackStyle } from "@/lib/pack-styles";

export const panel =
  "space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
export const inputCls =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
export const labelCls = "mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
export const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryBtn =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-3.5 text-xs font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";
export const dangerBtn = `${secondaryBtn} text-red-600 dark:text-red-400`;
export const chip =
  "inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";

/** 12.3456 -> "12.3%", 0.0123 -> "0.012%". Enough digits to tell small chances apart. */
export function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0%";
  if (n >= 10) return `${Number(n.toFixed(1))}%`;
  if (n >= 0.1) return `${Number(n.toFixed(2))}%`;
  return `${Number(n.toPrecision(2))}%`;
}

export const tierLabel = (t: FullArtTier) => tierInfo(t).label;

export { QUESTION_IMAGE };

/** The normal generated card at a rarity: the rarity's frame with a "?" where the picture will be. */
export function generatedPreviewCard(tier: FullArtTier): FullArtCardData {
  return {
    name: `${tierLabel(tier)} card`,
    ability: "Drawn from a car",
    effect: "Drawn when the pack is opened.",
    tier,
    stats: { drift: "20", accel: "18", grip: "21", steer: "19" },
    imageUrl: QUESTION_IMAGE,
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: "Driver",
    team: "Team",
  };
}

/** A style at a rarity: its frame, and its sample picture or a "?" until it has one. */
export function stylePreviewCard(style: PackStyle, tier: FullArtTier): FullArtCardData {
  const card = styleToPreviewCard(style, tier);
  return card.imageUrl ? card : { ...card, imageUrl: QUESTION_IMAGE };
}

/** A card preview that can be clicked, with a caption and optional controls underneath. */
export function PreviewTile({
  card,
  title,
  subtitle,
  badge,
  onOpen,
  children,
}: {
  card: FullArtCardData;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${title}: view details`}
        className="relative block rounded-xl text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <FullArtCard card={card} className="drop-shadow-lg" />
        {badge && <span className="absolute left-1.5 top-1.5">{badge}</span>}
      </button>
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** A simple dialog: closes on Escape or a click outside, and puts focus on the close button. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-stretch justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex h-full w-full flex-col gap-4 overflow-y-auto bg-white p-5 text-zinc-900 shadow-2xl dark:bg-zinc-950 dark:text-zinc-100 sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-zinc-200 sm:p-6 dark:sm:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">{title}</h3>
          <button ref={closeRef} type="button" onClick={onClose} className={secondaryBtn}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

const promptBox =
  "max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

/** The normal generated card: every art style it can be drawn in. */
export function GeneratedDetails({ tier }: { tier: FullArtTier }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        A normal {tierLabel(tier)} card is drawn from a car photo. Each card gets 1 to 3 of these art styles, picked evenly, on top of
        the {tierLabel(tier)} scene. Open a style to see the exact prompt that is sent.
      </p>
      <ul className="space-y-2">
        {ART_STYLES.map((s) => (
          <li key={s.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-sm font-black">{s.label}</p>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{s.text}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-bold text-amber-600 dark:text-amber-400">Full prompt with this style alone</summary>
              <div className={`${promptBox} mt-2`}>{tierArtPrompt(tier, [s.id])}</div>
            </details>
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-xs font-bold text-amber-600 dark:text-amber-400">Prompt with no art style</summary>
        <div className={`${promptBox} mt-2`}>{tierArtPrompt(tier)}</div>
      </details>
    </div>
  );
}

/** A custom style: its one prompt, as it is sent, and its frame. */
export function StyleDetails({ style, tier }: { style: PackStyle; tier: FullArtTier }) {
  const sent = stylePrompt(style, tier);
  const frame = style.frame;
  return (
    <div className="space-y-4">
      {style.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{style.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        <span className={chip}>
          {!style.prompt ? "No prompt: uses the rarity's normal prompt" : style.promptMode === "full" ? "Full prompt, sent as written" : "Art style, added to the rarity's scene"}
        </span>
        <span className={chip}>
          Frame effect: {frame.effect === "tier" ? "the rarity's own" : frame.effect === "none" ? "none" : frame.effect === "flames" ? "flames" : "prismatic"}
        </span>
        {frame.effect !== "tier" && <span className={chip}>Shine: {frame.shine ? "on" : "off"}</span>}
        {frame.effect === "flames" && frame.flameColour && (
          <span className={chip}>
            Flame colour
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-black/20" style={{ background: frame.flameColour }} />
            {frame.flameColour}
          </span>
        )}
        {Object.entries(frame.colours).map(([field, value]) => (
          <span key={field} className={chip}>
            {field.replace(/^custom/, "").replace(/([A-Z])/g, " $1").trim()}
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-black/20" style={{ background: value }} />
          </span>
        ))}
      </div>
      <div>
        <p className={labelCls}>Prompt sent at {tierLabel(tier)}</p>
        <div className={promptBox}>{sent}</div>
      </div>
    </div>
  );
}

/** A fixed set card: what it is. Nothing is drawn for it. */
export function FixedCardDetails({ card }: { card: FullArtCardData }) {
  const total = [card.stats.drift, card.stats.accel, card.stats.grip, card.stats.steer].reduce((s, v) => s + (Number.parseInt(v, 10) || 0), 0);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        A fixed set card made in the Card maker. Its picture, stats and frame are as saved and nothing is drawn for it.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-bold text-zinc-500">Rarity</dt>
        <dd>{tierLabel(card.tier)}</dd>
        <dt className="font-bold text-zinc-500">Stats</dt>
        <dd>
          {card.stats.drift} / {card.stats.accel} / {card.stats.grip} / {card.stats.steer} (total {total})
        </dd>
        {card.ability && (
          <>
            <dt className="font-bold text-zinc-500">Ability</dt>
            <dd>{card.ability}</dd>
          </>
        )}
        {card.effect && (
          <>
            <dt className="font-bold text-zinc-500">Effect</dt>
            <dd>{card.effect}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
