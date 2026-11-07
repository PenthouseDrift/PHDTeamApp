import { RARITY_STAT_BRACKETS, tierFromStats, type MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier } from "@/lib/pack-config";
import { getCarNormalizedTotalScore } from "../challenges-types";
import { generatedCar, profileOf, type PlayerProfile } from "../opponent-matching";
import { mulberry32 } from "../battle-sim";
import { ladderDials, crewCardsFromSpecs, rollRivalCrewSpecs, type Rng, type RivalCrewSpec } from "../rival-ai";
import type { ClashOpponent } from "../types";
import { RIVAL_POOL_SIZE } from "./config";
import type { ArtEntry } from "./types";

/**
 * Pure card and rival generation for the Drift Campaign. No storage, no React: every random choice takes a seed, so a
 * run can be rebuilt and simulated (see calibrate.ts and scripts/simulate-campaign.ts).
 *
 * The player drives their own cards. The rivals are the generated side: pictures come from the art pool (every car photo
 * in the game) and stats are generated here at the start of the run, which is what lets each rival be made exactly as
 * hard as its round needs against the cars the player picked.
 */

export const PLACEHOLDER_ART: ArtEntry = {
  key: "placeholder",
  name: "Prototype Chassis",
  driver: "Test Driver",
  team: "Team PHD",
  imageUrl: "/icons/icon-512.png",
  imageZoom: 106,
  imageX: 50,
  imageY: 50,
};

const DRIVER_NAMES = [
  "Jax Moretti", "Mika Tanaka", "Sofia Reyes", "Dex Holloway", "Nova Lindqvist", "Rafe Okafor",
  "Yuki Sato", "Cass Brennan", "Tomas Vidal", "Ines Duarte", "Kai Mendez", "Bryn Calloway",
  "Hana Mori", "Zed Harlow", "Luca Fontaine", "Mara Voss",
];
const TEAM_NAMES = [
  "Smoke Show Racing", "Touge Collective", "Redline Syndicate", "Night Shift Drift",
  "Apex Garage", "Ghost Lane Crew", "Sideways Society", "Rising Line Works",
];
export const CHAMPION = { driver: "The Champion", team: "Champions Row" };

/** Take `count` entries from the pool at random, with no repeats unless the pool is too small. */
export function pickArt(pool: ArtEntry[], count: number, rng: Rng, avoid: Set<string> = new Set()): ArtEntry[] {
  if (pool.length === 0) return Array.from({ length: count }, () => PLACEHOLDER_ART);
  const fresh = pool.filter((a) => !avoid.has(a.key));
  const source = fresh.length >= count ? fresh : pool;
  const left = source.slice();
  const out: ArtEntry[] = [];
  while (out.length < count) {
    if (left.length === 0) left.push(...source);
    out.push(left.splice(Math.floor(rng() * left.length), 1)[0]);
  }
  return out;
}

function faceOf(art: ArtEntry) {
  return {
    name: art.name,
    ability: "Campaign Spec",
    effect: "Tuned for the Drift Campaign.",
    imageUrl: art.imageUrl,
    imageZoom: art.imageZoom,
    imageX: art.imageX,
    imageY: art.imageY,
  };
}

const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, legend: 3, mythic: 4 };

/**
 * Give each rival car a picture from a card of its own rarity. Pictures are drawn in a look for their rarity, so a Silver
 * rival with a Legend picture looks wrong. The stats are made first (they have to be, to be calibrated), so the pictures are
 * matched to the finished cars. A car takes an unused picture of its rarity, or the nearest rarity (the lower one on a tie)
 * when there are none left. Pictures in `avoid` (the player's, and rivals already faced) are not used. The picture does not
 * affect scoring, so this never changes how hard a rival is.
 */
export function matchFacesToTiers(cars: MemberCard[], pool: ArtEntry[], avoid: Set<string>, rng: Rng): MemberCard[] {
  const tiered = pool.filter((a) => a.tier && a.tier in TIER_RANK);
  if (tiered.length === 0) return cars;
  const taken = new Set(avoid);
  const used = new Set<string>();
  return cars.map((car) => {
    const want = TIER_RANK[car.tier] ?? 0;
    const sameTier = tiered.filter((a) => TIER_RANK[a.tier as string] === want);
    // The car's own rarity always comes first: an unused picture of it, then (when they have all been used) one used by
    // a rival before, then one already on this roster. Another rarity is only used if there are no pictures of this one at all.
    let best = sameTier.filter((a) => !taken.has(a.key));
    if (best.length === 0) best = sameTier.filter((a) => !used.has(a.key));
    if (best.length === 0) best = sameTier;
    if (best.length === 0) {
      let bestDistance = Infinity;
      for (const art of tiered) {
        const rank = TIER_RANK[art.tier as string];
        const distance = Math.abs(rank - want) + (rank > want ? 0.1 : 0);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [art];
        } else if (distance === bestDistance) best.push(art);
      }
    }
    if (best.length === 0) return car;
    const pick = best[Math.floor(rng() * best.length)];
    taken.add(pick.key);
    used.add(pick.key);
    return { ...car, ...faceOf(pick) };
  });
}

