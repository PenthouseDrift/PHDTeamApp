import type { FullArtTier } from "@/lib/full-art-card";
import { CLASH_RARITY_ODDS, rollClashRarityTier } from "@/lib/crew-cards";
import type { MemberCard } from "@/lib/card-roll";

export type MechanicalFaultType = "engine" | "transmission" | "suspension" | "electronics";

export interface MechanicalFaultDef {
  type: MechanicalFaultType;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  accentColor: string;
}

export interface MechanicalFault {
  type: MechanicalFaultType;
  name: string;
  icon: string;
  battlesNeeded: number;
  battlesRemaining: number;
  occurredAt?: number;
}

/**
 * 4 Mechanical Faults that RC drift cars can suffer after their durability runs out.
 * Each fault forces the car to sit out 2–5 battles unless repaired with a maintenance consumable.
 */
export const MECHANICAL_FAULTS: Record<MechanicalFaultType, MechanicalFaultDef> = {
  engine: {
    type: "engine",
    name: "Brushless Motor Overheat",
    shortName: "Engine Fault",
    icon: "⚙️",
    description: "Brushless rotor desync, overheated motor can, and seized front bearings.",
    accentColor: "#ef4444", // red
  },
  transmission: {
    type: "transmission",
    name: "Stripped Diff & Driveshaft",
    shortName: "Transmission Fault",
    icon: "🕹️",
    description: "Stripped differential bevel gears and twisted center CVD dogbone.",
    accentColor: "#f59e0b", // amber
  },
  suspension: {
    type: "suspension",
    name: "Snapped Steering Link & Damper",
    shortName: "Suspension Fault",
    icon: "🔧",
    description: "Snapped turnbuckle tie-rod, bent kingpin knuckle, and blown damper o-ring.",
    accentColor: "#06b6d4", // cyan
  },
  electronics: {
    type: "electronics",
    name: "ESC Thermal Cutoff & Gyro Drift",
    shortName: "Electronics Fault",
    icon: "⚡",
    description: "Thermal throttle shutdown, loose gyro telemetry lead, and capacitor puff.",
    accentColor: "#a855f7", // purple
  },
};

export const MECHANICAL_FAULT_TYPES: MechanicalFaultType[] = [
  "engine",
  "transmission",
  "suspension",
  "electronics",
];

/**
 * Repair power by rarity tier for Maintenance Consumable Cards:
 *   Bronze: -1 Battle
 *   Silver: -2 Battles
 *   Gold:   -3 Battles
 *   Legend: -5 Battles (Instant Full Repair)
 */
export const REPAIR_AMOUNT_BY_TIER: Record<FullArtTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  legend: 5,
  mythic: 5,
};

export interface MaintenanceConsumableSpec {
  id: string;
  targetFault: MechanicalFaultType;
  name: string;
  ability: string;
  effect: string;
  tier: FullArtTier;
  repairBattles: number;
  icon: string;
  accentColor: string;
}

/** Names and descriptions for each fault repair kit across the 4 tiers */
const MAINTENANCE_KIT_NAMES: Record<
  MechanicalFaultType,
  Record<FullArtTier, { name: string; title: string }>
