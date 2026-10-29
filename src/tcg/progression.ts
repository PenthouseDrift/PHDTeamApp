import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import {
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  DYNAMIC_TRACK_BUFF_PRESETS,
  DYNAMIC_TRACK_HAZARD_PRESETS,
  LOANER_CREW_DEFINITIONS,
  STARTER_LOANER_CREW_DEFINITION,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  getCrewCardDefinition,
  rollClashRarityTier,
  scaleDebuffCardDefinition,
  type CrewCardDefinition,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";

/**
 * DriftClash Gamified Progression, UK Track Cards, Random Debuff Cards & Crew Advantage Scoring Engine
 */

export const STARTER_LOANER_CREW_CARD: MemberCard = {
  id: "loaner-crew-ziptie",
  userId: "loaner",
  ...crewDefinitionToCardData(STARTER_LOANER_CREW_DEFINITION),
  styleIds: [],
  kept: true,
  rerolled: false,
  createdAt: 0,
};

export const STARTER_LOANER_CREW_CARDS: [MemberCard, MemberCard, MemberCard] = [
  {
    id: "loaner-crew-1",
    userId: "loaner",
    ...crewDefinitionToCardData(LOANER_CREW_DEFINITIONS[0]),
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-crew-2",
    userId: "loaner",
    ...crewDefinitionToCardData(LOANER_CREW_DEFINITIONS[1]),
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-crew-3",
    userId: "loaner",
    ...crewDefinitionToCardData(LOANER_CREW_DEFINITIONS[2]),
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
];

export const TIER_BASE_POWER: Record<FullArtTier, number> = {
  bronze: 20,
  silver: 45,
  gold: 95,
  legend: 210,
  mythic: 450,
};

export const TIER_CLASH_BONUS: Record<FullArtTier, number> = {
  bronze: 0,
  silver: 2,
  gold: 4,
  legend: 7,
  mythic: 10,
};

export const DAILY_CLASH_WIN_REWARD_PCREDITS = 25;
export const STREAK_MILESTONE_REWARD_PCREDITS = 10;

export function getCardPower(card: Pick<MemberCard, "tier" | "stats" | "cardType" | "crewCardId">): number {
  const base = TIER_BASE_POWER[card.tier] ?? 20;
  if (card.cardType === "crew" || card.crewCardId) {
    return base + 45;
  }
  const statSum =
    (Number(card.stats?.drift) || 0) +
    (Number(card.stats?.accel) || 0) +
    (Number(card.stats?.grip) || 0) +
    (Number(card.stats?.steer) || 0);
  return base + statSum * 3;
}

export interface CollectorRankInfo {
  level: number;
  rankTitle: string;
  rankIcon: string;
  rankColorClass: string;
  totalPower: number;
  xp: number;
  currentLevelFloorXp: number;
  nextLevelXp: number;
  progressPct: number;
  tierCounts: Record<FullArtTier, number>;
}

const RANKS: Array<{
  minLevel: number;
  title: string;
  icon: string;
  colorClass: string;
}> = [
  {
    minLevel: 25,
    title: "Mythic Overlord",
    icon: "💎",
    colorClass: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300",
  },
  {
    minLevel: 15,
    title: "Penthouse Legend",
    icon: "👑",
    colorClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  {
    minLevel: 10,
    title: "Twin-Turbo Pro",
    icon: "⚡",
    colorClass: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
  },
  {
    minLevel: 6,
    title: "Tandem Specialist",
    icon: "🔥",
    colorClass: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  },
  {
    minLevel: 3,
    title: "Street Slider",
    icon: "🛞",
    colorClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  {
    minLevel: 1,
    title: "Rookie Drifter",
    icon: "🌱",
    colorClass: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
  },
];

export function getRankForLevel(level: number) {
  return RANKS.find((r) => level >= r.minLevel) ?? RANKS[RANKS.length - 1];
}

export function getCollectorProgress(
  cards: MemberCard[],
  clashWins = 0,
  packsOpened = 0
): CollectorRankInfo {
  const tierCounts: Record<FullArtTier, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    legend: 0,
    mythic: 0,
  };

  let totalPower = 0;
  for (const card of cards) {
    tierCounts[card.tier] = (tierCounts[card.tier] ?? 0) + 1;
    totalPower += getCardPower(card);
  }

  const xp = totalPower + clashWins * 40 + packsOpened * 15;
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 60)) + 1);
  const currentLevelFloorXp = 60 * Math.pow(level - 1, 2);
  const nextLevelXp = 60 * Math.pow(level, 2);
  const span = Math.max(1, nextLevelXp - currentLevelFloorXp);
  const progressPct = Math.min(100, Math.max(4, Math.round(((xp - currentLevelFloorXp) / span) * 100)));

  const rank = getRankForLevel(level);

  return {
    level,
    rankTitle: rank.title,
    rankIcon: rank.icon,
    rankColorClass: rank.colorClass,
    totalPower,
    xp,
    currentLevelFloorXp,
    nextLevelXp,
    progressPct,
    tierCounts,
  };
}

// ── Track Sectors & Randomised Match Corners ───────────────────────────────

export type ClashSectorId =
  | "entry"
  | "chase"
  | "wallride"
  | "hairpin"
  | "sweeper"
  | "infield";

export interface ClashSectorSpec {
  id: ClashSectorId;
  category?: "entry" | "chase" | "wallride";
  number: 1 | 2 | 3;
  name: string;
  subtitle: string;
  eventDescription: string;
  formulaBadge: string;
  formulaLabel: string;
  icon: string;
}

export const CLASH_SECTOR_POOL: Array<Omit<ClashSectorSpec, "number">> = [
  {
    id: "entry",
    category: "entry",
    name: "Flick Entry & Angle",
    subtitle: "High-Commitment Sweeper Initiation",
    eventDescription:
      "Throw the car sideways at full lock into the first outside clipping point! Judges heavily reward big Drift angle, snappy Steering lock, and initiation Accel.",
    formulaBadge: "DRIFT × 2 + ACCEL × 1.5 + STEER + Tier Bonus",
    formulaLabel: "DRIFT × 2 + ACCEL × 1.5 + STEER + Tier",
    icon: "📐",
  },
  {
    id: "chase",
    category: "chase",
    name: "Door-to-Door Tandem Chase",
    subtitle: "Mid-Track Switchback Proximity",
    eventDescription:
      "Dive onto the lead driver's door through the tight inner switchback! Judges score Transition Acceleration, Deep Drift proximity, and Grip drive.",
    formulaBadge: "STEER × 2 + GRIP × 1.5 + DRIFT + Tier Bonus",
    formulaLabel: "STEER × 2 + GRIP × 1.5 + DRIFT + Tier",
    icon: "🔥",
  },
  {
    id: "wallride",
    category: "wallride",
    name: "Outside Wall Ride",
    subtitle: "Concrete Finish Bank",
    eventDescription:
      "Hold the rear bumper millimetres off the outside wall all the way to the finish line! Judges score rear Grip stability, precision Steer, and Drift hold.",
    formulaBadge: "DRIFT × 2 + GRIP × 1.5 + ACCEL + Tier Bonus",
    formulaLabel: "DRIFT × 2 + GRIP × 1.5 + ACCEL + Tier",
    icon: "🧱",
  },
  {
    id: "hairpin",
    category: "chase",
    name: "Tight Hairpin Switchback",
    subtitle: "Technical Front-Lock Clipping Point",
    eventDescription:
      "Snappy weight transfer into an ultra-tight hairpin! Judges reward precision Steering lock, controllable Drift rotation, and rapid exit Accel.",
    formulaBadge: "STEER × 2 + DRIFT × 1.5 + ACCEL + Tier Bonus",
    formulaLabel: "STEER × 2 + DRIFT × 1.5 + ACCEL + Tier",
    icon: "⛰️",
  },
  {
    id: "sweeper",
    category: "entry",
    name: "High-Speed Power Sweeper",
    subtitle: "Full-Throttle Parabolic Arc",
    eventDescription:
      "High-momentum parabolic arc requiring relentless throttle commit! Judges reward explosive Accel drive, sustained Drift angle, and Grip balance.",
    formulaBadge: "ACCEL × 2 + DRIFT × 1.5 + GRIP + Tier Bonus",
    formulaLabel: "ACCEL × 2 + DRIFT × 1.5 + GRIP + Tier",
    icon: "⚡",
  },
  {
    id: "infield",
    category: "wallride",
    name: "Technical Infield Transition",
    subtitle: "Chicane S-Bend & Snap Counter",
    eventDescription:
      "Violent chicane switchback through the infield! Judges score quick Grip hook-up, responsive Accel recovery, and surgical Steer precision.",
    formulaBadge: "GRIP × 2 + ACCEL × 1.5 + STEER + Tier Bonus",
    formulaLabel: "GRIP × 2 + ACCEL × 1.5 + STEER + Tier",
    icon: "🎯",
  },
];

