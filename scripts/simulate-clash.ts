/**
 * Tandem Clash difficulty tuning. Plays thousands of simulated battles and prints how often a player wins.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/simulate-clash.ts            # the current setting, every challenge rarity
 *   npx tsx --tsconfig tsconfig.json scripts/simulate-clash.ts tune gold  # search settings for the rarities named
 *   BATTLES=3000 ...                                                        # more battles for steadier numbers
 *
 * Aim: a typical player (a mix of casual and good players) beats a challenge about 3 times in 10.
 * To change difficulty, edit CHALLENGE_DIFFICULTY in src/tcg/rival-ai.ts, then run this again.
 */
import type { FullArtTier } from "@/lib/full-art-card";
import { DEFAULT_SIM, winRate, type SimConfig } from "@/tcg/battle-sim";
import { CHALLENGE_DIFFICULTY } from "@/tcg/rival-ai";

const BATTLES = Number(process.env.BATTLES ?? 1500);
const TIERS: FullArtTier[] = ["bronze", "silver", "gold", "legend"];
const pct = (n: number) => `${(n * 100).toFixed(1).padStart(5)}%`;

function row(label: string, cfg: SimConfig) {
  const casual = winRate({ ...cfg, player: "casual" }, BATTLES, 11);
  const good = winRate({ ...cfg, player: "good" }, BATTLES, 22);
  console.log(`${label.padEnd(46)} casual ${pct(casual)}   good ${pct(good)}   typical ${pct((casual + good) / 2)}`);
}

const mode = process.argv[2];
if (mode === "tune") {
  const only = process.argv.slice(3) as FullArtTier[];
  for (const tier of only.length > 0 ? only : TIERS) {
    console.log(`\n── ${tier} challenge ──`);
    for (const rivalCarSkip of [0.3, 0.4, 0.5]) {
      for (const rivalCrewCount of [3, 4, 5]) {
        row(`car skip ${rivalCarSkip}, crew of ${rivalCrewCount}, skill 0.9`, {
          ...DEFAULT_SIM, tier, rival: "ai", skill: 0.9, rivalCrewCount, rivalCarSkip,
        });
      }
    }
  }
} else {
  console.log(`Battles per row: ${BATTLES}`);
  for (const tier of TIERS) {
    const d = CHALLENGE_DIFFICULTY[tier];
    console.log(`\n── ${tier} challenge ──`);
    row("old rival (fixed order, best cars, set crew)", { ...DEFAULT_SIM, tier, rival: "old" });
    row(`AI: skip ${d.carSkip}, crew of ${d.crewCount}, +${d.crewBoost}, skill ${d.skill}`, {
      ...DEFAULT_SIM, tier, rival: "ai", skill: d.skill, rivalCarSkip: d.carSkip, rivalCrewCount: d.crewCount, rivalCrewBoost: d.crewBoost,
    });
  }
}
