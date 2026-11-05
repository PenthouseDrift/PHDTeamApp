import type { MemberCard } from "@/lib/card-roll";
import {
  STARTER_LOANER_CREW_CARDS,
  evaluateCornerMatchup,
  getNormalizedCardStats,
  rollThreeClashSectors,
  rollThreeDebuffCards,
  rollUkTrackCard,
} from "@/tcg/progression";
import { NO_CREW_CARD, NO_CREW_DEF } from "@/tcg/rival-ai";
import { CREW_CARD_SET } from "@/lib/crew-cards";
import { clampCondition, conditionMultiplier, wearFor } from "./condition";
import { roundRatingDelta } from "./rating";
import { between, type Rng } from "./rng";
import { counterTo, triangleWinner } from "./stance";
import { skillMultiplierFor } from "./skill";
import { getUpgradeDef } from "./upgrades";
import type {
  BattleLog,
  PreparedRound,
  StatKey,
  Stance,
  TourConfig,
  TourCornerLog,
  TourLoadout,
  TourOpponent,
  TourUpgrade,
} from "./types";

/**
 * The Tandem Tour engine. Pure code: given the same seed and the same choices it always gives the same Round, so the
 * server can decide results, the simulator can balance them and a disputed result can be replayed.
 * It reuses the existing 3-corner scoring (evaluateCornerMatchup) so the maths is the same as Tandem Clash.
 */

/** Scoring needs to find a Crew card by id, including the "no Crew" stand-in used to compare options. */
const SCORING_POOL = [NO_CREW_DEF, ...CREW_CARD_SET];

export interface ResolveInput {
  round: number;
  /** The member's rating at the start of the Tour plus what they have gained so far. */
  rating: number;
  loadout: TourLoadout;
  condition: Record<string, number>;
  upgrades: TourUpgrade[];
  carId: string;
  stance: Stance;
  opponent: TourOpponent;
  strikes: number;
  config: TourConfig;
  /** Seeded for this Round (see rng.ts). */
  rng: Rng;
}

export interface ResolveOutput {
  log: BattleLog;
  won: boolean;
  /** False when the Round was lost but an Insurance upgrade covered it. */
  strikeLost: boolean;
  conditionAfter: Record<string, number>;
  upgradesAfter: TourUpgrade[];
  ratingDelta: number;
}

/** How well each side drove, per corner, 0 to 1. */
export interface RoundSkill {
  player: number[];
  rival: number[];
  walls: number;
}

/**
 * The score multiplier for a line accuracy. The pivot accuracy changes nothing; 1 adds `swing`, 0 takes `swing` off.
 * Good driving is worth more than the gap between neighbouring card rarities, so it can beat a better car.
 */
export function skillMultiplier(accuracy: number, config: Pick<TourConfig, "tuning">): number {
  return skillMultiplierFor(accuracy, config.tuning.skillSwing, config.tuning.skillPivot);
}

interface ActiveEffects {
  stat: Partial<Record<StatKey, number>>;
  score: number;
  stanceEdge: number;
  gambleSafe: number;
  wearReduce: number;
  text: string[];
}

const isActive = (u: TourUpgrade) => u.roundsLeft === undefined || u.roundsLeft > 0;

/** What a set of held upgrades does this Round. */
export function activeEffects(upgrades: TourUpgrade[], config: TourConfig): ActiveEffects {
  const out: ActiveEffects = { stat: {}, score: 0, stanceEdge: 0, gambleSafe: 0, wearReduce: 0, text: [] };
  for (const held of upgrades) {
    if (!isActive(held)) continue;
    const def = getUpgradeDef(held.id, config, true);
    if (!def) continue;
    const amount = held.amount ?? def.values.amount ?? 0;
    switch (def.effect.kind) {
      case "stat": {
        const stats: StatKey[] = def.effect.stat === "all" ? ["drift", "accel", "grip", "steer"] : [def.effect.stat];
        for (const s of stats) out.stat[s] = (out.stat[s] ?? 0) + amount;
        out.text.push(`${def.name}: +${amount} ${def.effect.stat === "all" ? "every stat" : def.effect.stat}`);
        break;
      }
      case "score":
        out.score += amount;
        out.text.push(`${def.name}: +${amount} on every corner`);
        break;
      case "stance_edge":
        out.stanceEdge += amount;
        out.text.push(`${def.name}: +${amount} when your stance wins`);
        break;
      case "gamble_safe":
        out.gambleSafe += amount;
        out.text.push(`${def.name}: safer gamble`);
        break;
      case "wear_reduce":
        out.wearReduce += amount;
        out.text.push(`${def.name}: ${amount} less wear`);
        break;
      default:
        break;
    }
  }
  return out;
}

