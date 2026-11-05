import { STEP, type Course, type CornerShape } from "./track-geometry";

/**
 * How the cars move along a course over time. The car drives itself forward at a fixed speed profile (slower through
 * corners), so where it is along the course depends only on the clock, never on the driver. Only the sideways position
 * is steered. Pure code, shared by the browser and the server.
 */

/** Seconds of the run itself (after any countdown). */
export const RUN_SECONDS = 20;

/** How fast the cars go through each kind of corner, compared with a straight (1). */
const SPEED: Record<CornerShape, number> = { sweeper: 0.78, hairpin: 0.58, chicane: 0.7, kink: 0.92, longEntry: 0.85 };

export interface CourseTiming {
  /** Seconds into the run at which the pack reaches distance `s`. */
  runTimeAtS(s: number): number;
  /** Distance along the course after `tau` seconds of the run. */
  sAtRun(tau: number): number;
  /** Forward speed in units per second at distance `s`. */
  speedAt(s: number): number;
}

export function buildCourseTiming(course: Course): CourseTiming {
  const n = course.samples.length;
  const weight = (i: number) => {
    const c = course.samples[Math.max(0, Math.min(n - 1, i))].corner;
    return c >= 0 ? SPEED[course.spans[c].shape] : 1;
  };
  // cum[i] is the (unscaled) time to reach sample i.
  const cum = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + STEP / weight(i - 1);
  const startIdx = Math.round(course.startS / STEP);
  const finishIdx = Math.min(n - 1, Math.round(course.finishS / STEP));
  const base = cum[startIdx];
  const scale = RUN_SECONDS / (cum[finishIdx] - base);

  const runTimeAtS = (s: number): number => {
    const f = Math.max(0, Math.min(n - 1, s / STEP));
    const i = Math.floor(f);
    const c = cum[i] + (cum[Math.min(n - 1, i + 1)] - cum[i]) * (f - i);
    return (c - base) * scale;
  };
  const sAtRun = (tau: number): number => {
    const target = tau / scale + base;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = cum[i] - cum[i - 1] || 1;
    return (i - 1 + (target - cum[i - 1]) / span) * STEP;
  };
  const speedAt = (s: number): number => weight(Math.floor(s / STEP)) / scale;
  return { runTimeAtS, sAtRun, speedAt };
}
