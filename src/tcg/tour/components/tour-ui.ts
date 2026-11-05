import type { FullArtTier } from "@/lib/full-art-card";

/** Shared look for the Tandem Tour screens, matching the rest of the card game. */

export const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
export const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";
export const pill = "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
export const heading = "text-base font-black text-zinc-900 dark:text-zinc-100";
export const muted = "text-xs text-zinc-500 dark:text-zinc-400";

export const TIER_TEXT: Record<FullArtTier, string> = {
  bronze: "text-orange-600 dark:text-orange-400",
  silver: "text-zinc-500 dark:text-zinc-300",
  gold: "text-yellow-600 dark:text-yellow-400",
  legend: "text-fuchsia-600 dark:text-fuchsia-400",
  mythic: "text-rose-600 dark:text-rose-400",
};

export const CATEGORY_LABEL = {
  tuning: "Tuning",
  crew_call: "Crew call",
  track_intel: "Track intel",
  pit_stop: "Pit stop",
  sponsor: "Sponsor",
} as const;

export const RARITY_STYLE = {
  common: "border-zinc-300 dark:border-zinc-700",
  rare: "border-sky-400 dark:border-sky-500",
  epic: "border-fuchsia-500",
} as const;

/** Condition bar colour. */
export function conditionColour(c: number): string {
  if (c >= 70) return "bg-emerald-500";
  if (c >= 40) return "bg-amber-500";
  return "bg-rose-500";
}
