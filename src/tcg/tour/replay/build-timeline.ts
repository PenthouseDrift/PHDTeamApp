import type { BattleLog } from "../types";
import { STANCE_ICON, STANCE_LABEL } from "../stance";
import { buildCourseTiming, RUN_SECONDS } from "./course-timing";
import { buildCourse, sampleAt, type Course } from "./track-geometry";

/**
 * Turns a Battle Log into a timeline for the animated replay. Pure code with no randomness: the same log always gives
 * the same timeline. It only DRAWS what the server already decided; it never changes a score or a result.
 *
 * The two cars drive the course together. Whoever won a corner pulls ahead through it (by more when they won by more), so
 * the lead changes hands as the corners are won and lost, as in a real tandem battle.
 */

export { RUN_SECONDS };
export const INTRO_SECONDS = 1.4;
export const FINISH_SECONDS = 2.2;
export const TOTAL_SECONDS = INTRO_SECONDS + RUN_SECONDS + FINISH_SECONDS;

export interface Theme {
  /** Hue (0 to 360) the scenery is tinted with. */
  hue: number;
  grass: string;
  grassDark: string;
  road: string;
  roadEdge: string;
  line: string;
}

export interface ReplayEvent {
  t0: number;
  t1: number;
  kind: "banner" | "stance" | "upgrade" | "score" | "finish";
  text: string;
  tone: "neutral" | "good" | "bad";
}

export interface Pose {
  x: number;
  y: number;
  /** Direction of the road here. */
  h: number;
  /** Direction the car body points: the road direction plus its drift angle. */
  body: number;
  /** Distance along the course. */
  s: number;
  /** How hard the car is drifting, 0 to 1 (drives smoke and tyre marks). */
  drift: number;
}

export interface ReplayFrame {
  player: Pose;
  rival: Pose;
  pack: { x: number; y: number; s: number };
  phase: "intro" | "run" | "finish";
}

export interface Timeline {
  duration: number;
  course: Course;
  theme: Theme;
  events: ReplayEvent[];
  scoreSteps: Array<{ t: number; player: number; rival: number }>;
  /** One plain sentence per corner (and the result), for screen readers and the reduced-motion view. */
  narration: string[];
  names: { player: string; rival: string };
  rivalKind: "ghost" | "bot";
  result: "win" | "loss";
  poseAt(t: number): ReplayFrame;
  timeAtS(s: number): number;
}

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function themeFor(trackName: string): Theme {
  const hue = hashString(trackName) % 360;
  return {
    hue,
    grass: `hsl(${hue}, 28%, 24%)`,
    grassDark: `hsl(${hue}, 30%, 18%)`,
    road: "#2a2b31",
    roadEdge: "#3a3b43",
    line: "rgba(255,255,255,0.55)",
  };
}

