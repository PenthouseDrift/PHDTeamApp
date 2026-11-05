import { buildCourseTiming, RUN_SECONDS, type CourseTiming } from "./course-timing";
import { buildCourse, STEP, type Course } from "./track-geometry";

/**
 * The drift simulation behind a Tandem Tour Round. Pure code and fully deterministic: the same course, the same car and the
 * same recording always give the same drive. The browser runs it live to show the car; the server runs it again on the
 * recording you send to work out your score, so a score is never taken on trust.
 *
 * The car drives the drift line by itself, perfectly. What you control is the ANGLE of the car: tilt the phone (or use the
 * arrows) toward the bend to hang the tail out. A bigger angle earns more points, but every car and set of tyres has a grip
 * limit. Near the limit the screen warns you. A little over it and the tyres heat up until a wheel bursts (more damage and a
 * moment of no control). Go well over it and the car spins into the wall (a penalty and a moment of no control). Worn tyres
 * and a low grip stat mean a lower limit, so the same angle is riskier.
 *
 * Angles are "a": -1 to 1, positive = nose to the right of the direction of travel. A right-hand bend wants a positive angle
 * and a left-hand bend wants a negative one, so on the straight between two corners you flick the car across.
 */

export const DT = 1 / 30;
export const TICKS = Math.round(RUN_SECONDS / DT);

/** The wall: the line never goes beyond this from the middle of the road (the renderer draws the barrier just outside). */
export const WALL_E = 38;

// ── The line ────────────────────────────────────────────────────────────────
export const LINE_AMP = 31; // how far from the middle the line clips the inside of a bend: 7 units off the wall
export const OUTSIDE_AMP = 29; // how close to the outside wall the line starts and ends each bend
export const SHORT_ARC = 150; // bends shorter than this clip less deeply
export const MIN_DEPTH = 0.6; // and never less than this share of LINE_AMP

// ── The car ─────────────────────────────────────────────────────────────────
export const ANGLE_LAG = 0.2; // share of the gap to the asked-for angle closed every tick (the car feels weighty, not twitchy)
export const MAX_ANGLE_SLEW = 0.1; // most the angle can change in one tick: a full flick across takes about 0.7 s

// ── Limits ──────────────────────────────────────────────────────────────────
export const WARN_AT = 0.85; // share of the limit where the screen starts to warn
export const STRESS_BASE = 0.25; // tyre heat gained per second just over the limit
export const STRESS_GAIN = 5; // and extra per second for each 1.0 (100% of the limit) over it
export const STRESS_COOL = 0.6; // heat lost per second while safely under the limit
export const BURST_LOCK = 40; // ticks of reduced control after a burst
export const WALL_LOCK = 30; // ticks of reduced control after a wall hit
export const WALL_MARGIN_MIN = 0.12; // the wall is hit this far (share of the limit) over the limit where the line is hard against the wall
export const WALL_MARGIN_RANGE = 0.14; // and up to this much further where there is room
export const GATE_ANGLE = 0.6; // a clip point needs this share of the limit to count

// ── Scoring ─────────────────────────────────────────────────────────────────
/** Share of a corner's accuracy that comes from the angle held (the rest is the clip points). */
export const TRACK_WEIGHT = 0.6;
export const GATES_PER_CORNER = 5;
export const BURST_PENALTY = 0.08; // taken off a corner's accuracy for each burst in it
export const WALL_PENALTY = 0.12; // and for each wall hit
/** Extra distance before and after a corner that counts towards its accuracy. */
const PAD = 20;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much angle the tyres can take before they start to give up, 0.42 to 0.85. Fresh tyres (condition 100) and a high grip
 * stat (0 to 25) raise it; worn tyres lower it. The server works it out from the car, never from what the browser says.
 */
export function angleLimit(condition: number, grip: number): number {
  const c = clamp(Number.isFinite(condition) ? condition / 100 : 1, 0, 1);
  const g = clamp(Number.isFinite(grip) ? grip / 25 : 0.5, 0, 1);
  return clamp(0.42 + 0.26 * c + 0.17 * g, 0.42, 0.85);
}

// ── The drift line and the way to lean ──────────────────────────────────────

