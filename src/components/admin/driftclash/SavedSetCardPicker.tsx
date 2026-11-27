"use client";

import { useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { statTotal } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { applyVariant, type EntryVariant } from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import { createFinishedSetCardAction } from "@/actions/admin/driftclash-packs";
import type { SetCard } from "@/components/admin/driftclash/PackEditor";
import { NO_RESTYLE, RestylePanel, type RestyleChoice } from "@/components/admin/driftclash/RestylePanel";
import {
  StatsModeControl,
  defaultStatsChoice,
  statFieldsOf,
  statsChoiceError,
  type StatsChoice,
} from "@/components/admin/driftclash/StatsModeControl";
import { inputCls, labelCls, primaryBtn, secondaryBtn, tierLabel } from "@/components/admin/driftclash/preview";

/**
 * The variant to store on a pack entry for these choices, or undefined when the card is used just as it was saved.
 * The stats choice, a style and a redrawn picture belong to the pack entry, not to the saved card, so choosing a card
 * (even many times) never saves another card.
 */
export function variantFrom(stats: StatsChoice | null, restyle: RestyleChoice): EntryVariant | undefined {
  const variant: EntryVariant = {
    ...statFieldsOf(stats),
    ...(restyle.styleId ? { styleId: restyle.styleId } : {}),
    ...(restyle.artUrl ? { artUrl: restyle.artUrl } : {}),
  };
  return Object.keys(variant).length > 0 ? variant : undefined;
}

/** The most saved cards that can be added in one go. */
const MAX_BATCH = 100;

/** A short description of what a variant changes, for the notice after adding. */
export function describeVariant(variant: EntryVariant | undefined): string {
  if (!variant) return "no changes";
  return [
    variant.stats ? "your own stats" : "",
    variant.rerollOnPull ? "stats rerolled at each pull" : "",
    variant.edits ? "edited card details" : "",
    variant.styleId ? (variant.artUrl ? "a restyled frame and artwork" : "a restyled frame") : "",
  ]
    .filter(Boolean)
    .join(" and ");
}

/**
 * Saved set cards (made in the Card maker, or from a member's car) that can go on a rarity. Every saved card can be used
 * on any rarity: choose one, then optionally reroll its stats for this rarity and/or restyle it with a style from the
 * style library. The choices are kept on the pack entry only. The saved card is not changed and nothing new is saved.
 */
export function SavedSetCardPicker({
  tier,
  cards,
  styles,
  mode = "rarity",
  onAdd,
  onAddMany,
  room = MAX_BATCH,
}: {
  /** The rarity being added to. For the bonus pull this is Legend, the rarity bonus cards are given out as. */
  tier: FullArtTier;
  /**
   * "rarity": the card goes on `tier`; a card saved on another rarity has its stats rerolled to fit.
   * "bonus": the card goes in a bonus pull, which gives every card out as Legend whatever it was saved as, so any card
   * can be added as it is and there is nothing to reroll.
   */
  mode?: "rarity" | "bonus";
  /** Saved cards that are not already in this rarity, of any rarity. */
  cards: SetCard[];
  styles: PackStyle[];
  /** `created` is true when a new set card was saved (see "Save the finished card"), so the page's list of saved cards needs it. */
  onAdd: (card: SetCard, variant: EntryVariant | undefined, created: boolean) => void;
  /**
   * When given, a "Select several" switch appears: tick many saved cards and add them all at once. Nothing new is saved, so
   * this is instant. A card keeps its stats if they fit the rarity, otherwise they are rerolled at each pull.
   */
  onAddMany?: (items: { card: SetCard; variant: EntryVariant | undefined }[]) => void;
  /** How many more cards fit in the place being added to. A batch can't be bigger than this. */
  room?: number;
}) {
  const [saveAsNew, setSaveAsNew] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();
  const [search, setSearch] = useState("");
  const [sameRarityOnly, setSameRarityOnly] = useState(false);
  const [selected, setSelected] = useState<SetCard | null>(null);
  /** What happens to the card's stats on this rarity. Null in a bonus pull, where stats are set when the card is given out. */
  const [statsChoice, setStatsChoice] = useState<StatsChoice | null>(null);
  const [restyle, setRestyle] = useState<RestyleChoice>(NO_RESTYLE);
  /** "Select several": clicking a card ticks it instead of opening it. */
  const [multi, setMulti] = useState(false);
  /** The ticked cards, in the order they were ticked. Kept while searching. */
  const [picked, setPicked] = useState<Map<string, SetCard>>(new Map());
  /** "match": each card keeps its stats if they fit the rarity, otherwise they are rerolled at the pull. "reroll": all are rerolled. */
  const [batchStats, setBatchStats] = useState<"match" | "reroll">("match");

  const bonus = mode === "bonus";
  const limit = Math.max(0, Math.min(MAX_BATCH, room));
  const q = search.trim().toLowerCase();
  const shown = cards.filter(
    (c) =>
      (bonus || !sameRarityOnly || c.tier === tier) &&
      (!q || [c.name, c.driver, c.team, c.ability].some((v) => v.toLowerCase().includes(q)))
  );

  function togglePicked(card: SetCard) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(card.id)) next.delete(card.id);
      else if (next.size < limit) next.set(card.id, card);
      return next;
    });
  }

  /** Tick every card on screen, up to the room there is. */
  function tickAllShown() {
    setPicked((prev) => {
      const next = new Map(prev);
      for (const c of shown) {
        if (next.size >= limit) break;
        next.set(c.id, c);
      }
      return next;
    });
  }

  /** The pack-entry changes for one card in a batch. A restyle is not part of a batch: restyle a card from its own page. */
  function batchVariant(card: SetCard): EntryVariant | undefined {
    if (bonus) return undefined;
    const choice: StatsChoice = batchStats === "reroll" ? { mode: "reroll", stats: card.stats } : defaultStatsChoice(card, tier);
    return variantFrom(choice, NO_RESTYLE);
  }

  function addMany() {
    if (!onAddMany || picked.size === 0) return;
    onAddMany([...picked.values()].map((card) => ({ card, variant: batchVariant(card) })));
  }

  function choose(card: SetCard) {
    setSelected(card);
    setRestyle(NO_RESTYLE);
    setSaveAsNew(null);
    setError(null);
    // A card on its own rarity starts by keeping its stats; one saved on another rarity starts rerolled at the pull.
    setStatsChoice(bonus ? null : defaultStatsChoice(card, tier));
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No saved cards to add yet. Make one in the Card maker, or pick a member&apos;s car on the Members&apos; cars tab; it is saved here automatically.
      </p>
    );
  }

  if (selected) {
    const variant = variantFrom(statsChoice, restyle);
    const statsError = statsChoice ? statsChoiceError(statsChoice, selected, tier) : null;
    const preview = applyVariant(selected, variant, new Map(styles.map((s) => [s.id, s])), tier);
    // Saving the finished card only makes sense when it differs from the saved one. After a redraw it starts ticked.
    const changed = Boolean(restyle.styleId) || (statsChoice ? statsChoice.mode !== "keep" : false);
    const willSave = changed && (saveAsNew ?? Boolean(restyle.artUrl));

    const add = () => {
      setError(null);
      if (!willSave) {
        onAdd(selected, variant, false);
        return;
      }
      startAdd(async () => {
        const res = await createFinishedSetCardAction({
          source: { kind: "saved", id: selected.id },
          // A bonus card is saved on the rarity it already is; it is given out as Legend either way.
          tier: bonus ? selected.tier : tier,
          variant,
        });
        if (res.success) onAdd(res.data.card as SetCard, res.data.entryVariant, true);
        else setError(res.error);
      });
    };

    return (
      <div className="space-y-4">
        <button type="button" className={secondaryBtn} onClick={() => setSelected(null)}>
          ← Back to saved cards
        </button>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="w-44 shrink-0 self-center sm:self-start">
            <FullArtCard card={preview} showDurability={false} />
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-base font-black">{selected.name}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Saved as {tierLabel(selected.tier)} · DRIFT {selected.stats.drift} · ACCEL {selected.stats.accel} · GRIP {selected.stats.grip} · STEER{" "}
                {selected.stats.steer} · total {statTotal(selected.stats)}
              </p>
            </div>

            {bonus ? (
              <p className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                In a bonus pull this card is given out as a Legend card with stats of at least 23 (a Mythic card stays Mythic), so there is no need to reroll its stats.
              </p>
            ) : (
              statsChoice && (
                <StatsModeControl tier={tier} saved={selected} value={statsChoice} onChange={setStatsChoice} name="saved-stats" />
              )
            )}

            <RestylePanel
              styles={styles}
              tier={tier}
              source={{ kind: "saved", id: selected.id }}
              choice={restyle}
              onChange={setRestyle}
            />

            {changed && (
              <div className="space-y-1 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
                <label className="flex items-start gap-2.5 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={willSave}
                    disabled={adding}
                    onChange={(e) => setSaveAsNew(e.target.checked)}
                  />
                  <span>Save the finished card as a new set card</span>
                </label>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {willSave
                    ? `The card as shown in the preview is saved to Saved set cards (and the Card maker) as its own ${tierLabel(bonus ? selected.tier : tier)} card, and the pack uses that. ${
                        statsChoice?.mode === "reroll" ? "Its stats are rolled once for the saved card; the pack still rerolls them at each pull. " : ""
                      }Your original card is not changed.`
                    : "Leave this off to use the changes in this pack only. Nothing new is saved."}
                </p>
              </div>
            )}

            {!changed && <p className="text-xs text-zinc-600 dark:text-zinc-400">This pack will use the card as it is saved.</p>}

            <div role="status" aria-live="polite">
              {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <button type="button" className={primaryBtn} disabled={Boolean(statsError) || adding} onClick={add}>
              {adding ? "Saving…" : bonus ? "Add to the bonus pull" : `Add to ${tierLabel(tier)}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canSelectSeveral = Boolean(onAddMany) && limit > 0;
  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${bonus ? "" : "sm:grid-cols-[1fr_auto]"} sm:items-end`}>
        <div>
          <label htmlFor="sc-search" className={labelCls}>
            Search saved cards
          </label>
          <input
            id="sc-search"
            type="search"
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Car, driver or team"
            maxLength={60}
          />
        </div>
        {!bonus && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4" checked={sameRarityOnly} onChange={(e) => setSameRarityOnly(e.target.checked)} />
            {tierLabel(tier)} cards only
          </label>
        )}
      </div>

      {canSelectSeveral && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={multi}
              onChange={(e) => {
                setMulti(e.target.checked);
                if (!e.target.checked) setPicked(new Map());
              }}
            />
            Select several cards to add at once
          </label>
          {multi && shown.length > 0 && (
            <>
              <button type="button" className={secondaryBtn} onClick={tickAllShown} disabled={picked.size >= limit}>
                Tick all shown
              </button>
              {picked.size > 0 && (
                <button type="button" className={secondaryBtn} onClick={() => setPicked(new Map())}>
                  Clear ticks
                </button>
              )}
            </>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          No saved cards match.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {shown.map((c) => {
            const isPicked = picked.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => (multi ? togglePicked(c) : choose(c))}
                  aria-pressed={multi ? isPicked : undefined}
                  aria-label={`${multi ? (isPicked ? "Untick" : "Tick") : "Choose"} saved card ${c.name}, ${tierLabel(c.tier)}`}
                  className={`relative w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isPicked ? "ring-4 ring-amber-500" : ""
                  }`}
                >
                  <FullArtCard card={c} showDurability={false} />
                  {multi && (
                    <span
                      aria-hidden="true"
                      className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-black ${
                        isPicked ? "border-amber-500 bg-amber-500 text-black" : "border-white bg-black/50 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  )}
                  <span className="mt-1 block truncate text-xs font-bold">{c.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{tierLabel(c.tier)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {multi && canSelectSeveral && (
        <div className="sticky bottom-0 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-black" role="status" aria-live="polite">
            {picked.size === 0
              ? "Tick the cards you want to add"
              : `${picked.size} card${picked.size === 1 ? "" : "s"} selected${picked.size >= limit ? ` (the most that fit here is ${limit})` : ""}`}
          </p>

          {!bonus && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Stats on {tierLabel(tier)}</legend>
              {(
                [
                  ["match", "Keep stats that fit, reroll the rest", `Cards already ${tierLabel(tier)} keep their stats. Others are rerolled each time they are pulled.`],
                  ["reroll", "Reroll all at the time of pull", `Every card gets fresh ${tierLabel(tier)} stats each time a member pulls it.`],
                ] as const
              ).map(([id, title, text]) => (
                <label
                  key={id}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-sm ${
                    batchStats === id ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <input type="radio" name="saved-batch-stats" className="mt-1 h-4 w-4" checked={batchStats === id} onChange={() => setBatchStats(id)} />
                  <span className="min-w-0">
                    <span className="block font-bold">{title}</span>
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">{text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            The saved cards are not changed and nothing new is saved. Restyle or set your own stats on one card afterwards by opening it in the pack.
          </p>

          <button type="button" className={primaryBtn} onClick={addMany} disabled={picked.size === 0}>
            {picked.size > 0 ? `Add ${picked.size} to ${bonus ? "the bonus pull" : tierLabel(tier)}` : `Add to ${bonus ? "the bonus pull" : tierLabel(tier)}`}
          </button>
        </div>
      )}
    </div>
  );
}