> = {
  engine: {
    bronze: {
      name: "Motor Bearing & Shimming Kit",
      title: "BRONZE MOTOR REPAIR · -1 BATTLE",
    },
    silver: {
      name: "Brushless Stator & Rotor Refresh",
      title: "SILVER MOTOR OVERHAUL · -2 BATTLES",
    },
    gold: {
      name: "Competition Motor Rebuild Kit",
      title: "GOLD COMPETITION MOTOR · -3 BATTLES",
    },
    legend: {
      name: "Factory Works Motor Overhaul",
      title: "LEGEND WORKS OVERHAUL · FULL REPAIR",
    },
    mythic: {
      name: "Custom Billet Motor Overhaul",
      title: "MYTHIC WORKS OVERHAUL · FULL REPAIR",
    },
  },
  transmission: {
    bronze: {
      name: "Diff Shim & Lube Pack",
      title: "BRONZE DIFF REPAIR · -1 BATTLE",
    },
    silver: {
      name: "Hardened Steel Bevel Gears",
      title: "SILVER GEARBOX OVERHAUL · -2 BATTLES",
    },
    gold: {
      name: "Ball Diff & CVD Driveshaft Kit",
      title: "GOLD DRIVETRAIN REBUILD · -3 BATTLES",
    },
    legend: {
      name: "Billet Spool & Direct-Drive Kit",
      title: "LEGEND DRIVETRAIN WORKS · FULL REPAIR",
    },
    mythic: {
      name: "Carbon Titanium Drivetrain",
      title: "MYTHIC DRIVETRAIN WORKS · FULL REPAIR",
    },
  },
  suspension: {
    bronze: {
      name: "Damper Oil & O-Ring Service",
      title: "BRONZE SUSPENSION REPAIR · -1 BATTLE",
    },
    silver: {
      name: "Titanium Turnbuckles & Cups",
      title: "SILVER STEERING OVERHAUL · -2 BATTLES",
    },
    gold: {
      name: "High-Angle Knuckle & Geometry Kit",
      title: "GOLD GEOMETRY REBUILD · -3 BATTLES",
    },
    legend: {
      name: "Full Billet Suspension Overhaul",
      title: "LEGEND CHASSIS WORKS · FULL REPAIR",
    },
    mythic: {
      name: "Factory Billet Suspension System",
      title: "MYTHIC CHASSIS WORKS · FULL REPAIR",
    },
  },
  electronics: {
    bronze: {
      name: "Gyro Lead & Calibration Pack",
      title: "BRONZE ELECTRONICS REPAIR · -1 BATTLE",
    },
    silver: {
      name: "High-Voltage BEC & Fan Pack",
      title: "SILVER ESC OVERHAUL · -2 BATTLES",
    },
    gold: {
      name: "Competition ESC Capacitor Bank",
      title: "GOLD PRO ESC REBUILD · -3 BATTLES",
    },
    legend: {
      name: "Factory Dual-Core ESC & Gyro Refresh",
      title: "LEGEND ELECTRONICS WORKS · FULL REPAIR",
    },
    mythic: {
      name: "Pro Telemetry & Core ESC Overhaul",
      title: "MYTHIC ELECTRONICS WORKS · FULL REPAIR",
    },
  },
};

/**
 * Builds an inline SVG data URI for a Maintenance Consumable Card.
 */
