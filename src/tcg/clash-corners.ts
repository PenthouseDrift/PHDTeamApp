/**
 * The corner types a Tandem Clash match can roll, and how each one turns a car's four stats into a score.
 *
 * Each match rolls three different corners from this pool at random, so corner 1 is never the same every time.
 * A corner is a name and a story, plus ONE calculation (`calc`). Everything that scores a corner (the live battle,
 * the card previews and the older lineup optimiser) goes through `computeSectorStatScore`, so a corner can't be
 * scored two different ways.
 *
 * The original six keep their original linear weights exactly. The rest are a mix of:
 *  - linear weights on different stats (reward one playstyle),
 *  - "shape" corners that look at the lowest, highest or best two stats (reward balance, a hero stat or versatility),
 *  - curved corners that reward spikes or flatten them out,
 *  - gates and penalties (a bonus for clearing a bar, a penalty for a weak link).
 *
 * The non-linear corners are scaled (`K` below) so a typical card scores about the same average on every corner. That
 * keeps flat bonuses (tier, Crew, track, debuffs) worth the same everywhere. Re-check with scripts/check-corners.ts
 * whenever a corner is added or changed.
 */

export type StatKey = "drift" | "accel" | "grip" | "steer";
export interface CornerStats {
  drift: number;
  accel: number;
  grip: number;
  steer: number;
}

export type ClashSectorId =
  // The original six
  | "entry"
  | "chase"
  | "wallride"
  | "hairpin"
  | "sweeper"
  | "infield"
  // Linear, on other stats
  | "downhill"
  | "banked"
  | "esses"
  | "gravel"
  | "slingshot"
  | "roundabout"
  | "pitdash"
  | "slalom"
  // Shape corners
  | "rhythm"
  | "showpiece"
  | "freestyle"
  | "smooth"
  | "roads"
  | "pendulum"
  // Curves, gates and penalties
  | "technical"
  | "fullsend"
  | "gate"
  | "launch"
  | "gauntlet"
  | "judges";

export interface ClashSectorSpec {
  id: ClashSectorId;
  /** Which family it belongs to. Crew "corner specialist" bonuses can target a whole family. */
  category?: "entry" | "chase" | "wallride";
  number: 1 | 2 | 3;
  name: string;
  subtitle: string;
  eventDescription: string;
  formulaBadge: string;
  formulaLabel: string;
  icon: string;
}

export interface SectorCalc {
  /** The corner's stat score. */
  score(stats: CornerStats): number;
  /** The same sum written out for the battle breakdown, e.g. "DRIFT 20×2 + ACCEL 18×1.5 + STEER 10". */
  breakdown(stats: CornerStats): string;
  /** Before the balancing in `TUNING`. Only the balance check script reads this. */
  untuned?: (stats: CornerStats) => number;
}

const LABEL: Record<StatKey, string> = { drift: "DRIFT", accel: "ACCEL", grip: "GRIP", steer: "STEER" };
const KEYS: StatKey[] = ["drift", "accel", "grip", "steer"];

const total = (s: CornerStats) => s.drift + s.accel + s.grip + s.steer;
const lowest = (s: CornerStats) => Math.min(s.drift, s.accel, s.grip, s.steer);
const highest = (s: CornerStats) => Math.max(s.drift, s.accel, s.grip, s.steer);
/** The four stats, best first. */
const ranked = (s: CornerStats) => KEYS.map((k) => s[k]).sort((a, b) => b - a);
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** A plain weighted sum: each stat counts for `weight` of its value. A weight of 1 is written without "×1". */
function linear(terms: Array<[StatKey, number]>): { calc: SectorCalc; badge: string; label: string } {
  const text = (value: (k: StatKey) => string, times: string) =>
    terms.map(([k, w]) => (w === 1 ? value(k) : `${value(k)}${times}${fmt(w)}`)).join(" + ");
  const name = (k: StatKey) => LABEL[k];
  return {
    calc: {
      score: (s) => Math.round(terms.reduce((sum, [k, w]) => sum + s[k] * w, 0)),
      breakdown: (s) => text((k) => `${LABEL[k]} ${s[k]}`, "×"),
    },
    badge: `${text(name, " × ")} + Tier Bonus`,
    label: `${text(name, " × ")} + Tier`,
  };
}

