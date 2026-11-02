"use client";

import { useCallback, useState } from "react";
import {
  DEFAULT_BONUS_CHANCE_PCT,
  MAX_BONUS_ENTRIES,
  MAX_BONUS_WEIGHT,
  MIN_BONUS_WEIGHT,
  applyVariant,
  bonusEntryOverallPct,
  bonusPullCard,
  oneInFromPct,
  pctFromOneIn,
  type EntryVariant,
  type PackBonus,
} from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import type { Notice, SetCard } from "@/components/admin/driftclash/PackEditor";
import { MemberCarPicker } from "@/components/admin/driftclash/MemberCarPicker";
import { EntryEditorDialog } from "@/components/admin/driftclash/EntryEditorDialog";
import { createFinishedSetCardAction } from "@/actions/admin/driftclash-packs";
import { SavedSetCardPicker, describeVariant } from "@/components/admin/driftclash/SavedSetCardPicker";
import {
  Modal,
  PreviewTile,
  dangerBtn,
  fmtPct,
  inputCls,
  labelCls,
  panel,
  primaryBtn,
  secondaryBtn,
  generatedPreviewCard,
} from "@/components/admin/driftclash/preview";

/** The card as a member would be given it from the bonus pull: Legend, with stats lifted to 23 to 25. */
const asPulled = (card: SetCard): SetCard => ({ ...card, ...bonusPullCard(card) });

/**
 * The bonus pull section of a pack: how often a pack also holds an extra card, and which set cards it is picked from.
 * It sits beside the rarities rather than in one of them, because it does not depend on the rarity roll. Every card in it
 * has a fixed picture, so a bonus pull never costs an AI image.
 */