/** The card with extra points on its stats (kept within 1 to 25). */
export function boostCard(card: MemberCard, bonus: Partial<Record<StatKey, number>>): MemberCard {
  if (!Object.values(bonus).some((v) => v)) return card;
  const n = getNormalizedCardStats(card);
  const up = (k: StatKey) => String(Math.max(1, Math.min(25, n[k] + (bonus[k] ?? 0))));
  return { ...card, stats: { drift: up("drift"), accel: up("accel"), grip: up("grip"), steer: up("steer") } };
}

/** Move timed upgrades one Round on, dropping the ones that have run out. */
export function ageUpgrades(upgrades: TourUpgrade[]): TourUpgrade[] {
  return upgrades
    .map((u) => (u.roundsLeft === undefined ? u : { ...u, roundsLeft: u.roundsLeft - 1 }))
    .filter((u) => u.roundsLeft === undefined || u.roundsLeft > 0)
    .filter((u) => u.usesLeft === undefined || u.usesLeft > 0);
}

/** Score of one side on a corner with a given Crew card, against a rival with no Crew card. Used to choose Crew. */
function scoreWithCrew(input: {
  cornerIdx: 0 | 1 | 2;
  sector: ReturnType<typeof rollThreeClashSectors>[number];
  mine: MemberCard;
  theirs: MemberCard;
  crew: MemberCard;
  myDebuff: ReturnType<typeof rollThreeDebuffCards>[number];
  theirDebuff: ReturnType<typeof rollThreeDebuffCards>[number];
  track: ReturnType<typeof rollUkTrackCard>;
  side: "player" | "rival";
}): number {
  const res = evaluateCornerMatchup({
    cornerIdx: input.cornerIdx,
    sector: input.sector,
    playerCard: input.side === "player" ? input.mine : input.theirs,
    rivalCard: input.side === "player" ? input.theirs : input.mine,
    playerCrewCard: input.side === "player" ? input.crew : NO_CREW_CARD,
    rivalCrewCard: input.side === "player" ? NO_CREW_CARD : input.crew,
    playerDebuffCard: input.side === "player" ? input.myDebuff : input.theirDebuff,
    rivalDebuffCard: input.side === "player" ? input.theirDebuff : input.myDebuff,
    trackCard: input.track,
    crewPool: SCORING_POOL,
  });
  return input.side === "player" ? res.playerScore : res.rivalScore;
}

/** The best unused Crew card for this corner (a loaner when none are left). */
function chooseCrew(
  pool: MemberCard[],
  used: Set<string>,
  cornerIdx: 0 | 1 | 2,
  score: (crew: MemberCard) => number
): MemberCard {
  const open = pool.filter((c) => !used.has(c.id));
  if (open.length === 0) return STARTER_LOANER_CREW_CARDS[cornerIdx];
  let best = open[0];
  let bestScore = -Infinity;
  for (const crew of open) {
    const s = score(crew);
    if (s > bestScore) {
      best = crew;
      bestScore = s;
    }
  }
  used.add(best.id);
  return best;
}


/**
 * Work out a Round as far as the drive: the corners, the track, the Crew cards chosen, each side's score from its cards and
 * condition, and the flat extras (upgrades, stance, form, gamble). What is left is the driving, which `finishRound` adds.
 */
