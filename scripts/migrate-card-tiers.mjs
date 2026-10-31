import { Redis } from "@upstash/redis";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from driftClash
dotenv.config({ path: join(__dirname, "../.env.local") });

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const redis = new Redis({ url, token });

function statTotal(stats) {
  return (
    (Number(stats?.drift) || 0) +
    (Number(stats?.accel) || 0) +
    (Number(stats?.grip) || 0) +
    (Number(stats?.steer) || 0)
  );
}

function tierFromStats(stats) {
  const total = statTotal(stats);
  if (total >= 100) return "mythic";
  if (total >= 85) return "legend";
  if (total >= 75) return "gold";
  if (total >= 60) return "silver";
  return "bronze";
}

async function migrate() {
  console.log("Connecting to Redis...");
  const cardIds = await redis.zrange("usercards:all", 0, -1);
  console.log(`Found ${cardIds.length} card IDs in usercards:all`);

  let updatedCount = 0;
  let skippedNonCar = 0;
  let alreadyCorrect = 0;
  const changes = [];

  for (const id of cardIds) {
    const raw = await redis.get(`usercard:${id}`);
    if (!raw) continue;

    const card = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Skip non-car cards (crew advantages, maintenance consumables, tracks, debuffs)
    if (
      card.cardType === "crew" ||
      card.cardType === "maintenance" ||
      card.cardType === "track" ||
      card.cardType === "debuff" ||
      Boolean(card.crewCardId)
    ) {
      skippedNonCar++;
      continue;
    }

    // Auto-scale legacy 1..10 scale if needed
    let stats = card.stats ? { ...card.stats } : { drift: "15", accel: "15", grip: "15", steer: "15" };
    const oldTier = card.tier;

    if (oldTier === "mythic") {
      stats = { drift: "25", accel: "25", grip: "25", steer: "25" };
    } else if (card.featured) {
      // Featured set cards stay legend unless 100 pts
      const dVal = Number.parseInt(stats.drift || "0", 10);
      if (dVal < 20) {
        stats = { drift: "24", accel: "23", grip: "23", steer: "24" };
      }
    } else {
      const vals = [
        Number.parseInt(stats.drift, 10),
        Number.parseInt(stats.accel, 10),
        Number.parseInt(stats.grip, 10),
        Number.parseInt(stats.steer, 10),
      ].filter((n) => Number.isFinite(n));

      if (vals.length > 0 && Math.max(...vals) <= 10) {
        stats = {
          drift: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.drift, 10) || 5) * 2.5)))),
          accel: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.accel, 10) || 5) * 2.5)))),
          grip: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.grip, 10) || 5) * 2.5)))),
          steer: String(Math.min(25, Math.max(1, Math.round((Number.parseInt(stats.steer, 10) || 5) * 2.5)))),
        };
      }
    }

    const total = statTotal(stats);
    const newTier = card.featured && total < 100 ? "legend" : tierFromStats(stats);

    if (oldTier !== newTier || JSON.stringify(card.stats) !== JSON.stringify(stats)) {
      card.tier = newTier;
      card.stats = stats;
      await redis.set(`usercard:${id}`, JSON.stringify(card));
      updatedCount++;
      changes.push({
        id,
        name: card.name,
        driver: card.driver,
        total,
        oldTier,
        newTier,
      });
    } else {
      alreadyCorrect++;
    }
  }

  console.log("\nMigration Summary:");
  console.log(`- Total Cards Processed: ${cardIds.length}`);
  console.log(`- Non-car items skipped: ${skippedNonCar}`);
  console.log(`- Already matching new thresholds: ${alreadyCorrect}`);
  console.log(`- Updated to new thresholds: ${updatedCount}`);

  if (changes.length > 0) {
    console.log("\nUpdated Cards Sample:");
    for (const c of changes.slice(0, 25)) {
      console.log(`• [${c.total}/100 pts] ${c.name} (${c.driver}) : ${c.oldTier} -> ${c.newTier}`);
    }
    if (changes.length > 25) {
      console.log(`... and ${changes.length - 25} more cards updated.`);
    }
  }
}

migrate()
  .then(() => {
    console.log("\nTier migration complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
