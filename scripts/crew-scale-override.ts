/**
 * Try a different Crew rarity table without editing the game. Preload it before another script:
 *
 *   CREW_TABLE=previous npx tsx --tsconfig tsconfig.json --import ./scripts/crew-scale-override.ts scripts/simulate-matched-opponent.ts
 *
 * CREW_TABLE is "current" (nothing changes), "previous" or "B". Each candidate is listed against `CREW_RARITY_SCALE` in
 * src/lib/crew-cards.ts (Bronze, Silver, Gold, Legend). To adopt one, copy its numbers into that table.
 */
import { CREW_RARITY_SCALE } from "@/lib/crew-cards";

type Scale = typeof CREW_RARITY_SCALE;
const CANDIDATES: Record<string, Partial<Scale>> = {
  // What the game uses now.
  current: {},
  // What the game used before the Legend Crew cards were toned down.
  previous: {
    statBonus: [2, 3, 5, 8],
    boostWeakestStat: [2, 3, 5, 8],
    minStatFloor: [15, 17, 20, 23],
    underdogBonus: [5, 8, 12, 18],
    bronzeExtraBonus: [3, 5, 8, 12],
    giantSlayerBonus: [5, 8, 12, 18],
    cornerSpecialist: [3, 5, 10, 15],
    flatMultiplier: [1.5, 2.5, 4.0, 6.0],
    flatMinimum: [2, 5, 10, 15],
  },
  // Legend about 20% weaker than now: +5 stats, flat x4.
  B: {
    statBonus: [2, 3, 4, 5],
    boostWeakestStat: [2, 3, 4, 5],
    minStatFloor: [15, 17, 19, 20],
    underdogBonus: [5, 7, 10, 13],
    bronzeExtraBonus: [3, 4, 6, 8],
    giantSlayerBonus: [5, 7, 10, 13],
    cornerSpecialist: [3, 5, 7, 10],
    flatMultiplier: [1.5, 2.2, 3.0, 4.0],
    flatMinimum: [2, 4, 7, 10],
  },
};
const name = process.env.CREW_TABLE ?? "current";
const table = CANDIDATES[name];
if (!table) throw new Error(`CREW_TABLE must be one of ${Object.keys(CANDIDATES).join(", ")}`);
Object.assign(CREW_RARITY_SCALE, table);
console.log(`[crew table: ${name}]`);
