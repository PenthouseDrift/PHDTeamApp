/**
 * Tandem Clash battle simulator, for tuning the rival AI. It plays whole 3-corner battles with the
 * game's real scoring (`evaluateCornerMatchup`) and the same turn order as the arena:
 *
 *   per corner: the player sees the rival's car and picks theirs, both debuffs show, the player picks a
 *   Crew card, the rival picks its Crew card without seeing the player's, then the corner is scored.
 *
 * The winner is the side with more corners, then the higher total, with an exact tie going to the player
 * (the same rule as `finishBattleAndShowVerdict` in DriftClashArena).
 *
 * Pure and seedable. Used by scripts/simulate-clash.ts. Not imported by the app.
 */

import type { MemberCard } from "@/lib/card-roll";
import {
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  rollCrewCardDefinition,
  type CrewCardDefinition,
  type DebuffCardDefinition,
} from "@/lib/crew-cards";
import type { FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier } from "@/lib/pack-config";
import { getBestCrewCardsForRarity, getCarNormalizedTotalScore } from "./challenges-types";
import {
  STARTER_LOANER_CREW_CARDS,
  evaluateCornerMatchup,
  getCardPower,
  rollThreeClashSectors,
  rollThreeDebuffCards,
  rollUkTrackCard,
} from "./progression";
import {
  NEUTRAL_DEBUFF,
  arrangeRival,
  chooseRivalCrew,
  crewCardsFromSpecs,
  rivalCarPoolFrom,
  rollRivalCrewSpecs,
  type RivalContext,
  type Rng,
  type Trio,
} from "./rival-ai";

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Corner = 0 | 1 | 2;
const CORNERS: Corner[] = [0, 1, 2];