/**
 * Randomises 3 distinct corner sectors for a fresh Drift Clash match so corner 1 isn't always predictable.
 */
export function rollThreeClashSectors(): [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec] {
  const shuffled = [...CLASH_SECTOR_POOL].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  return [
    { ...picked[0], number: 1, name: `Corner 1 · ${picked[0].name}` },
    { ...picked[1], number: 2, name: `Corner 2 · ${picked[1].name}` },
    { ...picked[2], number: 3, name: `Corner 3 · ${picked[2].name}` },
  ];
}

export const CLASH_SECTORS: ClashSectorSpec[] = [
  { ...CLASH_SECTOR_POOL[0], number: 1, name: `Corner 1 · ${CLASH_SECTOR_POOL[0].name}` },
  { ...CLASH_SECTOR_POOL[1], number: 2, name: `Corner 2 · ${CLASH_SECTOR_POOL[1].name}` },
  { ...CLASH_SECTOR_POOL[2], number: 3, name: `Corner 3 · ${CLASH_SECTOR_POOL[2].name}` },
];

// ── Dynamic Track Conditions & Spin-Out Hazards ─────────────────────────────

export interface ClashTrackCondition {
  id: string;
  name: string;
  icon: string;
  badgeColor: string;
  summary: string;
  spinOutWarning: string;
}

export const CLASH_TRACK_CONDITIONS: ClashTrackCondition[] = [
  {
    id: "track-ice",
    name: "Polished Concrete Ice Rink",
    icon: "❄️",
    badgeColor: "border-cyan-500/50 bg-cyan-500/15 text-cyan-200",
    summary: "Low-grip warehouse concrete! Smooth throttle & high GRIP win.",
    spinOutWarning: "⚠️ SPIN-OUT RISK: Any car with ACCEL >= 8 and GRIP < 7 spins out (-6 pts)! Cars with GRIP >= 7 gain +3 pts.",
  },
  {
    id: "track-touge",
    name: "Tight Technical Switchbacks",
    icon: "⛰️",
    badgeColor: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
    summary: "Narrow hairpin layout! High STEER lock dominates.",
    spinOutWarning: "⚠️ WALL-TAP RISK: Any car with ACCEL >= 9 and STEER < 8 understeers into the rail (-6 pts)! STEER >= 8 gains +3 pts.",
  },
  {
    id: "track-rain",
    name: "Blue-Hour Wet Asphalt",
    icon: "🌧️",
    badgeColor: "border-blue-500/50 bg-blue-500/15 text-blue-200",
    summary: "Standing water on the racing line! Balanced GRIP & STEER required.",
    spinOutWarning: "⚠️ OVER-ROTATE RISK: Cars with DRIFT >= 9 and GRIP < 7 spin out (-5 pts)! Cars with GRIP >= 7 gain +4 pts.",
  },
  {
    id: "track-grassroots",
    name: "Grassroots Underdog Night",
    icon: "📣",
    badgeColor: "border-amber-500/50 bg-amber-500/15 text-amber-200",
    summary: "Street-spec showcase! Judges reward low-tier builds and penalize supercars.",
    spinOutWarning: "⚖️ BRACKET HANDICAP: Bronze cars get +5 pts & Silver cars get +3 pts! Legend/Mythic cars carry -4 pts ballast.",
  },
  {
    id: "track-meihan",
    name: "Meihan Concrete Wall Entry",
    icon: "🔥",
    badgeColor: "border-rose-500/50 bg-rose-500/15 text-rose-200",
    summary: "High-speed wall ride! Judges demand massive DRIFT angle.",
    spinOutWarning: "⚠️ SHALLOW ANGLE PENALTY: Cars with DRIFT < 7 lose -5 pts! Cars with DRIFT >= 8 gain +3 pts.",
  },
  {
    id: "track-standard",
    name: "Penthouse Championship P-Tile",
    icon: "🏁",
    badgeColor: "border-purple-500/50 bg-purple-500/15 text-purple-200",
    summary: "Official PHD competition carpet/P-Tile layout.",
    spinOutWarning: "⚠️ WHEELSPIN CHECK: Unbalanced builds with ACCEL >= 9 and GRIP <= 5 lose -5 pts from wheelspin!",
  },
];

export function rollTrackCondition(): ClashTrackCondition {
  const idx = Math.floor(Math.random() * CLASH_TRACK_CONDITIONS.length);
  return CLASH_TRACK_CONDITIONS[idx] ?? CLASH_TRACK_CONDITIONS[0];
}

function applyTrackConditionModifier(
  cardTier: FullArtTier,
  stats: { drift: number; accel: number; grip: number; steer: number },
  trackCondition?: ClashTrackCondition | null,
  halfSpinPenalty = false
): { delta: number; label: string | null } {
  if (!trackCondition) return { delta: 0, label: null };
  const { drift, accel, grip, steer } = stats;
  const scalePen = (pen: number) => (halfSpinPenalty ? -Math.ceil(Math.abs(pen) / 2) : pen);

  if (trackCondition.id === "track-ice") {
    if (accel >= 8 && grip < 7) {
      const d = scalePen(-6);
      return { delta: d, label: `❄️ Ice Spin-Out (${d} pts)` };
    }
    if (grip >= 7) return { delta: 3, label: "❄️ Ice Grip (+3 pts)" };
  } else if (trackCondition.id === "track-touge") {
    if (accel >= 9 && steer < 8) {
      const d = scalePen(-6);
      return { delta: d, label: `⛰️ Hairpin Understeer (${d} pts)` };
    }
    if (steer >= 8) return { delta: 3, label: "⛰️ Touge Angle (+3 pts)" };
  } else if (trackCondition.id === "track-rain") {
    if (drift >= 9 && grip < 7) {
      const d = scalePen(-5);
      return { delta: d, label: `🌧️ Wet Over-Rotate (${d} pts)` };
    }
    if (grip >= 7) return { delta: 4, label: "🌧️ Wet Traction (+4 pts)" };
  } else if (trackCondition.id === "track-grassroots") {
    if (cardTier === "bronze") return { delta: 5, label: "📣 Grassroots Bronze (+5 pts)" };
    if (cardTier === "silver") return { delta: 3, label: "📣 Grassroots Silver (+3 pts)" };
    if (cardTier === "legend" || cardTier === "mythic") {
      return { delta: -4, label: "⚖️ Supercar Ballast (-4 pts)" };
    }
  } else if (trackCondition.id === "track-meihan") {
    if (drift < 7) {
      const d = scalePen(-5);
      return { delta: d, label: `🔥 Shallow Entry (${d} pts)` };
    }
    if (drift >= 8) return { delta: 3, label: "🔥 Wall Commitment (+3 pts)" };
  } else if (trackCondition.id === "track-standard") {
    if (accel >= 9 && grip <= 5) {
      const d = scalePen(-5);
      return { delta: d, label: `⚠️ Wheelspin (${d} pts)` };
    }
  }

  return { delta: 0, label: null };
}

