/**
 * Balance check for the Tandem Clash corners. For every corner it prints how a typical card of each rarity scores
 * (average and spread), next to the average of the original six corners, then the scale `k` and offset `b` that
 * best make the corner's rarity averages match theirs (score = raw × k + b), and what is left over after that.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/check-corners.ts
 *   CARDS=20000 ...                                              # more cards, steadier numbers
 *
 * Run it whenever a corner is added or changed. Put the suggested k and b into `TUNING` in src/tcg/clash-corners.ts
 * (plain weighted sums that add up to 4.5 need none). Raw means are taken with the current tuning switched off.
 */
import type { FullArtTier } from "@/lib/full-art-card";
import { rollStatsForTier } from "@/lib/pack-config";
import { mulberry32 } from "@/tcg/battle-sim";
import { CLASH_SECTOR_POOL, RAW_SECTOR_SCORE } from "@/tcg/clash-corners";

const CARDS = Number(process.env.CARDS ?? 8000);
const TIERS: FullArtTier[] = ["bronze", "silver", "gold", "legend", "mythic"];
const ORIGINAL = ["entry", "chase", "wallride", "hairpin", "sweeper", "infield"];
const rng = mulberry32(2024);

const cards = Object.fromEntries(
  TIERS.map((tier) => [
    tier,
    Array.from({ length: tier === "mythic" ? 1 : CARDS }, () => {
      const s = rollStatsForTier(tier, rng);
      return { drift: Number(s.drift), accel: Number(s.accel), grip: Number(s.grip), steer: Number(s.steer) };
    }),
  ])
);

function stats(id: string, tier: FullArtTier) {
  const scores = cards[tier].map((c) => RAW_SECTOR_SCORE(id, c));
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
  return { mean, sd };
}

const reference: Record<string, number> = {};
for (const tier of TIERS) reference[tier] = ORIGINAL.reduce((s, id) => s + stats(id, tier).mean, 0) / ORIGINAL.length;
console.log(`Original six, average score: ${TIERS.map((t) => `${t} ${reference[t].toFixed(1)}`).join("   ")}\n`);
console.log("corner".padEnd(11) + TIERS.map((t) => t.padStart(14)).join("") + "     k      b    left over (after fit)");
for (const spec of CLASH_SECTOR_POOL) {
  const per = TIERS.map((t) => ({ t, ...stats(spec.id, t) }));
  const isOriginal = ORIGINAL.includes(spec.id);
  // Least-squares line from the corner's rarity averages onto the reference averages.
  const xs = per.map((p) => p.mean);
  const ys = TIERS.map((t) => reference[t]);
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const k = isOriginal ? 1 : xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const b = isOriginal ? 0 : my - k * mx;
  const left = per.map((p, i) => (p.mean * k + b - ys[i]).toFixed(1).padStart(6)).join("");
  const cells = per.map((p) => `${p.mean.toFixed(1)}±${p.sd.toFixed(1)}`.padStart(14)).join("");
  console.log(spec.id.padEnd(11) + cells + `  ${k.toFixed(3)}  ${b.toFixed(1).padStart(5)}  ${left}${isOriginal ? "  (original)" : ""}`);
}
