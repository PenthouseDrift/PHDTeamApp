import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { getNormalizedCardStats } from "@/tcg/progression";
import { crewCardsFromSpecs, rollRivalCrewSpecs } from "@/tcg/rival-ai";
import { botStance } from "./stance";
import { between, pick, type Rng } from "./rng";
import type { Stance, TourConfig, TourOpponent } from "./types";

/**
 * Bots stand in when there is no ghost to face (for example, the first members to play a Round). They are sized from the
 * Round number and the member's rating so they feel like a fair person, not a wall.
 */

const BOT_NAMES = [
  "K. Mercer", "T. Aoki", "D. Walsh", "L. Okafor", "M. Reyes", "S. Patel", "J. Holt", "R. Sato",
  "C. Brennan", "A. Novak", "P. Lindqvist", "H. Mori", "E. Duarte", "B. Kowalski", "N. Fraser", "G. Ito",
];
const BOT_CARS = [
  "Midnight Silvia", "Touge Runner", "Backstreet S15", "Rising Sun RWD", "Mountain Goat", "Neon Drifter",
  "Hachi Spirit", "Rain Dancer", "Night Shift", "Smoke Signal", "Redline Special", "Gravel King",
];

/** Stats per car for a bot of each rarity are set by `statAvg` below; this maps the average back to a rarity label. */
function tierFromAverage(avg: number): FullArtTier {
  const total = avg * 4;
  if (total >= 100) return "mythic";
  if (total >= 85) return "legend";
  if (total >= 75) return "gold";
  if (total >= 60) return "silver";
  return "bronze";
}

/** The average stat (1 to 25) of the member's strongest two cars. Bots are sized from this so every member meets an even fight. */
export function loadoutAverage(cars: MemberCard[]): number {
  const avgs = cars
    .map((c) => {
      const n = getNormalizedCardStats(c);
      return (n.drift + n.accel + n.grip + n.steer) / 4;
    })
    .sort((a, b) => b - a)
    .slice(0, 2);
  if (avgs.length === 0) return 14;
  return avgs.reduce((s, v) => s + v, 0) / avgs.length;
}

/** How far above (or below) the member's own average a bot is, by Round. It starts soft and finishes with a boss. */
const RAMP = [-4, -3, -2, -1, 0, 1, 2, 3, 3, 3, 3, 3];

/** Bots follow the member's cards only part of the way, so better cards are still an advantage against them. */
const MID_STAT = 17;
const FOLLOW = 0.6;

export function botStatAverage(round: number, playerAvg: number): number {
  const ramp = RAMP[Math.max(0, Math.min(RAMP.length - 1, round - 1))];
  const followed = MID_STAT + (playerAvg - MID_STAT) * FOLLOW;
  return Math.max(8, Math.min(25, followed + ramp));
}

function botCar(avg: number, rng: Rng, n: number): MemberCard {
  const tier = tierFromAverage(avg);
  const stat = () => String(Math.max(1, Math.min(25, tier === "mythic" ? 25 : Math.round(avg) + between(-2, 2, rng))));
  return {
    id: `tour-bot-car-${n}`,
    userId: "tour-bot",
    name: pick(BOT_CARS, rng),
    ability: "Generated chassis",
    effect: "Tour bot",
    driver: "Tour Bot",
    team: "Open Entry",
    tier,
    styleIds: [],
    stats: { drift: stat(), accel: stat(), grip: stat(), steer: stat() },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  };
}

/** A bot opponent for this Round, sized from the member's own strongest cars. */
export function buildBot(opts: {
  round: number;
  rating: number;
  playerAvg: number;
  stanceHistory: Stance[];
  rng: Rng;
  config: Pick<TourConfig, "tuning">;
}): TourOpponent {
  const { round, rating, playerAvg, stanceHistory, rng, config } = opts;
  const avg = botStatAverage(round, playerAvg);
  // A member with strong cars meets a bot with better Crew cards too.
  const crewBoost = Math.max(0, Math.min(1.25, (MID_STAT + (playerAvg - MID_STAT) * FOLLOW - 15) / 5));
  const crewSpecs = rollRivalCrewSpecs(rng, 4, crewBoost);
  return {
    kind: "bot",
    ghostId: null,
    ownerId: null,
    name: pick(BOT_NAMES, rng),
    rating: Math.round(rating),
    car: botCar(avg, rng, round),
    crew: crewCardsFromSpecs(crewSpecs),
    upgrades: [],
    // Bots arrive a little worn in later Rounds, as a real team would.
    condition: Math.max(60, 100 - round * 4),
    stance: botStance(stanceHistory, rng),
    // How well it drives: a steady climb through the Tour, with a little variation from corner to corner.
    accuracy: [0, 1, 2].map(() =>
      Math.max(0.1, Math.min(0.95, config.tuning.botAccuracyStart + config.tuning.botAccuracyPerRound * (round - 1) + (rng() - 0.5) * 0.24))
    ),
    edge: config.tuning.botEdge[tierFromAverage(playerAvg)] + config.tuning.botEdgePerRound * (round - 1),
  };
}
