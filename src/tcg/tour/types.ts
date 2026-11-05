import type { MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";

/**
 * Tandem Tour: types shared by the engine, the server and the screens. Nothing in this file runs code.
 * See .kiro/specs/tandem-tour-game-mode for what the mode is and why it is built this way.
 */

export type Stance = "attack" | "hold" | "gamble";
export const STANCES: Stance[] = ["attack", "hold", "gamble"];

export type UpgradeCategory = "tuning" | "crew_call" | "track_intel" | "pit_stop" | "sponsor";
export type UpgradeRarity = "common" | "rare" | "epic";
export type StatKey = "drift" | "accel" | "grip" | "steer";

/** What an upgrade does. Numbers live in `values` on the definition so an admin can change them. */
export type UpgradeEffect =
  | { kind: "stat"; stat: StatKey | "all" }
  | { kind: "score" }
  | { kind: "stance_edge" }
  | { kind: "gamble_safe" }
  | { kind: "wear_reduce" }
  | { kind: "condition"; target: "all" | "lowest" }
  | { kind: "reveal_stats" }
  | { kind: "stance_hint" }
  | { kind: "insurance" }
  | { kind: "prize_bonus" }
  | { kind: "free_reroll" };

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  effect: UpgradeEffect;
  /** Default numbers: `amount` (the size of the effect), `rounds` (how long it lasts) and `uses` (how many times). */
  values: { amount?: number; rounds?: number; uses?: number };
}

/** An upgrade the member holds in a Tour. */
export interface TourUpgrade {
  id: string;
  /** Rounds left for a timed effect (counts down after every Round). */
  roundsLeft?: number;
  /** Uses left for a limited effect. */
  usesLeft?: number;
  /** The numbers in force when it was picked (after any admin override). */
  amount?: number;
}

export interface TourLoadout {
  cars: MemberCard[];
  crew: MemberCard[];
  /** Repair kits (maintenance cards) brought on the Tour. A kit is deleted from the collection only when it is used. */
  kits: MemberCard[];
}

export interface TourCornerSide {
  carName: string;
  crewName: string;
  /** Score straight from the corner engine. */
  baseScore: number;
  /** After condition, driving skill, stance, upgrades and gamble. */
  score: number;
  /** Line accuracy driven in this corner, 0 to 1. */
  accuracy: number;
  /** The score multiplier that accuracy earned (1 = no change). */
  skillMultiplier: number;
  /** Plain-language reasons that moved the score. */
  notes: string[];
}

export interface TourCornerLog {
  sectorId: string;
  sectorName: string;
  trackName: string;
  player: TourCornerSide;
  rival: TourCornerSide;
  winner: "player" | "rival" | "tie";
}

export interface BattleLog {
  round: number;
  trackName: string;
  trackIcon: string;
  corners: TourCornerLog[];
  stance: { player: Stance; rival: Stance; triangle: "player" | "rival" | "none" };
  upgradesApplied: Array<{ side: "player" | "rival"; upgradeId: string; text: string }>;
  result: "win" | "loss";
  cornersWon: { player: number; rival: number };
  totals: { player: number; rival: number };
  player: { carId: string; carName: string; conditionBefore: number; conditionAfter: number };
  rival: { name: string; carName: string; tier: FullArtTier; rating: number; kind: "ghost" | "bot" };
  /** The closest the member came to winning or losing, to show a "so close" hint. */
  nearMiss: { by: number; hint: string } | null;
  /** Hints for the animated replay. Decided here so the screen needs no randomness. */
  motion: Array<{ cornerIdx: number; leadSide: "player" | "rival"; gap: number; angleDeg: number; smoke: number }>;
  /** Whether the Strike was cancelled by an Insurance upgrade. */
  insuranceUsed: boolean;
  /** How the driving shaped the Round. */
  skill: { swing: number; pivot: number; walls: number; bursts?: number; extraWear?: number };
}

/** A Round worked out as far as the drive: everything except what the driving adds. Server only. */
export interface PreparedRound {
  round: number;
  trackName: string;
  trackIcon: string;
  sectors: Array<{ id: string; name: string }>;
  corners: Array<{
    player: { carName: string; crewName: string; baseScore: number; pre: number; flat: number; notes: string[] };
    rival: { carName: string; crewName: string; baseScore: number; pre: number; flat: number; notes: string[] };
  }>;
  triangle: "player" | "rival" | "none";
  upgradesApplied: Array<{ side: "player" | "rival"; upgradeId: string; text: string }>;
  carId: string;
  stance: Stance;
  playerCondition: number;
  /** Used for the coin toss if everything else is level. */
  coin: number;
}

