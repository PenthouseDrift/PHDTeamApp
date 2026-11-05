import type { Rng } from "./rng";
import type { TourConfig, TourUpgrade, UpgradeDef, UpgradeRarity } from "./types";

/**
 * The upgrade catalogue: temporary cards the member drafts between Rounds. They last for the Tour only and are never
 * added to the collection. The numbers can be changed by an admin (config.upgradeOverrides) without a code change.
 */

const U = (def: UpgradeDef): UpgradeDef => def;

export const UPGRADE_CATALOGUE: UpgradeDef[] = [
  // ── Tuning: stat boosts for a few Rounds ────────────────────────────────
  U({ id: "fresh-rubber", name: "Fresh Rubber", icon: "🛞", category: "tuning", rarity: "common", effect: { kind: "stat", stat: "grip" }, values: { amount: 3, rounds: 2 }, description: "+{amount} grip for the next {rounds} Rounds." }),
  U({ id: "boost-map", name: "Boost Map", icon: "🚀", category: "tuning", rarity: "common", effect: { kind: "stat", stat: "accel" }, values: { amount: 3, rounds: 2 }, description: "+{amount} acceleration for the next {rounds} Rounds." }),
  U({ id: "angle-kit", name: "Angle Kit", icon: "📐", category: "tuning", rarity: "common", effect: { kind: "stat", stat: "drift" }, values: { amount: 3, rounds: 2 }, description: "+{amount} drift for the next {rounds} Rounds." }),
  U({ id: "quick-rack", name: "Quick Rack", icon: "🎯", category: "tuning", rarity: "common", effect: { kind: "stat", stat: "steer" }, values: { amount: 3, rounds: 2 }, description: "+{amount} steering for the next {rounds} Rounds." }),
  U({ id: "race-tune", name: "Race Tune", icon: "🔧", category: "tuning", rarity: "rare", effect: { kind: "stat", stat: "all" }, values: { amount: 2, rounds: 2 }, description: "+{amount} to every stat for the next {rounds} Rounds." }),
  U({ id: "dyno-day", name: "Dyno Day", icon: "🏭", category: "tuning", rarity: "epic", effect: { kind: "stat", stat: "all" }, values: { amount: 3, rounds: 3 }, description: "+{amount} to every stat for the next {rounds} Rounds." }),

  // ── Crew calls: extra points on every corner ────────────────────────────
  U({ id: "hired-spotter", name: "Hired Spotter", icon: "🔭", category: "crew_call", rarity: "common", effect: { kind: "score" }, values: { amount: 2, rounds: 2 }, description: "+{amount} points on every corner for {rounds} Rounds." }),
  U({ id: "team-talk", name: "Team Talk", icon: "📣", category: "crew_call", rarity: "rare", effect: { kind: "score" }, values: { amount: 3, rounds: 2 }, description: "+{amount} points on every corner for {rounds} Rounds." }),
  U({ id: "pit-whisperer", name: "Pit Whisperer", icon: "🎧", category: "crew_call", rarity: "rare", effect: { kind: "score" }, values: { amount: 4, rounds: 1 }, description: "+{amount} points on every corner for the next Round." }),
  U({ id: "crew-chief", name: "Crew Chief", icon: "🧑‍🔧", category: "crew_call", rarity: "epic", effect: { kind: "score" }, values: { amount: 5, rounds: 2 }, description: "+{amount} points on every corner for {rounds} Rounds." }),

  // ── Stance helpers ──────────────────────────────────────────────────────
  U({ id: "read-the-line", name: "Read the Line", icon: "👁️", category: "tuning", rarity: "rare", effect: { kind: "stance_edge" }, values: { amount: 3, rounds: 3 }, description: "When your stance beats theirs, +{amount} more points per corner for {rounds} Rounds." }),
  U({ id: "steady-hands", name: "Steady Hands", icon: "🧤", category: "tuning", rarity: "common", effect: { kind: "gamble_safe" }, values: { amount: 3, rounds: 3 }, description: "Gamble can swing down {amount} less for {rounds} Rounds." }),

  // ── Track intel: information about the opponent ─────────────────────────
  U({ id: "scout-report", name: "Scout Report", icon: "📋", category: "track_intel", rarity: "common", effect: { kind: "reveal_stats" }, values: { uses: 1 }, description: "See the next opponent's car stats before you choose (1 Round)." }),
  U({ id: "walk-the-track", name: "Walk the Track", icon: "🥾", category: "track_intel", rarity: "rare", effect: { kind: "reveal_stats" }, values: { uses: 3 }, description: "See your opponents' car stats before you choose (3 Rounds)." }),
  U({ id: "stance-hint", name: "Paddock Whisper", icon: "🤫", category: "track_intel", rarity: "rare", effect: { kind: "stance_hint" }, values: { uses: 2 }, description: "Learn one stance your next opponent will NOT use (2 Rounds)." }),

  // ── Pit stops: condition ────────────────────────────────────────────────
  U({ id: "quick-stop", name: "Quick Stop", icon: "⏱️", category: "pit_stop", rarity: "common", effect: { kind: "condition", target: "all" }, values: { amount: 20 }, description: "Restore {amount} condition on every car right now." }),
  U({ id: "fresh-tyres", name: "Fresh Tyres", icon: "🔄", category: "pit_stop", rarity: "common", effect: { kind: "condition", target: "lowest" }, values: { amount: 40 }, description: "Restore {amount} condition on your most worn car right now." }),
  U({ id: "pit-crew-pro", name: "Pit Crew Pro", icon: "🏁", category: "pit_stop", rarity: "rare", effect: { kind: "wear_reduce" }, values: { amount: 8, rounds: 3 }, description: "Your car wears {amount} less after each Round for {rounds} Rounds." }),
  U({ id: "full-service", name: "Full Service", icon: "🛠️", category: "pit_stop", rarity: "epic", effect: { kind: "condition", target: "all" }, values: { amount: 50 }, description: "Restore {amount} condition on every car right now." }),

  // ── Sponsors: once-per-Tour bonuses ─────────────────────────────────────
  U({ id: "insurance", name: "Insurance", icon: "🛡️", category: "sponsor", rarity: "rare", effect: { kind: "insurance" }, values: { uses: 1 }, description: "Your next lost Round does not cost a Strike." }),
  U({ id: "cash-sponsor", name: "Cash Sponsor", icon: "💷", category: "sponsor", rarity: "rare", effect: { kind: "prize_bonus" }, values: { amount: 15 }, description: "+{amount}% on the P-Credit prize if you finish with 5 or more wins." }),
  U({ id: "spare-ticket", name: "Spare Ticket", icon: "🎫", category: "sponsor", rarity: "common", effect: { kind: "free_reroll" }, values: { amount: 1 }, description: "Gives you {amount} extra free reroll of the upgrade offers." }),
];

