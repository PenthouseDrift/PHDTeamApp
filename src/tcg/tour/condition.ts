import type { Stance, TourConfig } from "./types";

/**
 * Condition: how worn a car is during a Tour (0 to 100). It only lives in the Tour. A real card's durability
 * and faults are never touched.
 */

export const MAX_CONDITION = 100;

export const clampCondition = (c: number) => Math.max(0, Math.min(MAX_CONDITION, Math.round(c)));

/** The score multiplier for a car at this condition: the floor at 0, 1 at 100. */
export function conditionMultiplier(condition: number, config: Pick<TourConfig, "tuning">): number {
  const floor = config.tuning.conditionFloorMultiplier;
  return floor + (1 - floor) * (clampCondition(condition) / MAX_CONDITION);
}

/** Condition lost by the car that drove a Round. Attack wears more; `reduce` is from wear-saving upgrades. */
export function wearFor(stance: Stance, config: Pick<TourConfig, "tuning">, reduce = 0): number {
  const base = config.tuning.wearBase + (stance === "attack" ? config.tuning.wearAttack : 0);
  return Math.max(0, base - Math.max(0, reduce));
}

/** Condition a repair kit gives back, by the kit card's rarity. */
export function repairAmount(tier: string, config: Pick<TourConfig, "tuning">): number {
  const table = config.tuning.repairByRarity;
  return (table as Record<string, number>)[tier] ?? table.bronze;
}