export interface PlayerSide {
  cars: MemberCard[];
  crew: MemberCard[];
}

/** How strong a rival's cars are compared with the player's, at each point on the strength ladder. */
export function carRatio(strength: number): number {
  return 0.4 + 0.65 * strength;
}

export interface RivalBuild {
  /** The cars the rival chooses its three from. */
  carPool: MemberCard[];
  crewSpecs: RivalCrewSpec[];
  crewPool: MemberCard[];
  skill: number;
}

/**
 * A rival at one point on the strength ladder (0 = pushover, 1.25 = as strong as it gets). One number turns every dial:
 * how good its cars are compared with the player's, how well the AI plays, and how many (and how rare) Crew cards it
 * can choose from. `seed` fixes the random parts, so the same seed at a nearby strength gives a nearby rival.
 */
export function rivalAt(
  profile: PlayerProfile,
  strength: number,
  art: ArtEntry[],
  seed: number,
  persona: { driver: string; team: string }
): RivalBuild {
  const carRng = mulberry32(seed);
  const crewRng = mulberry32(seed ^ 0x51ed270b);
  const dials = ladderDials(strength);
  const ratio = carRatio(strength);

  // Three cars at the full ratio, the rest a little weaker, so the AI has a choice but the best three are about on target.
  const targets: number[] = [];
  for (let i = 0; i < RIVAL_POOL_SIZE; i++) {
    const base = profile.carPoints[i % profile.carPoints.length];
    const jitter = 1 + (carRng() * 2 - 1) * 0.03;
    targets.push(base * ratio * jitter * (i < 3 ? 1 : 0.9));
  }
  const faces = art.length >= RIVAL_POOL_SIZE ? art : pickArt(art, RIVAL_POOL_SIZE, carRng);
  const carPool = targets.map((target, i) => {
    const car = generatedCar(target, carRng, persona);
    return { ...car, ...faceOf(faces[i]), id: `campaign-rival-${seed}-${i}`, userId: "campaign-rival", driver: persona.driver, team: persona.team };
  });

  const crewSpecs = rollRivalCrewSpecs(crewRng, dials.crewCount, dials.crewBoost);
  const crewPool = crewCardsFromSpecs(crewSpecs).map((c, i) => ({ ...c, id: `campaign-rival-crew-${seed}-${i}` }));
  return { carPool, crewSpecs, crewPool, skill: dials.skill };
}

/** The persona for a round: a different driver and team each time, and the Champion for the last one. */
export function personaFor(round: number, rounds: number, rng: Rng): { driver: string; team: string } {
  if (round >= rounds) return CHAMPION;
  const offset = Math.floor(rng() * DRIVER_NAMES.length);
  return {
    driver: DRIVER_NAMES[(offset + round * 5) % DRIVER_NAMES.length],
    team: TEAM_NAMES[(offset + round * 3) % TEAM_NAMES.length],
  };
}

/** Wrap a built rival as the opponent the arena plays against. */
export function toOpponent(
  id: string,
  title: string,
  persona: { driver: string; team: string },
  build: RivalBuild
): ClashOpponent {
  const cards = build.carPool.slice(0, 3);
  const crewCards = build.crewPool.slice(0, 3) as [MemberCard, MemberCard, MemberCard];
  return {
    id,
    driverName: persona.driver,
    teamName: persona.team,
    title,
    crewPower: cards.reduce((sum, c) => sum + getCarNormalizedTotalScore(c), 0),
    cards,
    crewCard: crewCards[0],
    crewCards,
    carPool: build.carPool,
    crewPoolSpecs: build.crewSpecs,
    aiSkill: build.skill,
  };
}

export function profileFor(side: PlayerSide): PlayerProfile {
  const profile = profileOf(side.cars, side.crew);
  if (!profile) throw new Error("The campaign needs at least one car.");
  return profile;
}

// ── Showcase rivals: real rarities ──────────────────────────────────────────────────────────────────────────────────
//
// The first rounds use rivals built to the player's own card points (`rivalAt`). From the Quarter-Final the rivals show
// off: a roster of real cards of one rarity, such as an all-legend Final. How hard they are is then set by the AI's skill,
// its Crew cards and how high in the rarity the stats sit, so a roster that looks that strong can still be beaten as
// often as the round's win chance says. A rarity is only used when the player's cards can still reach that win chance.

export const TIER_ORDER: FullArtTier[] = ["bronze", "silver", "gold", "legend"];

