import { tierFromStats } from "@/lib/card-roll";
import { FULL_ART_TIERS, type FullArtCardData, type FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier, variantStatsMode, type EntryVariant, type StatsMode } from "@/lib/pack-config";

/**
 * The stats choice for a set card on one rarity of a pack: keep the stats it was saved with, roll them fresh each time a
 * member pulls the card, or use stats the admin sets. Pure helpers shared by the pack editor's pickers and dialog.
 */

type Stats = FullArtCardData["stats"];

/** `stats` only counts when `mode` is "custom". */
export interface StatsChoice {
  mode: StatsMode;
  stats: Stats;
}

export const STAT_KEYS = ["drift", "accel", "grip", "steer"] as const;

const label = (t: FullArtTier) => FULL_ART_TIERS.find((x) => x.id === t)?.label ?? t;

/** The total a card needs to be of a rarity, in words. */
export function rangeText(tier: FullArtTier): string {
  switch (tier) {
    case "bronze":
      return "of 4 to 59";
    case "silver":
      return "of 60 to 74";
    case "gold":
      return "of 75 to 84";
    case "legend":
      return "of 85 to 99";
    default:
      return "of exactly 100 (25 in every stat)";
  }
}

/** The starting stats for "set my own": the card's own if they already fit the rarity, otherwise a roll that does. */
export function startingCustomStats(savedStats: Stats, tier: FullArtTier): Stats {
  return tierFromStats(savedStats) === tier ? savedStats : rollStatsForTier(tier, Math.random);
}

/** Where a card starts: keeping its stats when it is saved on this rarity, otherwise rerolled at the pull. */
export function defaultStatsChoice(saved: { tier: FullArtTier; stats: Stats }, tier: FullArtTier): StatsChoice {
  return { mode: saved.tier === tier ? "keep" : "reroll", stats: startingCustomStats(saved.stats, tier) };
}

/** The choice an existing pack entry already has. */
export function statsChoiceOf(variant: EntryVariant | undefined, saved: { tier: FullArtTier; stats: Stats }, tier: FullArtTier): StatsChoice {
  return { mode: variantStatsMode(variant), stats: variant?.stats ?? startingCustomStats(saved.stats, tier) };
}

/** The stat fields of an entry's variant for a choice. Keeping the stats sets nothing. */
export function statFieldsOf(choice: StatsChoice | null): Pick<EntryVariant, "stats" | "rerollOnPull"> {
  if (!choice || choice.mode === "keep") return {};
  return choice.mode === "reroll" ? { rerollOnPull: true } : { stats: choice.stats };
}

/** What is wrong with a choice for this rarity, or null when it can be used. */
export function statsChoiceError(choice: StatsChoice, saved: { tier: FullArtTier }, tier: FullArtTier): string | null {
  if (choice.mode === "keep" && saved.tier !== tier) {
    return `This card is saved as ${label(saved.tier)}, so it can't keep its stats on ${label(tier)}. Reroll them at the pull or set your own.`;
  }
  if (choice.mode === "custom") {
    const values = STAT_KEYS.map((k) => Number(choice.stats[k]));
    if (values.some((n) => !Number.isInteger(n) || n < 1 || n > 25)) return "Each stat must be a whole number from 1 to 25.";
    const made = tierFromStats(choice.stats);
    if (made !== tier) return `These stats make a ${label(made)} card. ${label(tier)} needs a total ${rangeText(tier)}.`;
  }
  return null;
}
