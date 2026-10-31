import type { FullArtTier } from "@/lib/full-art-card";
import type { MemberCard } from "@/lib/card-roll";
import { getNormalizedCardStats, normalizeStatValue } from "@/tcg/progression";
import {
  CREW_CARD_SET,
  scaleCrewCardDefinition,
  crewDefinitionToCardData,
} from "@/lib/crew-cards";

export type ChallengeRarityFilter = "any" | "bronze" | "silver" | "gold" | "legend";
export type ChallengeThemeStyle =
  | "bronze"
  | "silver"
  | "gold"
  | "legend"
  | "cyber"
  | "touge"
  | "neon"
  | "fire";

export interface CustomRivalCrewCardConfig {
  cardId: string;
  tier: FullArtTier;
}

export interface CustomRivalConfig {
  driverName: string;
  teamName: string;
  title: string;
  carCardIds: string[];
  cars?: MemberCard[];
  crewCards?: CustomRivalCrewCardConfig[];
}

export interface TandemClashChallenge {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  themeStyle: ChallengeThemeStyle;
  allowedRarity: ChallengeRarityFilter;
  /** Maximum combined total score of all 4 car stats (e.g., 60, 65, 80). Null = no max score limit. */
  maxTotalScore: number | null;
  /** Entry cost in P-Credits. 0 = Free entry. */
  entryCostPCredits: number;
  /** P-Credits rewarded upon winning the 3-corner clash battle. */
  rewardPCredits: number;
  /** Whether this is an automated built-in challenge. */
  isSystem?: boolean;
  createdBy?: string;
  createdAt: number;
  /** Optional custom-picked opponent rival team for admin challenges. */
  customRival?: CustomRivalConfig | null;
}

export interface AdminChallengeInput {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  themeStyle: ChallengeThemeStyle;
  allowedRarity: ChallengeRarityFilter;
  maxTotalScore: number | null;
  entryCostPCredits: number;
  rewardPCredits: number;
  customRival?: CustomRivalConfig | null;
}

/** Theme visual styling presets for Challenge Cards and headers. */
export interface ChallengeThemeConfig {
  borderClass: string;
  bgGradientClass: string;
  badgeClass: string;
  accentTextClass: string;
  buttonClass: string;
  glowClass: string;
  icon: string;
}

