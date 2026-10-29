import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";

/**
 * Clash Game Card Sets for DriftClash & Penthouse Drift:
 *  1. 30 Crew Advantage Cards (`CREW_CARD_SET`) — Pullable in Standard Packs; 100% positive advantages!
 *     Players bring 3 Crew Cards into a Clash (filled with Loaner Crew Cards if they own < 3)
 *     and choose 1 Crew Card to deploy on each of the 3 Corners.
 *  2. 12 Randomised Corner Debuff Cards (`DEBUFF_CARD_SET`) — Drawn automatically each Corner and
 *     applied symmetrically to BOTH drivers.
 *  3. 10 UK RC Drift Track Cards (`UK_TRACK_CARD_SET`) — Randomised at the start of each Clash
 *     with venue-specific Track Buffs and Track Debuffs.
 *
 * All three card sets can be managed, customized, given uploaded images, or expanded with bespoke
 * cards by admins in the Admin Card Maker ("Clash Game Cards" tab).
 */

export type CrewCardCategory =
  | "Pit Crew Tuning"
  | "Underdog Boost"
  | "Corner Specialist"
  | "Debuff Shield"
  | "Telemetry & ESC"
  | "Judge Favor";

export interface CrewCardModifiers {
  driftBonus?: number;
  accelBonus?: number;
  gripBonus?: number;
  steerBonus?: number;
  /** Flat points added on the corner this Crew Card is played */
  flatBonus?: number;
  /** Extra points when played on a Bronze or Silver car */
  underdogBonus?: number;
  /** Extra points when played on a Bronze car specifically */
  bronzeExtraBonus?: number;
  /** Boosts the car's lowest stat by this amount (up to max 8) */
  boostWeakestStat?: number;
  /** Raises any stat below this floor up to this floor (e.g., 7) */
  minStatFloor?: number;
  /** Shields your car from the Corner Debuff Card & Track Debuff (0.5 = 50% reduction, 1 = 100% immunity) */
  debuffShield?: number;
  /** Extra points if played on a specific corner (e.g. "entry", "chase", "wallride", "hairpin", "sweeper", "infield") */
  cornerSpecialist?: {
    corners: Array<"entry" | "chase" | "wallride" | "hairpin" | "sweeper" | "infield">;
    bonusPoints: number;
  };
  /** Extra points if your car has lower total base stats than the Rival's car on this corner */
  giantSlayerBonus?: number;
}

export interface CrewCardDefinition {
  /** Stable set identifier, e.g. "crew-01-polished-ice" */
  id: string;
  /** Number in the Crew Set (1..30, or >30 for bespoke admin cards) */
  setNumber: number;
  name: string;
  category: CrewCardCategory | string;
  /** Short advantage summary shown on the card ability line (<= 48 chars) */
  ability: string;
  /** Detailed advantage description printed on the card (<= 160 chars) */
  effect: string;
  tier: FullArtTier;
  /** Emoji/icon displayed as the centerpiece artwork when no custom image is uploaded */
  icon: string;
  /** Accent hex color for the icon backdrop */
  accentColor: string;
  /** Relative pull weight in Standard Packs */
  pullWeight: number;
  /** Structured positive advantage modifiers applied when played on a corner */
  modifiers: CrewCardModifiers;
  /** Optional custom uploaded artwork URL (overrides SVG icon art when set by admin) */
  customImageUrl?: string;
  imageZoom?: number;
  imageX?: number;
  imageY?: number;
  isCustom?: boolean;
}

export interface DebuffCardPenalties {
  driftPenalty?: number;
  accelPenalty?: number;
  gripPenalty?: number;
  steerPenalty?: number;
  /** Flat point deduction applied to both drivers on this corner */
  flatPenalty?: number;
  /** Conditional extra penalty (or exemption) based on a car's stat */
  condition?: {
    stat: "drift" | "accel" | "grip" | "steer";
    op: ">=" | "<=";
    threshold: number;
    extraPenalty: number;
  };
}

export interface DebuffCardDefinition {
  id: string;
  setNumber: number;
  name: string;
  category: string;
  /** Short hazard rule shown on the card ability line (<= 48 chars) */
  ability: string;
  /** Detailed hazard description printed on the card (<= 160 chars) */
  effect: string;
  tier: FullArtTier;
  icon: string;
  accentColor: string;
  penalties: DebuffCardPenalties;
  customImageUrl?: string;
  imageZoom?: number;
  imageX?: number;
  imageY?: number;
  isCustom?: boolean;
}

export interface TrackCardRules {
  /** Positive stat buffs applied to all cars on this UK Track (capped at 10, naturally helping lower-stat cars) */
  driftBuff?: number;
  accelBuff?: number;
  gripBuff?: number;
  steerBuff?: number;
  /** Conditional positive bonus points on this track (favours underdog / lower-rated setups) */
  buffCondition?: {
    type:
      | "stat_max"
      | "underdog_tier"
      | "low_total"
      | "stat_min"
      | "balanced_stats"
      | "always";
    stat?: "drift" | "accel" | "grip" | "steer";
    threshold?: number;
    bonusPoints: number;
  };
  /** Conditional negative penalty on this track (checks high-stat / high-tier setups) */
  debuffCondition?: {
    type: "stat_max" | "stat_min" | "high_tier";
    stat?: "drift" | "accel" | "grip" | "steer";
    threshold?: number;
    penaltyPoints: number;
  };
}

export interface TrackCardDefinition {
  id: string;
  setNumber: number;
  name: string;
  /** UK Region & Surface type */
  region: string;
  /** Short summary shown on card ability line (<= 48 chars) */
  ability: string;
  /** Detailed Buff + Debuff text printed on the card (<= 160 chars) */
  effect: string;
  /** Explicit Buff callout shown in the Clash UI */
  buffLabel: string;
  /** Explicit Debuff callout shown in the Clash UI */
  debuffLabel: string;
  tier: FullArtTier;
  icon: string;
  accentColor: string;
  rules: TrackCardRules;
  customImageUrl?: string;
  imageZoom?: number;
  imageX?: number;
  imageY?: number;
  isCustom?: boolean;
}

/**
 * Generates an inline SVG data URI for a Crew, Debuff, or UK Track Card so `card.imageUrl`
 * works everywhere (`FullArtCard`, thumbnails, marketplace, admin lists) with zero external requests.
 */