interface CourseLine {
  /** Sideways offset of the line at every sample. */
  ideal: Float32Array;
  /** Which way the car should lean at every sample: -1 (left) to 1 (right), smoothly flipping between bends. */
  dir: Float32Array;
}

const lineCache = new WeakMap<Course, CourseLine>();

/**
 * The line is built from a few key points joined by smooth sweeps, like a real drift run: in from the OUTSIDE wall, clip the
 * INSIDE wall at the apex, then out to the outside wall again. On the straight between two corners it sweeps right across
 * the road to the other wall for the next entry. Where two bends join (a chicane) there is no outside point between them.
 */
function courseLine(course: Course): CourseLine {
  const cached = lineCache.get(course);
  if (cached) return cached;
  const n = course.samples.length;
  const arcs: Array<{ a: number; z: number; turn: number }> = [];
  for (let i = 0; i < n; i++) {
    const p = course.samples[i];
    if (p.arc < 0) continue;
    const last = arcs[arcs.length - 1];
    if (last && course.samples[i - 1]?.arc === p.arc) last.z = i;
    else arcs.push({ a: i, z: i, turn: p.turn });
  }

  const keys: Array<{ i: number; e: number }> = [{ i: 0, e: 0 }];
  arcs.forEach((arc, j) => {
    // A short bend (half of a chicane) has no room to swing all the way to the wall, so its line is shallower.
    const depth = clamp(((arc.z - arc.a + 1) * STEP) / SHORT_ARC, MIN_DEPTH, 1);
    const joinedBefore = j > 0 && arcs[j - 1].z + 1 === arc.a;
    const joinedAfter = j < arcs.length - 1 && arc.z + 1 === arcs[j + 1].a;
    if (!joinedBefore) keys.push({ i: arc.a, e: -arc.turn * OUTSIDE_AMP * depth });
    keys.push({ i: Math.round((arc.a + arc.z) / 2), e: arc.turn * LINE_AMP * depth });
    if (!joinedAfter) keys.push({ i: arc.z, e: -arc.turn * OUTSIDE_AMP * depth });
  });
  keys.push({ i: n - 1, e: 0 });

  const ideal = new Float32Array(n);
  for (let k = 0; k < keys.length - 1; k++) {
    const a = keys[k];
    const b = keys[k + 1];
    for (let i = a.i; i <= b.i; i++) {
      const u = b.i > a.i ? (i - a.i) / (b.i - a.i) : 1;
      ideal[i] = a.e + (b.e - a.e) * smoothstep(u);
    }
  }

  // Each stretch of road belongs to the nearest bend; the lean flips half way across the straight between two bends.
  const raw = new Float32Array(n);
  let owner = 0;
  for (let i = 0; i < n; i++) {
    while (owner < arcs.length - 1 && i > (arcs[owner].z + arcs[owner + 1].a) / 2) owner++;
    raw[i] = arcs[owner]?.turn ?? 0;
  }
  const blur = Math.max(1, Math.round(12 / STEP));
  const dir = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - blur); j <= Math.min(n - 1, i + blur); j++) {
      sum += raw[j];
      count++;
    }
    dir[i] = sum / count;
  }

  const line = { ideal, dir };
  lineCache.set(course, line);
  return line;
}