export function BonusPullEditor({
  bonus,
  cards,
  isStandard,
  legacyPullable,
  styles,
  readOnly,
  onChange,
  onCardCreated,
  onNotify,
  onOpenCard,
}: {
  /** The pack's bonus pull, or undefined when it has not been set up. */
  bonus: PackBonus | undefined;
  /** Every saved set card with a picture. */
  cards: SetCard[];
  isStandard: boolean;
  /** The admin's old pullable list (card id -> odds weight). Only used to move it into the Standard Pack. */
  legacyPullable: Record<string, number>;
  /** The style library, for restyling a card as it is added. */
  styles: PackStyle[];
  readOnly: boolean;
  onChange: (bonus: PackBonus) => void;
  /** A set card was just made (from a member's car, or a restyled copy), so the page's list of saved cards needs it. */
  onCardCreated: (card: SetCard) => void;
  onNotify: (notice: Notice) => void;
  onOpenCard: (card: SetCard) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addTab, setAddTab] = useState<"cards" | "members">("cards");
  /** The bonus card being edited in the card editor. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditing = useCallback(() => setEditingId(null), []);
  const [oneInText, setOneInText] = useState(() => String(bonus ? (oneInFromPct(bonus.chancePct) ?? "") : ""));
  const closeAdd = useCallback(() => setAdding(false), []);

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const styleById = new Map(styles.map((s) => [s.id, s]));
  const legacyUsable = Object.entries(legacyPullable).filter(([id, w]) => cardById.has(id) && w > 0);

  // ── Not set up yet ────────────────────────────────────────────────────────
  if (!bonus) {
    const moveLegacy = () => {
      const entries = legacyUsable.map(([refId, weight]) => ({
        refId,
        weight: Math.min(MAX_BONUS_WEIGHT, Math.max(MIN_BONUS_WEIGHT, Math.round(weight))),
      }));
      onChange({ chancePct: DEFAULT_BONUS_CHANCE_PCT, entries });
      setOneInText(String(oneInFromPct(DEFAULT_BONUS_CHANCE_PCT) ?? ""));
    };
    return (
      <section className={panel} aria-labelledby="bonus-pull">
        <h3 id="bonus-pull" className="text-base font-black text-zinc-900 dark:text-zinc-100">
          Bonus pull
        </h3>
        {isStandard ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            The Standard Pack still uses your pullable list: a 1 in 100 chance of one extra card from {Object.keys(legacyPullable).length} pullable
            card{Object.keys(legacyPullable).length === 1 ? "" : "s"}. Move it here to change the chance and the cards, and to use the same
            bonus pull in your other packs.
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            This pack has no bonus pull. Set one up to give the pack a chance of one extra card from a list of set cards.
          </p>
        )}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {isStandard && (
              <button type="button" className={primaryBtn} onClick={moveLegacy} disabled={legacyUsable.length === 0}>
                Move my pullable cards here
              </button>
            )}
            <button
              type="button"
              className={isStandard ? secondaryBtn : primaryBtn}
              onClick={() => {
                onChange({ chancePct: DEFAULT_BONUS_CHANCE_PCT, entries: [] });
                setOneInText(String(oneInFromPct(DEFAULT_BONUS_CHANCE_PCT) ?? ""));
              }}
            >
              {isStandard ? "Start a new list" : "Set up a bonus pull"}
            </button>
          </div>
        )}
        {isStandard && legacyUsable.length === 0 && Object.keys(legacyPullable).length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">None of the pullable cards could be loaded, so there is nothing to move.</p>
        )}
        {isStandard && <p className="text-xs text-zinc-500 dark:text-zinc-400">Nothing changes for members until you save the pack.</p>}
      </section>
    );
  }

  // ── Set up ────────────────────────────────────────────────────────────────
  const setChance = (text: string) => {
    setOneInText(text);
    const n = Number(text);
    onChange({ ...bonus, chancePct: text.trim() === "" ? 0 : pctFromOneIn(n) });
  };
  const setWeight = (refId: string, value: string) => {
    const n = Math.min(MAX_BONUS_WEIGHT, Math.max(MIN_BONUS_WEIGHT, Math.round(Number(value) || MIN_BONUS_WEIGHT)));
    onChange({ ...bonus, entries: bonus.entries.map((e) => (e.refId === refId ? { ...e, weight: n } : e)) });
  };
  const remove = (refId: string) => onChange({ ...bonus, entries: bonus.entries.filter((e) => e.refId !== refId) });
  const add = (card: SetCard, variant?: EntryVariant) => {
    // A bonus card's rarity and stats are set when it is given out, so only the style and picture of a variant count here.
    const kept = variant && (variant.styleId || variant.artUrl) ? { styleId: variant.styleId, artUrl: variant.artUrl } : undefined;
    onChange({ ...bonus, entries: [...bonus.entries, { refId: card.id, weight: 10, ...(kept ? { variant: kept } : {}) }] });
    setAdding(false);
  };

  const taken = new Set(bonus.entries.map((e) => e.refId));
  const off = bonus.chancePct <= 0;
  const full = bonus.entries.length >= MAX_BONUS_ENTRIES;

  return (
    <section className={`${panel} ${off ? "opacity-80" : ""}`} aria-labelledby="bonus-pull">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="bonus-pull" className="text-base font-black text-zinc-900 dark:text-zinc-100">
          Bonus pull{" "}
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
            {off ? "off" : `${fmtPct(bonus.chancePct)} of packs get an extra card`}
          </span>
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <label htmlFor="bonus-one-in" className={labelCls}>
            Chance of a bonus card
          </label>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-300">1 in</span>
            <input
              id="bonus-one-in"
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              className={`${inputCls} !w-28 !px-2 !py-1.5`}
              value={oneInText}
              disabled={readOnly}
              onChange={(e) => setChance(e.target.value)}
              placeholder="never"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">packs. Blank means never.</span>
          </div>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          When a pack gets a bonus card it is picked from the cards below by their share. Bonus cards are given out as Legend cards with stats
          of at least 23, whatever rarity they were saved with, and their picture is never redrawn, so they cost no AI images.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        {bonus.entries.map((entry) => {
          const saved = cardById.get(entry.refId);
          // The card as this pack gives it out: with its restyled frame and redrawn picture, if any.
          const card = saved ? applyVariant(saved, entry.variant, styleById) : undefined;
          const overall = bonusEntryOverallPct(bonus, entry);
          return (
            <PreviewTile
              key={entry.refId}
              card={card ? asPulled(card) : { ...generatedPreviewCard("legend"), name: "Missing", ability: "Deleted" }}
              title={card?.name ?? "Missing"}
              subtitle={card ? `${fmtPct(overall)} of packs${entry.variant ? " · restyled" : ""}` : "Remove this card"}
              onOpen={() => {
                if (!card) return;
                if (readOnly) onOpenCard(card);
                else setEditingId(entry.refId);
              }}
            >
              <div className="flex items-center gap-1">
                <label htmlFor={`bw-${entry.refId}`} className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                  Share
                </label>
                <input
                  id={`bw-${entry.refId}`}
                  type="number"
                  min={MIN_BONUS_WEIGHT}
                  max={MAX_BONUS_WEIGHT}
                  step={1}
                  inputMode="numeric"
                  disabled={readOnly}
                  className={`${inputCls} !px-2 !py-1.5`}
                  value={entry.weight}
                  onChange={(e) => setWeight(entry.refId, e.target.value)}
                />
              </div>
              {!readOnly && (
                <button type="button" className={`${dangerBtn} !min-h-8 !px-2`} onClick={() => remove(entry.refId)}>
                  Remove
                </button>
              )}
            </PreviewTile>
          );
        })}

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setAddTab("cards");
              setAdding(true);
            }}
            disabled={full}
            className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 self-start rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
            style={{ aspectRatio: "63 / 88" }}
          >
            <span aria-hidden="true" className="text-3xl font-black">
              +
            </span>
            <span className="text-xs font-bold">{full ? "Full" : "Add card"}</span>
          </button>
        )}
      </div>

      {bonus.entries.length === 0 && !off && (
        <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
          The bonus pull has a chance but no cards. Add a card, or clear the chance.
        </p>
      )}

      {editingId &&
        (() => {
          const entry = bonus.entries.find((e) => e.refId === editingId);
          const saved = entry ? cardById.get(entry.refId) : undefined;
          if (!entry || !saved) return null;
          return (
            <EntryEditorDialog
              mode="bonus"
              tier="legend"
              saved={saved}
              variant={entry.variant}
              styles={styles}
              onApply={(variant) => {
                onChange({
                  ...bonus,
                  entries: bonus.entries.map((e) => {
                    if (e.refId !== entry.refId) return e;
                    const { variant: _old, ...rest } = e;
                    void _old;
                    return variant ? { ...rest, variant } : rest;
                  }),
                });
                setEditingId(null);
                onNotify({ text: `Updated "${saved.name}" in the bonus pull. The saved card is unchanged. Save the pack to keep your changes.` });
              }}
              onSaveAsNew={async (variant) => {
                // A bonus card keeps the rarity it was saved on; it is given out as Legend either way.
                const res = await createFinishedSetCardAction({ source: { kind: "saved", id: entry.refId }, tier: saved.tier, variant });
                if (!res.success) return res.error;
                const created = res.data.card as SetCard;
                onCardCreated(created);
                onChange({ ...bonus, entries: bonus.entries.map((e) => (e.refId === entry.refId ? { refId: created.id, weight: e.weight } : e)) });
                setEditingId(null);
                onNotify({ text: `Saved "${created.name}" as a new set card and pointed the bonus pull at it. The card it was made from is unchanged. Save the pack to keep your changes.` });
                return null;
              }}
              onClose={closeEditing}
            />
          );
        })()}

      {adding && (
        <Modal title="Add a bonus card" onClose={closeAdd}>
          <div role="tablist" aria-label="Where to pick the card from" className="inline-flex gap-1 self-start rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
            {(
              [
                ["cards", "Saved set cards"],
                ["members", "Members' cars"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={addTab === id}
                onClick={() => setAddTab(id)}
                className={`min-h-10 rounded-xl px-3.5 text-sm font-black transition-colors ${
                  addTab === id ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {addTab === "cards" ? (
            <SavedSetCardPicker
              tier="legend"
              mode="bonus"
              styles={styles}
              cards={cards.filter((c) => !taken.has(c.id))}
              onAdd={(card, variant, created) => {
                if (created) onCardCreated(card);
                add(card, variant);
                onNotify({
                  text: created
                    ? `Saved "${card.name}" as a new set card and added it to the bonus pull. Your original card is unchanged. Save the pack to keep your changes.`
                    : `Added "${card.name}" to the bonus pull${variant ? ` with ${describeVariant(variant)}` : ""}. The saved card is unchanged and no new card was saved. Save the pack to keep your changes.`,
                });
              }}
            />
          ) : (
            <MemberCarPicker
              tier="legend"
              mode="bonus"
              styles={styles}
              onImported={(card, variant) => {
                onCardCreated(card);
                add(card, variant);
                onNotify({
                  text: `Added "${card.name}" to the bonus pull. The member's car is saved as a set card once and reused if you pick it again. Save the pack to keep your changes.`,
                });
              }}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