export function buildCrewCardSvgDataUrl(def: {
  icon: string;
  category: string;
  accentColor: string;
  setNumber: number;
  badgeText?: string;
  tier?: FullArtTier;
}): string {
  const tierLabel = def.tier ? ` · ${def.tier.toUpperCase()}` : "";
  const footerText =
    def.badgeText ? `${def.badgeText}${tierLabel}` : `CREW ADVANTAGE #${String(def.setNumber).padStart(2, "0")}${tierLabel}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="70%">
        <stop offset="0%" stop-color="${def.accentColor}" stop-opacity="0.48"/>
        <stop offset="55%" stop-color="#111827" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#050507" stop-opacity="1"/>
      </radialGradient>
      <radialGradient id="ring" cx="50%" cy="38%" r="35%">
        <stop offset="0%" stop-color="${def.accentColor}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${def.accentColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="600" height="800" fill="#07070a"/>
    <rect width="600" height="800" fill="url(#bg)"/>
    <circle cx="300" cy="295" r="195" fill="url(#ring)"/>
    <circle cx="300" cy="295" r="145" fill="none" stroke="${def.accentColor}" stroke-opacity="0.45" stroke-width="4" stroke-dasharray="14 10"/>
    <circle cx="300" cy="295" r="112" fill="#09090b" fill-opacity="0.78" stroke="${def.accentColor}" stroke-opacity="0.85" stroke-width="3"/>
    <text x="300" y="120" text-anchor="middle" fill="${def.accentColor}" font-family="system-ui, sans-serif" font-size="22" font-weight="900" letter-spacing="5">${def.category.toUpperCase()}</text>
    <text x="300" y="336" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="110" dominant-baseline="central">${def.icon}</text>
    <text x="300" y="478" text-anchor="middle" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="18" font-weight="800" letter-spacing="4">${footerText}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. 30 CREW ADVANTAGE CARDS (100% POSITIVE ADVANTAGES · PULLABLE IN PACKS)
// ═════════════════════════════════════════════════════════════════════════════

export const CREW_CARD_SET: CrewCardDefinition[] = [
  // ── 1–8: Debuff Shields & High-Traction Setup Advantages ─────────────────
  {
    id: "crew-01-polished-ice",
    setNumber: 1,
    name: "Ice-Spec Compound Tyres",
    category: "Debuff Shield",
    ability: "ICE COMPOUND · +2 GRIP & 100% DEBUFF SHIELD",
    effect: "Ultra-soft cold compound! Grants +2 GRIP, +2 corner pts, and 100% immunity to the Corner Debuff Card.",
    tier: "gold",
    icon: "❄️",
    accentColor: "#38bdf8",
    pullWeight: 14,
    modifiers: { gripBonus: 2, flatBonus: 2, debuffShield: 1 },
  },
  {
    id: "crew-02-rain-tarmac",
    setNumber: 2,
    name: "Wet-Line Rain Groove Setup",
    category: "Debuff Shield",
    ability: "WET CONTROL · +2 GRIP & 50% DEBUFF SHIELD",
    effect: "Grooved rain tyres and softened dampers! Adds +2 GRIP, +1 STEER, and blocks 50% of any Corner Debuff penalty.",
    tier: "silver",
    icon: "🌧️",
    accentColor: "#60a5fa",
    pullWeight: 24,
    modifiers: { gripBonus: 2, steerBonus: 1, debuffShield: 0.5 },
  },
  {
    id: "crew-03-wall-clip-zone",
    setNumber: 3,
    name: "Kevlar Rear Bumper Bash-Bar",
    category: "Corner Specialist",
    ability: "WALL RIDE · +3 PTS (+6 PTS ON CORNER 3)",
    effect: "Reinforced rear bash-bar lets you rub the concrete wall fearlessly! Grants +3 pts (+6 pts if played on Corner 3).",
    tier: "gold",
    icon: "🛡️",
    accentColor: "#f97316",
    pullWeight: 14,
    modifiers: {
      flatBonus: 3,
      cornerSpecialist: { corners: ["wallride"], bonusPoints: 3 },
    },
  },
  {
    id: "crew-04-boost-ban",
    setNumber: 4,
    name: "Works Factory Spec Tune",
    category: "Telemetry & ESC",
    ability: "FACTORY SPEC · +2 ALL STATS & +2 PTS",
    effect: "Full factory works telemetry calibration! Boosts DRIFT, ACCEL, GRIP, and STEER by +2 (up to 10) on this corner and adds +2 pts.",
    tier: "legend",
    icon: "🚨",
    accentColor: "#f43f5e",
    pullWeight: 6,
    modifiers: {
      driftBonus: 2,
      accelBonus: 2,
      gripBonus: 2,
      steerBonus: 2,
      flatBonus: 2,
    },
  },
  {
    id: "crew-05-diff-oil-spill",
    setNumber: 5,
    name: "Silicone Ball-Diff Lock",
    category: "Pit Crew Tuning",
    ability: "DIFF LOCK · +1 ACCEL, +1 GRIP & +1 PT",
    effect: "Freshly rebuilt ball differential! Grants +1 ACCEL, +1 GRIP, and +1 corner pt for instant forward bite.",
    tier: "bronze",
    icon: "⚙️",
    accentColor: "#eab308",
    pullWeight: 40,
    modifiers: { accelBonus: 1, gripBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-06-shallow-protest",
    setNumber: 6,
    name: "Spotter's High-Line Call",
    category: "Judge Favor",
    ability: "SPOTTER CALL · +2 STEER & +2 PTS",
    effect: "Your pit spotter calls the exact inner clip line on the headset! Adds +2 STEER and +2 pts on this corner.",
    tier: "silver",
    icon: "🚩",
    accentColor: "#a855f7",
    pullWeight: 24,
    modifiers: { steerBonus: 2, flatBonus: 2 },
  },
  {
    id: "crew-07-tire-bead-pop",
    setNumber: 7,
    name: "Beadlock Alloy Wheel Rims",
    category: "Debuff Shield",
    ability: "BEADLOCK · +2 DRIFT, +1 GRIP & SHIELD",
    effect: "CNC alloy beadlock rims prevent tyre roll! Grants +2 DRIFT, +1 GRIP, +2 pts, and 100% Corner Debuff immunity.",
    tier: "gold",
    icon: "⚙️",
    accentColor: "#ef4444",
    pullWeight: 14,
    modifiers: { driftBonus: 2, gripBonus: 1, flatBonus: 2, debuffShield: 1 },
  },
  {
    id: "crew-08-rf-glitch",
    setNumber: 8,
    name: "Ultra-Fast SSR Radio Link",
    category: "Telemetry & ESC",
    ability: "ZERO LATENCY · +2 STEER, +1 DRIFT & +2 PTS",
    effect: "Sub-millisecond transmitter response! Grants +2 STEER, +1 DRIFT, and +2 pts for razor-sharp transitions.",
    tier: "gold",
    icon: "📡",
    accentColor: "#06b6d4",
    pullWeight: 14,
    modifiers: { steerBonus: 2, driftBonus: 1, flatBonus: 2 },
  },

  // ── 9–14: Underdog & Low-Tier Amplifiers ─────────────────────────────────
  {
    id: "crew-09-grassroots-hero",
    setNumber: 9,
    name: "Grassroots Crowd Favorite",
    category: "Underdog Boost",
    ability: "CROWD ROAR · +3 PTS (+8 BRONZE / +6 SILVER)",
    effect: "The pit lane cheers the underdog build! Grants +3 pts (+8 pts total on a Bronze car, or +6 pts total on a Silver car).",
    tier: "legend",
    icon: "📣",
    accentColor: "#fbbf24",
    pullWeight: 6,
    modifiers: { flatBonus: 3, underdogBonus: 3, bronzeExtraBonus: 2 },
  },
  {
    id: "crew-10-box-stock-killer",
    setNumber: 10,
    name: "Box-Stock Giant Killer",
    category: "Underdog Boost",
    ability: "GIANT KILLER · +3 PTS (+7 VS HIGHER STAT)",
    effect: "Driver skill over budget! Grants +3 pts, plus an extra +4 pts whenever your car has lower base stats than the Rival's car.",
    tier: "gold",
    icon: "📦",
    accentColor: "#f59e0b",
    pullWeight: 14,
    modifiers: { flatBonus: 3, giantSlayerBonus: 4 },
  },
  {
    id: "crew-11-tech-scrutineer",
    setNumber: 11,
    name: "Scrutineer's Spec Equalizer",
    category: "Underdog Boost",
    ability: "EQUALIZER · +4 PTS (+7 FOR BRONZE/SILVER)",
    effect: "Levels the playing field! Grants +4 pts on this corner (+7 pts total when played on a Bronze or Silver car) and 100% Debuff Shield.",
    tier: "legend",
    icon: "⚖️",
    accentColor: "#8b5cf6",
    pullWeight: 6,
    modifiers: { flatBonus: 4, underdogBonus: 3, debuffShield: 1 },
  },
  {
    id: "crew-12-ziptie-tuner",
    setNumber: 12,
    name: "Zip-Tie Pit Engineering",
    category: "Underdog Boost",
    ability: "PIT FIX · WEAKEST STAT +2 & +2 PTS",
    effect: "Quick pit-table geometry fix! Boosts your car's lowest stat by +2 and adds +2 pts on this corner.",
    tier: "bronze",
    icon: "🔧",
    accentColor: "#d97706",
    pullWeight: 40,
    modifiers: { boostWeakestStat: 2, flatBonus: 2 },
  },
  {
    id: "crew-13-giant-slayer",
    setNumber: 13,
    name: "Tandem Giant Slayer",
    category: "Underdog Boost",
    ability: "SUPERCAR HUNTER · +3 PTS (+6 VS HIGHER CAR)",
    effect: "Dialed in to chase down high-tier builds! Grants +3 pts (+6 pts if facing a higher-stat rival car) and +1 DRIFT.",
    tier: "gold",
    icon: "⚔️",
    accentColor: "#ec4899",
    pullWeight: 14,
    modifiers: { driftBonus: 1, flatBonus: 3, giantSlayerBonus: 3 },
  },
  {
    id: "crew-14-home-track-line",
    setNumber: 14,
    name: "Penthouse Local Line",
    category: "Underdog Boost",
    ability: "LOCAL KNOWLEDGE · +3 PTS (+5 BRONZE/SILVER)",
    effect: "You know every bump in the concrete! Grants +3 pts on this corner (+5 pts when played on a Bronze or Silver car).",
    tier: "silver",
    icon: "🗺️",
    accentColor: "#10b981",
    pullWeight: 24,
    modifiers: { flatBonus: 3, underdogBonus: 2 },
  },

  // ── 15–20: Corner Specialists & Setup Advantages ─────────────────────────
  {
    id: "crew-15-touge-hairpins",
    setNumber: 15,
    name: "Touge Hairpin Geometry",
    category: "Corner Specialist",
    ability: "HAIRPIN LOCK · +2 STEER & +2 PTS",
    effect: "Maximum front caster and steering throw! Grants +2 STEER and +2 pts on this corner.",
    tier: "silver",
    icon: "🏁",
    accentColor: "#14b8a6",
    pullWeight: 24,
    modifiers: { steerBonus: 2, flatBonus: 2 },
  },
  {
    id: "crew-16-meihan-wall-ride",
    setNumber: 16,
    name: "Meihan Flick Commitment",
    category: "Corner Specialist",
    ability: "BIG ENTRY · +2 DRIFT & +5 PTS ON CORNER 1/3",
    effect: "High-commitment backward entry! Grants +2 DRIFT and +3 pts (+5 pts if played on Corner 1 or Corner 3).",
    tier: "gold",
    icon: "🔥",
    accentColor: "#f97316",
    pullWeight: 14,
    modifiers: {
      driftBonus: 2,
      flatBonus: 3,
      cornerSpecialist: { corners: ["entry", "wallride"], bonusPoints: 2 },
    },
  },
  {
    id: "crew-17-fresh-asphalt",
    setNumber: 17,
    name: "Fresh Track Tyre Warmer",
    category: "Pit Crew Tuning",
    ability: "WARM TYRES · +1 GRIP, +1 DRIFT & +1 PT",
    effect: "Pre-warmed contact patch! Adds +1 GRIP, +1 DRIFT, and +1 pt on this corner.",
    tier: "bronze",
    icon: "♨️",
    accentColor: "#84cc16",
    pullWeight: 40,
    modifiers: { gripBonus: 1, driftBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-18-smoke-screen",
    setNumber: 18,
    name: "Showstopper Smoke Plume",
    category: "Judge Favor",
    ability: "STYLE POINTS · +2 DRIFT & +2 PTS",
    effect: "Crowd-pleasing angle and tyre smoke! Adds +2 DRIFT and +2 style pts from the judges on this corner.",
    tier: "silver",
    icon: "💨",
    accentColor: "#94a3b8",
    pullWeight: 24,
    modifiers: { driftBonus: 2, flatBonus: 2 },
  },
  {
    id: "crew-19-inverted-grid",
    setNumber: 19,
    name: "Pro-Spec Balance Blueprint",
    category: "Underdog Boost",
    ability: "BLUEPRINT · STATS BELOW 8 BECOME 8 + 2 PTS!",
    effect: "Master chassis blueprint! Raises any stat on your car that is below 8 up to 8 for this corner, plus +2 pts.",
    tier: "legend",
    icon: "🔄",
    accentColor: "#c084fc",
    pullWeight: 6,
    modifiers: { minStatFloor: 8, flatBonus: 2 },
  },
  {
    id: "crew-20-proximity-laser",
    setNumber: 20,
    name: "Proximity Laser Telemetry",
    category: "Corner Specialist",
    ability: "CHASE SENSOR · +2 ACCEL & +4 PTS ON CORNER 2",
    effect: "Laser rangefinder keeps you inches from the lead door! Adds +2 ACCEL and +2 pts (+4 pts on Corner 2 Chase).",
    tier: "silver",
    icon: "🎯",
    accentColor: "#06b6d4",
    pullWeight: 24,
    modifiers: {
      accelBonus: 2,
      flatBonus: 2,
      cornerSpecialist: { corners: ["chase"], bonusPoints: 2 },
    },
  },

  // ── 21–30: Pit Crew & Electronics Tuning Buffs ───────────────────────────
  {
    id: "crew-21-turbo-map",
    setNumber: 21,
    name: "13.5T Turbo Timing Map",
    category: "Telemetry & ESC",
    ability: "ESC TUNE · +1 ACCEL, +1 DRIFT & +1 PT",
    effect: "Laptop ESC boost curve on the pit lane! Adds +1 ACCEL, +1 DRIFT, and +1 pt on this corner.",
    tier: "bronze",
    icon: "⚡",
    accentColor: "#f59e0b",
    pullWeight: 40,
    modifiers: { accelBonus: 1, driftBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-22-ackerman-knuckles",
    setNumber: 22,
    name: "Big-Lock Ackerman Knuckles",
    category: "Pit Crew Tuning",
    ability: "FRONT LOCK · +1 STEER, +1 DRIFT & +1 PT",
    effect: "Clean front-end ackerman alignment! Adds +1 STEER, +1 DRIFT, and +1 pt on this corner.",
    tier: "bronze",
    icon: "🔩",
    accentColor: "#3b82f6",
    pullWeight: 40,
    modifiers: { steerBonus: 1, driftBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-23-brass-bulkhead",
    setNumber: 23,
    name: "Rear Brass Weight Bias",
    category: "Pit Crew Tuning",
    ability: "REAR BIAS · +1 GRIP, +1 ACCEL & +1 PT",
    effect: "Rear pendulum weight transfer! Adds +1 GRIP, +1 ACCEL, and +1 pt on this corner.",
    tier: "bronze",
    icon: "⚓",
    accentColor: "#ca8a04",
    pullWeight: 40,
    modifiers: { gripBonus: 1, accelBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-24-dual-gain-gyro",
    setNumber: 24,
    name: "Dual-Gain Gyro Curve",
    category: "Debuff Shield",
    ability: "GYRO SHIELD · +2 STEER & 100% DEBUFF SHIELD",
    effect: "Custom remote gyro gain curve! Adds +2 STEER, +1 pt, and completely shields your car from the Corner Debuff Card.",
    tier: "silver",
    icon: "🧭",
    accentColor: "#6366f1",
    pullWeight: 24,
    modifiers: { steerBonus: 2, flatBonus: 1, debuffShield: 1 },
  },
  {
    id: "crew-25-ti-turnbuckles",
    setNumber: 25,
    name: "Titanium Camber Links",
    category: "Pit Crew Tuning",
    ability: "CONTACT PATCH · +1 STEER, +1 GRIP & +1 PT",
    effect: "Dialed front and rear contact patch! Adds +1 STEER, +1 GRIP, and +1 pt consistency bonus.",
    tier: "bronze",
    icon: "🔧",
    accentColor: "#94a3b8",
    pullWeight: 40,
    modifiers: { steerBonus: 1, gripBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-26-carbon-flex-deck",
    setNumber: 26,
    name: "High-Flex Carbon Deck",
    category: "Pit Crew Tuning",
    ability: "CHASSIS FLEX · +2 GRIP & +1 STEER",
    effect: "Torsional chassis roll in tandem! Adds +2 GRIP, +1 STEER, and +1 pt on this corner.",
    tier: "silver",
    icon: "💎",
    accentColor: "#22c55e",
    pullWeight: 24,
    modifiers: { gripBonus: 2, steerBonus: 1, flatBonus: 1 },
  },
  {
    id: "crew-27-one-more-time",
    setNumber: 27,
    name: '"One More Time!" Crowd Surge',
    category: "Judge Favor",
    ability: "CLUTCH SURGE · +5 PTS & +1 ALL STATS",
    effect: "The crowd chants OMT! Fuels an all-out attack with +1 to all 4 stats and +5 bonus pts on this corner.",
    tier: "gold",
    icon: "📢",
    accentColor: "#f43f5e",
    pullWeight: 14,
    modifiers: {
      driftBonus: 1,
      accelBonus: 1,
      gripBonus: 1,
      steerBonus: 1,
      flatBonus: 4,
    },
  },
  {
    id: "crew-28-vip-judge-box",
    setNumber: 28,
    name: "VIP Judge Stand Replay",
    category: "Judge Favor",
    ability: "JUDGE FAVOR · +6 PTS & 100% DEBUFF SHIELD",
    effect: "High-speed camera replay wows the judges! Grants +6 pts on this corner and 100% immunity to the Corner Debuff.",
    tier: "legend",
    icon: "🎬",
    accentColor: "#ec4899",
    pullWeight: 6,
    modifiers: { flatBonus: 6, debuffShield: 1 },
  },
  {
    id: "crew-29-p1-qualifier",
    setNumber: 29,
    name: "P1 Solo Qualifier Line",
    category: "Corner Specialist",
    ability: "ENTRY LINE · +2 PTS (+4 PTS ON CORNER 1)",
    effect: "Clean qualifier initiation line! Grants +2 pts (+4 pts if played on Corner 1 Flick Entry) and +1 DRIFT.",
    tier: "bronze",
    icon: "🏁",
    accentColor: "#10b981",
    pullWeight: 40,
    modifiers: {
      driftBonus: 1,
      flatBonus: 2,
      cornerSpecialist: { corners: ["entry"], bonusPoints: 2 },
    },
  },
  {
    id: "crew-30-twin-drift-sync",
    setNumber: 30,
    name: "Twin-Drift Mirror Sync",
    category: "Corner Specialist",
    ability: "DOOR SYNC · +2 PTS (+5 PTS ON CORNER 2)",
    effect: "Locked onto the lead car's door! Grants +2 pts (+5 pts if played on Corner 2 Door-to-Door Chase) and +1 ACCEL.",
    tier: "silver",
    icon: "🏎️",
    accentColor: "#f97316",
    pullWeight: 24,
    modifiers: {
      accelBonus: 1,
      flatBonus: 2,
      cornerSpecialist: { corners: ["chase"], bonusPoints: 3 },
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// 2. 12 RANDOMISED CORNER DEBUFF CARDS (APPLIED TO BOTH DRIVERS EACH CORNER)
// ═════════════════════════════════════════════════════════════════════════════

export const DEBUFF_CARD_SET: DebuffCardDefinition[] = [
  {
    id: "debuff-01-black-ice",
    setNumber: 1,
    name: "Polished Concrete Ice Patch",
    category: "Surface Hazard",
    ability: "SLICK PATCH · -1 GRIP (ACCEL >= 9: -3 PTS)",
    effect: "Mirror-slick concrete on the apex! Loses -1 GRIP on this corner, and overpowering cars with ACCEL >= 9 spin wide for -3 pts.",
    tier: "gold",
    icon: "🧊",
    accentColor: "#38bdf8",
    penalties: {
      gripPenalty: 1,
      condition: { stat: "accel", op: ">=", threshold: 9, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-02-tyre-smoke",
    setNumber: 2,
    name: "Blinding Tyre Smoke Bank",
    category: "Visibility Hazard",
    ability: "SMOKE POCKET · -1 STEER (DRIFT >= 9: -3 PTS)",
    effect: "Thick hanging smoke hides the clipping cone! Loses -1 STEER, and extreme-angle cars (DRIFT >= 9) overshoot the clip for -3 pts.",
    tier: "silver",
    icon: "💨",
    accentColor: "#94a3b8",
    penalties: {
      steerPenalty: 1,
      condition: { stat: "drift", op: ">=", threshold: 9, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-03-oil-spill",
    setNumber: 3,
    name: "Silicone Shock Oil Spill",
    category: "Surface Hazard",
    ability: "APEX SLICK · -1 PT (GRIP >= 8: -3 EXTRA PTS)",
    effect: "Leaked shock oil on the entry line! High-bite setups relying on GRIP >= 8 snap-slide for an extra -3 pts penalty.",
    tier: "bronze",
    icon: "💧",
    accentColor: "#eab308",
    penalties: {
      flatPenalty: 1,
      condition: { stat: "grip", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-04-voltage-sag",
    setNumber: 4,
    name: "2S LiPo Voltage Sag",
    category: "Electrical Hazard",
    ability: "BATTERY DROP · -1 ACCEL (ACCEL >= 8: -3 PTS)",
    effect: "High-amp turbo draw sags the battery pack! Cars with ACCEL >= 8 suffer a -3 pts brownout penalty on this corner.",
    tier: "bronze",
    icon: "⚡",
    accentColor: "#ef4444",
    penalties: {
      accelPenalty: 1,
      condition: { stat: "accel", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-05-servo-glitch",
    setNumber: 5,
    name: "BEC Steering Servo Twitch",
    category: "Electrical Hazard",
    ability: "SERVO GLITCH · -1 STEER (STEER >= 9: -3 PTS)",
    effect: "Ultra-high-speed servos overload the BEC mid-transition! Cars with STEER >= 9 twitch for -3 extra pts.",
    tier: "silver",
    icon: "⚡",
    accentColor: "#f59e0b",
    penalties: {
      steerPenalty: 1,
      condition: { stat: "steer", op: ">=", threshold: 9, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-06-cold-tyres",
    setNumber: 6,
    name: "Cold HDPE Spec Tyres",
    category: "Surface Hazard",
    ability: "COLD PLASTIC · -1 DRIFT (GRIP >= 9: -2 PTS)",
    effect: "Unwarmed spec tyres chatter on entry! Reduces DRIFT by -1, and sticky high-grip setups (GRIP >= 9) hop for -2 pts.",
    tier: "bronze",
    icon: "❄️",
    accentColor: "#60a5fa",
    penalties: {
      driftPenalty: 1,
      condition: { stat: "grip", op: ">=", threshold: 9, extraPenalty: 2 },
    },
  },
  {
    id: "debuff-07-wall-scrape",
    setNumber: 7,
    name: "Concrete Barrier Tail-Tap",
    category: "Track Hazard",
    ability: "WALL BRUSH · -1 PT (DRIFT >= 8: -3 EXTRA PTS)",
    effect: "Tight outer barrier! Aggressive high-angle cars (DRIFT >= 8) clip the concrete wall with their rear bumper for -3 extra pts.",
    tier: "silver",
    icon: "🚧",
    accentColor: "#f97316",
    penalties: {
      flatPenalty: 1,
      condition: { stat: "drift", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-08-gyro-hunt",
    setNumber: 8,
    name: "Gyro Gain Oscillation",
    category: "Electrical Hazard",
    ability: "GYRO WOBBLE · -1 DRIFT (STEER >= 8: -3 PTS)",
    effect: "Floor vibration triggers gyro hunting! High-angle steering setups (STEER >= 8) oscillate on the sweep for -3 pts.",
    tier: "silver",
    icon: "🧭",
    accentColor: "#a855f7",
    penalties: {
      driftPenalty: 1,
      condition: { stat: "steer", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-09-strict-marshal",
    setNumber: 9,
    name: "Over-Rotation Judge Deduction",
    category: "Judge Penalty",
    ability: "OVER-ROTATION · -1 PT (DRIFT >= 9: -4 EXTRA)",
    effect: "Judges penalize excessive crab-walking! Cars pushing extreme DRIFT >= 9 get docked -4 extra pts for over-rotation.",
    tier: "gold",
    icon: "🚨",
    accentColor: "#f43f5e",
    penalties: {
      flatPenalty: 1,
      condition: { stat: "drift", op: ">=", threshold: 9, extraPenalty: 4 },
    },
  },
  {
    id: "debuff-10-turbo-overheat",
    setNumber: 10,
    name: "ESC Thermal Throttle Cut",
    category: "Electrical Hazard",
    ability: "ESC OVERHEAT · -2 ACCEL (ACCEL >= 8: -3 PTS)",
    effect: "High-boost timing overheats the ESC! Loses -2 ACCEL, and high-power setups with ACCEL >= 8 go into thermal limp for -3 pts.",
    tier: "gold",
    icon: "🌡️",
    accentColor: "#ec4899",
    penalties: {
      accelPenalty: 2,
      condition: { stat: "accel", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
  {
    id: "debuff-11-de-bead",
    setNumber: 11,
    name: "High-Load Rear Tyre De-Bead",
    category: "Track Hazard",
    ability: "BEAD ROLL · -1 GRIP (GRIP >= 8: -4 EXTRA PTS)",
    effect: "Extreme lateral load rolls the tyre off the rim! High-grip rigs (GRIP >= 8) suffer -4 extra pts on this corner.",
    tier: "legend",
    icon: "💥",
    accentColor: "#ef4444",
    penalties: {
      gripPenalty: 1,
      condition: { stat: "grip", op: ">=", threshold: 8, extraPenalty: 4 },
    },
  },
  {
    id: "debuff-12-radio-jam",
    setNumber: 12,
    name: "Telemetry Overload Glitch",
    category: "Electrical Hazard",
    ability: "SIGNAL GLITCH · -1 STEER (STEER >= 8: -3 PTS)",
    effect: "2.4GHz telemetry saturation in the venue! High-sensitivity steering setups (STEER >= 8) suffer a -3 pts latency penalty.",
    tier: "silver",
    icon: "📡",
    accentColor: "#06b6d4",
    penalties: {
      steerPenalty: 1,
      condition: { stat: "steer", op: ">=", threshold: 8, extraPenalty: 3 },
    },
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// 3. 10 UK RC DRIFT TRACK CARDS (ALL GOLD VENUE CARDS — NO PERMANENT BUFFS/DEBUFFS)
// Buffs & Hazards are dynamically rolled & paired per match on game load.
// ═════════════════════════════════════════════════════════════════════════════

export interface TrackModifierPreset {
  id: string;
  name: string;
  label: string;
  rules: TrackCardRules;
}

/**
 * 10 Dynamic Track Buff presets rolled randomly at the start of each Drift Clash match.
 * Calibrated to reward underdog chassis, smooth throttle control, and grassroots builds.
 */
export const DYNAMIC_TRACK_BUFF_PRESETS: TrackModifierPreset[] = [
  {
    id: "buff-grassroots-line",
    name: "Grassroots Line",
    label: "Grassroots Line: Bronze & Silver cars gain +4 pts (+2 STEER cap 10)",
    rules: {
      steerBuff: 2,
      buffCondition: { type: "underdog_tier", bonusPoints: 4 },
    },
  },
  {
    id: "buff-momentum-flow",
    name: "Momentum Flow",
    label: "Momentum Flow: Cars with base ACCEL <= 6 gain +4 pts (+2 ACCEL cap 10)",
    rules: {
      accelBuff: 2,
      buffCondition: { type: "stat_max", stat: "accel", threshold: 6, bonusPoints: 4 },
    },
  },
  {
    id: "buff-resin-equalizer",
    name: "Slick Resin Equalizer",
    label: "Slick Resin Equalizer: Cars with base GRIP <= 6 gain +4 pts (+2 GRIP cap 10)",
    rules: {
      gripBuff: 2,
      buffCondition: { type: "stat_max", stat: "grip", threshold: 6, bonusPoints: 4 },
    },
  },
  {
    id: "buff-underground-touge",
    name: "Underground Touge",
    label: "Underground Touge: Bronze & Silver cars gain +5 pts/corner",
    rules: {
      driftBuff: 1,
      steerBuff: 1,
      buffCondition: { type: "underdog_tier", bonusPoints: 5 },
    },
  },
  {
    id: "buff-ptile-assist",
    name: "P-Tile Assist",
    label: "P-Tile Assist: Cars with base DRIFT <= 6 gain +4 pts (+2 DRIFT cap 10)",
    rules: {
      driftBuff: 2,
      buffCondition: { type: "stat_max", stat: "drift", threshold: 6, bonusPoints: 4 },
    },
  },
  {
    id: "buff-club-equalizer",
    name: "Club Equalizer",
    label: "Club Equalizer: Cars with total base stats <= 26 gain +4 pts",
    rules: {
      gripBuff: 2,
      buffCondition: { type: "low_total", threshold: 26, bonusPoints: 4 },
    },
  },
  {
    id: "buff-hairpin-assist",
    name: "Banked Hairpin Assist",
    label: "Banked Hairpin Assist: Cars with base STEER <= 6 gain +4 pts (+2 STEER)",
    rules: {
      steerBuff: 2,
      buffCondition: { type: "stat_max", stat: "steer", threshold: 6, bonusPoints: 4 },
    },
  },
  {
    id: "buff-street-spec",
    name: "Street Spec Boost",
    label: "Street Spec Boost: Cars with total base stats <= 27 gain +4 pts",
    rules: {
      driftBuff: 1,
      steerBuff: 1,
      buffCondition: { type: "low_total", threshold: 27, bonusPoints: 4 },
    },
  },
  {
    id: "buff-wet-look",
    name: "Wet-Look Control",
    label: "Wet-Look Control: Bronze & Silver cars gain +4 pts (+2 GRIP cap 10)",
    rules: {
      gripBuff: 2,
      buffCondition: { type: "underdog_tier", bonusPoints: 4 },
    },
  },
  {
    id: "buff-chase-draft",
    name: "Chase Draft Boost",
    label: "Chase Draft Boost: Cars with total base stats <= 27 gain +4 pts",
    rules: {
      accelBuff: 2,
      steerBuff: 1,
      buffCondition: { type: "low_total", threshold: 27, bonusPoints: 4 },
    },
  },
];

/**
 * 10 Dynamic Track Hazard presets rolled randomly at the start of each Drift Clash match.
 * Calibrated to challenge overpowered comp chassis and high-spec setups.
 */
export const DYNAMIC_TRACK_HAZARD_PRESETS: TrackModifierPreset[] = [
  {
    id: "hazard-concrete-walls",
    name: "Tight concrete walls",
    label: "Tight concrete walls: High-power cars with ACCEL >= 9 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "accel", threshold: 9, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-speed-scrub",
    name: "Speed scrub",
    label: "Speed scrub: Cars with base DRIFT >= 9 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "drift", threshold: 9, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-resin-chatter",
    name: "Resin chatter",
    label: "Resin chatter: High-bite cars with base GRIP >= 9 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "grip", threshold: 9, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-narrow-pillars",
    name: "Narrow pillars",
    label: "Narrow pillars: Legend & Mythic cars suffer -3 pts/corner",
    rules: {
      debuffCondition: { type: "high_tier", penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-oversteer-trap",
    name: "Over-steer trap",
    label: "Over-steer trap: Cars with base STEER >= 9 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "steer", threshold: 9, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-carpet-grip-roll",
    name: "Carpet grip-roll",
    label: "Carpet grip-roll: Cars with base GRIP >= 8 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "grip", threshold: 8, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-hairpin-spinout",
    name: "Hairpin spin-out",
    label: "Hairpin spin-out: Cars with base ACCEL >= 8 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "accel", threshold: 8, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-street-kerbs",
    name: "Tight street kerbs",
    label: "Tight street kerbs: Legend & Mythic cars lose -3 pts",
    rules: {
      debuffCondition: { type: "high_tier", penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-wheelspin",
    name: "Wheelspin hazard",
    label: "Wheelspin hazard: Cars with base ACCEL >= 8 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "accel", threshold: 8, penaltyPoints: 3 },
    },
  },
  {
    id: "hazard-angle-stall",
    name: "Angle stall",
    label: "Angle stall: Cars with base DRIFT >= 9 lose -3 pts",
    rules: {
      debuffCondition: { type: "stat_min", stat: "drift", threshold: 9, penaltyPoints: 3 },
    },
  },
];

export const UK_TRACK_CARD_SET: TrackCardDefinition[] = [
  {
    id: "track-01-penthouse-drift",
    setNumber: 1,
    name: "Penthouse Drift Arena",
    region: "UK · Polished Concrete Technical",
    ability: "UK VENUE · MIRROR-POLISHED CONCRETE",
    effect: "Home of Penthouse Drift! Premier indoor RC drift venue featuring mirror-polished concrete, tight clipping points, and technical switchbacks.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🏠",
    accentColor: "#f59e0b",
    rules: {},
  },
  {
    id: "track-02-asbo-rc",
    setNumber: 2,
    name: "ASBO RC Drift Circuit",
    region: "UK · Smooth Coated Tarmac",
    ability: "UK VENUE · SMOOTH COATED TARMAC",
    effect: "High-speed flowing club layout known for sweeping outer arcs, coated tarmac grip, and close door-to-door tandem battles.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🔥",
    accentColor: "#f97316",
    rules: {},
  },
  {
    id: "track-03-slide-house",
    setNumber: 3,
    name: "Slide House UK",
    region: "Midlands · Polished Resin Floor",
    ability: "MIDLANDS VENUE · POLISHED RESIN FLOOR",
    effect: "Glass-smooth polished resin floor where smooth throttle control, precision angle, and clean transitions reign supreme.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🏛️",
    accentColor: "#38bdf8",
    rules: {},
  },
  {
    id: "track-04-outlaw-rc",
    setNumber: 4,
    name: "Outlaw RC Underground",
    region: "North West · Raw Warehouse Touge",
    ability: "NORTH WEST VENUE · RAW WAREHOUSE TOUGE",
    effect: "Narrow underground warehouse circuit lined with concrete pillars, blind transitions, and raw touge intensity.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🏴",
    accentColor: "#a855f7",
    rules: {},
  },
  {
    id: "track-05-soul-rc",
    setNumber: 5,
    name: "Soul RC Championship Circuit",
    region: "UK · Competition P-Tile Arena",
    ability: "UK VENUE · COMPETITION P-TILE ARENA",
    effect: "Legendary UK competition P-tile arena. Flawless consistency demanding pinpoint clipping zone accuracy and tandem speed.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "👑",
    accentColor: "#ec4899",
    rules: {},
  },
  {
    id: "track-06-sideways-rc",
    setNumber: 6,
    name: "Sideways RC Club Track",
    region: "South · High-Bite Club Carpet",
    ability: "SOUTH VENUE · HIGH-BITE CLUB CARPET",
    effect: "High-traction club carpet venue packed with technical switchbacks, snappy transitions, and frantic bumper-to-bumper racing.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "⚡",
    accentColor: "#10b981",
    rules: {},
  },
  {
    id: "track-07-apex-touge-uk",
    setNumber: 7,
    name: "Apex Touge UK P-Tile",
    region: "Yorkshire · Technical P-Tile",
    ability: "YORKSHIRE VENUE · TECHNICAL P-TILE",
    effect: "Banked Yorkshire hairpins and technical elevation changes engineered to test maximum steering lock and chassis balance.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "📐",
    accentColor: "#06b6d4",
    rules: {},
  },
  {
    id: "track-08-scale-speed-uk",
    setNumber: 8,
    name: "Scale Speed UK Diorama",
    region: "UK · Scale Street Circuit",
    ability: "UK VENUE · SCALE STREET CIRCUIT",
    effect: "Ultra-realistic scale street circuit complete with street kerbs, lampposts, and unforgiving scale scenery.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🏁",
    accentColor: "#eab308",
    rules: {},
  },
  {
    id: "track-09-teesside-wet",
    setNumber: 9,
    name: "North East Wet-Look Touge",
    region: "North East · Sealed Slick Tarmac",
    ability: "NORTH EAST VENUE · SEALED SLICK TARMAC",
    effect: "Sealed slick tarmac with a mirror glaze that tests driver throttle finesse and progressive weight transfer.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🌧️",
    accentColor: "#6366f1",
    rules: {},
  },
  {
    id: "track-10-midlands-stadium",
    setNumber: 10,
    name: "Midlands Tandem Arena",
    region: "Midlands · Twin-Clip Championship",
    ability: "MIDLANDS VENUE · TWIN-CLIP CHAMPIONSHIP",
    effect: "Electric twin-clip stadium setup featuring massive viewing platforms and unforgiving clipping points built for showstopping drift battles.",
    buffLabel: "Randomised on match spin",
    debuffLabel: "Randomised on match spin",
    tier: "gold",
    icon: "🏟️",
    accentColor: "#f43f5e",
    rules: {},
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSION & LOOKUP HELPERS
// ═════════════════════════════════════════════════════════════════════════════

export function getCrewCardDefinition(
  crewCardId?: string | null,
  customSet: CrewCardDefinition[] = CREW_CARD_SET
): CrewCardDefinition | null {
  if (!crewCardId) return null;
  return (
    customSet.find((c) => c.id === crewCardId || c.name === crewCardId) ??
    CREW_CARD_SET.find((c) => c.id === crewCardId || c.name === crewCardId) ??
    null
  );
}

export function isCrewCard(
  card: (Pick<FullArtCardData, "cardType" | "crewCardId"> & { name?: string }) | null | undefined
): boolean {
  if (!card) return false;
  if (card.cardType === "debuff" || card.cardType === "track") return false;
  if (card.cardType === "crew") return true;
  if (Boolean(card.crewCardId)) return true;
  if (card.name && CREW_CARD_SET.some((c) => c.name === card.name || c.id === card.name)) return true;
  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
// RARITY ODDS & SCALING FOR CREW ADVANTAGES & CORNER DEBUFFS
// Bronze: Standard (72.5%) · Silver: 1 in 5 (20%) · Gold: 1 in 20 (5%) · Legend: 1 in 40 (2.5%)
// ═════════════════════════════════════════════════════════════════════════════

export const CLASH_RARITY_ODDS = {
  legend: 1 / 40, // 0.025 (2.5%)
  gold: 1 / 20, // 0.050 (5.0%)
  silver: 1 / 5, // 0.200 (20.0%)
  bronze: 1 - (1 / 40 + 1 / 20 + 1 / 5), // 0.725 (72.5%)
} as const;

export const CLASH_RARITY_TIERS: FullArtTier[] = ["bronze", "silver", "gold", "legend"];

export function rollClashRarityTier(rng: () => number = Math.random): FullArtTier {
  const r = rng();
  if (r < CLASH_RARITY_ODDS.legend) return "legend";
  if (r < CLASH_RARITY_ODDS.legend + CLASH_RARITY_ODDS.gold) return "gold";
  if (r < CLASH_RARITY_ODDS.legend + CLASH_RARITY_ODDS.gold + CLASH_RARITY_ODDS.silver) return "silver";
  return "bronze";
}

export function formatScaledCrewTexts(
  baseDef: CrewCardDefinition,
  mods: CrewCardModifiers,
  tier: FullArtTier
): { ability: string; effect: string } {
  const tag = baseDef.ability.split("·")[0]?.trim() || baseDef.name.toUpperCase();
  const summaryParts: string[] = [];
  const effectParts: string[] = [];

  if (mods.driftBonus) {
    summaryParts.push(`+${mods.driftBonus} DRIFT`);
    effectParts.push(`+${mods.driftBonus} DRIFT`);
  }
  if (mods.accelBonus) {
    summaryParts.push(`+${mods.accelBonus} ACCEL`);
    effectParts.push(`+${mods.accelBonus} ACCEL`);
  }
  if (mods.gripBonus) {
    summaryParts.push(`+${mods.gripBonus} GRIP`);
    effectParts.push(`+${mods.gripBonus} GRIP`);
  }
  if (mods.steerBonus) {
    summaryParts.push(`+${mods.steerBonus} STEER`);
    effectParts.push(`+${mods.steerBonus} STEER`);
  }

  if (mods.boostWeakestStat) {
    summaryParts.push(`WEAKEST STAT +${mods.boostWeakestStat}`);
    effectParts.push(`boosts lowest stat by +${mods.boostWeakestStat}`);
  }
  if (mods.minStatFloor) {
    summaryParts.push(`FLOOR ${mods.minStatFloor}`);
    effectParts.push(`raises stats below ${mods.minStatFloor} up to ${mods.minStatFloor}`);
  }
  if (mods.debuffShield) {
    const pct = Math.round(mods.debuffShield * 100);
    summaryParts.push(`${pct}% SHIELD`);
    effectParts.push(`${pct}% Corner Debuff Shield`);
  }
  if (mods.flatBonus) {
    summaryParts.push(`+${mods.flatBonus} PTS`);
    effectParts.push(`adds +${mods.flatBonus} pts on this corner`);
  }
  if (mods.underdogBonus) {
    summaryParts.push(`+${mods.underdogBonus} UNDERDOG`);
    effectParts.push(`+${mods.underdogBonus} extra pts for Bronze/Silver cars`);
  }
  if (mods.bronzeExtraBonus) {
    summaryParts.push(`+${mods.bronzeExtraBonus} BRONZE`);
    effectParts.push(`+${mods.bronzeExtraBonus} pts for Bronze cars`);
  }
  if (mods.giantSlayerBonus) {
    summaryParts.push(`+${mods.giantSlayerBonus} VS HIGHER`);
    effectParts.push(`+${mods.giantSlayerBonus} extra pts when facing higher-stat rivals`);
  }
  if (mods.cornerSpecialist) {
    const cNames = mods.cornerSpecialist.corners.join("/");
    summaryParts.push(`+${mods.cornerSpecialist.bonusPoints} ON ${cNames.toUpperCase()}`);
    effectParts.push(`+${mods.cornerSpecialist.bonusPoints} pts on ${cNames}`);
  }

  const flavorMatch = baseDef.effect.match(/^([^.!?]+[.!?])/);
  const flavor = flavorMatch ? flavorMatch[1].trim() : `${baseDef.name}!`;

  const ability = `${tag} · ${summaryParts.join(" & ")}`.slice(0, 48);
  const effect = `${flavor} Grants ${effectParts.join(", ")}.`.slice(0, 160);

  return { ability, effect };
}

export function formatScaledDebuffTexts(
  baseDef: DebuffCardDefinition,
  pen: DebuffCardPenalties,
  tier: FullArtTier
): { ability: string; effect: string } {
  const tag = baseDef.ability.split("·")[0]?.trim() || baseDef.name.toUpperCase();
  const summaryParts: string[] = [];
  const effectParts: string[] = [];

  if (pen.driftPenalty) {
    summaryParts.push(`-${pen.driftPenalty} DRIFT`);
    effectParts.push(`reduces DRIFT by -${pen.driftPenalty}`);
  }
  if (pen.accelPenalty) {
    summaryParts.push(`-${pen.accelPenalty} ACCEL`);
    effectParts.push(`reduces ACCEL by -${pen.accelPenalty}`);
  }
  if (pen.gripPenalty) {
    summaryParts.push(`-${pen.gripPenalty} GRIP`);
    effectParts.push(`reduces GRIP by -${pen.gripPenalty}`);
  }
  if (pen.steerPenalty) {
    summaryParts.push(`-${pen.steerPenalty} STEER`);
    effectParts.push(`reduces STEER by -${pen.steerPenalty}`);
  }
  if (pen.flatPenalty) {
    summaryParts.push(`-${pen.flatPenalty} PT${pen.flatPenalty > 1 ? "S" : ""}`);
    effectParts.push(`docked -${pen.flatPenalty} pts`);
  }
  if (pen.condition) {
    const c = pen.condition;
    summaryParts.push(`(${c.stat.toUpperCase()} ${c.op} ${c.threshold}: -${c.extraPenalty} PTS)`);
    effectParts.push(`cars with ${c.stat.toUpperCase()} ${c.op} ${c.threshold} lose -${c.extraPenalty} extra pts`);
  }

  const flavorMatch = baseDef.effect.match(/^([^.!?]+[.!?])/);
  const flavor = flavorMatch ? flavorMatch[1].trim() : `${baseDef.name}!`;

  const ability = `${tag} · ${summaryParts.join(" ")}`.slice(0, 48);
  const effect = `${flavor} ${effectParts.join(", ")}.`.slice(0, 160);

  return { ability, effect };
}

export function scaleCrewCardDefinition(
  baseDef: CrewCardDefinition,
  targetTier: FullArtTier
): CrewCardDefinition {
  const tierIndex: Record<FullArtTier, number> = {
    bronze: 0,
    silver: 1,
    gold: 2,
    legend: 3,
    mythic: 4,
  };
  const tIdx = Math.min(3, tierIndex[targetTier] ?? 0);
  const baseMods = baseDef.modifiers ?? {};
  const scaledMods: CrewCardModifiers = {};

  const statScale = [1, 2, 3, 4];
  const scaleStat = (val?: number) => {
    if (!val || val <= 0) return undefined;
    return statScale[tIdx];
  };

  if (baseMods.driftBonus) scaledMods.driftBonus = scaleStat(baseMods.driftBonus);
  if (baseMods.accelBonus) scaledMods.accelBonus = scaleStat(baseMods.accelBonus);
  if (baseMods.gripBonus) scaledMods.gripBonus = scaleStat(baseMods.gripBonus);
  if (baseMods.steerBonus) scaledMods.steerBonus = scaleStat(baseMods.steerBonus);

  if (baseMods.flatBonus !== undefined) {
    const flatScale = [
      Math.max(1, Math.round(baseMods.flatBonus * 0.6)),
      Math.max(2, Math.round(baseMods.flatBonus * 1.0)),
      Math.max(4, Math.round(baseMods.flatBonus * 1.6)),
      Math.max(6, Math.round(baseMods.flatBonus * 2.2)),
    ];
    scaledMods.flatBonus = flatScale[tIdx];
  }

  if (baseMods.boostWeakestStat !== undefined) {
    const weakestScale = [1, 2, 3, 4];
    scaledMods.boostWeakestStat = weakestScale[tIdx];
  }

  if (baseMods.minStatFloor !== undefined) {
    const floorScale = [6, 7, 8, 9];
    scaledMods.minStatFloor = floorScale[tIdx];
  }

  if (baseMods.debuffShield !== undefined) {
    const shieldScale = [0.25, 0.50, 0.75, 1.00];
    scaledMods.debuffShield = shieldScale[tIdx];
  }

  if (baseMods.underdogBonus !== undefined) {
    const underdogScale = [2, 3, 5, 7];
    scaledMods.underdogBonus = underdogScale[tIdx];
  }

  if (baseMods.bronzeExtraBonus !== undefined) {
    const bronzeExtraScale = [1, 2, 3, 4];
    scaledMods.bronzeExtraBonus = bronzeExtraScale[tIdx];
  }

  if (baseMods.giantSlayerBonus !== undefined) {
    const slayerScale = [2, 3, 5, 7];
    scaledMods.giantSlayerBonus = slayerScale[tIdx];
  }

  if (baseMods.cornerSpecialist) {
    const specScale = [1, 2, 4, 6];
    scaledMods.cornerSpecialist = {
      corners: baseMods.cornerSpecialist.corners,
      bonusPoints: specScale[tIdx],
    };
  }

  const scaledTexts = formatScaledCrewTexts(baseDef, scaledMods, targetTier);

  return {
    ...baseDef,
    tier: targetTier,
    modifiers: scaledMods,
    ability: scaledTexts.ability,
    effect: scaledTexts.effect,
  };
}

export function scaleDebuffCardDefinition(
  baseDef: DebuffCardDefinition,
  targetTier: FullArtTier
): DebuffCardDefinition {
  const tierIndex: Record<FullArtTier, number> = {
    bronze: 0,
    silver: 1,
    gold: 2,
    legend: 3,
    mythic: 4,
  };
  const tIdx = Math.min(3, tierIndex[targetTier] ?? 0);
  const basePen = baseDef.penalties ?? {};
  const scaledPen: DebuffCardPenalties = {};

  const statPenScale = [1, 2, 3, 4];
  const flatPenScale = [1, 2, 4, 6];
  const condExtraScale = [2, 3, 5, 7];

  if (basePen.driftPenalty) scaledPen.driftPenalty = statPenScale[tIdx];
  if (basePen.accelPenalty) scaledPen.accelPenalty = statPenScale[tIdx];
  if (basePen.gripPenalty) scaledPen.gripPenalty = statPenScale[tIdx];
  if (basePen.steerPenalty) scaledPen.steerPenalty = statPenScale[tIdx];
  if (basePen.flatPenalty) scaledPen.flatPenalty = flatPenScale[tIdx];

  if (basePen.condition) {
    scaledPen.condition = {
      stat: basePen.condition.stat,
      op: basePen.condition.op,
      threshold: basePen.condition.threshold,
      extraPenalty: condExtraScale[tIdx],
    };
  }

  const scaledTexts = formatScaledDebuffTexts(baseDef, scaledPen, targetTier);

  return {
    ...baseDef,
    tier: targetTier,
    penalties: scaledPen,
    ability: scaledTexts.ability,
    effect: scaledTexts.effect,
  };
}

/**
 * Pick one of the Crew Cards weighted by its `pullWeight`.
 * Also rolls the rarity tier according to the odds: Bronze (standard 72.5%), Silver (1 in 5, 20%), Gold (1 in 20, 5%), Legend (1 in 40, 2.5%).
 */
export function rollCrewCardDefinition(
  rng: () => number = Math.random,
  pool: CrewCardDefinition[] = CREW_CARD_SET,
  forcedTier?: FullArtTier
): CrewCardDefinition {
  const activePool = pool.length > 0 ? pool : CREW_CARD_SET;
  const totalWeight = activePool.reduce((sum, c) => sum + Math.max(1, c.pullWeight || 10), 0);
  let r = rng() * totalWeight;
  let picked = activePool[activePool.length - 1];
  for (const c of activePool) {
    const w = Math.max(1, c.pullWeight || 10);
    if (r < w) {
      picked = c;
      break;
    }
    r -= w;
  }
  const tier = forcedTier ?? rollClashRarityTier(rng);
  return scaleCrewCardDefinition(picked, tier);
}

/**
 * Convert a `CrewCardDefinition` into `FullArtCardData` fields ready to render or store.
 */
export function crewDefinitionToCardData(
  def: CrewCardDefinition
): Omit<FullArtCardData, "id" | "updatedAt"> {
  const hasCustomImg = Boolean(def.customImageUrl && def.customImageUrl.trim());
  return {
    name: def.name,
    ability: def.ability,
    effect: def.effect,
    tier: def.tier,
    stats: { drift: "—", accel: "—", grip: "—", steer: "—" },
    imageUrl: hasCustomImg
      ? def.customImageUrl!.trim()
      : buildCrewCardSvgDataUrl({
          icon: def.icon,
          category: def.category,
          accentColor: def.accentColor,
          setNumber: def.setNumber,
          badgeText: `CREW ADVANTAGE #${String(def.setNumber).padStart(2, "0")}`,
          tier: def.tier,
        }),
    imageZoom: def.imageZoom ?? 100,
    imageX: def.imageX ?? 50,
    imageY: def.imageY ?? 50,
    driver: def.category,
    team: `Crew Set #${String(def.setNumber).padStart(2, "0")}`,
    cardType: "crew",
    crewCardId: def.id,
    crewIcon: def.icon,
  };
}

