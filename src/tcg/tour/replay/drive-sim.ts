import { buildCourseTiming, RUN_SECONDS, type CourseTiming } from "./course-timing";
import { buildCourse, sampleAt, STEP, type Course } from "./track-geometry";

/**
 * The driving simulation behind a Tandem Tour Round. Pure code and fully deterministic: the same course and the same
 * steering recording always give the same drive. The browser runs it live to show you the car; the server runs it again
 * on the recording you send to work out your line accuracy, so a score is never taken on trust.
 *
 * The car drives itself forward at a fixed speed profile. You only steer it sideways. Steering pulls the car toward a
 * position on the road (full lean = 30 units to one side), a spring and damping make it settle smoothly, and every corner
 * pushes the car toward the outside, so you have to lean into corners to stay on the racing line.
 *
 * Positions are "e": the sideways offset from the middle of the road, positive to the right of the direction of travel.
 */

export const DT = 1 / 30;
export const TICKS = Math.round(RUN_SECONDS / DT);

/** Plant constants. Tuned with scripts/tour-sim.ts and the on-phone feel. */
export const KS = 7; // spring back to the middle of the lean (1/s²)
export const CD = 3; // damping (1/s)
export const KU = 210; // lean gain: full steering moves the car KU/KS = 30 units
export const KC = 3.2; // how hard a bend pushes the car outward
export const MAX_SLEW = 0.2; // most the steering can change in one tick
export const WALL_E = 38; // the wall: |e| beyond this is a hit
export const LINE_AMP = 20; // how far inside the middle the racing line goes at the apex
export const ERR_OK = 3; // within this of the line scores in full
export const ERR_MAX = 11; // this far from the line scores nothing
export const GATE_HALF = 5; // a gate is hit when the car is this close to the line
export const GATES_PER_CORNER = 5;
/** Share of a corner's accuracy that comes from staying on the line (the rest is gates). */
export const TRACK_WEIGHT = 0.6;
/** Extra distance before and after a corner that counts towards its accuracy. */
const PAD = 20;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** The racing line: where the car should be at distance `s`. Inside the bend at the apex, in the middle on the straights. */
export function idealOffset(course: Course, s: number): number {
  const p = sampleAt(course, s);
  if (p.corner < 0) return 0;
  const i = Math.max(0, Math.min(course.samples.length - 1, Math.floor(s / STEP)));
  const sample = course.samples[i];
  if (sample.arc < 0) return 0;
  return sample.turn * LINE_AMP * Math.sin(Math.PI * sample.arcU);
}

/** Everything about a course the drive needs, worked out once per tick. */
export interface DriveCourse {
  course: Course;
  timing: CourseTiming;
  /** Per tick: distance along the course, forward speed, signed curvature, racing-line offset. */
  s: Float64Array;
  v: Float64Array;
  curv: Float64Array;
  ideal: Float64Array;
  /** Per tick: which corner the tick counts towards (with padding), or -1. */
  corner: Int8Array;
  /** Per tick: the gate to judge on this tick as corner * GATES_PER_CORNER + n, or -1. */
  gate: Int16Array;
}

export function prepareDrive(sectorIds: string[]): DriveCourse {
  const course = buildCourse(sectorIds);
  const timing = buildCourseTiming(course);
  const s = new Float64Array(TICKS);
  const v = new Float64Array(TICKS);
  const curv = new Float64Array(TICKS);
  const ideal = new Float64Array(TICKS);
  const corner = new Int8Array(TICKS).fill(-1);
  const gate = new Int16Array(TICKS).fill(-1);
  for (let k = 0; k < TICKS; k++) {
    const sk = timing.sAtRun(k * DT);
    s[k] = sk;
    v[k] = timing.speedAt(sk);
    const idx = Math.max(0, Math.min(course.samples.length - 1, Math.floor(sk / STEP)));
    curv[k] = course.samples[idx].curv;
    ideal[k] = idealOffset(course, sk);
    for (const span of course.spans) {
      if (sk >= span.start - PAD && sk <= span.end + PAD) corner[k] = span.index;
    }
  }
  // Gates are spread along each corner; each is judged on the tick the car passes it.
  for (const span of course.spans) {
    for (let g = 0; g < GATES_PER_CORNER; g++) {
      const target = span.start + ((g + 0.5) / GATES_PER_CORNER) * (span.end - span.start);
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < TICKS; k++) {
        const d = Math.abs(s[k] - target);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      gate[best] = span.index * GATES_PER_CORNER + g;
    }
  }
  return { course, timing, s, v, curv, ideal, corner, gate };
}