let idCounter = 0;
function carCard(rng: Rng, tier: FullArtTier, who: string): MemberCard {
  return {
    id: `${who}-car-${idCounter++}`,
    userId: who,
    name: `${who} car`,
    ability: "",
    effect: "",
    tier,
    stats: rollStatsForTier(tier, rng),
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

function crewCardFromDef(def: CrewCardDefinition, who: string): MemberCard {
  return {
    id: `${who}-crew-${idCounter++}`,
    userId: who,
    ...crewDefinitionToCardData(def),
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  } as MemberCard;
}

/**
 * A rival like the one in the normal random game: another member who brings their own best 3 cars and best 3
 * Crew cards (owned cards rolled like the player's), which the AI then only arranges. Use with `rivalBuilder`.
 */
export function peerRivalBuilder(tier: FullArtTier, ownedCars: number, ownedCrew: number, skill: number) {
  return (rng: Rng) => {
    const cars = Array.from({ length: ownedCars }, () => carCard(rng, tier, "peer")).sort(byPowerDesc).slice(0, 3);
    const crew = Array.from({ length: ownedCrew }, () => crewCardFromDef(rollCrewCardDefinition(rng, CREW_CARD_SET), "peer"))
      .sort(byPowerDesc)
      .slice(0, 3);
    while (crew.length < 3) crew.push(STARTER_LOANER_CREW_CARDS[crew.length]);
    return { carPool: cars, crewPool: crew, skill };
  };
}
export type PlayerKind = "casual" | "good";
export type RivalKind = "old" | "ai";

export interface SimConfig {
  /** The challenge's rarity: both sides use this rarity of car. */
  tier: FullArtTier;
  player: PlayerKind;
  rival: RivalKind;
  /** AI skill, 0 to 1 (ignored for the old rival). */
  skill: number;
  /** How many cars of this rarity the player owns (they bring the best 3). */
  ownedCars: number;
  /** How many Crew cards the player owns, rolled with the real pack odds. */
  ownedCrew: number;
  /** How many cars of this rarity are in the community the old rival picked from. */
  communityCars: number;
  /** The AI rival's pool size. */
  rivalCarPool: number;
  /** Skip this share of the best community cars, so the rival fields good cars rather than the very best. */
  rivalCarSkip: number;
  /** How many Crew cards the AI rival brings to choose from, rolled like a member's collection. */
  rivalCrewCount: number;
  /** Lifts every rival Crew card this many rarities. 0 = the same odds as a member. */
  rivalCrewBoost: number;
  /**
   * Builds the rival for each battle instead of the settings above. Used to test a real challenge: it gives the
   * cars and Crew the rival chooses from and how well it plays.
   */
  rivalBuilder?: (rng: Rng) => { carPool: MemberCard[]; crewPool: MemberCard[]; skill: number };
}

export const DEFAULT_SIM: SimConfig = {
  tier: "gold",
  player: "good",
  rival: "ai",
  skill: 0.85,
  ownedCars: 4,
  ownedCrew: 8,
  communityCars: 40,
  rivalCarPool: 6,
  rivalCarSkip: 0,
  rivalCrewCount: 9,
  rivalCrewBoost: 0,
};

const byPowerDesc = (a: MemberCard, b: MemberCard) => getCardPower(b) - getCardPower(a);

/** A rough "how good is this Crew card" for a player choosing three to bring. */
const TIER_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, legend: 3, mythic: 3 };
const crewRank = (c: MemberCard) => TIER_RANK[c.tier] ?? 0;

interface Player {
  cars: MemberCard[];
  crew: MemberCard[];
}

function makePlayer(rng: Rng, cfg: SimConfig): Player {
  const owned = Array.from({ length: cfg.ownedCars }, () => carCard(rng, cfg.tier, "player"));
  const cars = owned.sort(byPowerDesc).slice(0, 3);
  const crewOwned = Array.from({ length: cfg.ownedCrew }, () => crewCardFromDef(rollCrewCardDefinition(rng, CREW_CARD_SET), "player"));
  const crew = crewOwned.sort((a, b) => crewRank(b) - crewRank(a)).slice(0, 3);
  while (crew.length < 3) crew.push(STARTER_LOANER_CREW_CARDS[crew.length]);
  return { cars, crew };
}

function winProb(margin: number): number {
  return 1 / (1 + Math.exp(-margin / 7));
}

export interface SimResult {
  playerWon: boolean;
  playerCorners: number;
  rivalCorners: number;
}

export function simulateBattle(cfg: SimConfig, rng: Rng): SimResult {
  const player = makePlayer(rng, cfg);

  // The roulette: track, corner types and both sides' debuffs.
  const track = rollUkTrackCard(UK_TRACK_CARD_SET, rng);
  const sectors = rollThreeClashSectors(rng);
  const playerDebuffs = rollThreeDebuffCards(DEBUFF_CARD_SET, rng);
  const rivalDebuffs = rollThreeDebuffCards(DEBUFF_CARD_SET, rng);
  const ctx: RivalContext = { track, sectors, rivalDebuffs };

  // The rival's cars and Crew.
  const community = cfg.rivalBuilder
    ? []
    : Array.from({ length: cfg.communityCars }, () => carCard(rng, cfg.tier, "community")).sort(
        (a, b) => getCarNormalizedTotalScore(b) - getCarNormalizedTotalScore(a)
      );
  let rivalCars: Trio<MemberCard>;
  let rivalCrew: Trio<MemberCard>;
  let rivalSkill = cfg.skill;
  if (cfg.rivalBuilder) {
    const built = cfg.rivalBuilder(rng);
    rivalSkill = built.skill;
    const arranged = arrangeRival({ cars: built.carPool, crew: built.crewPool, ctx, playerCars: player.cars, skill: built.skill, rng });
    rivalCars = arranged.cars;
    rivalCrew = arranged.crew;
  } else if (cfg.rival === "old") {
    rivalCars = community.slice(0, 3) as Trio<MemberCard>;
    rivalCrew = getBestCrewCardsForRarity(cfg.tier);
  } else {
    const carPool = rivalCarPoolFrom(community, cfg.rivalCarPool, cfg.rivalCarSkip);
    const crewPool = crewCardsFromSpecs(rollRivalCrewSpecs(rng, cfg.rivalCrewCount, cfg.rivalCrewBoost));
    // Once, when the battle starts: the rival brings and arranges the cars and Crew that suit this track and these debuffs.
    const arranged = arrangeRival({ cars: carPool, crew: crewPool, ctx, playerCars: player.cars, skill: cfg.skill, rng });
    rivalCars = arranged.cars;
    rivalCrew = arranged.crew;
  }

  const playerCarsLeft = [0, 1, 2];
  const playerCrewLeft = [0, 1, 2];
  const rivalCrewUsed: number[] = [];
  let playerCorners = 0;
  let rivalCorners = 0;
  let playerTotal = 0;
  let rivalTotal = 0;

  for (const k of CORNERS) {
    const rivalCar = rivalCars[k];

    // The player picks a car, seeing the rival's car for this corner.
    let carSlot: number;
    if (cfg.player === "good" && playerCarsLeft.length > 1) {
      const values = playerCarsLeft.map((slot) => {
        const r = evaluateCornerMatchup({
          cornerIdx: k,
          sector: sectors[k],
          playerCard: player.cars[slot],
          rivalCard: rivalCar,
          playerCrewCard: null,
          rivalCrewCard: null,
          playerDebuffCard: NEUTRAL_DEBUFF,
          rivalDebuffCard: NEUTRAL_DEBUFF,
          trackCard: track,
        });
        return r.playerScore - r.rivalScore;
      });
      carSlot = playerCarsLeft[values.indexOf(Math.max(...values))];
    } else {
      carSlot = playerCarsLeft[0];
    }
    playerCarsLeft.splice(playerCarsLeft.indexOf(carSlot), 1);
    const playerCar = player.cars[carSlot];

    // The player picks a Crew card, seeing both debuffs.
    let crewSlot: number;
    if (cfg.player === "good" && playerCrewLeft.length > 1) {
      const wins = playerCrewLeft.map((slot) => {
        const r = evaluateCornerMatchup({
          cornerIdx: k,
          sector: sectors[k],
          playerCard: playerCar,
          rivalCard: rivalCar,
          playerCrewCard: player.crew[slot],
          rivalCrewCard: null,
          playerDebuffCard: playerDebuffs[k],
          rivalDebuffCard: rivalDebuffs[k],
          trackCard: track,
        });
        return winProb(r.playerScore - r.rivalScore);
      });
      // Spend the weakest card that still makes this corner likely; otherwise the card that helps most.
      const order = playerCrewLeft
        .map((slot, i) => ({ slot, p: wins[i], rank: crewRank(player.crew[slot]) }))
        .sort((a, b) => a.rank - b.rank);
      const enough = order.find((o) => o.p >= 0.65);
      crewSlot = enough ? enough.slot : order.reduce((best, o) => (o.p > best.p ? o : best)).slot;
    } else {
      crewSlot = playerCrewLeft[0];
    }
    playerCrewLeft.splice(playerCrewLeft.indexOf(crewSlot), 1);

    // The rival picks its Crew card without seeing the player's.
    const rivalCrewIdx =
      cfg.rival === "old"
        ? [0, 1, 2].filter((i) => !rivalCrewUsed.includes(i))[0]
        : chooseRivalCrew({
            cornerIdx: k,
            ctx,
            cars: rivalCars,
            crew: rivalCrew,
            usedCrew: rivalCrewUsed,
            playerCar,
            playerDebuff: playerDebuffs[k] as DebuffCardDefinition,
            playerCars: player.cars,
            skill: rivalSkill,
            rng,
          });
    rivalCrewUsed.push(rivalCrewIdx);

    const result = evaluateCornerMatchup({
      cornerIdx: k,
      sector: sectors[k],
      playerCard: playerCar,
      rivalCard: rivalCar,
      playerCrewCard: player.crew[crewSlot],
      rivalCrewCard: rivalCrew[rivalCrewIdx],
      playerDebuffCard: playerDebuffs[k],
      rivalDebuffCard: rivalDebuffs[k],
      trackCard: track,
    });
    playerTotal += result.playerScore;
    rivalTotal += result.rivalScore;
    if (result.won) playerCorners++;
    else if (!result.tied) rivalCorners++;
  }

  const playerWon = playerCorners > rivalCorners || (playerCorners === rivalCorners && playerTotal >= rivalTotal);
  return { playerWon, playerCorners, rivalCorners };
}

/** Player win rate over many battles, from a fixed seed so runs are repeatable. */
export function winRate(cfg: SimConfig, battles: number, seed = 1): number {
  const rng = mulberry32(seed);
  let wins = 0;
  for (let i = 0; i < battles; i++) if (simulateBattle(cfg, rng).playerWon) wins++;
  return wins / battles;
}
