"use client";
import { useMemo, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import {
  COMING_SOON_NOTE_MAX,
  COMING_SOON_WHEN_MAX,
  DEFAULT_COMING_SOON_TIER,
  MAX_COMING_SOON,
  type ComingSoonItem,
} from "@/lib/coming-soon";
import { ALL_TIERS, QUESTION_IMAGE, type PackStyle } from "@/lib/pack-styles";
import { saveComingSoonAction } from "@/actions/admin/coming-soon";
import {
  chip,
  dangerBtn,
  inputCls,
  labelCls,
  panel,
  primaryBtn,
  secondaryBtn,
  stylePreviewCard,
  tierLabel,
} from "@/components/admin/driftclash/preview";
import type { Notice, SetCard } from "@/components/admin/driftclash/PackEditor";

const RARE_FIRST: FullArtTier[] = [...ALL_TIERS].reverse();

/** A random id in the format the saved list accepts. */
const newId = () => crypto.randomUUID();

/**
 * Manage the "Coming soon" row on the game's Home page: pick saved full art cards (from the card maker)
 * and styles from the style library, give each a release hint, and put them in order. Nothing is shown to
 * members until this is saved, and an empty list hides the row.
 */
export function ComingSoonEditor({
  initialItems,
  cards,
  styles,
  onNotify,
}: {
  initialItems: ComingSoonItem[];
  /** Every saved full art card, with or without a picture. */
  cards: SetCard[];
  styles: PackStyle[];
  onNotify: (notice: Notice) => void;
}) {
  const [items, setItems] = useState<ComingSoonItem[]>(initialItems);
  const [saved, setSaved] = useState<ComingSoonItem[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [styleTier, setStyleTier] = useState<Record<string, FullArtTier>>({});
  const [filter, setFilter] = useState("");

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const styleById = useMemo(() => new Map(styles.map((s) => [s.id, s])), [styles]);
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);
  const full = items.length >= MAX_COMING_SOON;
  const q = filter.trim().toLowerCase();

  /** The card to draw for an item, or null when what it points at has been deleted. */
  function previewFor(item: ComingSoonItem): FullArtCardData | null {
    if (item.source === "card") {
      const c = cardById.get(item.refId);
      return c ? { ...c, imageUrl: c.imageUrl || QUESTION_IMAGE } : null;
    }
    const s = styleById.get(item.refId);
    return s ? stylePreviewCard(s, item.tier ?? DEFAULT_COMING_SOON_TIER) : null;
  }

  const hasCard = (id: string) => items.some((i) => i.source === "card" && i.refId === id);
  const hasStyle = (id: string, tier: FullArtTier) => items.some((i) => i.source === "style" && i.refId === id && i.tier === tier);

  function addCard(card: SetCard) {
    if (full || hasCard(card.id)) return;
    setItems((list) => [...list, { id: newId(), source: "card", refId: card.id, when: "", note: "" }]);
  }
  function addStyle(style: PackStyle) {
    const tier = styleTier[style.id] ?? DEFAULT_COMING_SOON_TIER;
    if (full || hasStyle(style.id, tier)) return;
    setItems((list) => [...list, { id: newId(), source: "style", refId: style.id, tier, when: "", note: "" }]);
  }
  function patch(id: string, change: Partial<ComingSoonItem>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }
  function move(id: string, by: -1 | 1) {
    setItems((list) => {
      const from = list.findIndex((i) => i.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }
  function remove(id: string) {
    setItems((list) => list.filter((i) => i.id !== id));
  }

  function save() {
    startTransition(async () => {
      const res = await saveComingSoonAction(items);
      if (res.success) {
        setItems(res.data);
        setSaved(res.data);
        const dropped = items.length - res.data.length;
        onNotify({
          text: dropped > 0 ? `Saved. ${dropped} item${dropped === 1 ? "" : "s"} pointed at something that was deleted and was removed.` : "Coming soon row saved.",
        });
      } else {
        onNotify({ text: res.error, error: true });
      }
    });
  }

  const tileBtn = (active: boolean) =>
    `relative block w-full rounded-xl text-left transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
      active ? "opacity-50" : "hover:-translate-y-0.5"
    }`;

  return (
    <div className="space-y-6">
      <section className={panel} aria-label="Coming soon row">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Coming soon</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A row of teaser cards on the game&apos;s Home page. Pick saved full art cards and styles below, add a release hint, then
              save. Members see only the card, the hint and the note. An empty list hides the row.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={chip}>
              {items.length} / {MAX_COMING_SOON}
            </span>
            <button type="button" className={primaryBtn} onClick={save} disabled={pending || !dirty}>
              {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nothing coming soon yet. Choose a card or style below to add it.
          </p>
        ) : (
          <ol className="space-y-3">
            {items.map((item, idx) => {
              const card = previewFor(item);
              const label =
                item.source === "card"
                  ? cardById.get(item.refId)?.name
                  : styleById.get(item.refId)?.name;
              return (
                <li key={item.id} className="flex gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="w-24 shrink-0">
                    {card ? (
                      <FullArtCard card={card} className="drop-shadow-lg" />
                    ) : (
                      <div className="flex aspect-[5/7] items-center justify-center rounded-xl border border-dashed border-red-500/50 p-2 text-center text-[11px] font-bold text-red-600 dark:text-red-400">
                        Deleted
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">{label ?? "Missing card or style"}</p>
                      <span className={chip}>{item.source === "card" ? "Saved card" : `Style · ${tierLabel(item.tier ?? DEFAULT_COMING_SOON_TIER)}`}</span>
                      {item.source === "card" && cardById.get(item.refId) && !cardById.get(item.refId)?.imageUrl && (
                        <span className={chip}>No picture yet: shown as ?</span>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={labelCls} htmlFor={`cs-when-${item.id}`}>
                          Release hint
                        </label>
                        <input
                          id={`cs-when-${item.id}`}
                          className={inputCls}
                          value={item.when}
                          maxLength={COMING_SOON_WHEN_MAX}
                          placeholder="e.g. Next week"
                          onChange={(e) => patch(item.id, { when: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor={`cs-note-${item.id}`}>
                          Note (optional)
                        </label>
                        <input
                          id={`cs-note-${item.id}`}
                          className={inputCls}
                          value={item.note}
                          maxLength={COMING_SOON_NOTE_MAX}
                          placeholder="e.g. Joins the Summer Pack"
                          onChange={(e) => patch(item.id, { note: e.target.value })}
                        />
                      </div>
                    </div>
                    {item.source === "style" && (
                      <div className="max-w-[12rem]">
                        <label className={labelCls} htmlFor={`cs-tier-${item.id}`}>
                          Shown as
                        </label>
                        <select
                          id={`cs-tier-${item.id}`}
                          className={inputCls}
                          value={item.tier ?? DEFAULT_COMING_SOON_TIER}
                          onChange={(e) => patch(item.id, { tier: e.target.value as FullArtTier })}
                        >
                          {RARE_FIRST.map((t) => (
                            <option key={t} value={t}>
                              {tierLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={secondaryBtn} onClick={() => move(item.id, -1)} disabled={idx === 0} aria-label={`Move ${label ?? "item"} earlier`}>
                        ↑ Earlier
                      </button>
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => move(item.id, 1)}
                        disabled={idx === items.length - 1}
                        aria-label={`Move ${label ?? "item"} later`}
                      >
                        ↓ Later
                      </button>
                      <button type="button" className={dangerBtn} onClick={() => remove(item.id)} aria-label={`Remove ${label ?? "item"}`}>
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={panel} aria-label="Add from saved full art cards">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Saved full art cards</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Made in the Card maker. Click a card to add it.</p>
          </div>
          <div className="w-full sm:w-64">
            <label className={labelCls} htmlFor="cs-filter">
              Search cards and styles
            </label>
            <input id="cs-filter" className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name…" />
          </div>
        </div>
        {full && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">The row is full. Remove something to add more.</p>}
        {cards.filter((c) => !q || c.name.toLowerCase().includes(q)).length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{cards.length === 0 ? "No saved full art cards yet. Make one in the Card maker." : "No cards match."}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {cards
              .filter((c) => !q || c.name.toLowerCase().includes(q))
              .map((c) => {
                const added = hasCard(c.id);
                return (
                  <li key={c.id} className="space-y-1">
                    <button
                      type="button"
                      className={tileBtn(added)}
                      onClick={() => addCard(c)}
                      disabled={added || full}
                      aria-label={added ? `${c.name}: already in the row` : `Add ${c.name} to Coming soon`}
                    >
                      <FullArtCard card={{ ...c, imageUrl: c.imageUrl || QUESTION_IMAGE }} className="drop-shadow-md" />
                      {added && <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-black">Added</span>}
                    </button>
                    <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{c.name}</p>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className={panel} aria-label="Add from the style library">
        <div>
          <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Style library</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Shows the style&apos;s frame and sample picture at the rarity you choose. Pick a rarity, then add it.
          </p>
        </div>
        {styles.filter((s) => !q || s.name.toLowerCase().includes(q)).length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{styles.length === 0 ? "No styles yet. Add one on the Styles tab." : "No styles match."}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {styles
              .filter((s) => !q || s.name.toLowerCase().includes(q))
              .map((s) => {
                const tier = styleTier[s.id] ?? DEFAULT_COMING_SOON_TIER;
                const added = hasStyle(s.id, tier);
                return (
                  <li key={s.id} className="space-y-2">
                    <div className="mx-auto w-28">
                      <FullArtCard card={stylePreviewCard(s, tier)} className="drop-shadow-md" />
                    </div>
                    <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{s.name}</p>
                    <label className="sr-only" htmlFor={`cs-style-tier-${s.id}`}>
                      Rarity for {s.name}
                    </label>
                    <select
                      id={`cs-style-tier-${s.id}`}
                      className={inputCls}
                      value={tier}
                      onChange={(e) => setStyleTier((m) => ({ ...m, [s.id]: e.target.value as FullArtTier }))}
                    >
                      {RARE_FIRST.map((t) => (
                        <option key={t} value={t}>
                          {tierLabel(t)}
                        </option>
                      ))}
                    </select>
                    <button type="button" className={`${secondaryBtn} w-full`} onClick={() => addStyle(s)} disabled={added || full}>
                      {added ? "Already added" : "Add to row"}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