const BY_ID = new Map(UPGRADE_CATALOGUE.map((d) => [d.id, d]));

/** The definition with any admin override applied (numbers only), or null when it is unknown or switched off. */
export function getUpgradeDef(id: string, config?: Pick<TourConfig, "upgradeOverrides">, includeDisabled = false): UpgradeDef | null {
  const base = BY_ID.get(id);
  if (!base) return null;
  const o = config?.upgradeOverrides?.[id];
  if (o?.enabled === false && !includeDisabled) return null;
  if (!o) return base;
  return {
    ...base,
    values: {
      ...base.values,
      ...(o.amount !== undefined ? { amount: o.amount } : {}),
      ...(o.rounds !== undefined ? { rounds: o.rounds } : {}),
      ...(o.uses !== undefined ? { uses: o.uses } : {}),
    },
  };
}

/** The description with its numbers filled in. */
export function describeUpgrade(def: UpgradeDef): string {
  return def.description
    .replace("{amount}", String(def.values.amount ?? 0))
    .replace("{rounds}", String(def.values.rounds ?? 0))
    .replace("{uses}", String(def.values.uses ?? 0));
}

/** The upgrade as held in a Tour, starting with the numbers it has now. */
export function toHeldUpgrade(def: UpgradeDef): TourUpgrade {
  return {
    id: def.id,
    ...(def.values.rounds !== undefined ? { roundsLeft: def.values.rounds } : {}),
    ...(def.values.uses !== undefined ? { usesLeft: def.values.uses } : {}),
    ...(def.values.amount !== undefined ? { amount: def.values.amount } : {}),
  };
}

/** Effects that happen once, the moment they are picked, and are not kept. */
export const isInstant = (def: UpgradeDef) => def.effect.kind === "condition" || def.effect.kind === "free_reroll";

/**
 * Three different upgrade offers, picked by rarity weight. Upgrades already held (and still active) are not offered again.
 * `avoid` lets a reroll skip the offers just shown when there are enough others.
 */
export function rollOffers(rng: Rng, heldIds: string[], config: TourConfig, avoid: string[] = [], count = 3): string[] {
  const enabled = UPGRADE_CATALOGUE.map((d) => getUpgradeDef(d.id, config)).filter((d): d is UpgradeDef => d !== null);
  const held = new Set(heldIds);
  let pool = enabled.filter((d) => !held.has(d.id) && !avoid.includes(d.id));
  if (pool.length < count) pool = enabled.filter((d) => !held.has(d.id));
  if (pool.length < count) pool = enabled;

  const out: UpgradeDef[] = [];
  while (out.length < count && pool.length > 0) {
    const weightOf = (r: UpgradeRarity) => Math.max(0, config.upgradeWeights[r] ?? 0);
    const rarities: UpgradeRarity[] = ["common", "rare", "epic"];
    const present = rarities.filter((r) => pool.some((d) => d.rarity === r) && weightOf(r) > 0);
    const usable = present.length > 0 ? present : rarities.filter((r) => pool.some((d) => d.rarity === r));
    if (usable.length === 0) break;
    const total = usable.reduce((s, r) => s + Math.max(1, weightOf(r)), 0);
    let roll = rng() * total;
    let chosen: UpgradeRarity = usable[usable.length - 1];
    for (const r of usable) {
      roll -= Math.max(1, weightOf(r));
      if (roll <= 0) {
        chosen = r;
        break;
      }
    }
    const ofRarity = pool.filter((d) => d.rarity === chosen);
    const def = ofRarity[Math.floor(rng() * ofRarity.length)];
    out.push(def);
    pool = pool.filter((d) => d.id !== def.id);
  }
  return out.map((d) => d.id);
}