/**
 * Convert a `DebuffCardDefinition` into `FullArtCardData` fields so it renders in `FullArtCard`.
 */
export function debuffDefinitionToCardData(
  def: DebuffCardDefinition
): FullArtCardData {
  const hasCustomImg = Boolean(def.customImageUrl && def.customImageUrl.trim());
  return {
    id: def.id,
    name: def.name,
    ability: def.ability,
    effect: def.effect,
    tier: def.tier,
    stats: { drift: "—", accel: "—", grip: "—", steer: "—" },
    imageUrl: hasCustomImg
      ? def.customImageUrl!.trim()
      : buildCrewCardSvgDataUrl({
          icon: def.icon,
          category: def.category,
          accentColor: def.accentColor,
          setNumber: def.setNumber,
          badgeText: `CORNER DEBUFF #${String(def.setNumber).padStart(2, "0")}`,
          tier: def.tier,
        }),
    imageZoom: def.imageZoom ?? 100,
    imageX: def.imageX ?? 50,
    imageY: def.imageY ?? 50,
    driver: def.category,
    team: `Debuff #${String(def.setNumber).padStart(2, "0")}`,
    cardType: "debuff",
    crewCardId: def.id,
    crewIcon: def.icon,
  };
}

/**
 * Convert a `TrackCardDefinition` into `FullArtCardData` fields so it renders in `FullArtCard`.
 */
