/**
 * Mythic against Legend Crew: what the battle stat ceiling (BATTLE_STAT_CEILING in src/tcg/progression.ts) does to a car
 * whose stats are already at 25.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/check-mythic-crew.ts
 *   TRIALS=6000 ...                                                # more matchups, steadier numbers
 *
 * Part 1 takes each Legend-rarity Crew card on its own and shows how many corner points its STAT changes are worth on a
 * Mythic (25 in every stat), a Legend car and a Gold car, with the stats held at 25 and with the real ceiling. Flat
 * points are not shown: they are the same either way.
 *
 * Part 2 plays whole 3-corner matchups with the game's real scoring (`evaluateCornerMatchup`, no debuffs, no finale):
 * a Mythic car against a Legend car, both sides with Legend Crew they play to their own best advantage. It uses the
 * ceiling that is set in the code. To compare, change the constant to 25, run this again, and put it back.
 */
import type { MemberCard } from "@/lib/card-roll";
import {
  CREW_CARD_SET,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  scaleCrewCardDefinition,
  type CrewCardDefinition,
} from "@/lib/crew-cards";
import type { FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier } from "@/lib/pack-config";
import { mulberry32 } from "@/tcg/battle-sim";
import { CLASH_SECTOR_POOL, computeSectorStatScore } from "@/tcg/clash-corners";
import {
  BATTLE_STAT_CEILING,
  STARTER_LOANER_CREW_CARDS,
  applyCrewModsToStats,
  evaluateCornerMatchup,
  type ClashSectorSpec,
} from "@/tcg/progression";
import { NEUTRAL_DEBUFF, type Rng } from "@/tcg/rival-ai";

const TRIALS = Number(process.env.TRIALS ?? 3000);
const pct = (n: number) => `${(n * 100).toFixed(1).padStart(5)}%`;
const num = (n: number, w = 6) => n.toFixed(1).padStart(w);

type Stats = { drift: number; accel: number; grip: number; steer: number };
const MYTHIC: Stats = { drift: 25, accel: 25, grip: 25, steer: 25 };
const LEGEND_CAR: Stats = { drift: 22, accel: 22, grip: 22, steer: 22 };
const GOLD_CAR: Stats = { drift: 20, accel: 20, grip: 20, steer: 19 };

let ids = 0;
function carCard(tier: FullArtTier, stats: Stats, who: string): MemberCard {
  return {
    id: `${who}-car-${ids++}`,
    userId: who,
    name: `${who} car`,
    ability: "",
    effect: "",
    tier,
    stats: {
      drift: String(stats.drift),
      accel: String(stats.accel),
      grip: String(stats.grip),
      steer: String(stats.steer),
    },
    imageUrl: "",
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: who,
    team: who,
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  };
}
function crewCard(def: CrewCardDefinition, tier: FullArtTier, who: string): MemberCard {
  return {
    id: `${who}-crew-${ids++}`,
    userId: who,
    ...crewDefinitionToCardData({ ...def, tier }),
    tier,
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  } as MemberCard;
}

const clamp25 = (s: Stats): Stats => ({
  drift: Math.min(25, s.drift),
  accel: Math.min(25, s.accel),
  grip: Math.min(25, s.grip),
  steer: Math.min(25, s.steer),
});
const avgCornerScore = (s: Stats) =>
  CLASH_SECTOR_POOL.reduce((sum, c) => sum + computeSectorStatScore(c.id, s).score, 0) / CLASH_SECTOR_POOL.length;

// ── Part 1: what each Legend Crew card's stat changes are worth ───────────────────────────────────────────────────────
console.log(`Battle stat ceiling in the code: ${BATTLE_STAT_CEILING}\n`);
console.log("Part 1. Average corner points from a Legend Crew card's STAT changes (all corners), held at 25 -> with the ceiling");
console.log("Card".padEnd(40) + "Mythic (25s)".padEnd(18) + "Legend car".padEnd(18) + "Gold car");
const rows = CREW_CARD_SET.map((def) => {
  const mods = scaleCrewCardDefinition(def, "legend").modifiers ?? {};
  const gain = (base: Stats) => {
    const after = applyCrewModsToStats(base, mods);
    const was = avgCornerScore(clamp25(after)) - avgCornerScore(base);
    const now = avgCornerScore(after) - avgCornerScore(base);
    return { was, now };
  };
  return { name: `${def.setNumber}. ${def.name}`.slice(0, 38), m: gain(MYTHIC), l: gain(LEGEND_CAR), g: gain(GOLD_CAR) };
});
rows.sort((a, b) => b.m.now - a.m.now);
const fmt = (g: { was: number; now: number }) => `${num(g.was, 5)} -> ${num(g.now, 5)}`.padEnd(18);
for (const r of rows.slice(0, 10)) console.log(r.name.padEnd(40) + fmt(r.m) + fmt(r.l) + fmt(r.g).trim());
const withStats = rows.filter((r) => r.m.now > 0 || r.m.was > 0);
const mean = (f: (r: (typeof rows)[number]) => number) => withStats.reduce((s, r) => s + f(r), 0) / Math.max(1, withStats.length);
console.log(
  `\nMean over the ${withStats.length} cards with stat changes: Mythic ${num(mean((r) => r.m.was), 5)} -> ${num(mean((r) => r.m.now), 5)}, ` +
    `Legend car ${num(mean((r) => r.l.was), 5)} -> ${num(mean((r) => r.l.now), 5)}, ` +
    `Gold car ${num(mean((r) => r.g.was), 5)} -> ${num(mean((r) => r.g.now), 5)}`
);