export function buildMaintenanceCardSvgDataUrl(def: {
  icon: string;
  targetFaultName: string;
  tier: FullArtTier;
  repairBattles: number;
  accentColor: string;
}): string {
  const isFull = def.repairBattles >= 5;
  const badgeLabel = isFull
    ? "INSTANT FULL REPAIR"
    : `REPAIRS -${def.repairBattles} BATTLE${def.repairBattles > 1 ? "S" : ""}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
    <defs>
      <radialGradient id="maintBg" cx="50%" cy="40%" r="75%">
        <stop offset="0%" stop-color="${def.accentColor}" stop-opacity="0.55"/>
        <stop offset="50%" stop-color="#18181b" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#09090b" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="techGrid" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${def.accentColor}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="#09090b"/>
    <rect width="600" height="800" fill="url(#maintBg)"/>
    <!-- Technical schematic grid lines -->
    <path d="M 0 200 L 600 200 M 0 400 L 600 400 M 0 600 L 600 600 M 200 0 L 200 800 M 400 0 L 400 800" stroke="${def.accentColor}" stroke-opacity="0.12" stroke-width="2"/>
    <!-- Center circular HUD target -->
    <circle cx="300" cy="300" r="170" fill="none" stroke="${def.accentColor}" stroke-opacity="0.3" stroke-width="4" stroke-dasharray="8 8"/>
    <circle cx="300" cy="300" r="140" fill="#09090b" fill-opacity="0.85" stroke="${def.accentColor}" stroke-opacity="0.8" stroke-width="3"/>
    <circle cx="300" cy="300" r="115" fill="${def.accentColor}" fill-opacity="0.12"/>
    <!-- Diagnostic crosshairs -->
    <line x1="130" y1="300" x2="470" y2="300" stroke="${def.accentColor}" stroke-opacity="0.3" stroke-width="2"/>
    <line x1="300" y1="130" x2="300" y2="470" stroke="${def.accentColor}" stroke-opacity="0.3" stroke-width="2"/>
    <!-- Category Header -->
    <text x="300" y="115" text-anchor="middle" fill="${def.accentColor}" font-family="system-ui, sans-serif" font-size="20" font-weight="900" letter-spacing="4">PIT GARAGE · MAINTENANCE</text>
    <text x="300" y="145" text-anchor="middle" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="2">TARGET: ${def.targetFaultName.toUpperCase()}</text>
    <!-- Center Icon -->
    <text x="300" y="340" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="105" dominant-baseline="central">${def.icon}</text>
    <!-- Repair Badge -->
    <rect x="150" y="470" width="300" height="38" rx="19" fill="#000000" fill-opacity="0.75" stroke="${def.accentColor}" stroke-width="2"/>
    <text x="300" y="495" text-anchor="middle" fill="${def.accentColor}" font-family="system-ui, sans-serif" font-size="16" font-weight="900" letter-spacing="2">${badgeLabel}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Roll the initial durability for a fresh car card: 2 to 10 battles.
 */
export function rollCarInitialDurability(rng: () => number = Math.random): number {
  return 2 + Math.floor(rng() * 9); // [2, 10]
}

/**
 * Roll a mechanical fault when a car's battles run down to 0:
 *   - 1 of 4 faults (engine, transmission, suspension, electronics)
 *   - 2 to 5 battles needed to repair
 */
export function rollMechanicalFault(rng: () => number = Math.random): MechanicalFault {
  const faultType = MECHANICAL_FAULT_TYPES[Math.floor(rng() * MECHANICAL_FAULT_TYPES.length)];
  const def = MECHANICAL_FAULTS[faultType];
  const battlesNeeded = 2 + Math.floor(rng() * 4); // [2, 5]

  return {
    type: faultType,
    name: def.name,
    icon: def.icon,
    battlesNeeded,
    battlesRemaining: battlesNeeded,
    occurredAt: Date.now(),
  };
}

/**
 * Roll a Maintenance Consumable Card from a pack:
 *   - 1 of the 4 fault types at random
 *   - Rarity rolled using the standard CLASH_RARITY_ODDS (Bronze 72.5%, Silver 20%, Gold 5%, Legend 2.5%)
 *   - Repair power scales with tier (Bronze 1, Silver 2, Gold 3, Legend 5)
 */
export function rollMaintenanceConsumableCard(rng: () => number = Math.random): {
  name: string;
  ability: string;
  effect: string;
  tier: FullArtTier;
  cardType: "maintenance";
  targetFault: MechanicalFaultType;
  repairBattles: number;
  imageUrl: string;
  imageZoom: number;
  imageX: number;
  imageY: number;
  driver: string;
  team: string;
  stats: { drift: string; accel: string; grip: string; steer: string };
} {
  const targetFault = MECHANICAL_FAULT_TYPES[Math.floor(rng() * MECHANICAL_FAULT_TYPES.length)];
  const faultDef = MECHANICAL_FAULTS[targetFault];
  const tier = rollClashRarityTier(rng);
  const repairBattles = REPAIR_AMOUNT_BY_TIER[tier] ?? 1;
  const kitInfo = MAINTENANCE_KIT_NAMES[targetFault][tier];

  const imageUrl = buildMaintenanceCardSvgDataUrl({
    icon: faultDef.icon,
    targetFaultName: faultDef.shortName,
    tier,
    repairBattles,
    accentColor: faultDef.accentColor,
  });

  const isFull = repairBattles >= 5;
  const effect = isFull
    ? `Instantly repairs any ${faultDef.shortName} and restores the car to full race-ready condition!`
    : `Repairs ${faultDef.shortName} and reduces maintenance cooldown by ${repairBattles} battle${repairBattles > 1 ? "s" : ""}.`;

  return {
    name: kitInfo.name,
    ability: kitInfo.title,
    effect,
    tier,
    cardType: "maintenance",
    targetFault,
    repairBattles,
    imageUrl,
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: "Pit Crew Consumable",
    team: `${faultDef.shortName} Repair`,
    stats: {
      drift: String(repairBattles),
      accel: String(repairBattles),
      grip: String(repairBattles),
      steer: String(repairBattles),
    },
  };
}

/**
 * Checks if a car currently has an active mechanical fault.
 */
export function isCarBroken(card: (Pick<MemberCard, "fault"> & { cardType?: string }) | null | undefined): boolean {
  if (!card) return false;
  if (card.cardType === "crew" || card.cardType === "debuff" || card.cardType === "track" || card.cardType === "maintenance") {
    return false;
  }
  return Boolean(card.fault && card.fault.battlesRemaining > 0);
}

/**
 * Checks if a maintenance consumable card can be applied to a car.
 */
export function canRepairCarWithMaintenanceCard(
  car: MemberCard | null | undefined,
  consumable: MemberCard | null | undefined
): boolean {
  if (!car || !consumable) return false;
  if (!isCarBroken(car)) return false;
  if (consumable.cardType !== "maintenance") return false;
  return car.fault?.type === consumable.targetFault;
}
