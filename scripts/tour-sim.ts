/**
 * Tandem Tour balance simulator. Plays whole Tours with the real engine and the real driving simulation against generated
 * bots. The "driver" is a simulated human of a chosen skill (see src/tcg/tour/replay/autopilot.ts), so you can see how card
 * rarity and driving skill trade off and what the prize table costs.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tour-sim.ts [tours-per-cell]
 *
 * Optional tuning from the command line:
 *   SWING=0.25 PIVOT=0.55 BOT_START=0.4 BOT_STEP=0.045 npx tsx ...
 *
 * It never touches Redis or any real card.
 */
import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import { crewCardsFromSpecs, rollRivalCrewSpecs } from "@/tcg/rival-ai";
import { buildBot, loadoutAverage } from "@/tcg/tour/bots";
import { DEFAULT_TOUR_CONFIG, prizeForWins } from "@/tcg/tour/config";
import { finishRound, prepareRound } from "@/tcg/tour/engine";
import { makeRng, between, type Rng } from "@/tcg/tour/rng";
import { autopilotTrace } from "@/tcg/tour/replay/autopilot";
import { prepareDrive, simulateDrive } from "@/tcg/tour/replay/drive-sim";
import { applyContinue, applyPick, applyRoundResult, createRunState, tourIsOver } from "@/tcg/tour/run-logic";
import { counterTo } from "@/tcg/tour/stance";
import { getUpgradeDef } from "@/tcg/tour/upgrades";
import { STANCES, type Stance, type TourConfig } from "@/tcg/tour/types";

const TIER_STAT: Record<FullArtTier, number> = { bronze: 14, silver: 17, gold: 20, legend: 23, mythic: 25 };

function playerCar(tier: FullArtTier, rng: Rng, n: number): MemberCard {
  const s = () => String(Math.max(1, Math.min(25, tier === "mythic" ? 25 : TIER_STAT[tier] + between(-2, 2, rng))));
  return {
    id: `sim-car-${tier}-${n}`, userId: "sim", name: `Sim ${tier} ${n}`, ability: "x", effect: "x", driver: "Sim", team: "Sim",
    tier, styleIds: [], stats: { drift: s(), accel: s(), grip: s(), steer: s() }, imageUrl: "", imageZoom: 100, imageX: 50, imageY: 50,
    kept: true, rerolled: false, createdAt: 0,
  };
}

const ACCURACY_CAP = 0.95;
const courseCache = new Map<string, ReturnType<typeof prepareDrive>>();

function playTour(tier: FullArtTier, skill: number, seed: string, config: TourConfig): { wins: number; accuracy: number } {
  const rng = makeRng(`sim:${seed}`);
  const cars = [1, 2, 3, 4].map((n) => playerCar(tier, rng, n));
  const crew = crewCardsFromSpecs(rollRivalCrewSpecs(rng, 4, 0));
  let state = createRunState({
    id: seed, userId: "sim", userName: "Sim", seed, config, loadout: { cars, crew, kits: [] },
    rating: config.tuning.startRating, paid: { free: true, pCredits: 0 }, now: 0,
  });
  let accSum = 0;
  let accN = 0;

  for (;;) {
    if (state.offers) {
      const rank = { epic: 3, rare: 2, common: 1 } as const;
      const defs = state.offers.map((id) => getUpgradeDef(id, config)).filter((d): d is NonNullable<typeof d> => d !== null);
      state = applyPick(state, defs.sort((a, b) => rank[b.rarity] - rank[a.rarity])[0]?.id ?? null, config);
    }
    const car = [...state.loadout.cars].sort((a, b) => (state.condition[b.id] ?? 100) - (state.condition[a.id] ?? 100))[0];
    const last = state.stanceHistory[state.stanceHistory.length - 1];
    const stance: Stance = last && rng() < 0.5 ? counterTo(counterTo(counterTo(last))) : STANCES[Math.floor(rng() * 3)];

    const oppRng = makeRng(`${state.seed}:opp:${state.round}`);
    const opponent = buildBot({
      round: state.round, rating: state.rating + state.ratingDelta, playerAvg: loadoutAverage(state.loadout.cars),
      stanceHistory: state.stanceHistory, rng: oppRng, config,
    });
    const input = {
      round: state.round, rating: state.rating + state.ratingDelta, loadout: state.loadout, condition: state.condition,
      upgrades: state.upgrades, carId: car.id, stance, opponent, strikes: state.strikes, config,
      rng: makeRng(`${state.seed}:round:${state.round}`),
    };
    const prepared = prepareRound(input);
    const key = prepared.sectors.map((s) => s.id).join(",");
    let dc = courseCache.get(key);
    if (!dc) {
      dc = prepareDrive(prepared.sectors.map((s) => s.id));
      courseCache.set(key, dc);
    }
    const driven = simulateDrive(dc, autopilotTrace(dc, skill, `${seed}:${state.round}`));
    const accuracy = driven.accuracy.map((a) => Math.min(ACCURACY_CAP, a));
    accSum += accuracy.reduce((s, a) => s + a, 0) / 3;
    accN++;
    const out = finishRound(prepared, { player: accuracy, rival: opponent.accuracy, walls: driven.walls }, input);
    state = applyRoundResult(state, out, opponent, stance, 0);
    if (tourIsOver(state)) return { wins: state.wins, accuracy: accSum / accN };
    state = applyContinue(state, config, 0);
  }
}

function main() {
  const n = Math.max(30, Number(process.argv[2]) || 120);
  const config: TourConfig = JSON.parse(JSON.stringify(DEFAULT_TOUR_CONFIG));
  const e = process.env;
  if (e.SWING) config.tuning.skillSwing = Number(e.SWING);
  if (e.PIVOT) config.tuning.skillPivot = Number(e.PIVOT);
  if (e.BOT_START) config.tuning.botAccuracyStart = Number(e.BOT_START);
  if (e.BOT_STEP) config.tuning.botAccuracyPerRound = Number(e.BOT_STEP);

  const tiers: FullArtTier[] = ["bronze", "silver", "gold", "legend", "mythic"];
  const skills = [0.1, 0.35, 0.6, 0.85];
  console.log(
    `${n} Tours per cell · swing ${config.tuning.skillSwing} pivot ${config.tuning.skillPivot} · bots ${config.tuning.botAccuracyStart} +${config.tuning.botAccuracyPerRound}/round · entry ${config.entryPricePCredits}P\n`
  );
  console.log("Average wins (and typical line accuracy). Rows: card rarity. Columns: driver skill.");
  console.log(["tier   ", ...skills.map((s) => `skill ${s.toFixed(2)}`.padEnd(18))].join(""));
  for (const tier of tiers) {
    const cells: string[] = [];
    for (const skill of skills) {
      let wins = 0;
      let acc = 0;
      let paid = 0;
      for (let i = 0; i < n; i++) {
        const r = playTour(tier, skill, `${tier}-${skill}-${i}`, config);
        wins += r.wins;
        acc += r.accuracy;
        paid += prizeForWins(config, r.wins).pCredits;
      }
      cells.push(`${(wins / n).toFixed(1)}w ${(acc / n).toFixed(2)}a ${((paid / n / Math.max(1, config.entryPricePCredits)) * 100).toFixed(0)}%`.padEnd(18));
    }
    console.log(tier.padEnd(7) + cells.join(""));
  }
  console.log("\nCells: average wins, average line accuracy, prize as a share of the entry price.");
}

main();
