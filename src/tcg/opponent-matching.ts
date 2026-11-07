import type { MemberCard } from "@/lib/card-roll";
import { tierFromStats } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { CLASH_SECTOR_POOL, computeSectorStatScore } from "./clash-corners";
import { TIER_CLASH_BONUS, getCardPower, getNormalizedCardStats } from "./progression";
import { crewCardsFromSpecs, rollRivalCrewSpecs, type Rng } from "./rival-ai";

/**
 * Matching the normal game's opponent to the player. Pure code, no storage.
 *
 * The normal game used to field a member's very best cards whatever the player owned, so a new player with bronze cards
 * met legendary ones. Now the opponent is built to the player's own power, card for card: a player with one legend and two
 * bronze cars meets one car of about the legend's points and two of about the bronzes'. "Points" is what a car actually
 * scores on a corner (its average stat score across every corner the game can roll, plus the rarity bonus), so the match is
 * on what decides a corner, not on a rarity label.
 *
 * Real cards from a member's collection are used wherever one is close enough. A gap is filled with a generated car of
 * the right strength, so the match never depends on who happens to own what.
 */

/**
 * The opponent aims for this share of the player's points. Below 1 on purpose: the rival AI plays every debuff and Crew
 * card perfectly, so cards of equal points would win most games. Measured with battle-sim.ts, 0.85 gives a brand new
 * player about 40% wins and a skilled one about 55%, and stronger collections still win more.
 */
export const MATCH_STRENGTH = 0.85;
/** Each opponent car is nudged up or down by up to this much, so two games against the same player are not identical. */
export const MATCH_JITTER = 0.05;
/** A real card within this share of the target (or the flat allowance below) is used as it is. */
export const MATCH_TOLERANCE = 0.1;
export const MATCH_TOLERANCE_FLAT = 3;
/** Cost added to a member's fit for each generated car, so real cards are preferred when they fit as well. */
export const GENERATED_PENALTY = 0.05;

const SECTOR_IDS = CLASH_SECTOR_POOL.map((s) => s.id);

/** What a car scores on an average corner: stat score averaged over every corner type, plus the rarity bonus. */
export function carPoints(card: Pick<MemberCard, "tier" | "stats">): number {
  const stats = getNormalizedCardStats(card);
  let sum = 0;
  for (const id of SECTOR_IDS) sum += computeSectorStatScore(id, stats).score;
  return sum / SECTOR_IDS.length + (TIER_CLASH_BONUS[card.tier as FullArtTier] ?? 0);
}

export interface PlayerProfile {
  /** Points of the player's three best cars, strongest first. */
  carPoints: number[];
  /** Rarity of the player's three best Crew cards, strongest first. */
  crewTiers: FullArtTier[];
}

/**
 * The player's strength: their three best cars by points and three best Crew cards by power. A short collection is
 * filled out with its weakest card so the opponent is never stronger than the player's real spread.
 */
export function profileOf(cars: MemberCard[], crew: MemberCard[]): PlayerProfile | null {
  if (cars.length === 0) return null;
  const points = cars.map(carPoints).sort((a, b) => b - a).slice(0, 3);
  while (points.length < 3) points.push(points[points.length - 1]);
  const crewSorted = [...crew].sort((a, b) => getCardPower(b) - getCardPower(a)).slice(0, 3);
  const crewTiers = crewSorted.map((c) => c.tier as FullArtTier);
  while (crewTiers.length < 3) crewTiers.push("bronze");
  return { carPoints: points, crewTiers };
}

const GENERATED_NAMES = [
  "Midnight Silvia", "Touge Runner", "Backstreet S15", "Rising Sun RWD", "Mountain Goat", "Neon Drifter",
  "Hachi Spirit", "Rain Dancer", "Night Shift", "Smoke Signal", "Redline Special", "Gravel King",
];

export interface Persona {
  driver: string;
  team: string;
}

let generatedCount = 0;
/**
 * What a generated car scores, for each way of ordering its stats (there are only 24) and each total. It never changes, and
 * finding the best total for a target scans all 77 totals, so it is worked out once and kept.
 */
const generatedScores = new Map<string, { usable: boolean; points: number }>();