export function prepareRound(input: ResolveInput): PreparedRound {
  const { config, rng, opponent } = input;
  const t = config.tuning;

  const car = input.loadout.cars.find((c) => c.id === input.carId);
  if (!car) throw new Error("That car is not in your loadout.");

  const playerFx = activeEffects(input.upgrades, config);
  const rivalFx = activeEffects(opponent.upgrades, config);
  const playerCard = boostCard(car, playerFx.stat);
  const rivalCard = boostCard(opponent.car, rivalFx.stat);

  const playerCondition = clampCondition(input.condition[car.id] ?? 100);
  const rivalCondition = clampCondition(opponent.condition);
  const playerMult = conditionMultiplier(playerCondition, config);
  const rivalMult = conditionMultiplier(rivalCondition, config);

  const sectors = rollThreeClashSectors(rng);
  const track = rollUkTrackCard(undefined, rng);
  const triangle = triangleWinner(input.stance, opponent.stance);
  const triangleSide: "player" | "rival" | "none" = triangle === "a" ? "player" : triangle === "b" ? "rival" : "none";

  const playerUsed = new Set<string>();
  const rivalUsed = new Set<string>();
  const corners: PreparedRound["corners"] = [];
  const upgradesApplied: PreparedRound["upgradesApplied"] = [
    ...playerFx.text.map((text) => ({ side: "player" as const, upgradeId: "", text })),
    ...rivalFx.text.map((text) => ({ side: "rival" as const, upgradeId: "", text })),
  ];

  const swing = (stance: Stance, safe: number) => {
    if (stance !== "gamble") return 0;
    const min = Math.min(t.gambleMax, t.gambleMin + safe);
    return between(min, Math.max(min, t.gambleMax), rng);
  };

  for (const idx of [0, 1, 2] as const) {
    const sector = sectors[idx];
    const [pDebuff] = rollThreeDebuffCards(undefined, rng);
    const [rDebuff] = rollThreeDebuffCards(undefined, rng);

    const pCrew = chooseCrew(input.loadout.crew, playerUsed, idx, (crew) =>
      scoreWithCrew({ cornerIdx: idx, sector, mine: playerCard, theirs: rivalCard, crew, myDebuff: pDebuff, theirDebuff: rDebuff, track, side: "player" })
    );
    const rCrew = chooseCrew(opponent.crew, rivalUsed, idx, (crew) =>
      scoreWithCrew({ cornerIdx: idx, sector, mine: rivalCard, theirs: playerCard, crew, myDebuff: rDebuff, theirDebuff: pDebuff, track, side: "rival" })
    );

    const res = evaluateCornerMatchup({
      cornerIdx: idx,
      sector,
      playerCard,
      rivalCard,
      playerCrewCard: pCrew,
      rivalCrewCard: rCrew,
      playerDebuffCard: pDebuff,
      rivalDebuffCard: rDebuff,
      trackCard: track,
      crewPool: SCORING_POOL,
    });

    const pNotes: string[] = [];
    const rNotes: string[] = [];
    const pPre = Math.max(5, Math.round(res.playerScore * playerMult));
    const rPre = Math.max(5, Math.round(res.rivalScore * rivalMult));
    if (playerCondition < 100) pNotes.push(`Car condition ${playerCondition}%: ×${playerMult.toFixed(2)}`);
    if (rivalCondition < 100) rNotes.push(`Car condition ${rivalCondition}%: ×${rivalMult.toFixed(2)}`);

    let pFlat = 0;
    let rFlat = 0;
    if (playerFx.score) {
      pFlat += playerFx.score;
      pNotes.push(`Upgrades: +${playerFx.score}`);
    }
    if (rivalFx.score) {
      rFlat += rivalFx.score;
      rNotes.push(`Upgrades: +${rivalFx.score}`);
    }
    if (opponent.edge) {
      const edge = Math.round(opponent.edge);
      rFlat += edge;
      rNotes.push(`Form: ${edge >= 0 ? "+" : ""}${edge}`);
    }
    if (triangleSide === "player") {
      const bonus = t.stanceBonus + playerFx.stanceEdge;
      pFlat += bonus;
      pNotes.push(`Stance beat theirs: +${bonus}`);
    } else if (triangleSide === "rival") {
      const bonus = t.stanceBonus + rivalFx.stanceEdge;
      rFlat += bonus;
      rNotes.push(`Their stance beat yours: +${bonus}`);
    }
    const pSwing = swing(input.stance, playerFx.gambleSafe);
    const rSwing = swing(opponent.stance, rivalFx.gambleSafe);
    if (input.stance === "gamble") {
      pFlat += pSwing;
      pNotes.push(`Gamble ${pSwing >= 0 ? "paid off" : "cost you"}: ${pSwing >= 0 ? "+" : ""}${pSwing}`);
    }
    if (opponent.stance === "gamble") {
      rFlat += rSwing;
      rNotes.push(`Gamble ${rSwing >= 0 ? "paid off" : "cost them"}: ${rSwing >= 0 ? "+" : ""}${rSwing}`);
    }

    corners.push({
      player: { carName: playerCard.name, crewName: pCrew.name, baseScore: res.playerScore, pre: pPre, flat: pFlat, notes: pNotes },
      rival: { carName: rivalCard.name, crewName: rCrew.name, baseScore: res.rivalScore, pre: rPre, flat: rFlat, notes: rNotes },
    });
  }

  return {
    round: input.round,
    trackName: track.name,
    trackIcon: track.icon,
    sectors: sectors.map((s) => ({ id: s.id, name: s.name.replace(/^Corner \d+ · /, "") })),
    corners,
    triangle: triangleSide,
    upgradesApplied,
    carId: car.id,
    stance: input.stance,
    playerCondition,
    coin: rng(),
  };
}