/**
 * Fine-tuning for the non-linear corners, from scripts/check-corners.ts: score = raw × k + b. It lines each corner up
 * with the original six so a card of each rarity scores about the same on average whichever corner comes up.
 */
const TUNING: Record<string, { k: number; b: number }> = {
  rhythm: { k: 0.758, b: 30.4 },
  showpiece: { k: 1.461, b: -54.9 },
  freestyle: { k: 1.505, b: -63.8 },
  smooth: { k: 0.848, b: 16.8 },
  roads: { k: 1.402, b: -50.8 },
  pendulum: { k: 0.905, b: 11.7 },
  technical: { k: 1.469, b: -55.1 },
  fullsend: { k: 0.763, b: 30 },
  gate: { k: 0.769, b: 10.4 },
  launch: { k: 1.498, b: 20.3 },
  gauntlet: { k: 0.633, b: 29.7 },
  judges: { k: 0.933, b: 9.4 },
};
const tune = (id: string, raw: number) => {
  const t = TUNING[id];
  return t ? raw * t.k + t.b : raw;
};

interface CornerDef {
  spec: Omit<ClashSectorSpec, "number" | "formulaBadge" | "formulaLabel"> & { formulaBadge?: string; formulaLabel?: string };
  calc: SectorCalc;
}

function fromLinear(
  spec: CornerDef["spec"],
  terms: Array<[StatKey, number]>
): CornerDef {
  const l = linear(terms);
  return { spec: { ...spec, formulaBadge: l.badge, formulaLabel: l.label }, calc: l.calc };
}

function custom(
  spec: CornerDef["spec"],
  formula: string,
  calc: SectorCalc
): CornerDef {
  const untuned = calc.score;
  return {
    spec: { ...spec, formulaBadge: `${formula} + Tier Bonus`, formulaLabel: `${formula} + Tier` },
    calc: {
      score: (stats) => Math.max(0, Math.round(tune(spec.id, untuned(stats)))),
      breakdown: calc.breakdown,
      untuned,
    },
  };
}

