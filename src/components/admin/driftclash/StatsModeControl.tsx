"use client";

import { useState } from "react";
import { statTotal } from "@/lib/card-roll";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier, type EntryVariant, type StatsMode } from "@/lib/pack-config";
import {
  STAT_KEYS,
  rangeText,
  statFieldsOf,
  statsChoiceError,
  statsChoiceOf,
  type StatsChoice,
} from "@/lib/stats-choice";
import { Modal, inputCls, primaryBtn, secondaryBtn, tierLabel } from "@/components/admin/driftclash/preview";

export { defaultStatsChoice, statFieldsOf, statsChoiceError, statsChoiceOf, type StatsChoice } from "@/lib/stats-choice";

type Stats = FullArtCardData["stats"];

const LABELS: Record<(typeof STAT_KEYS)[number], string> = { drift: "Drift", accel: "Accel", grip: "Grip", steer: "Steer" };

/**
 * How a set card's stats work on one rarity of a pack: kept as saved, rolled fresh each time a member pulls the card, or
 * set by hand. Used when a card is added and again to change an entry that is already in the pack.
 */
export function StatsModeControl({
  tier,
  saved,
  value,
  onChange,
  disabled,
  name,
}: {
  tier: FullArtTier;
  /** The card as saved: its rarity and stats. */
  saved: { tier: FullArtTier; stats: Stats };
  value: StatsChoice;
  onChange: (choice: StatsChoice) => void;
  disabled?: boolean;
  /** Makes the radio group's name unique when more than one is on screen. */
  name: string;
}) {
  const keepFits = saved.tier === tier;
  const error = statsChoiceError(value, saved, tier);

  const option = (mode: StatsMode, title: string, text: string, off = false) => (
    <label
      key={mode}
      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-sm ${
        value.mode === mode ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 dark:border-zinc-700"
      } ${off ? "opacity-60" : ""}`}
    >
      <input
        type="radio"
        name={name}
        className="mt-1 h-4 w-4"
        checked={value.mode === mode}
        disabled={disabled || off}
        onChange={() => onChange({ ...value, mode })}
      />
      <span className="min-w-0">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-zinc-600 dark:text-zinc-400">{text}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900" disabled={disabled}>
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Stats on {tierLabel(tier)}</legend>

      {option(
        "keep",
        "Keep its stats",
        keepFits
          ? `DRIFT ${saved.stats.drift} · ACCEL ${saved.stats.accel} · GRIP ${saved.stats.grip} · STEER ${saved.stats.steer} (total ${statTotal(saved.stats)}). The same every pull.`
          : `Not available: it is saved as ${tierLabel(saved.tier)}, so its stats don't fit ${tierLabel(tier)}.`,
        !keepFits
      )}
      {option("reroll", "Reroll at the time of pull", `Each time a member pulls this card, its four stats are rolled fresh for ${tierLabel(tier)}.`)}
      {option("custom", "Set my own stats", `The same stats every pull, chosen by you. They must make a ${tierLabel(tier)} card (total ${rangeText(tier)}).`)}

      {value.mode === "custom" && (
        <div className="space-y-2 pl-1">
          <div className="grid grid-cols-4 gap-2">
            {STAT_KEYS.map((k) => (
              <div key={k}>
                <label htmlFor={`${name}-${k}`} className="mb-1 block text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
                  {LABELS[k]}
                </label>
                <input
                  id={`${name}-${k}`}
                  type="number"
                  min={1}
                  max={25}
                  step={1}
                  inputMode="numeric"
                  className={`${inputCls} !px-2 !py-1.5`}
                  value={value.stats[k]}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, stats: { ...value.stats, [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">Total {statTotal(value.stats)}</span>
            <button
              type="button"
              className={secondaryBtn}
              disabled={disabled}
              onClick={() => onChange({ ...value, stats: rollStatsForTier(tier, Math.random) })}
            >
              Fill with a roll for {tierLabel(tier)}
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite">
        {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </fieldset>
  );
}

/** A dialog to change the stats choice of a card that is already in a rarity. */
export function EntryStatsDialog({
  title,
  tier,
  saved,
  variant,
  onApply,
  onClose,
}: {
  title: string;
  tier: FullArtTier;
  saved: { tier: FullArtTier; stats: Stats };
  variant: EntryVariant | undefined;
  onApply: (stats: Pick<EntryVariant, "stats" | "rerollOnPull">) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<StatsChoice>(() => statsChoiceOf(variant, saved, tier));
  const error = statsChoiceError(choice, saved, tier);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <StatsModeControl tier={tier} saved={saved} value={choice} onChange={setChoice} name="entry-stats" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} disabled={Boolean(error)} onClick={() => onApply(statFieldsOf(choice))}>
            Use these stats
          </button>
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