/** What the browser needs to run the drive. Contains no hidden scores except the cards-only pace. */
export interface TourDriveSpec {
  round: number;
  sectorIds: string[];
  sectorNames: string[];
  trackName: string;
  trackIcon: string;
  /** Points each side's cards earn per corner before driving skill (shown as the pace). */
  paceBase: { player: number[]; rival: number[] };
  /** The opponent's driving level in each corner, 0 to 1. */
  rivalAccuracy: number[];
  swing: number;
  pivot: number;
  rivalName: string;
  rivalKind: "ghost" | "bot";
  carName: string;
  /** The chosen car's rarity and picture, so the drive can show it in its colours. Missing on drives started before the chase view. */
  carTier?: FullArtTier;
  carImageUrl?: string;
  /** How much angle the car's tyres can take (0.42 to 0.85), from its condition and grip. The server works it out again itself. */
  angleLimit?: number;
  /** The tyre condition the limit was worked out from, 0 to 100, to show on screen. */
  tyres?: number;
  /** Seconds the server expects the drive to take, at least. */
  seconds: number;
}

export interface TourDriveState {
  carId: string;
  stance: Stance;
  startedAt: number;
  prepared: PreparedRound;
  spec: TourDriveSpec;
}

/** What the member is told about the next opponent before choosing. */
export interface TourOpponentPreview {
  kind: "ghost" | "bot";
  name: string;
  rating: number;
  carName: string;
  carTier: FullArtTier;
  carImageUrl: string;
  /** Only with a "Walk the Track" upgrade. */
  carStats: { drift: number; accel: number; grip: number; steer: number } | null;
  /** Only with a "Stance Hint" upgrade: a stance they are NOT going to use. */
  notStance: Stance | null;
}

/** Everything the server needs to play an opponent. Never sent to the browser in full. */
export interface TourOpponent {
  kind: "ghost" | "bot";
  ghostId: string | null;
  ownerId: string | null;
  name: string;
  rating: number;
  car: MemberCard;
  crew: MemberCard[];
  upgrades: TourUpgrade[];
  condition: number;
  stance: Stance;
  /** How well they drive in each of the three corners, 0 to 1 (a ghost's is what its owner really drove). */
  accuracy: number[];
  /** Bots only: a hidden flat bonus (or penalty) on every corner that keeps fights even. Shown as "form" on the result. */
  edge?: number;
}

export interface TourGhost {
  id: string;
  ownerId: string;
  ownerName: string;
  round: number;
  rating: number;
  car: MemberCard;
  crew: MemberCard[];
  upgrades: TourUpgrade[];
  condition: number;
  stance: Stance;
  /** Line accuracy the owner drove in each corner of this Round. */
  accuracy: number[];
  createdAt: number;
}

export interface TourRoundRecord {
  round: number;
  result: "win" | "loss";
  opponent: string;
  opponentKind: "ghost" | "bot";
  opponentRating: number;
  stance: Stance;
  carName: string;
  totals: { player: number; rival: number };
}

export type TourStep = "pit" | "setup" | "drive" | "result" | "ended";

export interface TourSummary {
  wins: number;
  rounds: number;
  prize: { pCredits: number; packCredits: number };
  streakBonus: { pCredits: number; packCredits: number };
  ratingBefore: number;
  ratingAfter: number;
  streak: number;
  bestRound: number | null;
  upgradesUsed: string[];
  endedBy: "strikes" | "finished" | "idle" | "admin";
  /** How many more wins until the next prize that pays more. */
  nextPrize: { wins: number; pCredits: number; packCredits: number } | null;
}

export interface TourRunState {
  id: string;
  userId: string;
  userName: string;
  /** Secret. Never leaves the server. */
  seed: string;
  status: "active" | "ended";
  step: TourStep;
  round: number;
  maxRounds: number;
  strikes: number;
  maxStrikes: number;
  wins: number;
  /** The member's rating when the Tour started. */
  rating: number;
  /** Rating points gained or lost so far this Tour (applied when the Tour ends). */
  ratingDelta: number;
  loadout: TourLoadout;
  condition: Record<string, number>;
  usedKitIds: string[];
  upgrades: TourUpgrade[];
  /** Every upgrade id picked this Tour, in order (including one-off ones that are not held). */
  picked: string[];
  offers: string[] | null;
  rerollsUsed: number;
  freeRerolls: number;
  facedGhostIds: string[];
  /** The opponent for the Round in `setup`. Secret parts (stance, upgrades) stay on the server. */
  opponent: TourOpponent | null;
  /** What the member is allowed to know about that opponent (decided when the Round was set up). */
  preview: TourOpponentPreview | null;
  /** The drive in progress (step "drive"). Server only apart from its `spec`. */
  drive: TourDriveState | null;
  /** Drives restarted after an interruption this Tour (one is allowed). */
  restartsUsed: number;
  stanceHistory: Stance[];
  rounds: TourRoundRecord[];
  lastLog: BattleLog | null;
  paid: { free: boolean; pCredits: number };
  summary: TourSummary | null;
  startedAt: number;
  updatedAt: number;
}