const CORNERS: CornerDef[] = [
  // ── The original six (unchanged) ─────────────────────────────────────────
  fromLinear(
    {
      id: "entry",
      category: "entry",
      name: "Flick Entry & Angle",
      subtitle: "High-Commitment Sweeper Initiation",
      eventDescription:
        "Throw the car sideways at full lock into the first outside clipping point! Judges heavily reward big Drift angle, snappy Steering lock, and initiation Accel.",
      icon: "📐",
    },
    [["drift", 2], ["accel", 1.5], ["steer", 1]]
  ),
  fromLinear(
    {
      id: "chase",
      category: "chase",
      name: "Door-to-Door Tandem Chase",
      subtitle: "Mid-Track Switchback Proximity",
      eventDescription:
        "Dive onto the lead driver's door through the tight inner switchback! Judges score Transition Acceleration, Deep Drift proximity, and Grip drive.",
      icon: "🔥",
    },
    [["steer", 2], ["grip", 1.5], ["drift", 1]]
  ),
  fromLinear(
    {
      id: "wallride",
      category: "wallride",
      name: "Outside Wall Ride",
      subtitle: "Concrete Finish Bank",
      eventDescription:
        "Hold the rear bumper millimetres off the outside wall all the way to the finish line! Judges score rear Grip stability, precision Steer, and Drift hold.",
      icon: "🧱",
    },
    [["drift", 2], ["grip", 1.5], ["accel", 1]]
  ),
  fromLinear(
    {
      id: "hairpin",
      category: "chase",
      name: "Tight Hairpin Switchback",
      subtitle: "Technical Front-Lock Clipping Point",
      eventDescription:
        "Snappy weight transfer into an ultra-tight hairpin! Judges reward precision Steering lock, controllable Drift rotation, and rapid exit Accel.",
      icon: "⛰️",
    },
    [["steer", 2], ["drift", 1.5], ["accel", 1]]
  ),
  fromLinear(
    {
      id: "sweeper",
      category: "entry",
      name: "High-Speed Power Sweeper",
      subtitle: "Full-Throttle Parabolic Arc",
      eventDescription:
        "High-momentum parabolic arc requiring relentless throttle commit! Judges reward explosive Accel drive, sustained Drift angle, and Grip balance.",
      icon: "⚡",
    },
    [["accel", 2], ["drift", 1.5], ["grip", 1]]
  ),
  fromLinear(
    {
      id: "infield",
      category: "wallride",
      name: "Technical Infield Transition",
      subtitle: "Chicane S-Bend & Snap Counter",
      eventDescription:
        "Violent chicane switchback through the infield! Judges score quick Grip hook-up, responsive Accel recovery, and surgical Steer precision.",
      icon: "🎯",
    },
    [["grip", 2], ["accel", 1.5], ["steer", 1]]
  ),

  // ── Linear corners on other mixes of stats ───────────────────────────────
  fromLinear(
    {
      id: "downhill",
      category: "entry",
      name: "Downhill Plunge",
      subtitle: "Gravity-Fed Braking Zone",
      eventDescription:
        "The track drops away under the bonnet! Judges score how hard you stay on the throttle, how well the tyres hold the slope, and how neatly you place the nose.",
      icon: "🏔️",
    },
    [["accel", 2], ["grip", 1.5], ["steer", 1]]
  ),
  fromLinear(
    {
      id: "banked",
      category: "wallride",
      name: "Banked Oval Arc",
      subtitle: "Full-Lock Bowl Corner",
      eventDescription:
        "A steep banked bowl that rewards the car that sticks to the surface. Judges score Grip first, then a held Drift angle, then clean Steer.",
      icon: "🏟️",
    },
    [["grip", 2], ["drift", 1.5], ["steer", 1]]
  ),
  fromLinear(
    {
      id: "esses",
      category: "chase",
      name: "Rhythm Esses",
      subtitle: "Left-Right-Left Transition Flow",
      eventDescription:
        "Three quick direction changes in a row! Judges reward razor Steering, then fast Accel between the apexes, then enough Grip to keep it tidy.",
      icon: "🌊",
    },
    [["steer", 2], ["accel", 1.5], ["grip", 1]]
  ),
  fromLinear(
    {
      id: "gravel",
      category: "chase",
      name: "Gravel Trap Recovery",
      subtitle: "Dirt-Edge Save & Re-Launch",
      eventDescription:
        "You clipped the gravel and the car is half sideways! Judges score the power to claw back, the Steering to catch it, and the Drift you save.",
      icon: "🪨",
    },
    [["accel", 2], ["steer", 1.5], ["drift", 1]]
  ),
  fromLinear(
    {
      id: "slingshot",
      category: "entry",
      name: "Slingshot Exit",
      subtitle: "Angle Now, Speed Later",
      eventDescription:
        "Carry maximum angle through the apex and fire out the other side! Judges reward Drift angle, then the Steering to hold it, then Grip on the way out.",
      icon: "🚀",
    },
    [["drift", 2], ["steer", 1.5], ["grip", 1]]
  ),
  fromLinear(
    {
      id: "roundabout",
      category: "wallride",
      name: "Roundabout Orbit",
      subtitle: "Four-Exit Circle Drift",
      eventDescription:
        "Orbit the centre island and use everything the car has. Judges split the marks across Drift, Accel, Grip and Steer almost evenly.",
      icon: "🔄",
    },
    [["drift", 1.25], ["accel", 1.25], ["grip", 1], ["steer", 1]]
  ),
  fromLinear(
    {
      id: "pitdash",
      category: "entry",
      name: "Pit Lane Dash",
      subtitle: "Straight-Line Launch Zone",
      eventDescription:
        "Barely a corner at all: a flat-out burst down the pit lane! Judges care about Accel above all, with a little Grip to put the power down.",
      icon: "🏁",
    },
    [["accel", 3], ["grip", 1.5]]
  ),
  fromLinear(
    {
      id: "slalom",
      category: "chase",
      name: "Cone Slalom",
      subtitle: "Lock-To-Lock Precision Weave",
      eventDescription:
        "A line of cones and no room to spare! Judges score almost entirely on Steering, with a little Drift to look good doing it.",
      icon: "🚧",
    },
    [["steer", 3], ["drift", 1.5]]
  ),

  // ── Shape corners: they look at the lowest, highest or best stats ────────
  custom(
    {
      id: "rhythm",
      category: "wallride",
      name: "Rhythm Section",
      subtitle: "No Weak Link Allowed",
      eventDescription:
        "Four different corners strung together, and the judges mark the weakest one hardest. A car with no bad stat beats one with a single great stat.",
      icon: "🥁",
    },
    "2.5 × LOWEST STAT + 0.5 × TOTAL",
    {
      score: (s) => Math.round((2.5 * lowest(s) + 0.5 * total(s))),
      breakdown: (s) => `LOWEST ${lowest(s)}×2.5 + TOTAL ${total(s)}×0.5`,
    }
  ),
  custom(
    {
      id: "showpiece",
      category: "entry",
      name: "Hero Line Showpiece",
      subtitle: "Play To Your Strength",
      eventDescription:
        "A grandstand corner with the whole crowd watching! Judges are looking for one thing the car does brilliantly, whatever it is.",
      icon: "🏆",
    },
    "3 × BEST STAT + 0.5 × OTHER THREE",
    {
      score: (s) => Math.round((3 * highest(s) + 0.5 * (total(s) - highest(s)))),
      breakdown: (s) => `BEST ${highest(s)}×3 + OTHERS ${total(s) - highest(s)}×0.5`,
    }
  ),
  custom(
    {
      id: "freestyle",
      category: "chase",
      name: "Two-Way Freestyle",
      subtitle: "Any Two Stats Will Do",
      eventDescription:
        "No set line here: the judges simply score the two things your car does best. Different builds can win it in different ways.",
      icon: "✌️",
    },
    "2.25 × (BEST + 2ND BEST STAT)",
    {
      score: (s) => {
        const r = ranked(s);
        return Math.round(2.25 * (r[0] + r[1]));
      },
      breakdown: (s) => {
        const r = ranked(s);
        return `(BEST ${r[0]} + 2ND ${r[1]})×2.25`;
      },
    }
  ),
  custom(
    {
      id: "smooth",
      category: "wallride",
      name: "Smooth Line Judging",
      subtitle: "Flowing, Even, Effortless",
      eventDescription:
        "A long, flowing corner where the judges multiply all four stats together. One very low number drags the whole mark down.",
      icon: "🧘",
    },
    "4.5 × (DRIFT × ACCEL × GRIP × STEER)^¼",
    {
      score: (s) => Math.round(4.5 * Math.pow(s.drift * s.accel * s.grip * s.steer, 0.25)),
      breakdown: (s) => `4.5 × (${s.drift}×${s.accel}×${s.grip}×${s.steer})^¼`,
    }
  ),
  custom(
    {
      id: "roads",
      category: "chase",
      name: "Two Roads Apex",
      subtitle: "Slide It Or Steer It",
      eventDescription:
        "Two ways through the same apex! Judges take the better of Drift or Steer, and the better of Accel or Grip. Pick your road.",
      icon: "🔀",
    },
    "2.5 × BEST OF DRIFT/STEER + 2 × BEST OF ACCEL/GRIP",
    {
      score: (s) => Math.round((2.5 * Math.max(s.drift, s.steer) + 2 * Math.max(s.accel, s.grip))),
      breakdown: (s) => `MAX(DRIFT ${s.drift}, STEER ${s.steer})×2.5 + MAX(ACCEL ${s.accel}, GRIP ${s.grip})×2`,
    }
  ),
  custom(
    {
      id: "pendulum",
      category: "wallride",
      name: "Pendulum Swing",
      subtitle: "Drift And Steer In Step",
      eventDescription:
        "The car swings one way, then the other. Judges mark the weaker of Drift and Steer heavily, so both need to be good, with a little Accel and Grip.",
      icon: "🔔",
    },
    "2.5 × LOWER OF DRIFT/STEER + HIGHER OF DRIFT/STEER + 0.5 × ACCEL + 0.5 × GRIP",
    {
      score: (s) =>
        Math.round(
          (2.5 * Math.min(s.drift, s.steer) + Math.max(s.drift, s.steer) + 0.5 * s.accel + 0.5 * s.grip)
        ),
      breakdown: (s) =>
        `LOWER ${Math.min(s.drift, s.steer)}×2.5 + HIGHER ${Math.max(s.drift, s.steer)} + ACCEL ${s.accel}×0.5 + GRIP ${s.grip}×0.5`,
    }
  ),

  // ── Curves, gates and penalties ──────────────────────────────────────────
  custom(
    {
      id: "technical",
      category: "chase",
      name: "Precision Technical Section",
      subtitle: "Small Gains Count For More",
      eventDescription:
        "Tight, fiddly and all about consistency. Each stat's marks tail off the higher it goes, so a rounded car beats one with a single huge number.",
      icon: "🔬",
    },
    "5 × (√DRIFT × 1.5 + √ACCEL + √GRIP × 1.25 + √STEER × 0.75)",
    {
      score: (s) =>
        Math.round(
          (1.5 * 5 * Math.sqrt(s.drift) + 1 * 5 * Math.sqrt(s.accel) + 1.25 * 5 * Math.sqrt(s.grip) + 0.75 * 5 * Math.sqrt(s.steer))
        ),
      breakdown: (s) => `5×(√DRIFT ${s.drift}×1.5 + √ACCEL ${s.accel} + √GRIP ${s.grip}×1.25 + √STEER ${s.steer}×0.75)`,
    }
  ),
  custom(
    {
      id: "fullsend",
      category: "entry",
      name: "Full-Send Qualifier",
      subtitle: "Big Numbers Pay Double",
      eventDescription:
        "Qualifying run, one lap, no excuses. The higher a stat goes the more it is worth, so a car with big numbers pulls well clear.",
      icon: "💥",
    },
    "(DRIFT² × 1.25 + ACCEL² × 1.25 + GRIP² + STEER²) ÷ 25",
    {
      score: (s) =>
        Math.round(
          ((1.25 * s.drift * s.drift + 1.25 * s.accel * s.accel + 1 * s.grip * s.grip + 1 * s.steer * s.steer) / 25)
        ),
      breakdown: (s) => `(DRIFT ${s.drift}²×1.25 + ACCEL ${s.accel}²×1.25 + GRIP ${s.grip}² + STEER ${s.steer}²) ÷ 25`,
    }
  ),
  custom(
    {
      id: "gate",
      category: "entry",
      name: "High-Commitment Gate",
      subtitle: "Clear The Bar For Bonus Marks",
      eventDescription:
        "A narrow gate that only rewards commitment. Every point of a stat above 15 counts for an extra half.",
      icon: "🚪",
    },
    "DRIFT × 1.25 + ACCEL + GRIP × 1.25 + STEER (points over 15 count ×1.5)",
    {
      score: (s) => {
        const bar = (v: number) => v + 0.5 * Math.max(0, v - 15);
        return Math.round((1.25 * bar(s.drift) + 1 * bar(s.accel) + 1.25 * bar(s.grip) + 1 * bar(s.steer)));
      },
      breakdown: (s) => {
        const bar = (v: number) => fmt(v + 0.5 * Math.max(0, v - 15));
        return `DRIFT ${bar(s.drift)}×1.25 + ACCEL ${bar(s.accel)} + GRIP ${bar(s.grip)}×1.25 + STEER ${bar(s.steer)} (over 15 counts ×1.5)`;
      },
    }
  ),
  custom(
    {
      id: "launch",
      category: "wallride",
      name: "Cold Tyre Launch",
      subtitle: "Grip Decides Everything",
      eventDescription:
        "Cold tarmac and cold rubber. Everything the car has is multiplied by how well it holds the road, so Grip is worth far more than any other stat.",
      icon: "❄️",
    },
    "GRIP × (1.5 + (DRIFT + ACCEL + STEER) ÷ 75)",
    {
      score: (s) => Math.round(s.grip * (1.5 + (s.drift + s.accel + s.steer) / 75)),
      breakdown: (s) => `GRIP ${s.grip} × (1.5 + (DRIFT ${s.drift} + ACCEL ${s.accel} + STEER ${s.steer}) ÷ 75)`,
    }
  ),
  custom(
    {
      id: "gauntlet",
      category: "chase",
      name: "Weak-Link Gauntlet",
      subtitle: "Judges Punish A Gap",
      eventDescription:
        "Every stat is marked, but a big gap between your best and worst stat costs you points. Lopsided builds get found out here.",
      icon: "🔗",
    },
    "1.35 × TOTAL − 1.5 × (BEST − WORST)",
    {
      score: (s) => Math.max(0, Math.round((1.35 * total(s) - 1.5 * (highest(s) - lowest(s))))),
      breakdown: (s) => `TOTAL ${total(s)}×1.35 − GAP ${highest(s) - lowest(s)}×1.5`,
    }
  ),
  custom(
    {
      id: "judges",
      category: "wallride",
      name: "Judges' Consistency Test",
      subtitle: "All-Rounders Get A Bonus",
      eventDescription:
        "The panel adds up the whole car, then adds a bonus mark if it has no stat below 12. No cheap shortcuts, but no hiding places either.",
      icon: "📋",
    },
    "TOTAL + 10 if every stat is 12 or more",
    {
      score: (s) => Math.round((total(s) + (lowest(s) >= 12 ? 10 : 0))),
      breakdown: (s) => `TOTAL ${total(s)}${lowest(s) >= 12 ? " + 10 (no stat under 12)" : ""}`,
    }
  ),
];

