import { makeRng } from "../rng";
import { Driver, TICKS, type DriveCourse } from "./drive-sim";

/**
 * Simulated drivers of different skill, for the balance simulator and the tests. A driver leans the car toward the bend and
 * aims for a share of the grip limit. A skilled driver aims close to the limit (more points) and holds it steadily; a
 * beginner aims low to be safe, is late to flick the car across between bends, and drifts about so much that when they do
 * push they sometimes cross the limit. Nothing here ships to players.
 *
 * Skill 1 is close to perfect; skill 0 barely manages. `limit` is the grip limit of the car being driven.
 */

export function autopilotTrace(dc: DriveCourse, skill: number, seed: string, limit: number): Int8Array {
  const rng = makeRng(`autopilot:${seed}`);
  const q = Math.max(0, Math.min(1, skill));
  // How much of the limit they dare to use.
  const aim = limit * (0.48 + 0.46 * q);
  // How late they are to flick across between bends, in ticks, and how far ahead they look.
  const lateness = Math.round((1 - q) * 9);
  const lookahead = Math.round(3 * q);
  // How much their hands wander: a slow drift plus a bit of fast noise.
  const wander = 0.04 + 0.2 * Math.pow(1 - q, 1.4);
  const noise = 0.015 + 0.06 * (1 - q);

  const driver = new Driver(dc, limit);
  const trace = new Int8Array(TICKS);
  let drift = 0;
  let held = 0; // the lean they are holding, -1 to 1
  for (let k = 0; k < TICKS; k++) {
    const want = dc.dir[Math.max(0, Math.min(TICKS - 1, k + lookahead - lateness))];
    const side = want > 0.12 ? 1 : want < -0.12 ? -1 : 0;
    drift += (rng() - 0.5) * 0.16 * wander * 3 - drift * 0.04;
    const amount = Math.max(0, aim * (1 + drift) + (rng() - 0.5) * 2 * noise * limit);
    // Moving the hand takes a moment, so the lean eases toward what they want.
    held += (side * amount - held) * (0.35 + 0.4 * q);
    const cmd = Math.max(-1, Math.min(1, held));
    trace[k] = Math.round(cmd * 100);
    driver.step(cmd);
  }
  return trace;
}