export const CHALLENGE_THEME_CONFIGS: Record<ChallengeThemeStyle, ChallengeThemeConfig> = {
  bronze: {
    borderClass: "border-amber-700/60 hover:border-amber-500",
    bgGradientClass: "from-amber-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-amber-600/50 bg-amber-600/20 text-amber-300",
    accentTextClass: "text-amber-400",
    buttonClass: "from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-amber-900/40",
    glowClass: "shadow-[0_0_25px_rgba(180,83,9,0.25)]",
    icon: "🥉",
  },
  silver: {
    borderClass: "border-slate-400/60 hover:border-slate-200",
    bgGradientClass: "from-slate-900/90 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-slate-300/50 bg-slate-400/20 text-slate-200",
    accentTextClass: "text-slate-200",
    buttonClass: "from-slate-300 via-slate-200 to-slate-400 hover:from-white hover:to-slate-300 text-black shadow-slate-500/30",
    glowClass: "shadow-[0_0_25px_rgba(203,213,225,0.25)]",
    icon: "🥈",
  },
  gold: {
    borderClass: "border-yellow-500/60 hover:border-yellow-300",
    bgGradientClass: "from-yellow-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-yellow-500/50 bg-yellow-500/20 text-yellow-300",
    accentTextClass: "text-yellow-400",
    buttonClass: "from-yellow-400 via-amber-500 to-yellow-500 hover:from-yellow-300 hover:to-amber-400 text-black shadow-yellow-500/40",
    glowClass: "shadow-[0_0_30px_rgba(234,179,8,0.3)]",
    icon: "🥇",
  },
  legend: {
    borderClass: "border-purple-500/70 hover:border-purple-300",
    bgGradientClass: "from-purple-950/70 via-indigo-950/60 to-zinc-950",
    badgeClass: "border-purple-400/50 bg-purple-500/25 text-purple-200",
    accentTextClass: "text-purple-300",
    buttonClass: "from-purple-500 via-fuchsia-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-purple-500/40",
    glowClass: "shadow-[0_0_35px_rgba(168,85,247,0.35)]",
    icon: "👑",
  },
  cyber: {
    borderClass: "border-cyan-500/60 hover:border-cyan-300",
    bgGradientClass: "from-cyan-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-cyan-400/50 bg-cyan-500/20 text-cyan-300",
    accentTextClass: "text-cyan-400",
    buttonClass: "from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black shadow-cyan-500/40",
    glowClass: "shadow-[0_0_30px_rgba(6,182,212,0.3)]",
    icon: "⚡",
  },
  touge: {
    borderClass: "border-emerald-500/60 hover:border-emerald-300",
    bgGradientClass: "from-emerald-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-emerald-400/50 bg-emerald-500/20 text-emerald-300",
    accentTextClass: "text-emerald-400",
    buttonClass: "from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/40",
    glowClass: "shadow-[0_0_30px_rgba(16,185,129,0.3)]",
    icon: "⛰️",
  },
  neon: {
    borderClass: "border-pink-500/60 hover:border-pink-300",
    bgGradientClass: "from-pink-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-pink-400/50 bg-pink-500/20 text-pink-300",
    accentTextClass: "text-pink-400",
    buttonClass: "from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white shadow-pink-500/40",
    glowClass: "shadow-[0_0_30px_rgba(236,72,153,0.3)]",
    icon: "✨",
  },
  fire: {
    borderClass: "border-red-500/70 hover:border-red-400",
    bgGradientClass: "from-red-950/70 via-zinc-900/90 to-zinc-950",
    badgeClass: "border-red-500/50 bg-red-500/20 text-red-300",
    accentTextClass: "text-red-400",
    buttonClass: "from-red-500 via-orange-500 to-amber-500 hover:from-red-400 hover:to-amber-400 text-black shadow-red-500/40",
    glowClass: "shadow-[0_0_35px_rgba(239,68,68,0.35)]",
    icon: "🔥",
  },
};

/** Compute the normalized total score of all 4 stats on a car card (out of 100). */
export function getCarNormalizedTotalScore(card: Pick<MemberCard, "stats" | "tier">): number {
  if (!card?.stats) return 0;
  const s = getNormalizedCardStats(card);
  return s.drift + s.accel + s.grip + s.steer;
}

/** Check if a car card satisfies all restrictions of a given challenge. */
export function isCarEligibleForChallenge(
  card: MemberCard,
  challenge: TandemClashChallenge
): { eligible: boolean; reason?: string } {
  // Only valid car cards are allowed in car slots (exclude crew, maintenance, debuff, track)
  if (
    card.cardType === "crew" ||
    card.cardType === "maintenance" ||
    card.cardType === "debuff" ||
    card.cardType === "track" ||
    Boolean(card.crewCardId)
  ) {
    return {
      eligible: false,
      reason: "Only Car cards can be deployed into car slots",
    };
  }

  // Check rarity constraint (case-insensitive & trimmed)
  const reqTier = (challenge.allowedRarity || "any").toLowerCase().trim();
  const cardTier = (card.tier || "").toLowerCase().trim();

  if (reqTier && reqTier !== "any") {
    if (cardTier !== reqTier) {
      return {
        eligible: false,
        reason: `Requires ${challenge.allowedRarity.toUpperCase()} tier only (${cardTier ? cardTier.toUpperCase() : "UNKNOWN"} card)`,
      };
    }
  }

  // Check max total score constraint (if challenge sets a score cap)
  if (typeof challenge.maxTotalScore === "number" && challenge.maxTotalScore > 0) {
    const total = getCarNormalizedTotalScore(card);
    if (total > challenge.maxTotalScore) {
      return {
        eligible: false,
        reason: `Total score (${total}/100) exceeds max ${challenge.maxTotalScore}`,
      };
    }
  }

  return { eligible: true };
}

