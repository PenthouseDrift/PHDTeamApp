/**
 * Win rates in the normal Tandem Clash for players of different strength, against the old opponent (a member's best cards)
 * and against the matched opponent (built to the player's points, see src/tcg/opponent-matching.ts).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simulate-matched-opponent.ts [battles]
 *   STRENGTH=0.9 npx tsx ...    try a different MATCH_STRENGTH
 *
 * "casual" plays the rarest debuff it is dealt, "good" plays the one that hurts most. The rival AI plays perfectly.
 */
import { DEFAULT_SIM, memberCollection, playerFromTiers, simulateBattle, mulberry32, type Player, type SimConfig } from "@/tcg/battle-sim";
import { carPoints, matchCars, matchCrew, profileOf, targetsFor } from "@/tcg/opponent-matching";
import { getCardPower, STARTER_LOANER_CREW_CARDS } from "@/tcg/progression";
import type { FullArtTier } from "@/lib/full-art-card";

const ODDS: Array<[FullArtTier, number]> = [["bronze", 55], ["silver", 28], ["gold", 12], ["legend", 4.5], ["mythic", 0.5]];
const scenarios: Array<[string, FullArtTier[], number]> = [
  ["3 bronze (brand new)", ["bronze", "bronze", "bronze"], 3],
  ["1 legend + 2 bronze", ["legend", "bronze", "bronze"], 3],
  ["1 gold + 2 bronze", ["gold", "bronze", "bronze"], 3],
  ["3 silver", ["silver", "silver", "silver"], 5],
  ["3 gold", ["gold", "gold", "gold"], 8],
  ["3 legend", ["legend", "legend", "legend"], 10],
];
const N = Number(process.argv[2]) || 1200;

function oldRival(rng: () => number) {
  const m = memberCollection(rng, 12, 8, ODDS);
  const cars = m.cars.sort((a, b) => getCardPower(b) - getCardPower(a)).slice(0, 3);
  const crew = m.crew.sort((a, b) => getCardPower(b) - getCardPower(a)).slice(0, 3);
  while (crew.length < 3) crew.push(STARTER_LOANER_CREW_CARDS[crew.length]);
  return { carPool: cars, crewPool: crew, skill: 1 };
}
let lastDetail = "";
function newRival(rng: () => number, player: Player) {
  const m = memberCollection(rng, 12, 8, ODDS);
  const profile = profileOf(player.cars, player.crew)!;
  const match = matchCars(targetsFor(profile, rng, Number(process.env.STRENGTH) || undefined), m.cars, rng, { driver: "Rival", team: "Team" });
  const crew = matchCrew(profile.crewTiers, m.crew, rng);
  if (!lastDetail) lastDetail = `player ${profile.carPoints.map((p) => p.toFixed(0)).join("/")} -> rival ${match.cars.map((c) => carPoints(c).toFixed(0) + c.tier[0]).join("/")} (${match.generated} generated)`;
  return { carPool: match.cars, crewPool: crew, skill: 1 };
}
for (const kind of ["casual", "good"] as const) {
  console.log(`\n${kind} player, ${N} battles each`);
  for (const [name, tiers, crewN] of scenarios) {
    const base: SimConfig = { ...DEFAULT_SIM, player: kind, playerBuilder: playerFromTiers(tiers, crewN) };
    const rate = (builder: SimConfig["rivalBuilder"]) => {
      const rng = mulberry32(7);
      let w = 0;
      for (let i = 0; i < N; i++) if (simulateBattle({ ...base, rivalBuilder: builder }, rng).playerWon) w++;
      return Math.round((w / N) * 100);
    };
    lastDetail = "";
    const o = rate(oldRival);
    const n = rate(newRival);
    console.log(`${name.padEnd(24)} old opponent: you win ${String(o).padStart(3)}%   matched: you win ${String(n).padStart(3)}%   e.g. ${lastDetail}`);
  }
}