/** Every corner the game can roll. */
export const CLASH_SECTOR_POOL: Array<Omit<ClashSectorSpec, "number">> = CORNERS.map((c) => ({
  ...c.spec,
  formulaBadge: c.spec.formulaBadge ?? "",
  formulaLabel: c.spec.formulaLabel ?? "",
}));

const CALC_BY_ID = new Map<string, SectorCalc>(CORNERS.map((c) => [c.spec.id, c.calc]));
/** A corner id this build doesn't know (e.g. saved by an older version) is scored like the Outside Wall Ride. */
const FALLBACK_CALC = CALC_BY_ID.get("wallride") as SectorCalc;

/** A car's stat score on a corner, with the working. Does not include tier, Crew, track or debuff points. */
export function computeSectorStatScore(sectorId: string, stats: CornerStats): { score: number; breakdown: string } {
  const calc = CALC_BY_ID.get(sectorId) ?? FALLBACK_CALC;
  return { score: calc.score(stats), breakdown: calc.breakdown(stats) };
}

/** A corner's stat score before the balancing in `TUNING`. For the balance check script (scripts/check-corners.ts). */
export function RAW_SECTOR_SCORE(sectorId: string, stats: CornerStats): number {
  const calc = CALC_BY_ID.get(sectorId) ?? FALLBACK_CALC;
  return (calc.untuned ?? calc.score)(stats);
}
