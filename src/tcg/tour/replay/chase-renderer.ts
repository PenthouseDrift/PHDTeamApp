import { makeRng, type Rng } from "../rng";
import { WALL_E, WARN_AT, idealOffset, type Lock } from "./drive-sim";
import type { Theme } from "./theme";
import { hashString } from "./theme";
import { sampleAt, STEP, type Course } from "./track-geometry";

/**
 * Behind-the-car view of a Tandem Tour drive, drawn with Canvas 2D. No images and no 3D library: the road is the real
 * course geometry projected strip by strip (the same trick old arcade racers used), and the car is a small low-poly model
 * seen from behind, built from a few dozen faces and tinted with the colour of the member's chosen card.
 *
 * It only draws. Where the car is, how well it is lined up and what it scores all come from the drive simulation.
 */

/** What the renderer needs to know about the track and the car. */
export interface ChaseScene {
  course: Course;
  theme: Theme;
  rivalKind: "ghost" | "bot";
  names: { player: string; rival: string };
  /** Body colour of the member's car, "#rrggbb". Can be changed later with `setCarColour`. */
  carColour: string;
}

/**
 * One frame of a live drive. The car sits on the drift line: `s` is the distance along the course and `e` the sideways offset
 * of the line there. What the player controls is `angle`, how far the car hangs sideways (-1 to 1, positive = nose to the right).
 */
export interface DriveView {
  player: { s: number; e: number; angle: number; speed: number };
  gates: Array<{ s: number; e: number; state: "upcoming" | "hit" | "miss" }>;
  hud: {
    playerPoints: number;
    rivalPoints: number;
    accuracy: number;
    streak: number;
    progress: number;
    cornerIndex: number;
    /** The angle the car has now and the most its tyres can take (both 0 to 1). */
    angle: number;
    limit: number;
    /** Which way to lean here: -1 (left) to 1 (right), 0 half way across a straight. */
    lean: number;
    /** 0 well inside the limit, 1 at the limit: shakes and glows the screen. */
    strain: number;
    /** Tyre heat, 0 to 1. At 1 a wheel bursts. */
    stress: number;
    lock: Lock;
    countdown: number | null;
    banner: { text: string; tone: "good" | "bad" | "neutral"; age: number } | null;
    wallFlash: number;
    burstFlash: number;
    /** Tyre condition, 0 to 100, shown beside the gauge. */
    tyres: number;
    /** What the angle is worth right now, 1 (no angle) to 4 (right at the limit). 1 while out of control. */
    multiplier: number;
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

const CAM_BACK = 52; // how far behind the car the camera sits, along the road
const NEAR = 10; // nothing nearer than this is drawn
const MIN_Z = 4; // a road edge nearer than this (a sharp bend beside the camera) is skipped, not stretched across the screen
const SEGMENTS = 72; // how many 4-unit strips of road ahead are drawn
const ROAD_E = WALL_E; // the tarmac runs this far either side of the middle
const BARRIER_E = 46; // the barrier stands here, just outside the kerb
const BARRIER_H = 7;
const MAX_PARTICLES = 140;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// ── Colour helpers ──────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [245, 158, 11];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken (f < 1) or lighten (f > 1) a colour. */
function tint(rgb: [number, number, number], f: number): string {
  const mix = (c: number) => Math.round(f <= 1 ? c * f : c + (255 - c) * (f - 1));
  return `rgb(${mix(rgb[0])},${mix(rgb[1])},${mix(rgb[2])})`;
}

// ── The car model ───────────────────────────────────────────────────────────
// Local axes: x forward, y to the right, z up. About 36 units long, 17 wide.

type V3 = [number, number, number];
type Kind = "top" | "side" | "rear" | "front" | "roof" | "glass" | "rearGlass" | "wing" | "wingTop" | "dark" | "tyre" | "light";

interface Face {
  pts: V3[];
  kind: Kind;
  centre: V3;
  normal: V3;
}

const MODEL_CENTRE: V3 = [0, 0, 4.5];

function makeFace(pts: V3[], kind: Kind): Face {
  const centre: V3 = [0, 0, 0];
  for (const p of pts) {
    centre[0] += p[0] / pts.length;
    centre[1] += p[1] / pts.length;
    centre[2] += p[2] / pts.length;
  }
  const a: V3 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
  const b: V3 = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1], pts[pts.length - 1][2] - pts[0][2]];
  let n: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / len, n[1] / len, n[2] / len];
  // Point the normal away from the middle of the car.
  const out = n[0] * (centre[0] - MODEL_CENTRE[0]) + n[1] * (centre[1] - MODEL_CENTRE[1]) + n[2] * (centre[2] - MODEL_CENTRE[2]);
  if (out < 0) n = [-n[0], -n[1], -n[2]];
  return { pts, kind, centre, normal: n };
}

function boxFaces(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, kinds: Partial<Record<"front" | "rear" | "side" | "top", Kind>>): Face[] {
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  const k = { front: kinds.front ?? "dark", rear: kinds.rear ?? "dark", side: kinds.side ?? "dark", top: kinds.top ?? "dark" };
  return [
    makeFace([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], k.front),
    makeFace([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], k.rear),
    makeFace([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], k.side),
    makeFace([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], k.side),
    makeFace([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], k.top),
  ];
}

