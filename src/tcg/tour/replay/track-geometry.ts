/**
 * Track geometry for the Tandem Tour replay. Pure code.
 *
 * Each of the 26 corner types is drawn as one of six corner shapes. A course is a lead-in, the three rolled corners
 * joined by short straights, and a run-out. It is built with "turtle" steps (go straight, or turn along an arc) and
 * sampled every few units, so the cars can be placed at any distance along it. Corners alternate left and right so the
 * course winds across the screen instead of spiralling.
 */

export type CornerShape = "sweeper" | "hairpin" | "chicane" | "kink" | "longEntry";

/** Which shape each corner type is drawn as. Unknown ids fall back to a sweeper. */
export const SHAPE_BY_SECTOR: Record<string, CornerShape> = {
  entry: "longEntry", chase: "longEntry", slingshot: "longEntry", fullsend: "longEntry", launch: "longEntry",
  hairpin: "hairpin", roundabout: "hairpin", gravel: "hairpin", freestyle: "hairpin",
  sweeper: "sweeper", banked: "sweeper", smooth: "sweeper", roads: "sweeper", wallride: "sweeper", showpiece: "sweeper", judges: "sweeper",
  esses: "chicane", pendulum: "chicane", slalom: "chicane", technical: "chicane", infield: "chicane", gauntlet: "chicane", rhythm: "chicane",
  downhill: "kink", pitdash: "kink", gate: "kink",
};

/** The distance between samples, in world units. */
export const STEP = 4;
export const ROAD_WIDTH = 56;

type Cmd = { kind: "line"; length: number } | { kind: "arc"; radius: number; degrees: number };

const SHAPES: Record<CornerShape, Cmd[]> = {
  sweeper: [{ kind: "arc", radius: 150, degrees: 90 }],
  hairpin: [{ kind: "arc", radius: 72, degrees: 180 }],
  chicane: [
    { kind: "arc", radius: 105, degrees: 45 },
    { kind: "arc", radius: 105, degrees: -90 },
    { kind: "arc", radius: 105, degrees: 45 },
  ],
  kink: [
    { kind: "arc", radius: 210, degrees: 32 },
    { kind: "arc", radius: 210, degrees: -32 },
  ],
  longEntry: [
    { kind: "line", length: 100 },
    { kind: "arc", radius: 120, degrees: 100 },
  ],
};

export interface CourseSample {
  x: number;
  y: number;
  /** Direction of travel, in radians (0 = east, y grows downward). */
  h: number;
  /** Distance from the start. */
  s: number;
  /** Which corner this sample is in (0 to 2), or -1 on a straight. */
  corner: number;
  /** Turning direction here: +1 turning one way, -1 the other, 0 straight. */
  turn: number;
  /** Which bend this is (each arc of a chicane counts separately), or -1 on a straight. */
  arc: number;
  /** How far through that bend, 0 to 1. */
  arcU: number;
  /** Signed curvature: turn divided by the bend's radius (0 on a straight). */
  curv: number;
}

export interface CornerSpan {
  index: number;
  shape: CornerShape;
  start: number;
  mid: number;
  end: number;
}

export interface Course {
  samples: CourseSample[];
  length: number;
  spans: CornerSpan[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Where the cars line up and where the finish line is, as distances along the course. */
  startS: number;
  finishS: number;
}

export function shapeFor(sectorId: string): CornerShape {
  return SHAPE_BY_SECTOR[sectorId] ?? "sweeper";
}

/** Build the course for three corner ids. */
export function buildCourse(sectorIds: string[]): Course {
  const samples: CourseSample[] = [];
  const spans: CornerSpan[] = [];
  let x = 0;
  let y = 0;
  let h = 0;
  let s = 0;

  let arcCount = 0;
  const push = (corner: number, turn: number, arcId = -1, arcU = 0, curv = 0) =>
    samples.push({ x, y, h, s, corner, turn, arc: arcId, arcU, curv });
  const line = (length: number, corner: number) => {
    const n = Math.max(1, Math.round(length / STEP));
    for (let i = 0; i < n; i++) {
      push(corner, 0);
      x += Math.cos(h) * STEP;
      y += Math.sin(h) * STEP;
      s += STEP;
    }
  };
  const arc = (radius: number, degrees: number, corner: number) => {
    const total = (Math.abs(degrees) * Math.PI) / 180;
    const n = Math.max(2, Math.round((total * radius) / STEP));
    const dh = (Math.sign(degrees) * total) / n;
    const arcId = arcCount++;
    for (let i = 0; i < n; i++) {
      push(corner, Math.sign(degrees), arcId, n > 1 ? i / (n - 1) : 0, Math.sign(degrees) / radius);
      h += dh / 2;
      x += Math.cos(h) * STEP;
      y += Math.sin(h) * STEP;
      h += dh / 2;
      s += STEP;
    }
  };

  line(150, -1);
  const startS = 24;
  for (let i = 0; i < 3; i++) {
    const shape = shapeFor(sectorIds[i] ?? "sweeper");
    const flip = i % 2 === 0 ? 1 : -1;
    const startIdx = samples.length;
    for (const cmd of SHAPES[shape]) {
      if (cmd.kind === "line") line(cmd.length, i);
      else arc(cmd.radius, cmd.degrees * flip, i);
    }
    const endIdx = samples.length;
    spans.push({ index: i, shape, start: samples[startIdx].s, mid: samples[Math.floor((startIdx + endIdx) / 2)].s, end: samples[endIdx - 1].s });
    if (i < 2) line(90, -1);
  }
  line(170, -1);
  push(-1, 0);

  const xs = samples.map((p) => p.x);
  const ys = samples.map((p) => p.y);
  return {
    samples,
    length: s,
    spans,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    startS,
    finishS: s - 40,
  };
}

/** The sample at distance `s` along the course, with the position and direction blended between neighbours. */
export function sampleAt(course: Course, s: number): { x: number; y: number; h: number; corner: number; turn: number } {
  const clamped = Math.max(0, Math.min(course.length - STEP, s));
  const f = clamped / STEP;
  const i = Math.floor(f);
  const a = course.samples[i];
  const b = course.samples[Math.min(course.samples.length - 1, i + 1)];
  const t = f - i;
  // Directions are blended along the shortest way round.
  let dh = b.h - a.h;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, h: a.h + dh * t, corner: a.corner, turn: a.turn };
}