/** Add the driving to a prepared Round and decide it: the multiplier each side's accuracy earned, the winner, wear and rating. */
export function finishRound(prepared: PreparedRound, skill: RoundSkill, input: ResolveInput): ResolveOutput {
  const { config, opponent } = input;
  const t = config.tuning;
  const car = input.loadout.cars.find((c) => c.id === prepared.carId);
  if (!car) throw new Error("That car is not in your loadout.");
  const playerFx = activeEffects(input.upgrades, config);

  const corners: TourCornerLog[] = [];
  const motion: BattleLog["motion"] = [];
  prepared.corners.forEach((c, i) => {
    const pAcc = Math.max(0, Math.min(1, skill.player[i] ?? t.skillPivot));
    const rAcc = Math.max(0, Math.min(1, skill.rival[i] ?? t.skillPivot));
    const pMult = skillMultiplier(pAcc, config);
    const rMult = skillMultiplier(rAcc, config);
    const pScore = Math.max(1, Math.round(c.player.pre * pMult) + c.player.flat);
    const rScore = Math.max(1, Math.round(c.rival.pre * rMult) + c.rival.flat);
    const winner = pScore === rScore ? "tie" : pScore > rScore ? "player" : "rival";
    corners.push({
      sectorId: prepared.sectors[i].id,
      sectorName: prepared.sectors[i].name,
      trackName: prepared.trackName,
      player: {
        carName: c.player.carName,
        crewName: c.player.crewName,
        baseScore: c.player.baseScore,
        score: pScore,
        accuracy: pAcc,
        skillMultiplier: pMult,
        notes: [`Your driving: ${Math.round(pAcc * 100)}% on the line, ×${pMult.toFixed(2)}`, ...c.player.notes],
      },
      rival: {
        carName: c.rival.carName,
        crewName: c.rival.crewName,
        baseScore: c.rival.baseScore,
        score: rScore,
        accuracy: rAcc,
        skillMultiplier: rMult,
        notes: [`Their driving: ${Math.round(rAcc * 100)}% on the line, ×${rMult.toFixed(2)}`, ...c.rival.notes],
      },
      winner,
    });
    const diff = Math.abs(pScore - rScore);
    motion.push({
      cornerIdx: i,
      leadSide: winner === "rival" ? "rival" : "player",
      gap: diff,
      angleDeg: Math.round(25 + Math.min(35, Math.max(pScore, rScore) / 3)),
      smoke: Math.min(1, Math.max(0.25, Math.max(pScore, rScore) / 60)),
    });
  });

  const cornersWon = {
    player: corners.filter((c) => c.winner === "player").length,
    rival: corners.filter((c) => c.winner === "rival").length,
  };
  const totals = {
    player: corners.reduce((s, c) => s + c.player.score, 0),
    rival: corners.reduce((s, c) => s + c.rival.score, 0),
  };

  // Winner: corners won, then total points, then the higher rating, then a coin toss. Never a draw.
  let won: boolean;
  if (cornersWon.player !== cornersWon.rival) won = cornersWon.player > cornersWon.rival;
  else if (totals.player !== totals.rival) won = totals.player > totals.rival;
  else if (input.rating !== opponent.rating) won = input.rating > opponent.rating;
  else won = prepared.coin < 0.5;

  // Condition: the car that drove wears; the others rest.
  const conditionAfter = { ...input.condition };
  const after = clampCondition(prepared.playerCondition - wearFor(prepared.stance, config, playerFx.wearReduce));
  conditionAfter[car.id] = after;

  // Insurance turns a lost Round into no Strike.
  let strikeLost = !won;
  let insuranceUsed = false;
  let upgradesAfter = input.upgrades.map((u) => ({ ...u }));
  if (!won) {
    const ins = upgradesAfter.find((u) => getUpgradeDef(u.id, config, true)?.effect.kind === "insurance" && (u.usesLeft ?? 0) > 0);
    if (ins) {
      ins.usesLeft = (ins.usesLeft ?? 1) - 1;
      strikeLost = false;
      insuranceUsed = true;
    }
  }
  upgradesAfter = ageUpgrades(upgradesAfter);

  const lostBy = Math.abs(totals.player - totals.rival);
  let nearMiss: BattleLog["nearMiss"] = null;
  if (!won && lostBy <= 5) {
    const better = counterTo(opponent.stance);
    const weakest = corners.reduce((w, c, i) => (c.player.accuracy < corners[w].player.accuracy ? i : w), 0);
    const hint =
      corners[weakest].player.accuracy < 0.6
        ? `A cleaner line through corner ${weakest + 1} would have turned it.`
        : better !== prepared.stance
          ? `${better[0].toUpperCase()}${better.slice(1)} would have beaten their ${opponent.stance} and turned it.`
          : prepared.playerCondition < 70
            ? "A fresher car would have closed the gap."
            : "One more upgrade or a better car choice would have turned it.";
    nearMiss = { by: lostBy, hint };
  }

  const log: BattleLog = {
    round: prepared.round,
    trackName: prepared.trackName,
    trackIcon: prepared.trackIcon,
    corners,
    stance: { player: prepared.stance, rival: opponent.stance, triangle: prepared.triangle },
    upgradesApplied: prepared.upgradesApplied,
    result: won ? "win" : "loss",
    cornersWon,
    totals,
    player: { carId: car.id, carName: car.name, conditionBefore: prepared.playerCondition, conditionAfter: after },
    rival: { name: opponent.name, carName: opponent.car.name, tier: opponent.car.tier, rating: opponent.rating, kind: opponent.kind },
    nearMiss,
    motion,
    insuranceUsed,
    skill: { swing: t.skillSwing, pivot: t.skillPivot, walls: skill.walls },
  };

  return {
    log,
    won,
    strikeLost,
    conditionAfter,
    upgradesAfter,
    ratingDelta: opponent.kind === "bot" ? 0 : roundRatingDelta(input.rating, opponent.rating, won, t.ratingK),
  };
}

/** Prepare and finish a Round in one go. With no driving given, both sides drive at the pivot (no effect). Used by tests and the simulator. */
export function resolveRound(input: ResolveInput & { skill?: RoundSkill }): ResolveOutput {
  const prepared = prepareRound(input);
  const pivot = input.config.tuning.skillPivot;
  const skill = input.skill ?? { player: [pivot, pivot, pivot], rival: [pivot, pivot, pivot], walls: 0 };
  return finishRound(prepared, skill, input);
}
