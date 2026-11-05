import { makeRng, type Rng } from "../rng";
import { ROAD_WIDTH, STEP } from "./track-geometry";
import type { Pose, ReplayEvent, Theme, Timeline } from "./build-timeline";
import { idealOffset } from "./drive-sim";
import { sampleAt, type Course } from "./track-geometry";

/** What the renderer needs to know about a track and the two drivers. A Timeline has all of it, and so can a live drive. */
export interface ReplayScene {
  course: Course;
  theme: Theme;
  rivalKind: "ghost" | "bot";
  names: { player: string; rival: string };
}

/** One frame of a live drive. Positions are a distance along the course (s) and a sideways offset from the road middle (e). */
export interface DriveView {
  player: { s: number; e: number; ev: number; u: number; speed: number; lineScore: number; wall: boolean };
  rival: { s: number; e: number; speed: number };
  gates: Array<{ s: number; e: number; state: "upcoming" | "hit" | "miss" }>;
  hud: {
    playerPoints: number;
    rivalPoints: number;
    accuracy: number;
    streak: number;
    progress: number;
    cornerIndex: number;
    steer: number;
    countdown: number | null;
    banner: { text: string; tone: "good" | "bad" | "neutral"; age: number } | null;
    wallFlash: number;
    gateFlash: number;
  };
}

/**
 * Canvas 2D drawing for the Tandem Tour replay. It draws a Timeline at any moment `t` and knows nothing about scores or
 * results. The road and scenery are painted once onto a layer; each frame then only moves the camera, lays tyre marks and
 * smoke, and draws the cars and the on-screen text.
 *
 * Everything random here (scenery, smoke) is cosmetic and comes from a seeded generator, so a replay looks the same each time.
 */

const LAYER_MAX = 2600;
const MAX_PARTICLES = 150;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

interface Colours {
  body: string;
  accent: string;
}