/** Built-in Automated System Challenges */
export const SYSTEM_CHALLENGES: TandemClashChallenge[] = [
  {
    id: "challenge-grassroots-bronze",
    title: "Grassroots Cup",
    subtitle: "Bronze Tier Only · Equalizer Showdown",
    description:
      "Raw driving skill over tuning budget! Only Bronze-tier cars qualify. Face off against high-level Grassroots spec builds.",
    badge: "Bronze Only",
    themeStyle: "bronze",
    allowedRarity: "bronze",
    maxTotalScore: null,
    entryCostPCredits: 0,
    rewardPCredits: 35,
    isSystem: true,
    createdAt: 0,
  },
  {
    id: "challenge-proam-silver",
    title: "Pro-Am Shootout",
    subtitle: "Silver Tier Only · Precision Spec",
    description:
      "Fine-tuned club builds battling door-to-door! Only Silver-tier machines qualify for this high-intensity tandem showcase.",
    badge: "Silver Only",
    themeStyle: "silver",
    allowedRarity: "silver",
    maxTotalScore: null,
    entryCostPCredits: 0,
    rewardPCredits: 50,
    isSystem: true,
    createdAt: 0,
  },
  {
    id: "challenge-golden-gold",
    title: "Golden Hour Masters",
    subtitle: "Gold Tier Only · Sunset Championship",
    description:
      "Only precision-tuned Gold-tier machines qualify. High-traction drift dynamics against the greatest Gold setups in the paddock.",
    badge: "Gold Only",
    themeStyle: "gold",
    allowedRarity: "gold",
    maxTotalScore: null,
    entryCostPCredits: 10,
    rewardPCredits: 75,
    isSystem: true,
    createdAt: 0,
  },
  {
    id: "challenge-apex-legend",
    title: "Supercar Apex Series",
    subtitle: "Legend Tier Only · Maximum Pace",
    description:
      "The pinnacle of RC drifting! Bring your top Legend machines to take on the most ferocious Legend championship cars.",
    badge: "Legend Only",
    themeStyle: "legend",
    allowedRarity: "legend",
    maxTotalScore: null,
    entryCostPCredits: 25,
    rewardPCredits: 150,
    isSystem: true,
    createdAt: 0,
  },
];

/** Select the 3 highest synergy / best crew cards scaled to the challenge's rarity tier */
export function getBestCrewCardsForRarity(tier: FullArtTier): [MemberCard, MemberCard, MemberCard] {
  const tierConfig: Record<FullArtTier, [string, string, string]> = {
    bronze: ["crew-20-proximity-laser", "crew-21-turbo-map", "crew-29-p1-qualifier"],
    silver: ["crew-22-ackerman-knuckles", "crew-26-carbon-flex-deck", "crew-30-twin-drift-sync"],
    gold: ["crew-27-one-more-time", "crew-24-dual-gain-gyro", "crew-17-fresh-asphalt"],
    legend: ["crew-28-vip-judge-box", "crew-27-one-more-time", "crew-30-twin-drift-sync"],
    mythic: ["crew-28-vip-judge-box", "crew-27-one-more-time", "crew-30-twin-drift-sync"],
  };

  const ids = tierConfig[tier] ?? tierConfig.gold;
  const cards = ids.map((id) => {
    const def = CREW_CARD_SET.find((d) => d.id === id) ?? CREW_CARD_SET[0];
    const scaled = scaleCrewCardDefinition(def, tier);
    return crewDefinitionToCardData(scaled) as MemberCard;
  });

  return [cards[0], cards[1], cards[2]];
}

