import { makeRng } from "../rng";
import { DT, Driver, KC, KS, KU, TICKS, type DriveCourse } from "./drive-sim";

/**
 * Simulated drivers of different skill, for the balance simulator and the tests. A driver looks ahead at the racing line,
 * works out the steering that holds it, and then is made worse by reaction delay, jitter and not anticipating corners.
 * Skill 1 is close to perfect; skill 0 barely steers sensibly. Nothing here ships to players.
 */

export function autopilotTrace(dc: DriveCourse, skill: number, seed: string): Int8Array {
  const rng = makeRng(`autopilot:${seed}`);
  const q = Math.max(0, Math.min(1, skill));
  const delay = Math.round(2 + (1 - q) * 14); // reaction time in ticks
  const jitter = 0.03 + 0.28 * Math.pow(1 - q, 1.5);
  const lookahead = Math.round(9 * q); // a skilled driver steers for where the line will be
  const anticipation = Math.pow(q, 1.4); // and counters the corner push before feeling it
  const gain = 0.45 + 0.5 * q;

  const driver = new Driver(dc);
  const trace = new Int8Array(TICKS);
  const history: number[] = [0, 0, 0];
  let cmd = 0;
  for (let k = 0; k < TICKS; k++) {
    // What it sees is a little old.
    const seen = history[Math.max(0, history.length - 1 - delay)] ?? 0;
    const kk = Math.min(TICKS - 1, k + lookahead);
    const target = dc.ideal[kk];
    const push = (KC * dc.curv[kk] * dc.v[kk] * dc.v[kk]) / KS;
    // Steering that would hold the target, plus a correction for the error it can see.
    const feedForward = ((target + push * anticipation) * KS) / KU;
    const feedBack = (gain * (target - seen)) / 30;
    const noise = (rng() - 0.5) * 2 * jitter;
    cmd = Math.max(-1, Math.min(1, feedForward + feedBack + noise));
    trace[k] = Math.round(cmd * 100);
    driver.step(cmd);
    history.push(driver.e);
  }
  void DT;
  return trace;
}