interface Section {
  x: number;
  w: number;
  z0: number;
  z1: number;
}

function loftFaces(sections: Section[], topKinds: Kind[], sideKind: Kind, capRear: Kind | null, capFront: Kind | null): Face[] {
  const faces: Face[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    faces.push(makeFace([[a.x, -a.w, a.z1], [a.x, a.w, a.z1], [b.x, b.w, b.z1], [b.x, -b.w, b.z1]], topKinds[i] ?? topKinds[topKinds.length - 1]));
    faces.push(makeFace([[a.x, a.w, a.z0], [b.x, b.w, b.z0], [b.x, b.w, b.z1], [a.x, a.w, a.z1]], sideKind));
    faces.push(makeFace([[a.x, -a.w, a.z0], [b.x, -b.w, b.z0], [b.x, -b.w, b.z1], [a.x, -a.w, a.z1]], sideKind));
  }
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (capRear) faces.push(makeFace([[first.x, -first.w, first.z0], [first.x, first.w, first.z0], [first.x, first.w, first.z1], [first.x, -first.w, first.z1]], capRear));
  if (capFront) faces.push(makeFace([[last.x, -last.w, last.z0], [last.x, last.w, last.z0], [last.x, last.w, last.z1], [last.x, -last.w, last.z1]], capFront));
  return faces;
}

function buildCarModel(): Face[] {
  const faces: Face[] = [];
  // Body: a low wedge, widest over the rear wheels.
  faces.push(
    ...loftFaces(
      [
        { x: -18, w: 7.8, z0: 1.8, z1: 5.0 },
        { x: -13, w: 8.5, z0: 1.8, z1: 6.2 },
        { x: -3, w: 8.6, z0: 1.8, z1: 6.6 },
        { x: 9, w: 8.0, z0: 1.8, z1: 6.0 },
        { x: 18, w: 6.8, z0: 1.8, z1: 4.0 },
      ],
      ["top"],
      "side",
      "rear",
      "front"
    )
  );
  // Cabin: sloping rear glass, roof, windscreen.
  faces.push(
    ...loftFaces(
      [
        { x: -11, w: 6.6, z0: 6.5, z1: 6.6 },
        { x: -6.5, w: 6.0, z0: 6.5, z1: 9.4 },
        { x: 1.5, w: 5.8, z0: 6.7, z1: 9.6 },
        { x: 7.5, w: 5.4, z0: 6.7, z1: 6.9 },
      ],
      ["rearGlass", "roof", "glass"],
      "glass",
      null,
      null
    )
  );
  // Wing on two posts.
  faces.push(...boxFaces(-17.4, 0, 9.0, 1.6, 9.2, 0.4, { rear: "wing", front: "wing", side: "wing", top: "wingTop" }));
  faces.push(...boxFaces(-16.6, 5.5, 7.4, 0.5, 0.5, 1.6, { rear: "dark", front: "dark", side: "dark", top: "dark" }));
  faces.push(...boxFaces(-16.6, -5.5, 7.4, 0.5, 0.5, 1.6, { rear: "dark", front: "dark", side: "dark", top: "dark" }));
  // Wheels.
  for (const x of [-11.5, 11.5]) {
    for (const y of [-8.7, 8.7]) faces.push(...boxFaces(x, y, 3.8, 4.2, 1.5, 3.8, { front: "tyre", rear: "tyre", side: "tyre", top: "tyre" }));
  }
  // Tail lights, just proud of the back of the body.
  for (const side of [-1, 1]) {
    faces.push(makeFace([[-18.15, side * 2.6, 3.0], [-18.15, side * 7.4, 3.0], [-18.15, side * 7.4, 4.4], [-18.15, side * 2.6, 4.4]], "light"));
  }
  return faces;
}

const CAR_MODEL = buildCarModel();

// ── Particles ───────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  up: number;
  vx: number;
  vy: number;
  vup: number;
  age: number;
  life: number;
  size: number;
  spark: boolean;
  dark: boolean;
}

interface Pt {
  i: number;
  s: number;
  xc: number;
  zc: number;
  cd: number;
  sd: number;
}

export class ChaseRenderer {
  private ctx: CanvasRenderingContext2D;
  private size = { w: 300, h: 300, dpr: 1 };
  private particles: Particle[] = [];
  private rng: Rng;
  private quality = 1;
  private cam = { yaw: 0, e: 0, ready: false };
  private carRgb: [number, number, number];