// ── Base Sector Score Calculation (Single Side Preview & Self-Buffs) ────────

export function scoreCardForSector(
  card: Pick<MemberCard, "tier" | "stats">,
  sectorId: ClashSectorSpec["id"],
  trackCondition?: ClashTrackCondition | null,
  crewCard?: Pick<MemberCard, "crewCardId" | "name"> | null
): {
  total: number;
  statScore: number;
  tierBonus: number;
  breakdown: string;
  warning?: string | null;
} {
  const rawDrift = Number(card.stats?.drift) || 0;
  const rawAccel = Number(card.stats?.accel) || 0;
  const rawGrip = Number(card.stats?.grip) || 0;
  const rawSteer = Number(card.stats?.steer) || 0;

  let drift = rawDrift;
  let accel = rawAccel;
  let grip = rawGrip;
  let steer = rawSteer;

  const crewId = crewCard?.crewCardId ?? null;

  // Symmetric / Self Stat Modifiers from Crew Card
  if (crewId === "crew-04-boost-ban") {
    drift = Math.min(8, drift);
    accel = Math.min(8, accel);
    grip = Math.min(8, grip);
    steer = Math.min(8, steer);
  }
  if (crewId === "crew-19-inverted-grid") {
    if (drift <= 4) drift = 7;
    if (accel <= 4) accel = 7;
    if (grip <= 4) grip = 7;
    if (steer <= 4) steer = 7;
  }
  if (crewId === "crew-12-ziptie-tuner") {
    const minVal = Math.min(drift, accel, grip, steer);
    if (minVal < 7) {
      if (drift === minVal) drift = Math.min(7, drift + 1);
      else if (accel === minVal) accel = Math.min(7, accel + 1);
      else if (grip === minVal) grip = Math.min(7, grip + 1);
      else steer = Math.min(7, steer + 1);
    }
  }
  if (crewId === "crew-06-shallow-protest") {
    steer = Math.min(10, steer + 1);
  }
  if (crewId === "crew-17-fresh-asphalt") {
    grip = Math.min(10, grip + 1);
  }
  if (crewId === "crew-21-turbo-map") {
    accel = Math.min(10, accel + 1);
    drift = Math.min(10, drift + 1);
  }
  if (crewId === "crew-22-ackerman-knuckles") {
    steer = Math.min(10, steer + 1);
    drift = Math.min(10, drift + 1);
  }
  if (crewId === "crew-23-brass-bulkhead") {
    grip = Math.min(10, grip + 1);
    accel = Math.min(10, accel + 1);
  }
  if (crewId === "crew-24-dual-gain-gyro") {
    steer = Math.min(10, steer + 1);
  }
  if (
    crewId === "crew-26-carbon-flex-deck" &&
    (sectorId === "chase" || sectorId === "wallride" || sectorId === "hairpin" || sectorId === "infield")
  ) {
    grip = Math.min(10, grip + 1);
    steer = Math.min(10, steer + 1);
  }

  let statScore = 0;
  let breakdown = "";

  if (sectorId === "entry") {
    statScore = Math.round(drift * 2 + accel * 1.5 + steer);
    breakdown = `DRIFT ${drift}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else if (sectorId === "chase") {
    statScore = Math.round(steer * 2 + grip * 1.5 + drift);
    breakdown = `STEER ${steer}×2 + GRIP ${grip}×1.5 + DRIFT ${drift}`;
  } else if (sectorId === "hairpin") {
    statScore = Math.round(steer * 2 + drift * 1.5 + accel);
    breakdown = `STEER ${steer}×2 + DRIFT ${drift}×1.5 + ACCEL ${accel}`;
  } else if (sectorId === "sweeper") {
    statScore = Math.round(accel * 2 + drift * 1.5 + grip);
    breakdown = `ACCEL ${accel}×2 + DRIFT ${drift}×1.5 + GRIP ${grip}`;
  } else if (sectorId === "infield") {
    statScore = Math.round(grip * 2 + accel * 1.5 + steer);
    breakdown = `GRIP ${grip}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else {
    statScore = Math.round(drift * 2 + grip * 1.5 + accel);
    breakdown = `DRIFT ${drift}×2 + GRIP ${grip}×1.5 + ACCEL ${accel}`;
  }

  const tierBonus =
    crewId === "crew-11-tech-scrutineer" ? 0 : TIER_CLASH_BONUS[card.tier] ?? 0;

  const halfSpin = crewId === "crew-24-dual-gain-gyro";
  const trackMod = applyTrackConditionModifier(
    card.tier,
    { drift, accel, grip, steer },
    trackCondition,
    halfSpin
  );
  let extra = trackMod.delta;
  const warning = trackMod.label;

  if (crewId === "crew-01-polished-ice" && grip >= 7) extra += 3;
  if (crewId === "crew-02-rain-tarmac" && grip >= 7) extra += 3;
  if (crewId === "crew-03-wall-clip-zone" && (sectorId === "wallride" || sectorId === "infield")) extra += 2;
  if (
    crewId === "crew-04-boost-ban" &&
    rawDrift <= 8 &&
    rawAccel <= 8 &&
    rawGrip <= 8 &&
    rawSteer <= 8
  ) {
    extra += 3;
  }
  if (crewId === "crew-09-grassroots-hero") {
    if (card.tier === "bronze") extra += 7;
    else if (card.tier === "silver") extra += 4;
  }
  if (crewId === "crew-11-tech-scrutineer") {
    extra += card.tier === "bronze" || card.tier === "silver" ? 5 : 3;
  }
  if (crewId === "crew-12-ziptie-tuner") extra += 1;
  if (crewId === "crew-14-home-track-line") {
    extra += card.tier === "bronze" || card.tier === "silver" ? 4 : 2;
  }
  if (crewId === "crew-15-touge-hairpins" && steer >= 7) extra += 3;
  if (
    crewId === "crew-16-meihan-wall-ride" &&
    (sectorId === "entry" || sectorId === "sweeper" || sectorId === "wallride") &&
    drift >= 8
  ) {
    extra += 4;
  }
  if (crewId === "crew-17-fresh-asphalt") extra += 1;
  if (
    crewId === "crew-18-smoke-screen" &&
    (sectorId === "entry" || sectorId === "sweeper" || sectorId === "wallride") &&
    drift >= 7
  ) {
    extra += 2;
  }
  if (
    crewId === "crew-20-proximity-laser" &&
    (sectorId === "chase" || sectorId === "hairpin" || sectorId === "wallride") &&
    steer >= 7
  ) {
    extra += 3;
  }
  if (crewId === "crew-25-ti-turnbuckles") extra += 2;
  if (crewId === "crew-28-vip-judge-box") extra += 4;
  if (crewId === "crew-29-p1-qualifier") {
    if (sectorId === "entry" || sectorId === "sweeper") extra += 4;
    if (sectorId === "wallride" || sectorId === "infield") extra += 2;
  }
  if (crewId === "crew-30-twin-drift-sync") {
    if (sectorId === "chase" || sectorId === "hairpin") extra += 5;
    if (sectorId === "wallride" || sectorId === "infield") extra += 3;
  }

  const total = Math.max(5, statScore + tierBonus + extra);
  return {
    total,
    statScore,
    tierBonus,
    breakdown: `${breakdown}${tierBonus ? ` + ${tierBonus} Tier` : ""}${extra !== 0 ? ` (${extra > 0 ? `+${extra}` : extra} Mod)` : ""}`,
    warning,
  };
}

/**
 * Auto-optimizes a pool of Car Cards for the 3 Clash Sectors given a Track Condition and equipped Crew Card.
 * Used for both the Player's "Auto-Optimize" button and the Rival Challenger's automatic sector assignment.
 */
export function optimizeLineupForTrack(
  carCards: MemberCard[],
  trackCondition: ClashTrackCondition,
  crewCard: MemberCard | null,
  sectors: ClashSectorSpec[] = CLASH_SECTORS
): [MemberCard, MemberCard, MemberCard] {
  const pool = carCards.slice();
  while (pool.length < 3 && pool.length > 0) {
    pool.push(pool[0]);
  }
  const usedIndices = new Set<number>();
  const picked: MemberCard[] = [];

  for (const sector of sectors) {
    let bestIdx = pool.findIndex((_, idx) => !usedIndices.has(idx));
    if (bestIdx === -1) bestIdx = 0;
    let bestScore = -999;

    for (let i = 0; i < pool.length; i++) {
      if (usedIndices.has(i)) continue;
      const s = scoreCardForSector(pool[i], sector.id, trackCondition, crewCard).total;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }

    usedIndices.add(bestIdx);
    picked.push(pool[bestIdx]);
  }

  return [picked[0], picked[1], picked[2]];
}

// ── Full 3-Sector Head-to-Head Matchup Evaluation (Both Crew Cards Active) ──

export interface EvaluatedSectorResult {
  sector: ClashSectorSpec;
  playerCard: MemberCard;
  rivalCard: MemberCard;
  playerScore: number;
  rivalScore: number;
  playerBreakdown: string;
  rivalBreakdown: string;
  effectsTriggered: string[];
  won: boolean;
  tied: boolean;
}

function evaluateOneSideInSector(params: {
  myCard: MemberCard;
  oppCard: MemberCard;
  myCrewCard: MemberCard | null;
  oppCrewCard: MemberCard | null;
  sector: ClashSectorSpec;
  trackCondition: ClashTrackCondition;
  isMyAceSector: boolean;
  sideLabel: "You" | "Rival";
  effectsTriggered: string[];
}): {
  score: number;
  breakdown: string;
} {
  const {
    myCard,
    oppCard,
    myCrewCard,
    oppCrewCard,
    sector,
    trackCondition,
    isMyAceSector,
    sideLabel,
    effectsTriggered,
  } = params;

  const myCrewDef = getCrewCardDefinition(myCrewCard?.crewCardId ?? myCrewCard?.name ?? myCrewCard?.id);
  const oppCrewDef = getCrewCardDefinition(oppCrewCard?.crewCardId ?? oppCrewCard?.name ?? oppCrewCard?.id);
  const myCrewId = myCrewDef?.id ?? myCrewCard?.crewCardId ?? null;
  const oppCrewId = oppCrewDef?.id ?? oppCrewCard?.crewCardId ?? null;

  const rawDrift = Number(myCard.stats?.drift) || 0;
  const rawAccel = Number(myCard.stats?.accel) || 0;
  const rawGrip = Number(myCard.stats?.grip) || 0;
  const rawSteer = Number(myCard.stats?.steer) || 0;
  const myRawTotal = rawDrift + rawAccel + rawGrip + rawSteer;

  const oppRawDrift = Number(oppCard.stats?.drift) || 0;
  const oppRawAccel = Number(oppCard.stats?.accel) || 0;
  const oppRawGrip = Number(oppCard.stats?.grip) || 0;
  const oppRawSteer = Number(oppCard.stats?.steer) || 0;
  const oppRawTotal = oppRawDrift + oppRawAccel + oppRawGrip + oppRawSteer;

  let drift = rawDrift;
  let accel = rawAccel;
  let grip = rawGrip;
  let steer = rawSteer;

  // 1. Self Crew Stat Buffs
  if (myCrewId === "crew-19-inverted-grid") {
    if (drift <= 4) drift = 7;
    if (accel <= 4) accel = 7;
    if (grip <= 4) grip = 7;
    if (steer <= 4) steer = 7;
  }
  if (myCrewId === "crew-12-ziptie-tuner") {
    const minVal = Math.min(drift, accel, grip, steer);
    if (minVal < 7) {
      if (drift === minVal) drift = Math.min(7, drift + 1);
      else if (accel === minVal) accel = Math.min(7, accel + 1);
      else if (grip === minVal) grip = Math.min(7, grip + 1);
      else steer = Math.min(7, steer + 1);
    }
  }
  if (myCrewId === "crew-06-shallow-protest") steer = Math.min(10, steer + 1);
  if (myCrewId === "crew-17-fresh-asphalt") grip = Math.min(10, grip + 1);
  if (myCrewId === "crew-21-turbo-map") {
    accel = Math.min(10, accel + 1);
    drift = Math.min(10, drift + 1);
  }
  if (myCrewId === "crew-22-ackerman-knuckles") {
    steer = Math.min(10, steer + 1);
    drift = Math.min(10, drift + 1);
  }
  if (myCrewId === "crew-23-brass-bulkhead") {
    grip = Math.min(10, grip + 1);
    accel = Math.min(10, accel + 1);
  }
  if (myCrewId === "crew-24-dual-gain-gyro") steer = Math.min(10, steer + 1);
  if (
    myCrewId === "crew-26-carbon-flex-deck" &&
    (sector.id === "chase" || sector.id === "wallride")
  ) {
    grip = Math.min(10, grip + 1);
    steer = Math.min(10, steer + 1);
  }

  // 2. Opponent Crew Stat Debuffs against this car
  if (oppCrewId === "crew-19-inverted-grid") {
    if (drift === 10 || accel === 10 || grip === 10 || steer === 10) {
      if (drift === 10) drift = 8;
      if (accel === 10) accel = 8;
      if (grip === 10) grip = 8;
      if (steer === 10) steer = 8;
      effectsTriggered.push(`🔄 Inverted Grid: ${sideLabel} 10s trimmed to 8`);
    }
  }
  if (oppCrewId === "crew-08-rf-glitch") {
    steer = Math.max(1, steer - 1);
    drift = Math.max(1, drift - 1);
    effectsTriggered.push(`📡 Signal Glitch: ${sideLabel} -1 STEER & -1 DRIFT`);
  }

  // 3. Symmetric 10.5T Boost Ban Cap (if either side equipped it)
  if (myCrewId === "crew-04-boost-ban" || oppCrewId === "crew-04-boost-ban") {
    if (drift > 8 || accel > 8 || grip > 8 || steer > 8) {
      drift = Math.min(8, drift);
      accel = Math.min(8, accel);
      grip = Math.min(8, grip);
      steer = Math.min(8, steer);
      effectsTriggered.push(`🚨 10.5T Boost Ban: ${sideLabel} stats capped at 8`);
    }
  }

  // 4. Base Sector Stat Score
  let statScore = 0;
  let breakdown = "";
  if (sector.id === "entry") {
    statScore = Math.round(drift * 2 + accel * 1.5 + steer);
    breakdown = `DRIFT ${drift}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else if (sector.id === "chase") {
    statScore = Math.round(steer * 2 + grip * 1.5 + drift);
    breakdown = `STEER ${steer}×2 + GRIP ${grip}×1.5 + DRIFT ${drift}`;
  } else if (sector.id === "hairpin") {
    statScore = Math.round(steer * 2 + drift * 1.5 + accel);
    breakdown = `STEER ${steer}×2 + DRIFT ${drift}×1.5 + ACCEL ${accel}`;
  } else if (sector.id === "sweeper") {
    statScore = Math.round(accel * 2 + drift * 1.5 + grip);
    breakdown = `ACCEL ${accel}×2 + DRIFT ${drift}×1.5 + GRIP ${grip}`;
  } else if (sector.id === "infield") {
    statScore = Math.round(grip * 2 + accel * 1.5 + steer);
    breakdown = `GRIP ${grip}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else {
    statScore = Math.round(drift * 2 + grip * 1.5 + accel);
    breakdown = `DRIFT ${drift}×2 + GRIP ${grip}×1.5 + ACCEL ${accel}`;
  }

  // 5. Tier Bonus
  const nullifyTier =
    myCrewId === "crew-11-tech-scrutineer" ||
    oppCrewId === "crew-11-tech-scrutineer" ||
    (oppCrewId === "crew-28-vip-judge-box" && sector.id === "wallride");
  const tierBonus = nullifyTier ? 0 : TIER_CLASH_BONUS[myCard.tier] ?? 0;

  if (
    oppCrewId === "crew-28-vip-judge-box" &&
    sector.id === "wallride" &&
    (TIER_CLASH_BONUS[myCard.tier] ?? 0) > 0
  ) {
    effectsTriggered.push(`🕶️ VIP Judge Box: ${sideLabel} S3 Tier Bonus cancelled`);
  }

  // 6. Track Condition Modifier
  const halfSpin = myCrewId === "crew-24-dual-gain-gyro";
  const trackMod = applyTrackConditionModifier(
    myCard.tier,
    { drift, accel, grip, steer },
    trackCondition,
    halfSpin
  );
  let extra = trackMod.delta;
  if (trackMod.label) {
    effectsTriggered.push(`${sideLabel}: ${trackMod.label}`);
  }

  // 7. Self Crew Flat Bonuses
  if (myCrewId === "crew-01-polished-ice" && grip >= 7) extra += 3;
  if (myCrewId === "crew-02-rain-tarmac" && grip >= 7) extra += 3;
  if (myCrewId === "crew-03-wall-clip-zone" && sector.id === "wallride") extra += 2;
  if (
    myCrewId === "crew-04-boost-ban" &&
    rawDrift <= 8 &&
    rawAccel <= 8 &&
    rawGrip <= 8 &&
    rawSteer <= 8
  ) {
    extra += 3;
  }
  if (myCrewId === "crew-09-grassroots-hero") {
    if (myCard.tier === "bronze") {
      extra += 7;
      effectsTriggered.push(`📣 Grassroots Favorite: ${sideLabel} +7 pts (Bronze)`);
    } else if (myCard.tier === "silver") {
      extra += 4;
      effectsTriggered.push(`📣 Grassroots Favorite: ${sideLabel} +4 pts (Silver)`);
    }
  }
  if (myCrewId === "crew-10-box-stock-killer" && myRawTotal < oppRawTotal) {
    extra += 5;
    effectsTriggered.push(`📦 Box-Stock Killer: ${sideLabel} +5 pts (${myRawTotal}/40 vs ${oppRawTotal}/40)`);
  }
  if (myCrewId === "crew-11-tech-scrutineer") {
    extra += myCard.tier === "bronze" || myCard.tier === "silver" ? 5 : 3;
  }
  if (myCrewId === "crew-12-ziptie-tuner") extra += 1;
  if (
    myCrewId === "crew-13-giant-slayer" &&
    myCard.tier !== "legend" &&
    myCard.tier !== "mythic" &&
    (oppCard.tier === "legend" || oppCard.tier === "mythic")
  ) {
    extra += 4;
    effectsTriggered.push(`🗡️ Giant Slayer: ${sideLabel} +4 pts vs Legend`);
  }
  if (myCrewId === "crew-14-home-track-line") {
    extra += myCard.tier === "bronze" || myCard.tier === "silver" ? 4 : 2;
  }
  if (myCrewId === "crew-15-touge-hairpins" && steer >= 7) extra += 3;
  if (
    myCrewId === "crew-16-meihan-wall-ride" &&
    (sector.id === "entry" || sector.id === "wallride") &&
    drift >= 8
  ) {
    extra += 4;
  }
  if (myCrewId === "crew-17-fresh-asphalt") extra += 1;
  if (
    myCrewId === "crew-18-smoke-screen" &&
    (sector.id === "entry" || sector.id === "wallride") &&
    drift >= 7
  ) {
    extra += 2;
  }
  if (
    myCrewId === "crew-20-proximity-laser" &&
    (sector.id === "chase" || sector.id === "wallride") &&
    steer >= 7
  ) {
    extra += 3;
  }
  if (myCrewId === "crew-25-ti-turnbuckles") extra += 2;
  if (myCrewId === "crew-28-vip-judge-box") extra += 4;
  if (myCrewId === "crew-29-p1-qualifier") {
    if (sector.id === "entry") extra += 4;
    if (sector.id === "wallride") extra += 2;
  }
  if (myCrewId === "crew-30-twin-drift-sync") {
    if (sector.id === "chase") extra += 5;
    if (sector.id === "wallride") extra += 3;
  }

  // 8. Opponent Crew Traps & Sabotage Penalties against this car
  if (oppCrewId === "crew-01-polished-ice" && accel >= 8 && grip <= 7) {
    extra -= 4;
    effectsTriggered.push(`❄️ Polished Ice Trap: ${sideLabel} -4 pts`);
  }
  if (oppCrewId === "crew-02-rain-tarmac" && drift >= 9 && grip < 7) {
    extra -= 3;
    effectsTriggered.push(`🌧️ Rain Tarmac: ${sideLabel} -3 pts`);
  }
  if (
    oppCrewId === "crew-03-wall-clip-zone" &&
    (myRawTotal >= 34 || myCard.tier === "legend" || myCard.tier === "mythic")
  ) {
    extra -= 4;
    effectsTriggered.push(`🧱 Wall Clip Zone: ${sideLabel} Legend -4 pts`);
  }
  if (
    oppCrewId === "crew-05-diff-oil-spill" &&
    (sector.id === "entry" || sector.id === "chase") &&
    accel >= 9
  ) {
    extra -= 3;
    effectsTriggered.push(`🛢️ Diff Oil Spill: ${sideLabel} -3 pts`);
  }
  if (oppCrewId === "crew-06-shallow-protest" && steer <= 6) {
    extra -= 3;
    effectsTriggered.push(`🏴 Shallow Angle Protest: ${sideLabel} -3 pts`);
  }
  if (oppCrewId === "crew-07-tire-bead-pop" && isMyAceSector) {
    extra -= 8;
    effectsTriggered.push(`💥 Rear Tire De-Bead: ${sideLabel} Ace -8 pts!`);
  }
  if (
    oppCrewId === "crew-13-giant-slayer" &&
    oppCard.tier !== "legend" &&
    oppCard.tier !== "mythic" &&
    (myCard.tier === "legend" || myCard.tier === "mythic")
  ) {
    extra -= 3;
  }
  if (oppCrewId === "crew-15-touge-hairpins" && accel >= 9 && steer <= 6) {
    extra -= 3;
    effectsTriggered.push(`⛰️ Touge Switchbacks: ${sideLabel} -3 pts`);
  }
  if (oppCrewId === "crew-16-meihan-wall-ride" && drift <= 6) {
    extra -= 3;
    effectsTriggered.push(`🔥 Meihan Wall Entry: ${sideLabel} -3 pts`);
  }
  if (
    oppCrewId === "crew-18-smoke-screen" &&
    (sector.id === "entry" || sector.id === "wallride") &&
    oppRawDrift >= 7
  ) {
    extra -= 3;
    effectsTriggered.push(`💨 Smoke Screen: ${sideLabel} -3 pts visibility`);
  }
  if (
    oppCrewId === "crew-20-proximity-laser" &&
    (sector.id === "chase" || sector.id === "wallride") &&
    oppRawSteer >= 7
  ) {
    extra -= 1;
  }

  const score = Math.max(5, statScore + tierBonus + extra);
  return {
    score,
    breakdown: `${breakdown}${tierBonus ? ` + ${tierBonus} Tier` : ""}${extra !== 0 ? ` (${extra > 0 ? `+${extra}` : extra} Mod)` : ""}`,
  };
}

export function evaluateClashMatchup(params: {
  playerCards: MemberCard[];
  rivalCards: MemberCard[];
  crewCard: MemberCard | null;
  rivalCrewCard?: MemberCard | null;
  trackCondition: ClashTrackCondition;
}): EvaluatedSectorResult[] {
  const {
    playerCards,
    rivalCards,
    crewCard,
    rivalCrewCard = STARTER_LOANER_CREW_CARD,
    trackCondition,
  } = params;

  const pCrewDef = getCrewCardDefinition(crewCard?.crewCardId ?? crewCard?.name ?? crewCard?.id);
  const rCrewDef = getCrewCardDefinition(rivalCrewCard?.crewCardId ?? rivalCrewCard?.name ?? rivalCrewCard?.id);
  const pCrewId = pCrewDef?.id ?? crewCard?.crewCardId ?? null;
  const rCrewId = rCrewDef?.id ?? rivalCrewCard?.crewCardId ?? null;

  // Identify each side's highest base-scoring sector (for #07 Rear Tire De-Bead)
  const rawPlayerScores = CLASH_SECTORS.map((sec, idx) => {
    const pc = playerCards[idx] ?? playerCards[0];
    return scoreCardForSector(pc, sec.id, trackCondition, null).total;
  });
  let maxPlayerIdx = 0;
  for (let i = 1; i < rawPlayerScores.length; i++) {
    if (rawPlayerScores[i] > rawPlayerScores[maxPlayerIdx]) maxPlayerIdx = i;
  }

  const rawRivalScores = CLASH_SECTORS.map((sec, idx) => {
    const rc = rivalCards[idx] ?? rivalCards[0];
    return scoreCardForSector(rc, sec.id, trackCondition, null).total;
  });
  let maxRivalIdx = 0;
  for (let i = 1; i < rawRivalScores.length; i++) {
    if (rawRivalScores[i] > rawRivalScores[maxRivalIdx]) maxRivalIdx = i;
  }

  return CLASH_SECTORS.map((sector, idx) => {
    const pCard = playerCards[idx] ?? playerCards[0];
    const rCard = rivalCards[idx] ?? rivalCards[0];
    const effectsTriggered: string[] = [];

    const pRes = evaluateOneSideInSector({
      myCard: pCard,
      oppCard: rCard,
      myCrewCard: crewCard,
      oppCrewCard: rivalCrewCard,
      sector,
      trackCondition,
      isMyAceSector: idx === maxPlayerIdx,
      sideLabel: "You",
      effectsTriggered,
    });

    const rRes = evaluateOneSideInSector({
      myCard: rCard,
      oppCard: pCard,
      myCrewCard: rivalCrewCard,
      oppCrewCard: crewCard,
      sector,
      trackCondition,
      isMyAceSector: idx === maxRivalIdx,
      sideLabel: "Rival",
      effectsTriggered,
    });

    let pScore = pRes.score;
    let rScore = rRes.score;

    // #27 "One More Time!" Crowd Call — clutch overtake if trailing by 5 pts or less
    if (pCrewId === "crew-27-one-more-time" && rScore > pScore && rScore - pScore <= 5) {
      pScore += 6;
      effectsTriggered.push('📢 "One More Time!" Call: You +6 pts clutch overtake!');
    }
    if (rCrewId === "crew-27-one-more-time" && pScore > rScore && pScore - rScore <= 5) {
      rScore += 6;
      effectsTriggered.push('📢 "One More Time!" Call: Rival +6 pts clutch overtake!');
    }

    if (effectsTriggered.length === 0) {
      if (pCrewDef) effectsTriggered.push(`You: ${pCrewDef.icon} ${pCrewDef.name}`);
      if (rCrewDef) effectsTriggered.push(`Rival: ${rCrewDef.icon} ${rCrewDef.name}`);
    }

    return {
      sector,
      playerCard: pCard,
      rivalCard: rCard,
      playerScore: pScore,
      rivalScore: rScore,
      playerBreakdown: pRes.breakdown,
      rivalBreakdown: rRes.breakdown,
      effectsTriggered,
      won: pScore > rScore,
      tied: pScore === rScore,
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// NEW 3-CORNER TANDEM CLASH ENGINE:
//  - UK Track Card (Buff + Debuff)
//  - 1 Played Crew Advantage Card per Corner (out of 3)
//  - 1 Random Debuff Card per Corner applied to BOTH drivers
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rolls a random UK Track venue (all Gold venue cards), then independently rolls a random Track Buff
 * and a random Track Hazard from the dynamic presets pool, so every match gets a fresh randomised combo.
 */
export function rollUkTrackCard(
  pool: TrackCardDefinition[] = UK_TRACK_CARD_SET
): TrackCardDefinition {
  const list = pool.length > 0 ? pool : UK_TRACK_CARD_SET;
  const venue = list[Math.floor(Math.random() * list.length)] ?? UK_TRACK_CARD_SET[0];

  const buffPreset =
    DYNAMIC_TRACK_BUFF_PRESETS[Math.floor(Math.random() * DYNAMIC_TRACK_BUFF_PRESETS.length)] ??
    DYNAMIC_TRACK_BUFF_PRESETS[0];
  const hazardPreset =
    DYNAMIC_TRACK_HAZARD_PRESETS[Math.floor(Math.random() * DYNAMIC_TRACK_HAZARD_PRESETS.length)] ??
    DYNAMIC_TRACK_HAZARD_PRESETS[0];

  const b = buffPreset.rules ?? {};
  const d = hazardPreset.rules ?? {};

  return {
    ...venue,
    tier: "gold",
    ability: `BUFF: ${buffPreset.name.toUpperCase()} · HAZARD: ${hazardPreset.name.toUpperCase()}`.slice(0, 60),
    effect: `${venue.region}. Dynamic match conditions — 🇬🇧 Track Buff: ${buffPreset.label}. ⚠️ Track Hazard: ${hazardPreset.label}.`,
    buffLabel: buffPreset.label,
    debuffLabel: hazardPreset.label,
    rules: {
      driftBuff: b.driftBuff,
      accelBuff: b.accelBuff,
      gripBuff: b.gripBuff,
      steerBuff: b.steerBuff,
      buffCondition: b.buffCondition,
      debuffCondition: d.debuffCondition,
    },
  };
}

export function rollThreeDebuffCards(
  pool: DebuffCardDefinition[] = DEBUFF_CARD_SET
): [DebuffCardDefinition, DebuffCardDefinition, DebuffCardDefinition] {
  const list = (pool.length >= 3 ? pool : DEBUFF_CARD_SET).slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // Odds spin on Debuff rarities: Bronze (Standard 72.5%), Silver (1 in 5, 20%), Gold (1 in 20, 5%), Legend (1 in 40, 2.5%)
  return [
    scaleDebuffCardDefinition(list[0], rollClashRarityTier()),
    scaleDebuffCardDefinition(list[1] ?? list[0], rollClashRarityTier()),
    scaleDebuffCardDefinition(list[2] ?? list[0], rollClashRarityTier()),
  ];
}

export interface EvaluatedCornerResult {
  cornerIdx: 0 | 1 | 2;
  sector: ClashSectorSpec;
  playerCard: MemberCard;
  rivalCard: MemberCard;
  playerCrewCard: MemberCard;
  rivalCrewCard: MemberCard;
  playerDebuffCard: DebuffCardDefinition;
  rivalDebuffCard: DebuffCardDefinition;
  debuffCard: DebuffCardDefinition;
  trackCard: TrackCardDefinition;
  playerScore: number;
  rivalScore: number;
  playerBreakdown: string;
  rivalBreakdown: string;
  playerCrewBonusLabel: string;
  rivalCrewBonusLabel: string;
  debuffImpactLabel: string;
  trackImpactLabel: string;
  effectsTriggered: string[];
  won: boolean;
  tied: boolean;
}

function evaluateDriverOnCorner(params: {
  myCard: MemberCard;
  oppCard: MemberCard;
  myCrewCard: MemberCard;
  debuffCard: DebuffCardDefinition;
  trackCard: TrackCardDefinition;
  sector: ClashSectorSpec;
  sideLabel: "You" | "Rival";
  crewPool: CrewCardDefinition[];
  effectsTriggered: string[];
}): {
  score: number;
  breakdown: string;
  crewBonusLabel: string;
} {
  const {
    myCard,
    oppCard,
    myCrewCard,
    debuffCard,
    trackCard,
    sector,
    sideLabel,
    crewPool,
    effectsTriggered,
  } = params;

  const crewDef =
    getCrewCardDefinition(myCrewCard.crewCardId ?? myCrewCard.name ?? myCrewCard.id, crewPool) ??
    STARTER_LOANER_CREW_DEFINITION;
  const mods = crewDef.modifiers ?? {};
  const shield = Math.min(1, Math.max(0, mods.debuffShield ?? 0));

  const rawDrift = Number(myCard.stats?.drift) || 0;
  const rawAccel = Number(myCard.stats?.accel) || 0;
  const rawGrip = Number(myCard.stats?.grip) || 0;
  const rawSteer = Number(myCard.stats?.steer) || 0;
  const myRawTotal = rawDrift + rawAccel + rawGrip + rawSteer;

  const oppRawTotal =
    (Number(oppCard.stats?.drift) || 0) +
    (Number(oppCard.stats?.accel) || 0) +
    (Number(oppCard.stats?.grip) || 0) +
    (Number(oppCard.stats?.steer) || 0);

  let drift = rawDrift;
  let accel = rawAccel;
  let grip = rawGrip;
  let steer = rawSteer;

  // 1. Crew Card Stat Floor & Weakest Stat Boost (Advantage!)
  if (mods.minStatFloor && mods.minStatFloor > 0) {
    drift = Math.max(drift, mods.minStatFloor);
    accel = Math.max(accel, mods.minStatFloor);
    grip = Math.max(grip, mods.minStatFloor);
    steer = Math.max(steer, mods.minStatFloor);
  }
  if (mods.boostWeakestStat && mods.boostWeakestStat > 0) {
    const minVal = Math.min(drift, accel, grip, steer);
    if (drift === minVal) drift = Math.min(10, drift + mods.boostWeakestStat);
    else if (accel === minVal) accel = Math.min(10, accel + mods.boostWeakestStat);
    else if (grip === minVal) grip = Math.min(10, grip + mods.boostWeakestStat);
    else steer = Math.min(10, steer + mods.boostWeakestStat);
  }

  // 2. Crew Card Stat Bonuses (Advantage!)
  if (mods.driftBonus) drift = Math.min(10, drift + mods.driftBonus);
  if (mods.accelBonus) accel = Math.min(10, accel + mods.accelBonus);
  if (mods.gripBonus) grip = Math.min(10, grip + mods.gripBonus);
  if (mods.steerBonus) steer = Math.min(10, steer + mods.steerBonus);

  // 3. UK Track Card Stat Buffs
  const tRules = trackCard.rules ?? {};
  if (tRules.driftBuff) drift = Math.min(10, drift + tRules.driftBuff);
  if (tRules.accelBuff) accel = Math.min(10, accel + tRules.accelBuff);
  if (tRules.gripBuff) grip = Math.min(10, grip + tRules.gripBuff);
  if (tRules.steerBuff) steer = Math.min(10, steer + tRules.steerBuff);

  // 4. Random Corner Debuff Stat Penalties (Applied to both, reduced by Crew debuffShield!)
  const pen = debuffCard.penalties ?? {};
  const applyStatPen = (val: number, p?: number) => {
    if (!p || p <= 0) return val;
    const effectivePen = Math.round(p * (1 - shield));
    return Math.max(1, val - effectivePen);
  };
  drift = applyStatPen(drift, pen.driftPenalty);
  accel = applyStatPen(accel, pen.accelPenalty);
  grip = applyStatPen(grip, pen.gripPenalty);
  steer = applyStatPen(steer, pen.steerPenalty);

  // 5. Compute Corner Formula Stat Score
  let statScore = 0;
  let formulaStr = "";
  if (sector.id === "entry") {
    statScore = Math.round(drift * 2 + accel * 1.5 + steer);
    formulaStr = `DRIFT ${drift}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else if (sector.id === "chase") {
    statScore = Math.round(steer * 2 + grip * 1.5 + drift);
    formulaStr = `STEER ${steer}×2 + GRIP ${grip}×1.5 + DRIFT ${drift}`;
  } else if (sector.id === "hairpin") {
    statScore = Math.round(steer * 2 + drift * 1.5 + accel);
    formulaStr = `STEER ${steer}×2 + DRIFT ${drift}×1.5 + ACCEL ${accel}`;
  } else if (sector.id === "sweeper") {
    statScore = Math.round(accel * 2 + drift * 1.5 + grip);
    formulaStr = `ACCEL ${accel}×2 + DRIFT ${drift}×1.5 + GRIP ${grip}`;
  } else if (sector.id === "infield") {
    statScore = Math.round(grip * 2 + accel * 1.5 + steer);
    formulaStr = `GRIP ${grip}×2 + ACCEL ${accel}×1.5 + STEER ${steer}`;
  } else {
    statScore = Math.round(drift * 2 + grip * 1.5 + accel);
    formulaStr = `DRIFT ${drift}×2 + GRIP ${grip}×1.5 + ACCEL ${accel}`;
  }

  const tierBonus = TIER_CLASH_BONUS[myCard.tier] ?? 0;

  // 6. Crew Card Flat & Conditional Advantage Points
  let crewPts = mods.flatBonus ?? 0;
  if (
    mods.underdogBonus &&
    (myCard.tier === "bronze" || myCard.tier === "silver")
  ) {
    crewPts += mods.underdogBonus;
    if (mods.bronzeExtraBonus && myCard.tier === "bronze") {
      crewPts += mods.bronzeExtraBonus;
    }
  }
  if (
    mods.cornerSpecialist &&
    (mods.cornerSpecialist.corners.includes(sector.id as any) ||
      (sector.category && mods.cornerSpecialist.corners.includes(sector.category as any)))
  ) {
    crewPts += mods.cornerSpecialist.bonusPoints;
  }
  if (mods.giantSlayerBonus && myRawTotal < oppRawTotal) {
    crewPts += mods.giantSlayerBonus;
  }

  // 7. UK Track Conditional Buff & Debuff Points
  let trackPts = 0;
  if (tRules.buffCondition) {
    const bc = tRules.buffCondition;
    const rawMap = { drift: rawDrift, accel: rawAccel, grip: rawGrip, steer: rawSteer };
    if (bc.type === "always") {
      trackPts += bc.bonusPoints;
    } else if (bc.type === "underdog_tier" && (myCard.tier === "bronze" || myCard.tier === "silver")) {
      trackPts += bc.bonusPoints;
    } else if (
      bc.type === "balanced_stats" &&
      Math.min(rawDrift, rawAccel, rawGrip, rawSteer) >= (bc.threshold ?? 6)
    ) {
      trackPts += bc.bonusPoints;
    } else if (
      bc.type === "stat_min" &&
      bc.stat &&
      rawMap[bc.stat] >= (bc.threshold ?? 8)
    ) {
      trackPts += bc.bonusPoints;
    } else if (
      bc.type === "stat_max" &&
      bc.stat &&
      rawMap[bc.stat] <= (bc.threshold ?? 6)
    ) {
      trackPts += bc.bonusPoints;
    } else if (bc.type === "low_total" && myRawTotal <= (bc.threshold ?? 27)) {
      trackPts += bc.bonusPoints;
    }
  }
  if (tRules.debuffCondition) {
    const dc = tRules.debuffCondition;
    const rawMap = { drift: rawDrift, accel: rawAccel, grip: rawGrip, steer: rawSteer };
    let triggeredTrackDebuff = false;
    if (dc.type === "high_tier" && (myCard.tier === "legend" || myCard.tier === "mythic")) {
      triggeredTrackDebuff = true;
    } else if (dc.type === "stat_min" && dc.stat && rawMap[dc.stat] >= (dc.threshold ?? 9)) {
      triggeredTrackDebuff = true;
    } else if (dc.type === "stat_max" && dc.stat && rawMap[dc.stat] <= (dc.threshold ?? 6)) {
      triggeredTrackDebuff = true;
    }
    if (triggeredTrackDebuff) {
      const penPts = Math.round(dc.penaltyPoints * (1 - shield));
      trackPts -= penPts;
    }
  }

  // 8. Random Corner Debuff Flat & Conditional Penalty
  let debuffRawPen = pen.flatPenalty ?? 0;
  if (pen.condition) {
    const rawMap = { drift: rawDrift, accel: rawAccel, grip: rawGrip, steer: rawSteer };
    const statVal = rawMap[pen.condition.stat];
    const condMet =
      pen.condition.op === ">="
        ? statVal >= pen.condition.threshold
        : statVal <= pen.condition.threshold;
    if (condMet) {
      debuffRawPen += pen.condition.extraPenalty;
    }
  }
  const debuffPts = -Math.round(debuffRawPen * (1 - shield));

  if (shield > 0 && (debuffRawPen > 0 || pen.driftPenalty || pen.accelPenalty || pen.gripPenalty || pen.steerPenalty)) {
    effectsTriggered.push(
      `🛡️ ${sideLabel}: ${crewDef.icon} ${crewDef.name} shielded ${Math.round(shield * 100)}% of Debuff!`
    );
  }

  const totalExtra = crewPts + trackPts + debuffPts;
  const score = Math.max(5, statScore + tierBonus + totalExtra);

  const crewSummaryParts: string[] = [];
  if (mods.driftBonus) crewSummaryParts.push(`+${mods.driftBonus} DRIFT`);
  if (mods.accelBonus) crewSummaryParts.push(`+${mods.accelBonus} ACCEL`);
  if (mods.gripBonus) crewSummaryParts.push(`+${mods.gripBonus} GRIP`);
  if (mods.steerBonus) crewSummaryParts.push(`+${mods.steerBonus} STEER`);
  if (mods.minStatFloor) crewSummaryParts.push(`Floor ${mods.minStatFloor}`);
  if (mods.boostWeakestStat) crewSummaryParts.push(`+${mods.boostWeakestStat} Low Stat`);
  if (crewPts > 0) crewSummaryParts.push(`+${crewPts} Pts`);
  if (shield > 0) crewSummaryParts.push(`${Math.round(shield * 100)}% Shield`);

  return {
    score,
    breakdown: `${formulaStr}${tierBonus ? ` + ${tierBonus} Tier` : ""}${crewPts > 0 ? ` + ${crewPts} Crew` : ""}${trackPts !== 0 ? ` ${trackPts > 0 ? `+ ${trackPts}` : `- ${Math.abs(trackPts)}`} Track` : ""}${debuffPts < 0 ? ` - ${Math.abs(debuffPts)} Debuff` : ""}`,
    crewBonusLabel: `${crewDef.icon} ${crewDef.name} (${crewSummaryParts.join(" · ") || "Active"})`,
  };
}

export function evaluateCornerMatchup(params: {
  cornerIdx: 0 | 1 | 2;
  sector?: ClashSectorSpec;
  playerCard: MemberCard;
  rivalCard: MemberCard;
  playerCrewCard: MemberCard | null;
  rivalCrewCard: MemberCard | null;
  playerDebuffCard: DebuffCardDefinition;
  rivalDebuffCard: DebuffCardDefinition;
  trackCard: TrackCardDefinition;
  crewPool?: CrewCardDefinition[];
}): EvaluatedCornerResult {
  const {
    cornerIdx,
    sector: customSector,
    playerCard,
    rivalCard,
    playerCrewCard,
    rivalCrewCard,
    playerDebuffCard,
    rivalDebuffCard,
    trackCard,
    crewPool = CREW_CARD_SET,
  } = params;

  const sector = customSector ?? CLASH_SECTORS[cornerIdx] ?? CLASH_SECTORS[0];
  const pCrew = playerCrewCard ?? STARTER_LOANER_CREW_CARDS[cornerIdx];
  const rCrew = rivalCrewCard ?? STARTER_LOANER_CREW_CARDS[cornerIdx];
  const effectsTriggered: string[] = [
    `🇬🇧 Track: ${trackCard.icon} ${trackCard.name}`,
    `⚠️ Your Debuff: ${playerDebuffCard.icon} ${playerDebuffCard.name}`,
    `⚠️ Rival Debuff: ${rivalDebuffCard.icon} ${rivalDebuffCard.name}`,
  ];

  const pRes = evaluateDriverOnCorner({
    myCard: playerCard,
    oppCard: rivalCard,
    myCrewCard: pCrew,
    debuffCard: playerDebuffCard,
    trackCard,
    sector,
    sideLabel: "You",
    crewPool,
    effectsTriggered,
  });

  const rRes = evaluateDriverOnCorner({
    myCard: rivalCard,
    oppCard: playerCard,
    myCrewCard: rCrew,
    debuffCard: rivalDebuffCard,
    trackCard,
    sector,
    sideLabel: "Rival",
    crewPool,
    effectsTriggered,
  });

  return {
    cornerIdx,
    sector,
    playerCard,
    rivalCard,
    playerCrewCard: pCrew,
    rivalCrewCard: rCrew,
    playerDebuffCard,
    rivalDebuffCard,
    debuffCard: playerDebuffCard,
    trackCard,
    playerScore: pRes.score,
    rivalScore: rRes.score,
    playerBreakdown: pRes.breakdown,
    rivalBreakdown: rRes.breakdown,
    playerCrewBonusLabel: pRes.crewBonusLabel,
    rivalCrewBonusLabel: rRes.crewBonusLabel,
    debuffImpactLabel: `You: ${playerDebuffCard.name} · Rival: ${rivalDebuffCard.name}`,
    trackImpactLabel: `${trackCard.icon} ${trackCard.name}: ${trackCard.ability}`,
    effectsTriggered,
    won: pRes.score > rRes.score,
    tied: pRes.score === rRes.score,
  };
}
