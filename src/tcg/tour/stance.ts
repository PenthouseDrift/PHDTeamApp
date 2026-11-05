import type { Rng } from "./rng";
import { STANCES, type Stance } from "./types";

/** attack beats hold, hold beats gamble, gamble beats attack. */
const BEATS: Record<Stance, Stance> = { attack: "hold", hold: "gamble", gamble: "attack" };

/** Who the stance triangle favours: "a", "b" or "none" on a tie. */
export function triangleWinner(a: Stance, b: Stance): "a" | "b" | "none" {
  if (a === b) return "none";
  return BEATS[a] === b ? "a" : "b";
}

/** The stance that beats the given one. */
export function counterTo(s: Stance): Stance {
  return (Object.keys(BEATS) as Stance[]).find((k) => BEATS[k] === s) ?? "hold";
}

/**
 * A bot's stance. A predictable member is gently punished: the bot leans toward the counter of the member's last
 * stance (and a little toward the one before), but it is never certain.
 */
export function botStance(history: Stance[], rng: Rng): Stance {
  const weights: Record<Stance, number> = { attack: 1, hold: 1, gamble: 1 };
  const last = history[history.length - 1];
  const before = history[history.length - 2];
  if (last) weights[counterTo(last)] += 1.2;
  if (before) weights[counterTo(before)] += 0.5;
  const total = STANCES.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const s of STANCES) {
    r -= weights[s];
    if (r <= 0) return s;
  }
  return "hold";
}

export const STANCE_LABEL: Record<Stance, string> = { attack: "Attack", hold: "Hold", gamble: "Gamble" };
export const STANCE_ICON: Record<Stance, string> = { attack: "⚔️", hold: "🛡️", gamble: "🎲" };
export const STANCE_TEXT: Record<Stance, string> = {
  attack: "Push hard on the lead. Beats Hold. Wears the car more.",
  hold: "Drive it clean and consistent. Beats Gamble.",
  gamble: "Take the risky line. Beats Attack. Scores swing up or down.",
};