// ── Part 2: Mythic against Legend, both with Legend Crew ─────────────────────────────────────────────────────────────
interface Side {
  car: MemberCard;
  crew: MemberCard[];
}
const NEUTRAL_TRACK = UK_TRACK_CARD_SET[0];

function score(
  corner: 0 | 1 | 2,
  sector: ClashSectorSpec,
  me: MemberCard,
  them: MemberCard,
  myCrew: MemberCard | null,
  theirCrew: MemberCard | null
) {
  const r = evaluateCornerMatchup({
    cornerIdx: corner,
    sector,
    playerCard: me,
    rivalCard: them,
    playerCrewCard: myCrew,
    rivalCrewCard: theirCrew,
    playerDebuffCard: NEUTRAL_DEBUFF,
    rivalDebuffCard: NEUTRAL_DEBUFF,
    trackCard: NEUTRAL_TRACK,
  });
  return { mine: r.playerScore, theirs: r.rivalScore };
}

/** Each side picks, for each corner, the unused Crew card that beats the other car's loaner the most. */
function playBattle(a: Side, b: Side, sectors: [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec]) {
  const left = (s: Side) => s.crew.map((_, i) => i);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let totalA = 0;
  let totalB = 0;
  let cornersA = 0;
  for (const corner of [0, 1, 2] as const) {
    const pick = (me: Side, them: Side, used: Set<number>, mineIsA: boolean) => {
      let best = left(me).find((i) => !used.has(i)) ?? 0;
      let bestMargin = -Infinity;
      for (const i of left(me)) {
        if (used.has(i)) continue;
        const s = mineIsA
          ? score(corner, sectors[corner], me.car, them.car, me.crew[i], STARTER_LOANER_CREW_CARDS[corner])
          : score(corner, sectors[corner], them.car, me.car, STARTER_LOANER_CREW_CARDS[corner], me.crew[i]);
        const margin = mineIsA ? s.mine - s.theirs : s.theirs - s.mine;
        if (margin > bestMargin) {
          bestMargin = margin;
          best = i;
        }
      }
      used.add(best);
      return best;
    };
    const ia = pick(a, b, usedA, true);
    const ib = pick(b, a, usedB, false);
    const s = score(corner, sectors[corner], a.car, b.car, a.crew[ia], b.crew[ib]);
    totalA += s.mine;
    totalB += s.theirs;
    if (s.mine > s.theirs) cornersA++;
  }
  return { totalA, totalB, cornersA };
}

function sectorsFor(rng: Rng): [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec] {
  const pool = CLASH_SECTOR_POOL.map((c, i) => ({ ...c, number: ((i % 3) + 1) as 1 | 2 | 3 }));
  const out: ClashSectorSpec[] = [];
  while (out.length < 3) {
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!out.some((o) => o.id === pick.id)) out.push({ ...pick, number: (out.length + 1) as 1 | 2 | 3 });
  }
  return out as [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec];
}

function scenario(
  label: string,
  carA: (rng: Rng) => MemberCard,
  carB: (rng: Rng) => MemberCard,
  crewTier: FullArtTier | null,
  crewTierB: FullArtTier | null = crewTier
) {
  const rng = mulberry32(777);
  let wins = 0;
  let cornerWins = 0;
  let margin = 0;
  for (let t = 0; t < TRIALS; t++) {
    const crewFor = (who: string, tier: FullArtTier | null) =>
      Array.from({ length: 3 }, () => {
        if (!tier) return STARTER_LOANER_CREW_CARDS[0];
        // Cards picked like a pack would hand them out.
        return crewCard(CREW_CARD_SET[Math.floor(rng() * CREW_CARD_SET.length)], tier, who);
      });
    const a: Side = { car: carA(rng), crew: crewFor("a", crewTier) };
    const b: Side = { car: carB(rng), crew: crewFor("b", crewTierB) };
    const r = playBattle(a, b, sectorsFor(rng));
    margin += r.totalA - r.totalB;
    cornerWins += r.cornersA;
    if (r.cornersA >= 2) wins++;
  }
  console.log(
    `${label.padEnd(54)} wins ${pct(wins / TRIALS)}   corners ${pct(cornerWins / (TRIALS * 3))}   avg margin ${num(margin / TRIALS)}`
  );
}

const legendCar = (rng: Rng) => {
  const s = rollStatsForTier("legend", rng);
  return carCard("legend", { drift: +s.drift, accel: +s.accel, grip: +s.grip, steer: +s.steer }, "legend");
};
const mythicCar = () => carCard("mythic", MYTHIC, "mythic");

console.log(`\nPart 2. ${TRIALS} matchups, 3 random corners each, no debuffs, no finale (ceiling ${BATTLE_STAT_CEILING})`);
console.log("(first side is the one named first; a win is 2 or more corners)");
scenario("Mythic v Legend, both with Legend Crew", mythicCar, legendCar, "legend");
scenario("Mythic v Legend, both with Bronze Crew", mythicCar, legendCar, "bronze");
scenario("Mythic v Legend, no Crew (loaners only)", mythicCar, legendCar, null);
scenario("Legend v Legend, both with Legend Crew (fairness check)", legendCar, legendCar, "legend");
scenario("Legend car + Legend Crew v Mythic car + Bronze Crew", legendCar, mythicCar, "legend", "bronze");
scenario("Legend car + Bronze Crew v Mythic car + Legend Crew", legendCar, mythicCar, "bronze", "legend");
