import type { MemberCard } from "@/lib/card-roll";
import type { ClashOpponent } from "@/tcg/types";

/** A card face (picture and name) taken from the art pool. Stats are generated separately. */
export interface ArtEntry {
  key: string;
  name: string;
  driver: string;
  team: string;
  imageUrl: string;
  imageZoom: number;
  imageX: number;
  imageY: number;
}

export type CampaignStatus = "active" | "champion" | "eliminated";

/** One round of the cup, as the server stores it. */
export interface CampaignRoundPlan {
  round: number;
  driverName: string;
  teamName: string;
  /** A picture of the rival's lead car, for the bracket. */
  portraitUrl: string;
  targetWinPct: number;
  /** What the simulation measured for the finished opponent (percent). */
  estimatedWinPct: number;
  strength: number;
  /** The rarity the rival leads with. Missing on cups saved before this was recorded. */
  rosterTier?: string;
  opponent: ClashOpponent;
}

/** Something that happened to a car in the pit after a battle: it broke down, or finished its repair. */
export interface PitEvent {
  type: "fault" | "repaired";
  cardId: string;
  cardName: string;
  faultName?: string;
  faultIcon?: string;
  battlesNeeded?: number;
  freshBattles?: number;
}

/** The maintenance cost of one battle: how much durability each car has left, and any breakdowns or repairs. */
export interface CampaignMaintenance {
  cars: Array<{ id: string; name: string; remaining: number | null; max: number | null; broken: boolean }>;
  events: PitEvent[];
}

export interface CampaignRoundResult {
  round: number;
  won: boolean;
  playerCorners: number;
  opponentCorners: number;
  /** The player left the track mid-battle, which counts as a loss. */
  forfeited?: boolean;
  /** What the battle cost the cars (a forfeit costs nothing, as in the normal game). */
  maintenance?: CampaignMaintenance;
}

/** How a cup was entered. A "test" entry is free and pays no prize. */
export interface CampaignEntry {
  kind: "test" | "paid";
  /** P-Credits paid to enter (0 for a test entry). */
  fee: number;
}

/** What the member picks when they start: "test" or one of the entry fees. */
export type EntryChoice = "test" | number;

/** The whole run. Lives only on the server; the browser gets a `CampaignView`. */
export interface CampaignRun {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  status: CampaignStatus;
  seed: number;
  /** The three cars the player picked from their own deck, as they were when the cup started. */
  cars: MemberCard[];
  /** The three Crew cards used: the player's best, topped up with the starter loaners if they own fewer than three. */
  crew: MemberCard[];
  rounds: CampaignRoundPlan[];
  /** Index (0 to 5) of the round to play next. */
  currentRound: number;
  /** A battle has been started and no result has come back. */
  battleStarted: boolean;
  results: CampaignRoundResult[];
  /** Missing on cups saved before entry fees existed, which count as free test cups. */
  entry?: CampaignEntry;
  /** The prize has been worked out and paid (or there was none). */
  settled?: boolean;
  payout?: number | null;
  /** How a cup that did not end in a battle result ended. */
  endedBy?: "withdrew" | "left-track";
}

export type RoundState = "won" | "lost" | "current" | "upcoming";

/** What the bracket shows for a round. Opponent cards for rounds not yet reached stay on the server. */
export interface CampaignRoundView {
  round: number;
  name: string;
  short: string;
  icon: string;
  driverName: string;
  teamName: string;
  portraitUrl: string;
  /** The rarity the rival leads with. */
  rosterTier?: string;
  state: RoundState;
  result?: CampaignRoundResult;
}

export interface CampaignView {
  id: string;
  status: CampaignStatus;
  cars: MemberCard[];
  crew: MemberCard[];
  rounds: CampaignRoundView[];
  currentRound: number;
  battleStarted: boolean;
  /** Set after a result that ended the run by a forfeit, so the screen can say why. */
  note?: string;
  entry: CampaignEntry;
  /** Rounds won so far. */
  wins: number;
  /** The prize for the rounds won so far (what the cup pays if it ended now). 0 for a test cup. */
  prize: number;
  /** The prize actually paid, once the cup has ended. */
  payout: number | null;
  endedBy?: "withdrew" | "left-track";
  /** The member's P-Credit balance, sent when this action changed it. */
  balance?: number;
}

/**
 * How the Drift Campaign drives the Clash arena. When the arena is given this it plays one battle against `opponent`
 * with the cars and Crew it was handed, reports the result through `onResult` instead of the normal P-Credit, streak and
 * durability actions, and shows `continueLabel` at the end instead of the normal play-again buttons.
 */
export interface ArenaCampaignHook {
  opponent: ClashOpponent;
  roundLabel: string;
  onResult: (result: { won: boolean; playerCorners: number; opponentCorners: number }) => void;
  continueLabel: string;
  continueDisabled: boolean;
  onContinue: () => void;
  onExit: () => void;
  /** Shown on the verdict once the result is saved: what this battle cost the cars. */
  maintenance?: CampaignMaintenance | null;
}

/** What the browser needs to play one round in the arena. */
export interface CampaignBattle {
  view: CampaignView;
  round: CampaignRoundView;
  opponent: ClashOpponent;
  cars: MemberCard[];
  crew: MemberCard[];
}

/** The six cars dealt to choose three from. */
export interface CampaignOffer {
  cars: MemberCard[];
  /** Extra deals left. Stored on the member's profile. */
  rerollsLeft: number;
}

/** A paid entry waiting for its cars to be picked: what was paid, and the six dealt. */
export interface CampaignDraft {
  entry: CampaignEntry;
  offer: CampaignOffer;
}

/** What the tab needs when it opens: the current cup (if any) and a paid entry that has not started (if any). */
export interface CampaignState {
  view: CampaignView | null;
  draft: CampaignDraft | null;
  balance?: number;
}