export function trackDefinitionToCardData(
  def: TrackCardDefinition
): FullArtCardData {
  const hasCustomImg = Boolean(def.customImageUrl && def.customImageUrl.trim());
  return {
    id: def.id,
    name: def.name,
    ability: def.ability,
    effect: def.effect,
    tier: "gold",
    stats: { drift: "—", accel: "—", grip: "—", steer: "—" },
    imageUrl: hasCustomImg
      ? def.customImageUrl!.trim()
      : buildCrewCardSvgDataUrl({
          icon: def.icon,
          category: def.region,
          accentColor: def.accentColor,
          setNumber: def.setNumber,
          badgeText: `UK DRIFT TRACK #${String(def.setNumber).padStart(2, "0")}`,
        }),
    imageZoom: def.imageZoom ?? 100,
    imageX: def.imageX ?? 50,
    imageY: def.imageY ?? 50,
    driver: def.region,
    team: `UK Track #${String(def.setNumber).padStart(2, "0")}`,
    cardType: "track",
    crewCardId: def.id,
    crewIcon: def.icon,
  };
}

/**
 * 3 Starter Loaner Crew Definitions (#12 Zip-Tie Pit Engineering, #17 Fresh Track Tyre Warmer, #25 Titanium Camber Links)
 * used to fill any missing Crew Card slots when a player or Challenger owns fewer than 3 Crew Cards.
 */
export const LOANER_CREW_DEFINITIONS: [
  CrewCardDefinition,
  CrewCardDefinition,
  CrewCardDefinition,
] = [CREW_CARD_SET[11], CREW_CARD_SET[16], CREW_CARD_SET[24]];

export const STARTER_LOANER_CREW_DEFINITION: CrewCardDefinition = CREW_CARD_SET[11];