export function buildTimeline(log: BattleLog): Timeline {
  const course = buildCourse(log.corners.map((c) => c.sectorId));
  // ── Time along the course ────────────────────────────────────────────────
  const timing = buildCourseTiming(course);
  const timeAtS = (s: number): number => INTRO_SECONDS + timing.runTimeAtS(s);
  const sAtTime = (t: number): number => timing.sAtRun(t - INTRO_SECONDS);

  // ── The gap between the cars (positive: the member is ahead) ─────────────
  const gapPoints: Array<{ s: number; d: number }> = [{ s: course.startS, d: 0 }];
  log.corners.forEach((c, i) => {
    const diff = Math.abs(c.player.score - c.rival.score);
    const mag = c.winner === "tie" ? 0 : Math.min(70, 12 + diff * 1.8);
    const sign = c.winner === "player" ? 1 : c.winner === "rival" ? -1 : 0;
    gapPoints.push({ s: course.spans[i].mid, d: sign * mag });
  });
  gapPoints.push({ s: course.length, d: gapPoints[gapPoints.length - 1].d });
  const gapAt = (s: number): number => {
    for (let i = 1; i < gapPoints.length; i++) {
      if (s <= gapPoints[i].s) {
        const a = gapPoints[i - 1];
        const b = gapPoints[i];
        return a.d + (b.d - a.d) * smooth((s - a.s) / Math.max(1, b.s - a.s));
      }
    }
    return gapPoints[gapPoints.length - 1].d;
  };

  // ── Poses ────────────────────────────────────────────────────────────────
  const slipBase = log.motion.map((m) => (m.angleDeg * Math.PI) / 180 * 0.55);
  const smokeBase = log.motion.map((m) => m.smoke);

  const poseFor = (s: number, lateralSide: 1 | -1, d: number, leading: boolean): Pose => {
    const p = sampleAt(course, s);
    // Side by side when close; lined up behind each other when far apart.
    const lat = lateralSide * 8 * (1 - smooth((Math.abs(d) - 18) / 30));
    const x = p.x - Math.sin(p.h) * lat;
    const y = p.y + Math.cos(p.h) * lat;
    let slip = 0;
    let drift = 0;
    if (p.corner >= 0) {
      const span = course.spans[p.corner];
      const u = (s - span.start) / Math.max(1, span.end - span.start);
      const window = Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, u))), 0.6);
      const k = leading ? 1.15 : 0.9;
      slip = p.turn * (slipBase[p.corner] ?? 0.4) * window * k;
      drift = window * (smokeBase[p.corner] ?? 0.5);
    }
    return { x, y, h: p.h, body: p.h + slip, s, drift };
  };

  const poseAt = (t: number): ReplayFrame => {
    let sc: number;
    let phase: ReplayFrame["phase"];
    if (t <= INTRO_SECONDS) {
      sc = course.startS;
      phase = "intro";
    } else if (t <= INTRO_SECONDS + RUN_SECONDS) {
      sc = sAtTime(t);
      phase = "run";
    } else {
      // Past the line the cars roll out and slow down.
      const over = t - INTRO_SECONDS - RUN_SECONDS;
      sc = Math.min(course.length - 12, course.finishS + 50 * (1 - Math.exp(-over * 1.4)));
      phase = "finish";
    }
    const d = gapAt(sc);
    const player = poseFor(sc + d / 2, 1, d, d >= 0);
    const rival = poseFor(sc - d / 2, -1, d, d < 0);
    const mid = sampleAt(course, sc);
    return { player, rival, pack: { x: mid.x, y: mid.y, s: sc }, phase };
  };

  // ── Events, score steps, narration ───────────────────────────────────────
  const events: ReplayEvent[] = [];
  const scoreSteps: Timeline["scoreSteps"] = [{ t: 0, player: 0, rival: 0 }];
  const narration: string[] = [];
  let pTotal = 0;
  let rTotal = 0;

  const tri = log.stance.triangle;
  events.push({
    t0: 0.4,
    t1: 4.2,
    kind: "stance",
    tone: tri === "player" ? "good" : tri === "rival" ? "bad" : "neutral",
    text: `${STANCE_ICON[log.stance.player]} ${STANCE_LABEL[log.stance.player]} vs ${STANCE_ICON[log.stance.rival]} ${STANCE_LABEL[log.stance.rival]}${
      tri === "player" ? ": you win the stance" : tri === "rival" ? ": they win the stance" : ": stances tie"
    }`,
  });
  const ups = log.upgradesApplied.filter((u) => u.side === "player").slice(0, 2);
  ups.forEach((u, i) => events.push({ t0: 4.2 + i * 1.7, t1: 5.9 + i * 1.7, kind: "upgrade", tone: "good", text: u.text }));

  log.corners.forEach((c, i) => {
    const span = course.spans[i];
    const name = c.sectorName;
    events.push({ t0: timeAtS(Math.max(0, span.start - 50)), t1: timeAtS(span.start + 20), kind: "banner", tone: "neutral", text: `Corner ${i + 1}: ${name}` });
    const tScore = timeAtS(span.mid + 6);
    events.push({
      t0: tScore,
      t1: tScore + 2.1,
      kind: "score",
      tone: c.winner === "player" ? "good" : c.winner === "rival" ? "bad" : "neutral",
      text: `You ${c.player.score} · ${c.rival.score} ${log.rival.name.split(" ").pop()}`,
    });
    pTotal += c.player.score;
    rTotal += c.rival.score;
    scoreSteps.push({ t: tScore, player: pTotal, rival: rTotal });
    narration.push(
      `Corner ${i + 1}, ${name}: you scored ${c.player.score} to ${c.rival.score}${c.winner === "player" ? " and won the corner" : c.winner === "rival" ? " and lost the corner" : ", a tie"}.`
    );
  });
  const won = log.result === "win";
  events.push({ t0: INTRO_SECONDS + RUN_SECONDS - 0.2, t1: TOTAL_SECONDS, kind: "finish", tone: won ? "good" : "bad", text: won ? "YOU WIN" : "YOU LOSE" });
  narration.push(`${won ? "You won" : "You lost"} the Round, ${log.totals.player} points to ${log.totals.rival}, with ${log.cornersWon.player} corners to ${log.cornersWon.rival}.`);

  return {
    duration: TOTAL_SECONDS,
    course,
    theme: themeFor(log.trackName),
    events,
    scoreSteps,
    narration,
    names: { player: "You", rival: log.rival.name },
    rivalKind: log.rival.kind,
    result: log.result,
    poseAt,
    timeAtS,
  };
}