/** What the browser gets. No seed, no opponent secrets. */
export interface TourRunView {
  id: string;
  status: "active" | "ended";
  step: TourStep;
  round: number;
  maxRounds: number;
  strikes: number;
  maxStrikes: number;
  wins: number;
  loadout: TourLoadout;
  condition: Record<string, number>;
  usedKitIds: string[];
  upgrades: Array<TourUpgrade & { def: UpgradeDef | null }>;
  offers: Array<{ def: UpgradeDef; amount?: number }> | null;
  rerollsUsed: number;
  /** What the next reroll costs (0 when free). */
  rerollPrice: number;
  /** The track and corners of the coming Round, shown in the Pit Phase. */
  nextRoundInfo: { round: number } | null;
  opponent: TourOpponentPreview | null;
  /** The drive to play when the step is "drive". */
  drive: TourDriveSpec | null;
  stanceHistory: Stance[];
  rounds: TourRoundRecord[];
  lastLog: BattleLog | null;
  summary: TourSummary | null;
  decisionTimerSeconds: number;
}

export interface PrizeRow {
  wins: number;
  pCredits: number;
  packCredits: number;
}

export interface TourConfig {
  enabled: boolean;
  /** When true, only admins and members on the early access list can play. */
  earlyAccessOnly: boolean;
  adminsRunFree: boolean;
  maxRounds: number;
  maxStrikes: number;
  freeRunsPerDay: number;
  entryPricePCredits: number;
  maxPaidRunsPerDay: number;
  rerollPricePCredits: number;
  /** 0 = no timer. */
  decisionTimerSeconds: number;
  prizes: PrizeRow[];
  streakRewards: Array<{ days: number; pCredits: number; packCredits: number }>;
  multipliers: { streak: number; earlyAccess: number };
  tuning: {
    startRating: number;
    stanceBonus: number;
    gambleMin: number;
    gambleMax: number;
    wearBase: number;
    wearAttack: number;
    /** Extra condition lost for each burst tyre during the drive. */
    burstWear: number;
    /** Extra condition lost for each wall hit during the drive. */
    wallWear: number;
    conditionFloorMultiplier: number;
    repairByRarity: Record<"bronze" | "silver" | "gold" | "legend" | "mythic", number>;
    ratingK: number;
    ghostsPerRound: number;
    ratingBand: number;
    /** Bots: flat points per corner by the strength of the member's cars (tunes how hard the fallback bots are). */
    botEdge: Record<"bronze" | "silver" | "gold" | "legend" | "mythic", number>;
    /** Bots: extra points per corner for every Round after the first. */
    botEdgePerRound: number;
    /** How much driving can change a corner score: accuracy 0 gives -swing, accuracy 1 gives +swing (0.25 = 25%). */
    skillSwing: number;
    /** The accuracy that changes nothing. Raise it if members drive better than expected, lower it if worse. */
    skillPivot: number;
    /** Bots drive at this accuracy in Round 1 and a little better in each later Round. */
    botAccuracyStart: number;
    botAccuracyPerRound: number;
  };
  upgradeWeights: Record<UpgradeRarity, number>;
  upgradeOverrides: Record<string, { enabled?: boolean; amount?: number; rounds?: number; uses?: number }>;
  updatedAt: number;
}

/** The member's lobby view. */
export interface TourLobbyView {
  enabled: boolean;
  canPlay: boolean;
  reason: string | null;
  rating: number;
  streak: number;
  freezes: number;
  bestWins: number;
  tours: number;
  freeRunsLeft: number;
  paidRunsLeft: number;
  entryPrice: number;
  rerollPrice: number;
  maxRounds: number;
  maxStrikes: number;
  /** Driving record. */
  bestAccuracy: number;
  averageAccuracy: number;
  drives: number;
  prizes: PrizeRow[];
  streakRewards: TourConfig["streakRewards"];
  notes: string[];
  hasActiveRun: boolean;
  pCredits: number;
  packCredits: number;
  optOut: boolean;
  dailyLimit: number;
  spentToday: number;
  decisionTimerSeconds: number;
  tutorialSeen: boolean;
}

export interface TourEligibleCards {
  cars: MemberCard[];
  crew: MemberCard[];
  kits: MemberCard[];
  /** Cars that cannot be used, with the reason (for example "Broken: needs a repair"). */
  blocked: Array<{ card: MemberCard; reason: string }>;
  maxCars: number;
  maxCrew: number;
  maxKits: number;
}

export const TOUR_MAX_CARS = 4;
export const TOUR_MAX_CREW = 4;
export const TOUR_MAX_KITS = 3;