function lineAt(arr: Float32Array, s: number): number {
  const f = clamp(s / STEP, 0, arr.length - 1);
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

/** The drift line: where the car is at distance `s`. */
export function idealOffset(course: Course, s: number): number {
  return lineAt(courseLine(course).ideal, s);
}

/** Which way to lean at distance `s`: -1 (left) to 1 (right), 0 half way across a straight. */
export function leanDirection(course: Course, s: number): number {
  return lineAt(courseLine(course).dir, s);
}

/** Everything about a course the drive needs, worked out once per tick. */
export interface DriveCourse {
  course: Course;
  timing: CourseTiming;
  /** Per tick: distance along the course, forward speed, where the line is, which way to lean. */
  s: Float64Array;
  v: Float64Array;
  ideal: Float64Array;
  dir: Float64Array;
  /** Per tick: how much angle the wall leaves room for (0 hard against it, 1 in the middle of the road). */
  room: Float64Array;
  /** Per tick: how much a point is worth here. Points are worth more the closer the line runs to the wall. */
  weight: Float64Array;
  /** Per tick: which corner the tick counts towards (with padding), or -1. */
  corner: Int8Array;
  /** Per tick: the clip point to judge on this tick as corner * GATES_PER_CORNER + n, or -1. */
  gate: Int16Array;
}

export function prepareDrive(sectorIds: string[]): DriveCourse {
  const course = buildCourse(sectorIds);
  const timing = buildCourseTiming(course);
  const line = courseLine(course);
  const s = new Float64Array(TICKS);
  const v = new Float64Array(TICKS);
  const ideal = new Float64Array(TICKS);
  const dir = new Float64Array(TICKS);
  const room = new Float64Array(TICKS);
  const weight = new Float64Array(TICKS);
  const corner = new Int8Array(TICKS).fill(-1);
  const gate = new Int16Array(TICKS).fill(-1);
  for (let k = 0; k < TICKS; k++) {
    const sk = timing.sAtRun(k * DT);
    s[k] = sk;
    v[k] = timing.speedAt(sk);
    ideal[k] = lineAt(line.ideal, sk);
    dir[k] = lineAt(line.dir, sk);
    room[k] = clamp((WALL_E - Math.abs(ideal[k])) / WALL_E, 0, 1);
    weight[k] = 0.7 + 0.6 * clamp(Math.abs(ideal[k]) / WALL_E, 0, 1);
    for (const span of course.spans) {
      if (sk >= span.start - PAD && sk <= span.end + PAD) corner[k] = span.index;
    }
  }
  // Clip points are spread along each corner; each is judged on the tick the car passes it.
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
  return { course, timing, s, v, ideal, dir, room, weight, corner, gate };
}

/** The clip points of a course, in order, with where each one is. */
export function gateList(dc: DriveCourse): Array<{ id: number; corner: number; tick: number; s: number; e: number }> {
  const out: Array<{ id: number; corner: number; tick: number; s: number; e: number }> = [];
  for (let k = 0; k < TICKS; k++) {
    const id = dc.gate[k];
    if (id >= 0) out.push({ id, corner: Math.floor(id / GATES_PER_CORNER), tick: k, s: dc.s[k], e: dc.ideal[k] });
  }
  return out.sort((a, b) => a.id - b.id);
}

export type Lock = "none" | "burst" | "wall";

export interface DriveStep {
  tick: number;
  /** The car's angle after the lag, -1 to 1. */
  a: number;
  /** The angle in the way that is wanted, as a share of the limit (1 = right on the limit, negative = leaning the wrong way). */
  r: number;
  /** How good this moment was, 0 to 1. */
  value: number;
  /** Tyre heat, 0 (cool) to 1 (about to burst). */
  stress: number;
  /** 0 below the warning, 1 at the limit: drives the shake and the glow. */
  strain: number;
  burst: boolean;
  wall: boolean;
  lock: Lock;
  /** Set on the tick a clip point is judged: true when hit, false when missed. */
  gateHit: boolean | null;
  corner: number;
}

/** A drive in progress. The browser steps it live; the server steps it through a whole recording. */
export class Driver {
  a = 0;
  tick = 0;
  stress = 0;
  lockTicks = 0;
  lockKind: Lock = "none";
  walls = 0;
  bursts = 0;
  readonly scoreSum = [0, 0, 0];
  readonly weightSum = [0, 0, 0];
  readonly gatesHit = [0, 0, 0];
  readonly gatesSeen = [0, 0, 0];
  readonly wallsIn = [0, 0, 0];
  readonly burstsIn = [0, 0, 0];

  /** `limit` is the grip limit for this car and its tyres (see `angleLimit`). */
  constructor(private dc: DriveCourse, readonly limit: number) {}

  get done() {
    return this.tick >= TICKS;
  }

  /** Advance one tick with the angle asked for (-1 to 1). */
  step(command: number): DriveStep {
    const k = Math.min(TICKS - 1, this.tick);
    const dc = this.dc;
    const cmd = clamp(Number.isFinite(command) ? command : 0, -1, 1);
    const locked = this.lockTicks > 0;
    const lockKind = locked ? this.lockKind : "none";
    if (locked) {
      this.lockTicks--;
      if (this.lockTicks === 0) this.lockKind = "none";
    }

    // The car follows the asked-for angle with some weight to it. After a burst or a wall hit it hardly responds.
    const asked = locked ? cmd * (lockKind === "burst" ? 0.25 : 0.1) : cmd;
    this.a += clamp((asked - this.a) * ANGLE_LAG, -MAX_ANGLE_SLEW, MAX_ANGLE_SLEW);

    const limit = this.limit;
    const aligned = this.a * dc.dir[k];
    const r = aligned / limit;
    const value = locked ? 0 : Math.pow(clamp(r, 0, 1), 1.3);

    // Heat builds over the limit and drains under it. A wheel bursts when it is full.
    let burst = false;
    let wall = false;
    if (locked) {
      this.stress = Math.max(0, this.stress - 1.5 * DT);
    } else {
      if (r > 1) this.stress += (STRESS_BASE + STRESS_GAIN * (r - 1)) * DT;
      else if (r < 0.95) this.stress = Math.max(0, this.stress - STRESS_COOL * DT);
      const hard = limit + WALL_MARGIN_MIN + WALL_MARGIN_RANGE * dc.room[k];
      if (aligned > hard) {
        wall = true;
        this.walls++;
        this.lockTicks = WALL_LOCK;
        this.lockKind = "wall";
        this.stress = 0;
      } else if (this.stress >= 1) {
        burst = true;
        this.bursts++;
        this.lockTicks = BURST_LOCK;
        this.lockKind = "burst";
        this.stress = 0;
      }
    }

    const corner = dc.corner[k];
    if (corner >= 0) {
      this.scoreSum[corner] += dc.weight[k] * value;
      this.weightSum[corner] += dc.weight[k];
      if (wall) this.wallsIn[corner]++;
      if (burst) this.burstsIn[corner]++;
    }
    let gateHit: boolean | null = null;
    const gate = dc.gate[k];
    if (gate >= 0) {
      const c = Math.floor(gate / GATES_PER_CORNER);
      gateHit = !locked && !wall && !burst && r >= GATE_ANGLE;
      this.gatesSeen[c]++;
      if (gateHit) this.gatesHit[c]++;
    }

    const strain = clamp((r - WARN_AT) / (1 - WARN_AT), 0, 1);
    const shown: Lock = wall ? "wall" : burst ? "burst" : lockKind;
    this.tick++;
    return { tick: k, a: this.a, r, value, stress: this.stress, strain, burst, wall, lock: shown, gateHit, corner };
  }

  /** Accuracy so far for one corner, 0 to 1. `done` counts clip points not reached yet as misses (the final figure). */
  cornerAccuracy(c: number, done = true, unseen = 0.5): number {
    const track = this.weightSum[c] > 0 ? this.scoreSum[c] / this.weightSum[c] : done ? 0 : unseen;
    const seen = done ? GATES_PER_CORNER : this.gatesSeen[c];
    const gates = seen > 0 ? this.gatesHit[c] / seen : done ? 0 : track;
    const raw = TRACK_WEIGHT * track + (1 - TRACK_WEIGHT) * gates - BURST_PENALTY * this.burstsIn[c] - WALL_PENALTY * this.wallsIn[c];
    return clamp(raw, 0, 1);
  }

  /** Final accuracy for each corner, 0 to 1. A corner not reached yet counts as 0. */
  accuracy(): number[] {
    return [0, 1, 2].map((c) => this.cornerAccuracy(c));
  }
}

export interface DriveResult {
  accuracy: number[];
  walls: number;
  bursts: number;
  /** The car's angle at every tick, for drawing the drive back. */
  angle: Float32Array;
}

/** Run a whole recording (one reading per tick, -100 to 100). Short recordings are finished with the car straight. */
export function simulateDrive(dc: DriveCourse, trace: ArrayLike<number>, limit: number): DriveResult {
  const driver = new Driver(dc, limit);
  const angle = new Float32Array(TICKS);
  for (let k = 0; k < TICKS; k++) {
    const raw = k < trace.length ? trace[k] : 0;
    driver.step(raw / 100);
    angle[k] = driver.a;
  }
  return { accuracy: driver.accuracy(), walls: driver.walls, bursts: driver.bursts, angle };
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
