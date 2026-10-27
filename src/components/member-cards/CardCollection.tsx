"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { DeleteCardButton } from "@/components/member-cards/DeleteCardButton";
import { keepCard, rerollCard } from "@/actions/member-cards";
import {
  DEFAULT_SORT_DIRECTION,
  canRerollCard,
  rarityLabel,
  sortCards,
  type CardSortKey,
  type MemberCard,
  type SortDirection,
} from "@/lib/card-roll";
import { ART_STYLES } from "@/lib/card-maker";
import { FULL_ART_TIERS } from "@/lib/full-art-card";

/**
 * "My cards": the member's collection. Sort by newest, name, team, driver or rarity; tap a card for a
 * large view with its details. A card that was just opened can still be kept or re-rolled once from the
 * large view.
 */

const SORTS: Array<{ key: CardSortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "driver", label: "Driver" },
  { key: "rarity", label: "Rarity" },
];

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

const formatDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function CardCollection({
  initialCards,
  credits,
  canDelete = false,
}: {
  initialCards: MemberCard[];
  credits: number;
  /** Admins only: show a delete button in the large view. The server checks the role again. */
  canDelete?: boolean;
}) {
  const [cards, setCards] = useState(initialCards);
  const [sortKey, setSortKey] = useState<CardSortKey>("newest");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const sorted = useMemo(() => sortCards(cards, sortKey, direction), [cards, sortKey, direction]);
  const tally = useMemo(() => {
    const counts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, legend: 0 };
    for (const c of cards) counts[c.tier]++;
    return counts;
  }, [cards]);

  const openIndex = openId ? sorted.findIndex((c) => c.id === openId) : -1;
  const openCard = openIndex >= 0 ? sorted[openIndex] : null;

  const replaceCard = (next: MemberCard) => setCards((list) => list.map((c) => (c.id === next.id ? next : c)));
  const removeCard = (id: string) => {
    setCards((list) => list.filter((c) => c.id !== id));
    setOpenId(null);
  };

  function chooseSort(key: CardSortKey) {
    setSortKey(key);
    setDirection(DEFAULT_SORT_DIRECTION[key]);
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section className={`${panel} space-y-4`} aria-label="Collection summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Card credits</p>
            <p className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{credits}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Earn 1 every time you check in at the track, or 2 with a membership.</p>
          </div>
          <Link href="/cards/new" className={primary}>
            {credits > 0 ? "Open a card pack" : "Make a card"}
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cards by rarity">
          {[...FULL_ART_TIERS].reverse().map((t) => (
            <li key={t.id} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <span className="flex items-center gap-2 text-xs font-black text-zinc-900 dark:text-zinc-100">
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-full border border-black/20"
                  style={{
                    background:
                      t.id === "legend"
                        ? "conic-gradient(#7df9ff, #a78bfa, #ff7ad9, #ffd75e, #7df9ff)"
                        : `linear-gradient(135deg, ${t.palette.light}, ${t.palette.accent} 55%, ${t.palette.dark})`,
                  }}
                />
                {t.label}
              </span>
              <span className="block text-lg font-black text-zinc-900 dark:text-zinc-100">{tally[t.id]}</span>
            </li>
          ))}
        </ul>
      </section>

      {cards.length === 0 ? (
        <section className={`${panel} space-y-3 py-10 text-center`}>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">No cards yet</h2>
          <p className="mx-auto max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            Check in at the track to earn a card credit, then open a pack to get a card of your own car. Cards come in bronze,
            silver, gold and legend, and legend cards are rare.
          </p>
          <div>
            <Link href="/cards/new" className={primary}>
              {credits > 0 ? "Open your first pack" : "See how it works"}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Sorting */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort cards by">
              {SORTS.map((s) => {
                const active = sortKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseSort(s.key)}
                    className={`min-h-10 rounded-full border-2 px-4 text-xs font-bold ${
                      active
                        ? "border-amber-500 bg-amber-500 text-black"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={secondary}
              onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}
              aria-label={`Sort order: ${direction === "asc" ? "ascending" : "descending"}. Tap to reverse.`}
            >
              {direction === "asc" ? "A → Z / low → high" : "Z → A / high → low"}
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Your cards">
            {sorted.map((c) => (
              <li key={c.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="block w-full rounded-2xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
                  aria-label={`View ${c.name}, ${rarityLabel(c.tier)} card`}
                >
                  <FullArtCard card={c} className="drop-shadow-lg" />
                </button>
                <p className="truncate text-center text-xs font-bold text-zinc-700 dark:text-zinc-200">
                  {rarityLabel(c.tier)}
                  {canRerollCard(c, now) ? " · re-roll available" : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <CardViewer
        card={openCard}
        index={openIndex}
        total={sorted.length}
        now={now}
        onClose={() => setOpenId(null)}
        onMove={(step) => {
          const next = sorted[openIndex + step];
          if (next) setOpenId(next.id);
        }}
        onChange={replaceCard}
        canDelete={canDelete}
        onDeleted={removeCard}
      />
    </div>
  );
}

/** The large view of one card, in a native dialog (focus is kept inside it and Escape closes it). */
function CardViewer({
  card,
  index,
  total,
  now,
  onClose,
  onMove,
  onChange,
  canDelete,
  onDeleted,
}: {
  card: MemberCard | null;
  index: number;
  total: number;
  now: number;
  onClose: () => void;
  onMove: (step: -1 | 1) => void;
  onChange: (card: MemberCard) => void;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shownId, setShownId] = useState<string | null>(null);

  // A different card starts without a half-finished re-roll prompt or an old error.
  if ((card?.id ?? null) !== shownId) {
    setShownId(card?.id ?? null);
    setConfirm(false);
    setError(null);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (card && !dialog.open) dialog.showModal();
    if (!card && dialog.open) dialog.close();
  }, [card]);

  // Arrow keys step through the cards.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onMove(-1);
      if (e.key === "ArrowRight") onMove(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onMove]);

  const styles = card ? card.styleIds.map((id) => ART_STYLES.find((s) => s.id === id)?.label).filter(Boolean) : [];
  const pendingChoice = card ? canRerollCard(card, now) : false;

  function keep() {
    if (!card) return;
    startTransition(async () => {
      const res = await keepCard(card.id);
      if (res.success) onChange(res.data.card);
      else setError(res.error);
    });
  }

  function reroll() {
    if (!card) return;
    setConfirm(false);
    setError(null);
    startTransition(async () => {
      const res = await rerollCard(card.id);
      if (res.success) onChange(res.data.card);
      else setError(res.error);
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="card-viewer-title"
      className="m-auto w-[min(60rem,94vw)] max-h-[94vh] overflow-y-auto rounded-3xl border border-amber-500/30 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      {card && (
        <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="mx-auto w-full max-w-[22rem]">
            <FullArtCard card={card} className="drop-shadow-2xl" />
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">{rarityLabel(card.tier)} card</p>
                <h2 id="card-viewer-title" className="text-2xl font-black">
                  {card.name}
                </h2>
              </div>
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800">
                Close
              </button>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-bold text-zinc-400">Driver</dt>
              <dd>{card.driver || "—"}</dd>
              <dt className="font-bold text-zinc-400">Team</dt>
              <dd>{card.team || "—"}</dd>
              <dt className="font-bold text-zinc-400">Chassis</dt>
              <dd>{card.ability || "—"}</dd>
              <dt className="font-bold text-zinc-400">About</dt>
              <dd>{card.effect || "—"}</dd>
              <dt className="font-bold text-zinc-400">Art style</dt>
              <dd>{styles.length > 0 ? styles.join(" + ") : "Tier default"}</dd>
              <dt className="font-bold text-zinc-400">Opened</dt>
              <dd>{formatDate(card.createdAt)}</dd>
            </dl>

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
                {error}
              </p>
            )}

            {pendingChoice && (
              <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-sm font-bold">
                  This card is new. Keep it, or re-roll it once. A re-roll replaces it with a brand new card, rarity included.
                </p>
                {confirm ? (
                  <div className="space-y-2">
                    <p className="text-sm">You will lose this {rarityLabel(card.tier)} card. This can only be done once.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={primary} onClick={reroll} disabled={pending}>
                        Yes, re-roll it
                      </button>
                      <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800" onClick={() => setConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primary} onClick={keep} disabled={pending}>
                      Keep this card
                    </button>
                    <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800" onClick={() => setConfirm(true)} disabled={pending}>
                      Re-roll once
                    </button>
                  </div>
                )}
                {pending && <p role="status" className="text-xs text-zinc-300">Working on it… this can take up to a minute.</p>}
              </div>
            )}

            {canDelete && <DeleteCardButton key={card.id} cardId={card.id} onDeleted={onDeleted} />}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40" onClick={() => onMove(-1)} disabled={index <= 0}>
                ← Previous
              </button>
              <span className="text-xs text-zinc-400">
                {index + 1} of {total}
              </span>
              <button type="button" className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-40" onClick={() => onMove(1)} disabled={index >= total - 1}>
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