/** A car whose points are as close as possible to `target`, with its stats spread a little unevenly like a real card. */
export function generatedCar(target: number, rng: Rng, persona: Persona): MemberCard {
  // A real card has one or two strong stats and some weak ones. The game treats a card whose stats are ALL 10 or under
  // as an old-style card and scales it up, so a generated car always keeps one stat above 10 (it never looks weak and scores high).
  const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
  const WEIGHTS = [2.0, 1.2, 0.6, 0.2];
  const build = (total: number): [string, string, string, string] => {
    const raw = WEIGHTS.map((w) => (total * w) / 4);
    const out = raw.map((v) => Math.max(1, Math.min(25, Math.round(v))));
    // Nudge the stats until they add up to the total.
    let diff = total - out.reduce((a, b) => a + b, 0);
    for (let guard = 0; diff !== 0 && guard < 200; guard++) {
      const k = guard % 4;
      const step = diff > 0 ? 1 : -1;
      if (out[k] + step >= 1 && out[k] + step <= 25) {
        out[k] += step;
        diff -= step;
      }
    }
    const byStat = [0, 0, 0, 0];
    order.forEach((statIndex, rank) => (byStat[statIndex] = out[rank]));
    return byStat.map(String) as [string, string, string, string];
  };
  const make = (total: number): Pick<MemberCard, "tier" | "stats"> => {
    const [drift, accel, grip, steer] = build(total);
    const stats = { drift, accel, grip, steer };
    return { tier: tierFromStats(stats), stats };
  };
  let best = 24;
  let bestGap = Infinity;
  const orderKey = order.join("");
  for (let total = 24; total <= 100; total++) {
    const scoreKey = `${orderKey}:${total}`;
    let scored = generatedScores.get(scoreKey);
    if (!scored) {
      const candidate = make(total);
      scored = {
        usable: Math.max(...Object.values(candidate.stats).map(Number)) > 10,
        points: carPoints(candidate),
      };
      generatedScores.set(scoreKey, scored);
    }
    if (!scored.usable) continue;
    const gap = Math.abs(scored.points - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = total;
    }
  }
  const { tier, stats } = make(best);
  generatedCount++;
  return {
    id: `matched-car-${generatedCount}`,
    userId: "matched-rival",
    name: GENERATED_NAMES[Math.floor(rng() * GENERATED_NAMES.length)],
    ability: "Rival chassis",
    effect: "Built to match your garage",
    driver: persona.driver,
    team: persona.team,
    tier,
    styleIds: [],
    stats,
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  };
}

export interface CarMatch {
  cars: MemberCard[];
  /** How far the real cards were from their targets, plus a small cost per generated car. Lower is a better match. */
  fit: number;
  generated: number;
}

/**
 * Choose three cars for the targets (points, strongest first). For each target the closest unused real car is used if it
 * is near enough, otherwise one is generated.
 */
export function matchCars(targets: number[], owned: MemberCard[], rng: Rng, persona: Persona): CarMatch {
  const pool = owned.map((card) => ({ card, points: carPoints(card) }));
  const used = new Set<string>();
  const cars: MemberCard[] = [];
  let fit = 0;
  let generated = 0;
  for (const target of [...targets].sort((a, b) => b - a)) {
    let best: (typeof pool)[number] | null = null;
    for (const p of pool) {
      if (used.has(p.card.id)) continue;
      if (!best || Math.abs(p.points - target) < Math.abs(best.points - target)) best = p;
    }
    const gap = best ? Math.abs(best.points - target) : Infinity;
    if (best && gap <= Math.max(MATCH_TOLERANCE_FLAT, target * MATCH_TOLERANCE)) {
      used.add(best.card.id);
      cars.push(best.card);
      fit += gap / Math.max(1, target);
    } else {
      cars.push(generatedCar(target, rng, persona));
      fit += GENERATED_PENALTY;
      generated++;
    }
  }
  return { cars, fit, generated };
}

/** The points the opponent's cars should be, from the player's: slightly ahead, each nudged by a little luck. */
export function targetsFor(profile: PlayerProfile, rng: Rng, strength = MATCH_STRENGTH): number[] {
  return profile.carPoints.map((p) => p * strength * (1 + (rng() * 2 - 1) * MATCH_JITTER));
}

/**
 * Three Crew cards of the same rarities as the player's. A real Crew card of that rarity is used if there is one,
 * otherwise a card is generated at that rarity.
 */
export function matchCrew(tiers: FullArtTier[], owned: MemberCard[], rng: Rng): MemberCard[] {
  const used = new Set<string>();
  const out: Array<MemberCard | null> = [];
  for (const tier of tiers) {
    const found = owned.find((c) => !used.has(c.id) && c.tier === tier);
    if (found) {
      used.add(found.id);
      out.push(found);
    } else {
      out.push(null);
    }
  }
  // Generated cards for the gaps, each a different Crew card at the rarity wanted.
  const gaps = out.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  const specs = gaps.length > 0 ? rollRivalCrewSpecs(rng, gaps.length, 0) : [];
  const made = crewCardsFromSpecs(specs.map((spec, n) => ({ ...spec, tier: tiers[gaps[n]] })));
  let next = 0;
  return out.map((c) => c ?? made[next++]);
}
