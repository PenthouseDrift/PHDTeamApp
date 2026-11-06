import type { RolledTier } from "../types";

/** Label and colours for the rarity a dealt slot rolled. Written out in full so Tailwind can see the classes. */
export const ROLL_STYLE: Record<RolledTier, { label: string; chip: string; text: string }> = {
  bronze: { label: "Bronze", chip: "border-orange-500/50 bg-orange-950/70 text-orange-300", text: "text-orange-300" },
  silver: { label: "Silver", chip: "border-zinc-400/50 bg-zinc-700/60 text-zinc-100", text: "text-zinc-100" },
  gold: { label: "Gold", chip: "border-yellow-500/60 bg-yellow-950/60 text-yellow-300", text: "text-yellow-300" },
  legend: { label: "Legend", chip: "border-fuchsia-500/60 bg-fuchsia-950/60 text-fuchsia-300", text: "text-fuchsia-300" },
};