/** Rank of a rarity from bronze (0) to legend (3). Mythic counts as legend. */
export function tierRank(tier: FullArtTier): number {
  return Math.max(0, TIER_ORDER.indexOf(tier === "mythic" ? "legend" : tier));
}

/** The best rarity among a set of cars. */
export function bestTierOf(cars: MemberCard[]): FullArtTier {
  return cars.reduce<FullArtTier>((best, c) => (tierRank(c.tier) > tierRank(best) ? c.tier : best), "bronze");
}

/** The most common rarity among the cars a rival leads with, for the bracket. */
export function rosterTierOf(cars: MemberCard[]): FullArtTier {
  const counts = new Map<FullArtTier, number>();
  for (const c of cars.slice(0, 3)) counts.set(c.tier, (counts.get(c.tier) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || tierRank(b[0]) - tierRank(a[0]))[0]?.[0] ?? "bronze";
}

/** The lowest and highest stat total a showcase card of a rarity can have. Bronze starts at 30 so it is never a joke car. */
function totalRange(tier: FullArtTier): [number, number] {
  const bracket = RARITY_STAT_BRACKETS.find((b) => b.tier === (tier === "mythic" ? "legend" : tier));
  if (!bracket) return [30, 59];
  return [tier === "bronze" ? 30 : bracket.minTotal, bracket.maxTotal];
}

/** Stats for a card of this rarity that add up to exactly `target`, spread unevenly like a rolled card. */
function statsWithTotal(tier: FullArtTier, target: number, rng: Rng) {
  const rolled = rollStatsForTier(tier, rng);
  const values = [rolled.drift, rolled.accel, rolled.grip, rolled.steer].map(Number);
  let diff = target - values.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 400; guard++) {
    const k = Math.floor(rng() * 4);
    const step = diff > 0 ? 1 : -1;
    if (values[k] + step >= 1 && values[k] + step <= 25) {
      values[k] += step;
      diff -= step;
    }
  }
  const [drift, accel, grip, steer] = values.map(String);
  return { drift, accel, grip, steer };
}

/**
 * A roster of real cards of one rarity at a point on the strength ladder (0 to 1.25). Strength sets how high in the
 * rarity the stats sit (0 = bottom of its range, 1 = top), and, as for any rival, the AI's skill and Crew cards.
 */
export function showcaseAt(
  tier: FullArtTier,
  strength: number,
  art: ArtEntry[],
  seed: number,
  persona: { driver: string; team: string }
): RivalBuild {
  const carRng = mulberry32(seed);
  const crewRng = mulberry32(seed ^ 0x51ed270b);
  const dials = ladderDials(strength);
  const [lo, hi] = totalRange(tier);
  const quality = Math.min(1, Math.max(0, strength));
  const faces = art.length >= RIVAL_POOL_SIZE ? art : pickArt(art, RIVAL_POOL_SIZE, carRng);

  const carPool: MemberCard[] = [];
  for (let i = 0; i < RIVAL_POOL_SIZE; i++) {
    const jitter = (carRng() * 2 - 1) * 0.12;
    const total = Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, quality + jitter)));
    const stats = statsWithTotal(tier, total, carRng);
    carPool.push({
      id: `campaign-rival-${seed}-${i}`,
      userId: "campaign-rival",
      createdAt: 0,
      styleIds: [],
      kept: true,
      rerolled: false,
      tier: tierFromStats(stats),
      stats,
      driver: persona.driver,
      team: persona.team,
      ...faceOf(faces[i]),
    });
  }

  const crewSpecs = rollRivalCrewSpecs(crewRng, dials.crewCount, dials.crewBoost);
  const crewPool = crewCardsFromSpecs(crewSpecs).map((c, i) => ({ ...c, id: `campaign-rival-crew-${seed}-${i}` }));
  return { carPool, crewSpecs, crewPool, skill: dials.skill };
}

/**
 * The rarities to try for a round's showcase roster, strongest first, for a player whose best car is `best`. From the
 * Quarter-Final the rivals aim above the player's cards and the Final aims for all legend; each is tried in turn and the
 * first one the player's cards can still beat at the round's win chance is used. Rounds 1 to 3 have no showcase.
 */
export function showcaseTiersFor(round: number, best: FullArtTier): FullArtTier[] | undefined {
  const b = tierRank(best);
  let top: number;
  if (round === 4) top = Math.max(b, 1); // at least silver
  else if (round === 5) top = Math.max(Math.min(b + 1, 3), 2); // a rarity above the player's best, at least gold
  else if (round >= 6) top = 3; // legend
  else return undefined;
  // Down to one rarity below the player's best car, so a draw that cannot beat its own rarity still faces real cards.
  return TIER_ORDER.slice(Math.max(0, b - 1), Math.max(b, top) + 1).reverse();
}