/** The gates of a course, in order, with where each one is. */
export function gateList(dc: DriveCourse): Array<{ id: number; corner: number; tick: number; s: number; e: number }> {
  const out: Array<{ id: number; corner: number; tick: number; s: number; e: number }> = [];
  for (let k = 0; k < TICKS; k++) {
    const id = dc.gate[k];
    if (id >= 0) out.push({ id, corner: Math.floor(id / GATES_PER_CORNER), tick: k, s: dc.s[k], e: dc.ideal[k] });
  }
  return out.sort((a, b) => a.id - b.id);
}

export interface DriveStep {
  tick: number;
  e: number;
  ev: number;
  /** The steering after the rate limit, -1 to 1. */
  u: number;
  /** Distance from the racing line. */
  err: number;
  /** 1 on the line, falling to 0 far from it. */
  score: number;
  wall: boolean;
  /** Set on the tick a gate is judged: true when hit, false when missed. */
  gateHit: boolean | null;
  corner: number;
}

/** A drive in progress. The browser steps it live; the server steps it through a whole recording. */
export class Driver {
  e = 0;
  ev = 0;
  u = 0;
  tick = 0;
  walls = 0;
  readonly scoreSum = [0, 0, 0];
  readonly scoreCount = [0, 0, 0];
  readonly gatesHit = [0, 0, 0];
  readonly gatesSeen = [0, 0, 0];

  constructor(private dc: DriveCourse) {}

  get done() {
    return this.tick >= TICKS;
  }

  /** Advance one tick with the steering asked for (-1 to 1). */
  step(command: number): DriveStep {
    const k = Math.min(TICKS - 1, this.tick);
    const dc = this.dc;
    const cmd = clamp(Number.isFinite(command) ? command : 0, -1, 1);
    this.u += clamp(cmd - this.u, -MAX_SLEW, MAX_SLEW);

    const v = dc.v[k];
    const acc = KU * this.u - KC * dc.curv[k] * v * v - CD * this.ev - KS * this.e;
    this.ev += acc * DT;
    this.e += this.ev * DT;

    let wall = false;
    if (Math.abs(this.e) > WALL_E) {
      this.e = Math.sign(this.e) * WALL_E;
      this.ev *= -0.3;
      wall = true;
      this.walls++;
    }

    const err = Math.abs(this.e - dc.ideal[k]);
    const score = wall ? 0 : 1 - smoothstep((err - ERR_OK) / (ERR_MAX - ERR_OK));
    const corner = dc.corner[k];
    if (corner >= 0) {
      this.scoreSum[corner] += score;
      this.scoreCount[corner]++;
    }
    let gateHit: boolean | null = null;
    const gate = dc.gate[k];
    if (gate >= 0) {
      const c = Math.floor(gate / GATES_PER_CORNER);
      gateHit = !wall && err <= GATE_HALF;
      this.gatesSeen[c]++;
      if (gateHit) this.gatesHit[c]++;
    }
    this.tick++;
    return { tick: k, e: this.e, ev: this.ev, u: this.u, err, score, wall, gateHit, corner };
  }

  /** Line accuracy so far for each corner, 0 to 1. A corner not reached yet counts as 0. */
  accuracy(): number[] {
    return [0, 1, 2].map((c) => {
      const track = this.scoreCount[c] > 0 ? this.scoreSum[c] / this.scoreCount[c] : 0;
      const gates = this.gatesHit[c] / GATES_PER_CORNER;
      return TRACK_WEIGHT * track + (1 - TRACK_WEIGHT) * gates;
    });
  }
}

export interface DriveResult {
  accuracy: number[];
  walls: number;
  /** The car's sideways position at every tick, for drawing the drive back. */
  e: Float32Array;
}

/** Run a whole recording (one steering reading per tick, -100 to 100). Short recordings are finished with no steering. */
export function simulateDrive(dc: DriveCourse, trace: ArrayLike<number>): DriveResult {
  const driver = new Driver(dc);
  const e = new Float32Array(TICKS);
  for (let k = 0; k < TICKS; k++) {
    const raw = k < trace.length ? trace[k] : 0;
    driver.step(raw / 100);
    e[k] = driver.e;
  }
  return { accuracy: driver.accuracy(), walls: driver.walls, e };
}

// ── Recording format ────────────────────────────────────────────────────────

/** A recording as text: one signed byte per tick (-100 to 100), base64. About 800 characters for a drive. */
export function encodeTrace(trace: Int8Array): string {
  let binary = "";
  for (let i = 0; i < trace.length; i++) binary += String.fromCharCode(trace[i] & 0xff);
  return btoa(binary);
}

/** Read a recording back, or null when it is not one. Values are limited to -100 to 100. */
export function decodeTrace(text: unknown): Int8Array | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 4000) return null;
  try {
    const binary = atob(text);
    if (binary.length < TICKS - 5 || binary.length > TICKS + 5) return null;
    const out = new Int8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      const b = binary.charCodeAt(i);
      const signed = b > 127 ? b - 256 : b;
      out[i] = clamp(signed, -100, 100);
    }
    return out;
  } catch {
    return null;
  }
}