  constructor(private canvas: HTMLCanvasElement, private scene: ChaseScene, seed: string) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    this.ctx = ctx;
    this.rng = makeRng(`chase:${seed}`);
    this.carRgb = parseHex(scene.carColour);
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.size = { w: cssWidth, h: cssHeight, dpr };
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
  }

  /** Lower the quality when frames are slow (1 = full, down to 0.25). */
  setQuality(q: number) {
    this.quality = clamp(q, 0.25, 1);
  }

  setCarColour(hex: string) {
    this.carRgb = parseHex(hex);
  }

  reset() {
    this.particles = [];
    this.cam.ready = false;
  }

  destroy() {
    this.particles = [];
  }

  // ── A frame ──────────────────────────────────────────────────────────────

  renderDrive(view: DriveView, dtSeconds: number) {
    const { ctx, size, scene } = this;
    const { course, theme } = scene;
    const { w, h, dpr } = size;
    const dt = clamp(dtSeconds, 0, 0.1);
    const p = view.player;

    // The car: on the drift line, with its body turned by the angle the player is holding.
    const hudNow = view.hud;
    const slip = clamp(p.angle, -1, 1) * 0.85;
    const carPos = sampleAt(course, p.s);
    const carX = carPos.x - Math.sin(carPos.h) * p.e;
    const carY = carPos.y + Math.cos(carPos.h) * p.e;
    const pathYaw = Math.atan2(idealOffset(course, p.s + 6) - idealOffset(course, p.s - 6), 12);
    const carHeading = carPos.h + pathYaw + slip;
    // Smoke only when the tail is out the way the bend wants it.
    const drift = clamp(Math.abs(slip) / 0.5, 0, 1) * (Math.sign(slip) === Math.sign(hudNow.lean) ? 1 : 0.3);

    // The camera: behind the car, a little over to its side, looking slightly into the bend.
    const sCam = Math.max(0, p.s - CAM_BACK);
    const base = sampleAt(course, sCam);
    const ahead = sampleAt(course, sCam + 80);
    const yawTarget = base.h + 0.3 * (ahead.h - base.h) + 0.22 * slip;
    const eTarget = p.e * 0.55;
    if (!this.cam.ready) {
      this.cam = { yaw: yawTarget, e: eTarget, ready: true };
    } else {
      this.cam.yaw += (yawTarget - this.cam.yaw) * (1 - Math.exp(-dt * 7));
      this.cam.e += (eTarget - this.cam.e) * (1 - Math.exp(-dt * 9));
    }
    const yaw = this.cam.yaw;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const camX = base.x - Math.sin(base.h) * this.cam.e;
    const camY = base.y + Math.cos(base.h) * this.cam.e;

    // Screen layout. The horizon sits high and the camera height is chosen so the car lands low on the screen.
    const hz = Math.round(h * 0.4);
    const F = Math.min(w * 0.46, h * 0.7);
    // The back of the car (18 units nearer than its middle) should land low on the screen, which sets the camera height.
    const H = clamp(((h * 0.86 - hz) * (CAM_BACK - 18)) / F, 20, 64);
    const cx = w / 2;

    // The screen shakes harder the closer the tyres are to their limit, and a lot after a wall hit or a burst.
    const shake = Math.max(hudNow.wallFlash * 7, hudNow.burstFlash * 6, hudNow.strain * hudNow.strain * 2.4 + hudNow.stress * 3);
    const ox = shake ? (this.rng() - 0.5) * shake : 0;
    const oy = shake ? (this.rng() - 0.5) * shake : 0;
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    this.drawSky(yaw, cx, hz, F, w, h);

    // ── The road ──
    const pts: Pt[] = [];
    const i0 = Math.floor((sCam + NEAR) / STEP);
    const last = course.samples.length - 1;
    let prevZ = 0;
    for (let i = i0; i <= Math.min(last, i0 + SEGMENTS); i++) {
      const sm = course.samples[i];
      const dx = sm.x - camX;
      const dy = sm.y - camY;
      const zc = dx * cosY + dy * sinY;
      // Stop where the road swings round behind the camera.
      if (zc < 2 || zc < prevZ - 0.01) break;
      prevZ = zc;
      const d = sm.h - yaw;
      pts.push({ i, s: sm.s, xc: -dx * sinY + dy * cosY, zc, cd: Math.cos(d), sd: Math.sin(d) });
    }
    const sx = (q: Pt, e: number) => cx + (F * (q.xc + e * q.cd)) / Math.max(1.5, q.zc - e * q.sd);
    const sy = (q: Pt, e: number, up = 0) => hz + (F * (H - up)) / Math.max(1.5, q.zc - e * q.sd);
    const zAt = (q: Pt, e: number) => q.zc - e * q.sd;
    const quad = (a: Pt, e0: number, e1: number, b: Pt, fill: string) => {
      if (zAt(a, e0) < MIN_Z || zAt(a, e1) < MIN_Z) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(sx(a, e0), sy(a, e0));
      ctx.lineTo(sx(a, e1), sy(a, e1));
      ctx.lineTo(sx(b, e1), sy(b, e1));
      ctx.lineTo(sx(b, e0), sy(b, e0));
      ctx.closePath();
      ctx.fill();
    };

    // Gates by the strip they belong to.
    const gatesByIdx = new Map<number, DriveView["gates"]>();
    for (const g of view.gates) {
      const gi = Math.round(g.s / STEP);
      if (gi < i0 || gi > i0 + SEGMENTS) continue;
      const list = gatesByIdx.get(gi);
      if (list) list.push(g);
      else gatesByIdx.set(gi, [g]);
    }
    const finishIdx = Math.round(course.finishS / STEP);
    const startIdx = Math.round((course.startS + 8) / STEP);

    // The grass goes down first, as flat bands, so a band can never cut into the road of a strip farther away.
    for (let k = pts.length - 2; k >= 0; k--) {
      const yA = sy(pts[k], 0);
      const yB = sy(pts[k + 1], 0);
      ctx.fillStyle = Math.floor(pts[k].i / 5) % 2 ? theme.grass : theme.grassDark;
      ctx.fillRect(0, yB, w, Math.max(1, yA - yB + 1));
    }

    for (let k = pts.length - 2; k >= 0; k--) {
      const a = pts[k];
      const b = pts[k + 1];
      const band = Math.floor(a.i / 5) % 2;

      quad(a, -ROAD_E, ROAD_E, b, band ? theme.road : theme.roadDark);
      // Kerbs: the last few units before the wall.
      const kerb = Math.floor(a.i / 2) % 2 ? "#dc2626" : "#f4f4f5";
      quad(a, ROAD_E, BARRIER_E, b, kerb);
      quad(a, -BARRIER_E, -ROAD_E, b, kerb);
      // Edge lines and the dashed middle.
      quad(a, ROAD_E - 4.4, ROAD_E - 3.4, b, "rgba(255,255,255,0.5)");
      quad(a, -ROAD_E + 3.4, -ROAD_E + 4.4, b, "rgba(255,255,255,0.5)");
      if (a.i % 6 < 3) quad(a, -0.9, 0.9, b, "rgba(255,255,255,0.45)");

      if (a.i === finishIdx || a.i === startIdx) {
        for (let c = 0; c < 8; c++) {
          const e0 = -ROAD_E + (c * 2 * ROAD_E) / 8;
          quad(a, e0, e0 + (2 * ROAD_E) / 8, b, (c + a.i) % 2 ? "#fafafa" : "#18181b");
        }
      }

      // The drift line, a dashed ribbon on the road ahead of the car.
      if (a.s >= p.s - 6) {
        const fade = clamp(1.15 - a.zc / 300, 0.15, 1);
        const ea = idealOffset(course, a.s);
        const eb = idealOffset(course, b.s);
        ctx.globalAlpha = 0.2 * fade;
        quadSkew(ctx, sx, sy, a, ea - 6.5, ea + 6.5, b, eb - 6.5, eb + 6.5, "#4ade80");
        if (a.i % 3 !== 2) {
          ctx.globalAlpha = 0.95 * fade;
          quadSkew(ctx, sx, sy, a, ea - 2, ea + 2, b, eb - 2, eb + 2, "#d1fae5");
        }
        ctx.globalAlpha = 1;
      }

      // Barriers, with a lip on top.
      const barrier = Math.floor(a.i / 2) % 2 ? "#b91c1c" : "#e4e4e7";
      for (const side of [-1, 1]) {
        const e = side * BARRIER_E;
        if (zAt(a, e) < MIN_Z || zAt(b, e) < MIN_Z) continue;
        ctx.fillStyle = barrier;
        ctx.beginPath();
        ctx.moveTo(sx(a, e), sy(a, e));
        ctx.lineTo(sx(b, e), sy(b, e));
        ctx.lineTo(sx(b, e), sy(b, e, BARRIER_H));
        ctx.lineTo(sx(a, e), sy(a, e, BARRIER_H));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (a.i % 6 === 0) this.drawTree(a, F, H, hz, cx, theme, course.length);
      const gates = gatesByIdx.get(a.i);
      if (gates) for (const g of gates) this.drawGate(a, g.e, g.state, F, H, hz, cx);
    }

    // Haze toward the horizon.
    const fog = ctx.createLinearGradient(0, hz - 6, 0, hz + (F * H) / 110);
    fog.addColorStop(0, theme.skyBottom);
    fog.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = fog;
    ctx.fillRect(0, hz - 6, w, (F * H) / 110 + 6);
    ctx.globalAlpha = 1;

    // ── The car, with smoke and sparks ──
    const dxc = carX - camX;
    const dyc = carY - camY;
    const carXc = -dxc * sinY + dyc * cosY;
    const carZc = dxc * cosY + dyc * sinY;
    this.updateParticles(carX, carY, carHeading, drift, dt, hudNow);
    const toScreen = (x: number, y: number, up: number) => {
      const wx = x - camX;
      const wy = y - camY;
      const z = Math.max(2, wx * cosY + wy * sinY);
      return { x: cx + (F * (-wx * sinY + wy * cosY)) / z, y: hz + (F * (H - up)) / z, z };
    };
    this.drawParticles(toScreen, F, carZc, true);
    this.drawCar(carXc, carZc, carHeading - yaw, drift, p.angle, F, H, hz, cx);
    this.drawParticles(toScreen, F, carZc, false);

    this.drawHud(view);
  }

  // ── Scenery ──────────────────────────────────────────────────────────────

  private drawSky(yaw: number, cx: number, hz: number, F: number, w: number, h: number) {
    const { ctx, scene } = this;
    const t = scene.theme;
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, t.skyTop);
    g.addColorStop(1, t.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hz + 1);
    // Ground colour under everything, so there is never a gap past the last strip.
    ctx.fillStyle = t.grassDark;
    ctx.fillRect(0, hz, w, h - hz);

    // A low sun that stays put in the sky as the camera turns.
    const sunAng = 0.6;
    const sunX = cx + F * Math.tan(sunAng - yaw);
    if (Math.abs(sunAng - yaw) < 1.2) {
      const glow = ctx.createRadialGradient(sunX, hz - 16, 2, sunX, hz - 16, 70);
      glow.addColorStop(0, "rgba(255,244,214,0.95)");
      glow.addColorStop(0.25, "rgba(255,200,120,0.45)");
      glow.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - 80, hz - 100, 160, 100);
    }

    // Two ranges of hills that slide as the camera turns.
    const range = (amp: number, freq: number, phase: number, colour: string) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, hz + 1);
      for (let x = 0; x <= w + 10; x += 10) {
        const ang = yaw + Math.atan((x - cx) / F);
        const n = 0.5 * Math.sin(ang * freq + phase) + 0.3 * Math.sin(ang * freq * 2.3 + phase * 1.7) + 0.2 * Math.sin(ang * freq * 4.7 + phase * 0.6);
        ctx.lineTo(x, hz - amp * (0.55 + 0.45 * n));
      }
      ctx.lineTo(w + 10, hz + 1);
      ctx.closePath();
      ctx.fill();
    };
    range(h * 0.1, 3.1, 1.3, t.hillFar);
    range(h * 0.055, 5.3, 4.2, t.hillNear);
  }

  private drawTree(a: Pt, F: number, H: number, hz: number, cx: number, theme: Theme, courseLength: number) {
    const { ctx } = this;
    const hsh = hashString(`tree:${a.i}:${courseLength}`);
    const side = hsh % 2 ? 1 : -1;
    const e = side * (BARRIER_E + 14 + (hsh % 5) * 9);
    const zz = Math.max(1.5, a.zc - e * a.sd);
    const x = cx + (F * (a.xc + e * a.cd)) / zz;
    const y = hz + (F * H) / zz;
    const u = F / zz;
    if (zz < 14 || u * 30 < 2) return;
    const lamp = hsh % 7 === 0;
    if (lamp) {
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(x - 0.7 * u, y - 22 * u, 1.4 * u, 22 * u);
      ctx.fillRect(x - (side > 0 ? 0 : 7) * u, y - 22.5 * u, 7 * u, 1.2 * u);
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.arc(x + (side > 0 ? -6 : 6) * u, y - 21 * u, 1.6 * u, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const height = (22 + (hsh % 4) * 5) * u;
    ctx.fillStyle = "#3b2f2a";
    ctx.fillRect(x - 1.2 * u, y - 5 * u, 2.4 * u, 5 * u);
    ctx.fillStyle = theme.treeDark;
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.lineTo(x + 8 * u, y - 4 * u);
    ctx.lineTo(x - 8 * u, y - 4 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.tree;
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.lineTo(x + 8 * u, y - 4 * u);
    ctx.lineTo(x, y - 4 * u);
    ctx.closePath();
    ctx.fill();
  }

  /** A clip cone and a ring on the road at a gate. Gates are the clipping points on the drift line. */
  private drawGate(a: Pt, e: number, state: "upcoming" | "hit" | "miss", F: number, H: number, hz: number, cx: number) {
    const { ctx } = this;
    const z = Math.max(1.5, a.zc - e * a.sd);
    if (z < 8) return;
    const x = cx + (F * (a.xc + e * a.cd)) / z;
    const y = hz + (F * H) / z;
    const u = F / z;
    const colour = state === "hit" ? "#4ade80" : state === "miss" ? "rgba(248,113,113,0.7)" : "#fb923c";
    // Ring on the road.
    const rx = 8.5 * u;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * (H / Math.hypot(H, z)), 0, 0, Math.PI * 2);
    ctx.strokeStyle = state === "upcoming" ? "rgba(255,255,255,0.9)" : colour;
    ctx.lineWidth = Math.max(1.5, 0.9 * u);
    ctx.stroke();
    if (state === "hit") {
      ctx.fillStyle = "rgba(74,222,128,0.28)";
      ctx.fill();
    }
    // Cone.
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x - 2.8 * u, y);
    ctx.lineTo(x + 2.8 * u, y);
    ctx.lineTo(x, y - 9 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(x - 1.6 * u, y - 4.6 * u);
    ctx.lineTo(x + 1.6 * u, y - 4.6 * u);
    ctx.lineTo(x + 1.0 * u, y - 6.4 * u);
    ctx.lineTo(x - 1.0 * u, y - 6.4 * u);
    ctx.closePath();
    ctx.fill();
  }

  // ── The car ──────────────────────────────────────────────────────────────

  private faceColour(kind: Kind): string {
    const c = this.carRgb;
    switch (kind) {
      case "top": return tint(c, 1.18);
      case "roof": return tint(c, 1.08);
      case "side": return tint(c, 0.68);
      case "rear": return tint(c, 0.9);
      case "front": return tint(c, 0.55);
      case "glass": return "#0d1322";
      case "rearGlass": return "#1a2540";
      case "wing": return "#141519";
      case "wingTop": return tint(c, 0.95);
      case "tyre": return "#09090b";
      case "light": return "#ef4444";
      default: return "#0c0c0f";
    }
  }

  private drawCar(xc: number, zc: number, rel: number, drift: number, steer: number, F: number, H: number, hz: number, cx: number) {
    const { ctx } = this;
    const sinR = Math.sin(rel);
    const cosR = Math.cos(rel);
    const proj = (v: V3) => {
      const x = xc + v[0] * sinR + v[1] * cosR;
      const z = Math.max(2, zc + v[0] * cosR - v[1] * sinR);
      return { x: cx + (F * x) / z, y: hz + (F * (H - v[2])) / z, z };
    };

    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    [[-20, -10], [20, -10], [20, 10], [-20, 10]].forEach(([x, y], i) => {
      const q = proj([x, y, 0]);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.fill();

    // Faces that point at the camera, drawn from the far side to the near.
    const drawn: Array<{ depth: number; face: Face }> = [];
    for (const face of CAR_MODEL) {
      const n = face.normal;
      const nx = n[0] * sinR + n[1] * cosR;
      const nz = n[0] * cosR - n[1] * sinR;
      const c = face.centre;
      const px = xc + c[0] * sinR + c[1] * cosR;
      const pz = zc + c[0] * cosR - c[1] * sinR;
      const py = c[2] - H;
      if (nx * px + n[2] * py + nz * pz >= 0) continue;
      drawn.push({ depth: pz, face });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    for (const { face } of drawn) {
      ctx.beginPath();
      face.pts.forEach((v, i) => {
        const q = proj(v);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = this.faceColour(face.kind);
      ctx.fill();
      if (face.kind !== "tyre" && face.kind !== "glass" && face.kind !== "rearGlass") {
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    // Brake lights glow brighter when the car is hard on the steering or sliding.
    const glow = clamp(0.35 + drift * 0.5 + Math.abs(steer) * 0.25, 0, 1);
    ctx.globalCompositeOperation = "lighter";
    for (const side of [-1, 1]) {
      const q = proj([-18.4, side * 5.0, 3.7]);
      const r = (F * 5.5) / q.z;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(255,80,60,${0.9 * glow})`);
      g.addColorStop(1, "rgba(255,40,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ── Smoke and sparks ─────────────────────────────────────────────────────

  private updateParticles(carX: number, carY: number, heading: number, drift: number, dt: number, hud: DriveView["hud"]) {
    if (dt > 0) {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const limit = MAX_PARTICLES * this.quality;
      const burst = hud.lock === "burst";
      const smoke = (side: number, amount: number, dark: boolean) => {
        const count = Math.round(amount * dt * this.quality + this.rng());
        for (let i = 0; i < count && this.particles.length < limit; i++) {
          const lx = -11.5;
          const ly = side * 8.7;
          this.particles.push({
            x: carX + cos * lx - sin * ly,
            y: carY + sin * lx + cos * ly,
            up: 1 + this.rng() * 2,
            vx: -cos * 16 + (this.rng() - 0.5) * 16,
            vy: -sin * 16 + (this.rng() - 0.5) * 16,
            vup: 5 + this.rng() * 5,
            age: 0,
            life: 0.5 + this.rng() * 0.45,
            size: 2 + this.rng() * 1.6,
            spark: false,
            dark,
          });
        }
      };
      if (drift > 0.25) {
        smoke(-1, drift * 22, false);
        smoke(1, drift * 22, false);
      }
      // A burst tyre pours black smoke from its corner.
      if (burst) smoke(hud.lean >= 0 ? -1 : 1, 60, true);

      // Sparks: from the rim after a burst, off the side of the car against the wall, and a few when the tyres are screaming.
      const sparkAmount = burst ? 70 : hud.lock === "wall" ? 90 : hud.strain > 0.7 ? (hud.strain - 0.7) * 60 : 0;
      if (sparkAmount > 0 && this.quality > 0.4) {
        const side = hud.lock === "wall" ? (hud.lean >= 0 ? -1 : 1) : hud.lean >= 0 ? -1 : 1;
        const count = Math.round(sparkAmount * dt + this.rng());
        for (let i = 0; i < count && this.particles.length < limit; i++) {
          const lx = -14 + this.rng() * 8;
          const ly = side * (burst ? 8.7 : 8.5);
          this.particles.push({
            x: carX + cos * lx - sin * ly,
            y: carY + sin * lx + cos * ly,
            up: 2 + this.rng() * 3,
            vx: -cos * 30 + (this.rng() - 0.5) * 30,
            vy: -sin * 30 + (this.rng() - 0.5) * 30,
            vup: 8 + this.rng() * 14,
            age: 0,
            life: 0.25 + this.rng() * 0.25,
            size: 1 + this.rng(),
            spark: true,
            dark: false,
          });
        }
      }
    }
    for (const q of this.particles) {
      q.age += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.up += q.vup * dt;
      if (q.spark) q.vup -= 60 * dt;
      else {
        q.vx *= 0.97;
        q.vy *= 0.97;
      }
    }
    this.particles = this.particles.filter((q) => q.age < q.life && q.up > -1);
  }

  /** Smoke and sparks behind the car (farther than it) or in front of it (nearer to the camera). */
  private drawParticles(toScreen: (x: number, y: number, up: number) => { x: number; y: number; z: number }, F: number, carZ: number, far: boolean) {
    const { ctx } = this;
    for (const q of this.particles) {
      const s = toScreen(q.x, q.y, q.up);
      if ((s.z >= carZ) !== far) continue;
      if (s.z < 8) continue;
      const u = q.age / q.life;
      const r = Math.min(13, (F * q.size * (q.spark ? 1 : 0.6 + u * 1.6)) / s.z);
      ctx.globalAlpha = q.spark ? 1 - u : (1 - u) * 0.3;
      ctx.fillStyle = q.spark ? "#fde68a" : q.dark ? "#27272a" : "#e4e4e7";
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.6, r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Heads-up display ─────────────────────────────────────────────────────

  /** The pill at the top: YOU, the running points, then the rival's name, laid out left to right so nothing overlaps. */
  private drawBoard(board: string, rivalFullName: string) {
    const { ctx, size } = this;
    const { w } = size;
    const rivalName = rivalFullName.slice(0, 14).toUpperCase();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "800 11px system-ui, sans-serif";
    const youW = ctx.measureText("YOU").width;
    const nameW = ctx.measureText(rivalName).width;
    ctx.font = "800 15px system-ui, sans-serif";
    const scoreW = Math.max(54, ctx.measureText(board).width);
    const gap = 10;
    const bw = 14 + youW + gap + scoreW + gap + nameW + 14;
    const bx = w / 2 - bw / 2;
    ctx.fillStyle = "rgba(9,9,11,0.74)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(bx, 8, bw, 30, 15);
    else ctx.rect(bx, 8, bw, 30);
    ctx.fill();
    ctx.font = "800 11px system-ui, sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("YOU", bx + 14, 24);
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.fillStyle = "#fafafa";
    ctx.textAlign = "center";
    ctx.fillText(board, bx + 14 + youW + gap + scoreW / 2, 24);
    ctx.textAlign = "left";
    ctx.font = "800 11px system-ui, sans-serif";
    ctx.fillStyle = this.scene.rivalKind === "ghost" ? "#38bdf8" : "#a78bfa";
    ctx.fillText(rivalName, bx + 14 + youW + gap + scoreW + gap, 24);
    ctx.textAlign = "center";
  }

  private drawBanner(text: string, tone: "good" | "bad" | "neutral", cx: number, y: number, fade: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = "800 13px system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 28;
    ctx.fillStyle = tone === "good" ? "rgba(21,128,61,0.88)" : tone === "bad" ? "rgba(190,18,60,0.88)" : "rgba(9,9,11,0.78)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(cx - tw / 2, y - 13, tw, 26, 13);
    else ctx.rect(cx - tw / 2, y - 13, tw, 26);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, y);
    ctx.restore();
  }

  /**
   * The angle gauge. The ball is the angle of the car. Green is safe, amber is the last stretch before the tyres' limit, red
   * is over it. The arrows at the ends show which way to lean for the next bend, and the bar below is tyre heat.
   */
  private drawGauge(hud: DriveView["hud"], y: number) {
    const { ctx, size } = this;
    const { w } = size;
    const gw = Math.min(280, w * 0.7);
    const cx = w / 2;
    const half = gw / 2;
    const pos = (a: number) => cx + clamp(a, -1, 1) * half * 0.94;
    const rr = (x: number, yy: number, ww: number, hh: number, r: number) => {
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, yy, ww, hh, r);
      else ctx.rect(x, yy, ww, hh);
    };

    // Track, with the zones laid out on both sides of the middle.
    ctx.fillStyle = "rgba(9,9,11,0.66)";
    rr(cx - half - 4, y - 11, gw + 8, 22, 11);
    ctx.fill();
    const safe = hud.limit * WARN_AT;
    for (const side of [-1, 1]) {
      const zone = (from: number, to: number, colour: string) => {
        const x0 = pos(side * from);
        const x1 = pos(side * to);
        ctx.fillStyle = colour;
        ctx.fillRect(Math.min(x0, x1), y - 4, Math.abs(x1 - x0), 8);
      };
      zone(0, safe, "rgba(74,222,128,0.5)");
      zone(safe, hud.limit, "rgba(251,191,36,0.75)");
      zone(hud.limit, 1, "rgba(239,68,68,0.7)");
    }
    // Limit marks.
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(pos(hud.limit) - 1, y - 9, 2, 18);
    ctx.fillRect(pos(-hud.limit) - 1, y - 9, 2, 18);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(cx - 1, y - 7, 2, 14);

    // Arrows at the ends: the one on the side to lean toward lights up.
    ctx.font = "900 15px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const side of [-1, 1]) {
      const want = clamp(hud.lean * side, 0, 1);
      ctx.fillStyle = want > 0.5 ? `rgba(250,250,250,${0.6 + 0.4 * want})` : "rgba(250,250,250,0.22)";
      ctx.textAlign = side < 0 ? "right" : "left";
      ctx.fillText(side < 0 ? "◀◀" : "▶▶", cx + side * (half + 10), y);
    }

    // The ball.
    const over = hud.strain >= 1;
    ctx.beginPath();
    ctx.arc(pos(hud.angle), y, 8, 0, Math.PI * 2);
    ctx.fillStyle = over ? "#ef4444" : hud.strain > 0.05 ? "#fb923c" : "#fbbf24";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.stroke();

    // Tyre heat.
    const hy = y + 22;
    const hw = gw * 0.6;
    ctx.fillStyle = "rgba(9,9,11,0.66)";
    rr(cx - hw / 2, hy - 5, hw, 10, 5);
    ctx.fill();
    const heat = clamp(hud.stress, 0, 1);
    if (heat > 0) {
      ctx.fillStyle = heat > 0.66 ? "#ef4444" : heat > 0.33 ? "#fb923c" : "#fbbf24";
      rr(cx - hw / 2 + 1, hy - 4, Math.max(6, (hw - 2) * heat), 8, 4);
      ctx.fill();
    }
    ctx.font = "800 10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(hud.lock === "burst" ? "BURST" : hud.lock === "wall" ? "SPUN" : "TYRE HEAT", cx - hw / 2 - 8, hy);
    ctx.textAlign = "left";
    ctx.fillStyle = hud.tyres < 50 ? "#fb7185" : "rgba(255,255,255,0.8)";
    ctx.fillText(`TYRES ${Math.round(hud.tyres)}%`, cx + hw / 2 + 8, hy);

    // What the angle is worth right now: x1 with the car straight, x4 right at the limit.
    const m = clamp(hud.multiplier, 1, 4);
    const hot = (m - 1) / 3;
    ctx.save();
    ctx.translate(cx, hy + 30);
    ctx.scale(1 + 0.12 * hot, 1 + 0.12 * hot);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 26px system-ui, sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    const text = `×${m.toFixed(1)}`;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = hud.lock !== "none" ? "#a1a1aa" : hot > 0.75 ? "#fbbf24" : hot > 0.4 ? "#fde68a" : "#fafafa";
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.textAlign = "center";
  }

  private drawHud(view: DriveView) {
    const { ctx, size } = this;
    const { w, h, dpr } = size;
    const hud = view.hud;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The whole screen glows amber, then red, as the tyres near their limit, and flashes on a wall hit or a burst.
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 70);
    const glow = Math.max(hud.strain * 0.5 * pulse, hud.stress * 0.35, hud.wallFlash * 0.6, hud.burstFlash * 0.5);
    if (glow > 0.02) {
      const hot = hud.strain >= 1 || hud.stress > 0.4 || hud.wallFlash > 0 || hud.burstFlash > 0;
      const g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, hot ? `rgba(239,68,68,${glow})` : `rgba(251,146,60,${glow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    this.drawBoard(`${Math.round(hud.playerPoints)} – ${Math.round(hud.rivalPoints)}`, this.scene.names.rival);

    if (hud.banner) {
      const age = hud.banner.age;
      this.drawBanner(hud.banner.text, hud.banner.tone, w / 2, 56, Math.min(smooth(age / 0.15), smooth((2.0 - age) / 0.4)));
    }

    // Line accuracy and combo, bottom left and right.
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "800 13px system-ui, sans-serif";
    const acc = Math.round(hud.accuracy * 100);
    ctx.fillStyle = "rgba(9,9,11,0.72)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(10, h - 40, 104, 28, 14);
    else ctx.rect(10, h - 40, 104, 28);
    ctx.fill();
    ctx.fillStyle = acc >= 75 ? "#4ade80" : acc >= 50 ? "#fbbf24" : "#fb7185";
    ctx.fillText(`DRIFT ${acc}%`, 22, h - 26);
    if (hud.streak >= 8) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 15px system-ui, sans-serif";
      ctx.fillText(`🔥 ×${Math.floor(hud.streak / 8)}`, w - 14, h - 26);
    }

    this.drawGauge(hud, 86);

    // Corner progress dots.
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * 16, h - 12, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i < hud.cornerIndex ? "#fbbf24" : i === hud.cornerIndex ? "#fde68a" : "rgba(255,255,255,0.3)";
      ctx.fill();
    }

    // Countdown.
    if (hud.countdown !== null) {
      const n = Math.ceil(hud.countdown);
      const text = n <= 0 ? "GO!" : String(n);
      const frac = hud.countdown - Math.floor(hud.countdown);
      ctx.save();
      ctx.translate(w / 2, h * 0.3);
      const scale = 1 + (n <= 0 ? 0.2 : 0.35 * frac);
      ctx.scale(scale, scale);
      ctx.globalAlpha = n <= 0 ? Math.max(0, 1 - (0 - hud.countdown) * 2) : 0.4 + 0.6 * frac;
      ctx.font = "900 84px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = n <= 0 ? "#4ade80" : "#fafafa";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}

/** A road-surface quad whose sides can be at different offsets at the near and far ends (used for the drift line). */
function quadSkew(
  ctx: CanvasRenderingContext2D,
  sx: (q: Pt, e: number) => number,
  sy: (q: Pt, e: number, up?: number) => number,
  a: Pt,
  a0: number,
  a1: number,
  b: Pt,
  b0: number,
  b1: number,
  fill: string
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(sx(a, a0), sy(a, a0));
  ctx.lineTo(sx(a, a1), sy(a, a1));
  ctx.lineTo(sx(b, b1), sy(b, b1));
  ctx.lineTo(sx(b, b0), sy(b, b0));
  ctx.closePath();
  ctx.fill();
}