const PLAYER: Colours = { body: "#f59e0b", accent: "#fff7ed" };
const GHOST: Colours = { body: "#38bdf8", accent: "#e0f2fe" };
const BOT: Colours = { body: "#a78bfa", accent: "#ede9fe" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class ReplayRenderer {
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private marks: HTMLCanvasElement;
  private marksCtx: CanvasRenderingContext2D;
  private layerScale = 1;
  private origin = { x: 0, y: 0 };
  private size = { w: 300, h: 300, dpr: 1 };
  private cam = { x: 0, y: 0, zoom: 1, ready: false };
  private particles: Particle[] = [];
  private rng: Rng;
  private quality = 1;
  private lastMark: Record<"player" | "rival", { l: [number, number]; r: [number, number] } | null> = { player: null, rival: null };
  private lastT = 0;
  private colours: { player: Colours; rival: Colours };

  constructor(private canvas: HTMLCanvasElement, private scene: ReplayScene, seed: string, private timeline: Timeline | null = null) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    this.ctx = ctx;
    this.rng = makeRng(`replay:${seed}`);
    this.colours = { player: PLAYER, rival: scene.rivalKind === "ghost" ? GHOST : BOT };

    const b = scene.course.bounds;
    const pad = 260;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    this.layerScale = Math.min(1.2, LAYER_MAX / Math.max(w, h));
    this.origin = { x: b.minX - pad, y: b.minY - pad };
    this.layer = document.createElement("canvas");
    this.layer.width = Math.ceil(w * this.layerScale);
    this.layer.height = Math.ceil(h * this.layerScale);
    this.marks = document.createElement("canvas");
    this.marks.width = this.layer.width;
    this.marks.height = this.layer.height;
    const mctx = this.marks.getContext("2d");
    if (!mctx) throw new Error("Canvas is not available");
    this.marksCtx = mctx;
    this.paintTrack();
  }

  private requireTimeline(): Timeline {
    if (!this.timeline) throw new Error("This renderer has no timeline to replay");
    return this.timeline;
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

  /** Back to the start: clears smoke and tyre marks. */
  reset() {
    this.particles = [];
    this.marksCtx.clearRect(0, 0, this.marks.width, this.marks.height);
    this.lastMark = { player: null, rival: null };
    this.cam.ready = false;
    this.driveCam.ready = false;
    this.lastT = 0;
  }

  destroy() {
    this.particles = [];
    this.layer.width = 1;
    this.layer.height = 1;
    this.marks.width = 1;
    this.marks.height = 1;
  }

  // ── The track, painted once ──────────────────────────────────────────────

  private paintTrack() {
    const { course, theme } = this.scene;
    const g = this.layer.getContext("2d");
    if (!g) return;
    const rng = makeRng(`scenery:${theme.hue}:${course.length}`);
    g.save();
    g.scale(this.layerScale, this.layerScale);
    g.translate(-this.origin.x, -this.origin.y);

    // Ground, with darker patches so it is not flat.
    const b = course.bounds;
    g.fillStyle = theme.grass;
    g.fillRect(this.origin.x, this.origin.y, b.maxX - b.minX + 520, b.maxY - b.minY + 520);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = theme.grassDark;
      g.globalAlpha = 0.12 + rng() * 0.18;
      g.beginPath();
      g.arc(this.origin.x + rng() * (b.maxX - b.minX + 520), this.origin.y + rng() * (b.maxY - b.minY + 520), 10 + rng() * 40, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    const path = (from: number, to: number) => {
      g.beginPath();
      for (let i = from; i <= to; i++) {
        const p = course.samples[i];
        if (i === from) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
    };
    const last = course.samples.length - 1;
    g.lineJoin = "round";
    g.lineCap = "round";

    // Road edge, kerbs on the corners, the road itself and the centre line.
    path(0, last);
    g.strokeStyle = theme.roadEdge;
    g.lineWidth = ROAD_WIDTH + 10;
    g.stroke();

    for (const span of course.spans) {
      const a = Math.round(span.start / STEP);
      const z = Math.round(span.end / STEP);
      path(a, z);
      g.strokeStyle = "#f4f4f5";
      g.lineWidth = ROAD_WIDTH + 12;
      g.setLineDash([]);
      g.stroke();
      g.strokeStyle = "#dc2626";
      g.setLineDash([9, 9]);
      g.stroke();
      g.setLineDash([]);
    }

    path(0, last);
    g.strokeStyle = theme.road;
    g.lineWidth = ROAD_WIDTH;
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = ROAD_WIDTH - 18;
    g.stroke();

    path(0, last);
    g.strokeStyle = theme.line;
    g.lineWidth = 1.6;
    g.setLineDash([12, 16]);
    g.lineCap = "butt";
    g.stroke();
    g.setLineDash([]);

    // Tyre walls on the outside of each corner.
    for (const span of course.spans) {
      const a = Math.round(span.start / STEP);
      const z = Math.round(span.end / STEP);
      for (let i = a; i <= z; i += 3) {
        const p = course.samples[i];
        if (!p.turn) continue;
        const side = -p.turn;
        const off = ROAD_WIDTH / 2 + 17;
        const x = p.x - Math.sin(p.h) * off * side;
        const y = p.y + Math.cos(p.h) * off * side;
        g.fillStyle = (i / 3) % 2 === 0 ? "#18181b" : "#e4e4e7";
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#dc2626";
        g.lineWidth = 1.6;
        g.stroke();
      }
    }

    // Start grid and finish line, chequered across the road.
    const chequer = (s: number) => {
      const p = course.samples[Math.min(last, Math.round(s / STEP))];
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.h);
      const cols = 2;
      const rows = 8;
      const cw = 5;
      const rh = ROAD_WIDTH / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          g.fillStyle = (c + r) % 2 === 0 ? "#fafafa" : "#18181b";
          g.fillRect(c * cw - cw, -ROAD_WIDTH / 2 + r * rh, cw, rh);
        }
      }
      g.restore();
    };
    chequer(course.startS + 8);
    chequer(course.finishS);

    // Little grandstands with a crowd, beside the start and the finish.
    const stand = (s: number, side: 1 | -1) => {
      const p = course.samples[Math.min(last, Math.round(s / STEP))];
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.h);
      const y0 = side * (ROAD_WIDTH / 2 + 40);
      g.fillStyle = "#27272a";
      g.fillRect(-45, y0 - 12, 90, 24);
      for (let i = 0; i < 46; i++) {
        g.fillStyle = ["#f87171", "#fbbf24", "#60a5fa", "#4ade80", "#f472b6", "#e4e4e7"][Math.floor(rng() * 6)];
        g.beginPath();
        g.arc(-42 + (i % 23) * 3.7, y0 - 6 + Math.floor(i / 23) * 9 + rng() * 2, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    stand(course.startS + 20, 1);
    stand(course.startS + 20, -1);
    stand(course.finishS, 1);

    g.restore();
  }

  // ── A frame ──────────────────────────────────────────────────────────────

  render(t: number, dtSeconds: number) {
    const { ctx, size } = this;
    const frame = this.requireTimeline().poseAt(t);
    const dt = clamp(dtSeconds, 0, 0.1);
    const { w, h, dpr } = size;

    // Camera: fits the whole course at the start, then follows the pair and stays a little ahead of them.
    const b = this.scene.course.bounds;
    const fitZoom = Math.min(w / (b.maxX - b.minX + 160), h / (b.maxY - b.minY + 160));
    const dist = Math.hypot(frame.player.x - frame.rival.x, frame.player.y - frame.rival.y);
    const followZoom = (Math.min(w, h) / 250) / (1 + dist / 260);
    const intro = smooth((t - 0.9) / 1.6);
    const targetZoom = fitZoom + (followZoom - fitZoom) * intro;
    const ahead = 26 * intro;
    const targetX = (b.minX + b.maxX) / 2 + (frame.pack.x + Math.cos(frame.player.h) * ahead - (b.minX + b.maxX) / 2) * intro;
    const targetY = (b.minY + b.maxY) / 2 + (frame.pack.y + Math.sin(frame.player.h) * ahead - (b.minY + b.maxY) / 2) * intro;
    if (!this.cam.ready || Math.abs(t - this.lastT) > 0.5) {
      this.cam = { x: targetX, y: targetY, zoom: targetZoom, ready: true };
    } else {
      const k = 1 - Math.exp(-dt * 6);
      this.cam.x += (targetX - this.cam.x) * k;
      this.cam.y += (targetY - this.cam.y) * k;
      this.cam.zoom += (targetZoom - this.cam.zoom) * k;
    }
    this.lastT = t;

    this.updateMarks(frame.player, "player");
    this.updateMarks(frame.rival, "rival");
    this.updateParticles(frame.player, frame.rival, dt);

    // Draw.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.scene.theme.grassDark;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * this.cam.zoom, 0, 0, dpr * this.cam.zoom, dpr * (w / 2 - this.cam.x * this.cam.zoom), dpr * (h / 2 - this.cam.y * this.cam.zoom));

    const lw = this.layer.width / this.layerScale;
    const lh = this.layer.height / this.layerScale;
    ctx.drawImage(this.layer, this.origin.x, this.origin.y, lw, lh);
    ctx.drawImage(this.marks, this.origin.x, this.origin.y, lw, lh);

    this.drawParticles();
    // The car behind is drawn first so the leader sits on top at a pass.
    const order: Array<["player" | "rival", Pose]> = frame.player.s >= frame.rival.s
      ? [["rival", frame.rival], ["player", frame.player]]
      : [["player", frame.player], ["rival", frame.rival]];
    for (const [who, pose] of order) this.drawCar(pose, this.colours[who], who === "player");

    // Screen-space text and scoreboard.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(t);
  }


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

  // ── A live drive ─────────────────────────────────────────────────────────

  private driveCam = { x: 0, y: 0, angle: 0, ready: false };

  /** Draw one frame of a live drive. The camera turns with the car, so "up" on the screen is always where you are heading. */
  renderDrive(view: DriveView, dtSeconds: number) {
    const { ctx, size, scene } = this;
    const dt = clamp(dtSeconds, 0, 0.1);
    const { w, h, dpr } = size;
    const course = scene.course;

    const world = (s: number, e: number) => {
      const p = sampleAt(course, s);
      return { x: p.x - Math.sin(p.h) * e, y: p.y + Math.cos(p.h) * e, h: p.h, turn: p.turn };
    };
    const pw = world(view.player.s, view.player.e);
    const rw = world(view.rival.s, view.rival.e);
    const pSlip = clamp(0.9 * Math.atan2(view.player.ev, Math.max(10, view.player.speed)) + 0.28 * view.player.u, -0.65, 0.65);
    const rSlip = rw.turn * 0.32;
    const player: Pose = { x: pw.x, y: pw.y, h: pw.h, body: pw.h + pSlip, s: view.player.s, drift: clamp(Math.abs(pSlip) / 0.4, 0, 1) * 0.9 };
    const rival: Pose = { x: rw.x, y: rw.y, h: rw.h, body: rw.h + rSlip, s: view.rival.s, drift: Math.abs(rw.turn) * 0.55 };

    // Camera: follows the car and turns to keep its heading pointing up the screen.
    const targetAngle = -Math.PI / 2 - pw.h;
    const cam = this.driveCam;
    if (!cam.ready) {
      cam.x = pw.x;
      cam.y = pw.y;
      cam.angle = targetAngle;
      cam.ready = true;
    } else {
      let d = targetAngle - cam.angle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const k = 1 - Math.exp(-dt * 6);
      cam.angle += d * k;
      cam.x += (pw.x - cam.x) * (1 - Math.exp(-dt * 14));
      cam.y += (pw.y - cam.y) * (1 - Math.exp(-dt * 14));
    }
    const zoom = Math.min(w, h) / 230;
    const m = dpr * zoom;
    const cos = Math.cos(cam.angle);
    const sin = Math.sin(cam.angle);
    const ax = w / 2;
    const ay = h * 0.68;

    this.updateMarks(player, "player");
    this.updateMarks(rival, "rival");
    this.updateParticles(player, rival, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = scene.theme.grassDark;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(m * cos, m * sin, -m * sin, m * cos, dpr * ax - (m * cos * cam.x - m * sin * cam.y), dpr * ay - (m * sin * cam.x + m * cos * cam.y));

    const lw = this.layer.width / this.layerScale;
    const lh = this.layer.height / this.layerScale;
    ctx.drawImage(this.layer, this.origin.x, this.origin.y, lw, lh);
    ctx.drawImage(this.marks, this.origin.x, this.origin.y, lw, lh);

    // The racing line, a few seconds ahead.
    const from = view.player.s - 30;
    const to = Math.min(course.length - 4, view.player.s + 190);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let s = Math.max(0, from); s <= to; s += 5) {
      const q = world(s, idealOffset(course, s));
      if (s === Math.max(0, from)) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.strokeStyle = "rgba(74,222,128,0.2)";
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = "rgba(187,247,208,0.95)";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gates.
    for (const g of view.gates) {
      if (g.s < view.player.s - 30 || g.s > view.player.s + 210) continue;
      const q = world(g.s, g.e);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 10, 0, Math.PI * 2);
      if (g.state === "hit") {
        ctx.fillStyle = "rgba(74,222,128,0.5)";
        ctx.fill();
        ctx.strokeStyle = "#4ade80";
      } else if (g.state === "miss") {
        ctx.strokeStyle = "rgba(248,113,113,0.7)";
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
      }
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    this.drawParticles();
    const order: Array<[Pose, Colours, boolean]> = [[rival, this.colours.rival, false], [player, this.colours.player, true]];
    for (const [pose, colours, isPlayer] of order) this.drawCar(pose, colours, isPlayer);

    // How close the player is to the line: a ring round the car.
    ctx.beginPath();
    ctx.arc(player.x, player.y, 21, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${Math.round(120 * view.player.lineScore)}, 85%, 58%, 0.85)`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Screen-space HUD.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawDriveHud(view);
  }

  private drawDriveHud(view: DriveView) {
    const { ctx, size } = this;
    const { w, h } = size;
    const hud = view.hud;

    if (hud.wallFlash > 0) {
      ctx.strokeStyle = `rgba(239,68,68,${0.55 * hud.wallFlash})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, w, h);
    }

    this.drawBoard(`${Math.round(hud.playerPoints)} – ${Math.round(hud.rivalPoints)}`, this.scene.names.rival);

    if (hud.banner) {
      const age = hud.banner.age;
      const fade = Math.min(smooth(age / 0.15), smooth((2.0 - age) / 0.4));
      this.drawBanner({ t0: 0, t1: 1, kind: "banner", text: hud.banner.text, tone: hud.banner.tone }, 0.5, w / 2, 56, fade);
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
    ctx.fillText(`LINE ${acc}%`, 22, h - 26);
    if (hud.streak >= 8) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 15px system-ui, sans-serif";
      ctx.fillText(`🔥 ×${Math.floor(hud.streak / 8)}`, w - 14, h - 26);
    }

    // Steering indicator, above the bottom row so it never sits under the line accuracy or the combo.
    const bw = Math.min(200, w * 0.5);
    const cx = w / 2;
    const by = h - 62;
    ctx.fillStyle = "rgba(9,9,11,0.6)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(cx - bw / 2, by - 3, bw, 6, 3);
    else ctx.rect(cx - bw / 2, by - 3, bw, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(cx - 1, by - 8, 2, 16);
    ctx.beginPath();
    ctx.arc(cx + (hud.steer * bw) / 2, by, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();

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
      ctx.translate(w / 2, h * 0.38);
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

  // ── Tyre marks and smoke ─────────────────────────────────────────────────

  private wheelPoints(p: Pose): { l: [number, number]; r: [number, number] } {
    const cos = Math.cos(p.body);
    const sin = Math.sin(p.body);
    const rear = (lx: number, ly: number): [number, number] => [p.x + cos * lx - sin * ly, p.y + sin * lx + cos * ly];
    return { l: rear(-11, -6.5), r: rear(-11, 6.5) };
  }

  private updateMarks(p: Pose, who: "player" | "rival") {
    const pts = this.wheelPoints(p);
    if (this.quality >= 0.4 && p.drift > 0.22) {
      const prev = this.lastMark[who];
      if (prev) {
        const g = this.marksCtx;
        g.save();
        g.scale(this.layerScale, this.layerScale);
        g.translate(-this.origin.x, -this.origin.y);
        g.strokeStyle = `rgba(10,10,12,${0.18 + p.drift * 0.25})`;
        g.lineWidth = 3;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(prev.l[0], prev.l[1]);
        g.lineTo(pts.l[0], pts.l[1]);
        g.moveTo(prev.r[0], prev.r[1]);
        g.lineTo(pts.r[0], pts.r[1]);
        g.stroke();
        g.restore();
      }
      this.lastMark[who] = pts;
    } else {
      this.lastMark[who] = null;
    }
  }

  private updateParticles(a: Pose, b: Pose, dt: number) {
    for (const pose of [a, b]) {
      if (pose.drift <= 0.15 || dt <= 0) continue;
      const pts = this.wheelPoints(pose);
      const count = Math.round(pose.drift * 70 * dt * this.quality + this.rng());
      for (let i = 0; i < count && this.particles.length < MAX_PARTICLES * this.quality; i++) {
        const src = i % 2 === 0 ? pts.l : pts.r;
        this.particles.push({
          x: src[0] + (this.rng() - 0.5) * 4,
          y: src[1] + (this.rng() - 0.5) * 4,
          vx: -Math.cos(pose.body) * 14 + (this.rng() - 0.5) * 18,
          vy: -Math.sin(pose.body) * 14 + (this.rng() - 0.5) * 18,
          age: 0,
          life: 0.7 + this.rng() * 0.6,
          size: 4 + this.rng() * 3,
        });
      }
    }
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  private drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const u = p.age / p.life;
      ctx.globalAlpha = (1 - u) * 0.45;
      ctx.fillStyle = "#e4e4e7";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + u * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Cars ─────────────────────────────────────────────────────────────────

  private drawCar(p: Pose, c: Colours, isPlayer: boolean) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.body);
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    };

    if (this.quality > 0.5) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      rr(-14, -6, 31, 15, 5);
      ctx.fill();
    }
    // Wheels. The front ones counter-steer into the slide.
    const steer = clamp(-(p.body - p.h) * 0.9, -0.6, 0.6);
    ctx.fillStyle = "#0a0a0b";
    for (const [wx, wy, front] of [[-9, -8.5, false], [-9, 8.5, false], [10, -8.5, true], [10, 8.5, true]] as const) {
      ctx.save();
      ctx.translate(wx, wy);
      if (front) ctx.rotate(steer);
      rr(-4.5, -2, 9, 4, 1.2);
      ctx.fill();
      ctx.restore();
    }
    // Body, stripe, windscreen and roof.
    ctx.fillStyle = c.body;
    rr(-15, -7, 30, 14, 5);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-14, -1.2, 28, 2.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(10,10,14,0.88)";
    rr(1, -5.2, 6.5, 10.4, 2);
    ctx.fill();
    rr(-9, -5, 6, 10, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    rr(-3, -5.4, 5, 10.8, 2);
    ctx.fill();
    // Lights.
    ctx.fillStyle = "#fef9c3";
    ctx.fillRect(13.5, -5.4, 1.8, 2.4);
    ctx.fillRect(13.5, 3, 1.8, 2.4);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-15, -5.4, 1.4, 2.4);
    ctx.fillRect(-15, 3, 1.4, 2.4);
    ctx.restore();

    if (isPlayer) {
      // A small marker over the member's own car.
      ctx.save();
      ctx.translate(p.x, p.y - 24);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(-5, -3);
      ctx.lineTo(5, -3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── On-screen text ───────────────────────────────────────────────────────

  private drawHud(t: number) {
    const { ctx, size } = this;
    const { w, h } = size;
    const tl = this.requireTimeline();

    // Scoreboard.
    let step = tl.scoreSteps[0];
    for (const s of tl.scoreSteps) if (s.t <= t) step = s;
    this.drawBoard(`${step.player} – ${step.rival}`, tl.names.rival);

    // Events active now, stacked from the top.
    const active = tl.events.filter((e) => t >= e.t0 && t <= e.t1 && e.kind !== "finish");
    let y = 56;
    for (const e of active.slice(-3)) {
      this.drawBanner(e, t, w / 2, y);
      y += 34;
    }

    // The result, big in the middle.
    const fin = tl.events.find((e) => e.kind === "finish");
    if (fin && t >= fin.t0) {
      const u = smooth((t - fin.t0) / 0.5);
      ctx.save();
      ctx.translate(w / 2, h * 0.42);
      ctx.scale(0.7 + 0.3 * u, 0.7 + 0.3 * u);
      ctx.globalAlpha = u;
      ctx.font = "900 44px system-ui, sans-serif";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(fin.text, 0, 0);
      ctx.fillStyle = fin.tone === "good" ? "#4ade80" : "#fb7185";
      ctx.fillText(fin.text, 0, 0);
      ctx.restore();
    }

    // Progress dots for the three corners.
    const dots = tl.course.spans;
    const sNow = tl.poseAt(t).pack.s;
    for (let i = 0; i < dots.length; i++) {
      const x = w / 2 + (i - 1) * 18;
      ctx.beginPath();
      ctx.arc(x, h - 14, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = sNow >= dots[i].end ? "#fbbf24" : sNow >= dots[i].start ? "#fde68a" : "rgba(255,255,255,0.3)";
      ctx.fill();
    }
  }

  private drawBanner(e: ReplayEvent, t: number, cx: number, y: number, fadeOverride?: number) {
    const { ctx } = this;
    const fade = fadeOverride ?? Math.min(smooth((t - e.t0) / 0.25), smooth((e.t1 - t) / 0.3));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = "800 13px system-ui, sans-serif";
    const tw = ctx.measureText(e.text).width + 28;
    const bg = e.tone === "good" ? "rgba(21,128,61,0.88)" : e.tone === "bad" ? "rgba(190,18,60,0.88)" : "rgba(9,9,11,0.78)";
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(cx - tw / 2, y - 13, tw, 26, 13);
    else ctx.rect(cx - tw / 2, y - 13, tw, 26);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.text, cx, y);
    ctx.restore();
  }
}
