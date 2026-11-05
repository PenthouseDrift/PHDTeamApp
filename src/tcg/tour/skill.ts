/**
 * How driving skill changes a score. Pure and tiny, so the server (which decides the result) and the browser (which shows the
 * running pace while you drive) use exactly the same rule.
 *
 * The pivot accuracy changes nothing; an accuracy of 1 adds `swing` (0.2 = +20%) and an accuracy of 0 takes `swing` off.
 */
export function skillMultiplierFor(accuracy: number, swing: number, pivot: number): number {
  const a = Math.max(0, Math.min(1, accuracy));
  const raw = a >= pivot ? (a - pivot) / (1 - pivot) : (a - pivot) / pivot;
  return 1 + swing * raw;
}
