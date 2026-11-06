/**
 * Checks the Drift Campaign's difficulty: builds the six rivals for a few different players' garages, then plays many
 * fresh battles against each rival and prints how often the player really wins, next to the round's target.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simulate-campaign.ts [runs] [validationBattles]
 *
 * "estimate" is what the build-time check measured (few battles); "measured" is a fresh, larger run with other seeds.
 * A player whose cars are already near the top (all mythic) cannot be made to lose 80% of the time, so expect the
 * hardest rounds to read low for them.
 */
import { CAMPAIGN_ROUNDS } from "@/tcg/campaign/config";
import { targetWinPctFor } from "@/tcg/campaign/targets";
import { calibrate, winPct } from "@/tcg/campaign/calibrate";
import { bestTierOf, personaFor, profileFor, showcaseTiersFor } from "@/tcg/campaign/generate";
import { mulberry32, playerFromTiers } from "@/tcg/battle-sim";
import type { FullArtTier } from "@/lib/full-art-card";

const RUNS = Number(process.argv[2]) || 2;
const VALIDATE = Number(process.argv[3]) || 1000;

const garages: Array<[string, FullArtTier[], number]> = [
  ["3 bronze (new player)", ["bronze", "bronze", "bronze"], 3],
  ["3 silver", ["silver", "silver", "silver"], 5],
  ["gold + 2 silver", ["gold", "silver", "silver"], 6],
  ["silver + silver + gold", ["silver", "silver", "gold"], 6],
  ["3 gold", ["gold", "gold", "gold"], 8],
  ["3 legend", ["legend", "legend", "legend"], 10],
];

for (let run = 0; run < RUNS; run++) {
  const seed = 1000 + run * 77;
  for (const [label, tiers, crewCount] of garages) {
    const side = playerFromTiers(tiers, crewCount)(mulberry32(seed));
    const profile = profileFor(side);
    const t0 = Date.now();
    const personaRng = mulberry32(seed);
    const inputs = CAMPAIGN_ROUNDS.map((r) => ({
      round: r.round,
      targetPct: targetWinPctFor(r.round),
      persona: personaFor(r.round, CAMPAIGN_ROUNDS.length, personaRng),
      art: [],
      showcase: showcaseTiersFor(r.round, bestTierOf(side.cars)),
    }));
    const { rounds } = calibrate(side, profile, inputs, seed);
    console.log(`\nrun ${run + 1} · ${label} · built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const r of rounds) {
      const measured = winPct(side, () => r.build, VALIDATE, 424242 + r.round);
      console.log(
        `  round ${r.round}  target ${String(r.targetPct).padStart(2)}%  estimate ${r.estimatedPct.toFixed(0).padStart(3)}%  measured ${measured.toFixed(0).padStart(3)}%  strength ${r.strength.toFixed(2)}  rival cars: ${r.tier}`
      );
    }
  }
}
