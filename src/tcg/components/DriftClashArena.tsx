"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { triggerDriftWheelIntro } from "@/components/ui/DriftWheelIntro";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import {
  CLASH_RARITY_ODDS,
  CLASH_RARITY_TIERS,
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  debuffDefinitionToCardData,
  isCrewCard,
  scaleCrewCardDefinition,
  scaleDebuffCardDefinition,
  trackDefinitionToCardData,
  type CrewCardDefinition,
  type CrewCardModifiers,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";
import {
  isCarBroken,
  canRepairCarWithMaintenanceCard,
  MECHANICAL_FAULTS,
} from "@/lib/mechanical-faults";
import {
  getClashGameCardsConfigAction,
  listClashEarlyAccessRosterAction,
  grantClashEarlyAccessAction,
  revokeClashEarlyAccessAction,
  applyMaintenanceRepairAction,
  type EarlyAccessMemberItem,
} from "@/tcg/actions";
import {
  completeClashBattleAction,
  findNewClashOpponentAction,
} from "@/tcg/clash";
import {
  CLASH_SECTORS,
  DAILY_CLASH_WIN_REWARD_PCREDITS,
  STARTER_LOANER_CREW_CARDS,
  STREAK_MILESTONE_REWARD_PCREDITS,
  computeDebuffBreakdown,
  computeTrackBreakdown,
  evaluateCornerMatchup,
  getCardPower,
  getNormalizedCardStats,
  normalizeStatValue,
  rollThreeClashSectors,
  rollThreeDebuffCards,
  rollUkTrackCard,
  scoreCardForSector,
  type ClashSectorSpec,
  type DebuffBreakdown,
  type EvaluatedCornerResult,
  type TrackBreakdown,
} from "@/tcg/progression";
import type { ClashGameCardsConfig } from "@/tcg/storage";
import type { ClashOpponent, ClashPlayerStats } from "@/tcg/types";
import { ClashHowToPlayModal, type HowToPlayTab } from "./ClashHowToPlayModal";
import { ClashChallengesView } from "./ClashChallengesView";
import { useUtcMidnightCountdown } from "../hooks/useUtcCountdown";
import {
  CHALLENGE_THEME_CONFIGS,
  isCarEligibleForChallenge,
  getCarNormalizedTotalScore,
  type TandemClashChallenge,
} from "../challenges-types";
import {
  startChallengeBattleAction,
  completeChallengeBattleAction,
} from "../challenges-actions";

export interface DebuffScenario {
  id: number;
  icon: string;
  title: string;
  description: string;
}

export const DEBUFF_SCENARIOS: DebuffScenario[] = [
  {
    id: 1,
    icon: "🐈",
    title: "Cat On The Track!",
    description: "A giant stray tabby strolled straight across the apex clipping zone! Both drivers counter-steer wildly around giant furry paws.",
  },
  {
    id: 2,
    icon: "☕",
    title: "Iced Latte Spill!",
    description: "The pit mechanic knocked an iced latte right into the transmitter rack. Radio gyro sensitivity went completely berserk!",
  },
  {
    id: 3,
    icon: "⚙️",
    title: "Stripped Pinion Teeth!",
    description: "A violent high-RPM transition chewed two teeth clean off the pinion gear. The motor sounds like an angry blender!",
  },
  {
    id: 4,
    icon: "🧲",
    title: "Rogue Body Clip!",
    description: "A loose metal body clip dropped onto the track and magnetized to the chassis underpan, messing up corner weight balance.",
  },
  {
    id: 5,
    icon: "🍌",
    title: "Over-Polished Linoleum!",
    description: "Track marshals buffed the surface with high-gloss floor wax right before the heat. Zero rear lateral bite!",
  },
  {
    id: 6,
    icon: "📡",
    title: "2.4GHz Microwave Glitch!",
    description: "Someone in the lounge heated up a burrito, causing momentary radio frequency packet loss at the worst possible second.",
  },
  {
    id: 7,
    icon: "🪛",
    title: "Loose Wheel Nut Wobble!",
    description: "The rear left wheel nut is hanging on by two threads. The tyre is dancing the cha-cha at 40 degrees slip angle!",
  },
  {
    id: 8,
    icon: "⚡",
    title: "Overcooked Speed Control!",
    description: "Too many full-lock clutch-kicks triggered thermal safety limits on the ESC. Throttle power is begging for mercy!",
  },
  {
    id: 9,
    icon: "💨",
    title: "Industrial Fan Gust!",
    description: "The venue cooling fan pivoted and blast a sudden 30mph headwind directly into the initiation zone.",
  },
  {
    id: 10,
    icon: "🛞",
    title: "Glazed Hard Compounds!",
    description: "The plastic drift tyres overheated and turned into slick hockey pucks. Plenty of screech, zero forward drive.",
  },
  {
    id: 11,
    icon: "🕶️",
    title: "Fogged-Up Lenses!",
    description: "Intense tandem concentration caused the driver's glasses to mist over right as the cars reached the clipping cone.",
  },
  {
    id: 12,
    icon: "📻",
    title: "Reverse Gyro Twitch!",
    description: "A harsh kerb strike inverted the steering gyro logic for half a second. Instant tank-slapper down the straight!",
  },
  {
    id: 13,
    icon: "🧼",
    title: "Lifting Carpet Seam!",
    description: "The outer sweeper carpet seam lifted up and snagged the carbon front splitter.",
  },
  {
    id: 14,
    icon: "🔋",
    title: "LiPo Voltage Sag!",
    description: "Low-voltage buzzer is shrieking like a fire alarm as the cell drops under maximum full-throttle boost.",
  },
  {
    id: 15,
    icon: "🧯",
    title: "Ridiculous Camber Angle!",
    description: "Mechanic dialed in -12 degrees front camber. The car is literally sliding on the rim bevel!",
  },
  {
    id: 16,
    icon: "🐝",
    title: "Rogue Bumblebee Dive!",
    description: "An aggressive bumblebee landed directly on the transmitter steering wheel mid-tandem.",
  },
  {
    id: 17,
    icon: "🔌",
    title: "Pinched Servo Lead!",
    description: "The steering bellcrank pinched the servo wire at full lock, causing a violent front rack twitch.",
  },
  {
    id: 18,
    icon: "🍕",
    title: "Pepperoni Grease Slip!",
    description: "Pit chief handed over the transmitter after finishing a slice. The steering wheel slipped right through thumb grip!",
  },
  {
    id: 19,
    icon: "👟",
    title: "Spectator Sneaker Intrusion!",
    description: "An over-excited spectator stepped two inches across the white line into the outer clipping zone.",
  },
  {
    id: 20,
    icon: "💥",
    title: "Extreme Backward Entry!",
    description: "Driver attempted an absurd 85-degree backward entry and gave the outer tyre wall a solid high-five.",
  },
];

const LOANER_CARDS: MemberCard[] = [
  {
    id: "loaner-1",
    userId: "loaner",
    name: "PHD Rental RDX #01",
    ability: "Reve D RDX",
    effect: "Hobbywing 10BL120 · Yokomo V4 Gyro",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "15", accel: "13", grip: "15", steer: "15" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-2",
    userId: "loaner",
    name: "PHD Rental YD-2S #02",
    ability: "Yokomo YD-2S",
    effect: "Surpass Rocket 10.5T · Futaba S-C400",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "14", accel: "15", grip: "15", steer: "14" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-3",
    userId: "loaner",
    name: "PHD Rental Galm #03",
    ability: "Overdose GALM",
    effect: "Acuvance Agile · Sanwa PGS-CL II",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "15", accel: "15", grip: "13", steer: "15" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
];

type GamePhase =
  | "lobby"
  | "lineup"
  | "track_roulette"
  | "car_select"
  | "corner_battle"
  | "verdict";

type LoadoutSection = "cars" | "crew";

type CornerSubStage = "car_draw" | "choose_crew" | "debuff_and_score";

type BattleAnimStep =
  | "cards_entrance"
  | "head_to_head"
  | "prompt_crew"
  | "crew_overlay"
  | "battle_shake_1"
  | "prompt_debuff"
  | "debuff_overlay"
  | "battle_shake_2"
  | "knockout_and_winner"
  | "corner_finished";

function getStatDiffInfo(newVal: number, oldVal: number) {
  const diff = newVal - oldVal;
  if (diff > 0) {
    return {
      diff,
      text: `+${diff}`,
      colorClass: "text-emerald-300 bg-emerald-500/20 border-emerald-500/60",
      tagColor: "bg-emerald-500 text-black",
      status: "positive" as const,
    };
  }
  if (diff < 0) {
    return {
      diff,
      text: `${diff}`,
      colorClass: "text-rose-300 bg-rose-500/20 border-rose-500/60",
      tagColor: "bg-rose-500 text-white",
      status: "negative" as const,
    };
  }
  return {
    diff: 0,
    text: "±0",
    colorClass: "text-amber-300 bg-amber-500/20 border-amber-500/60",
    tagColor: "bg-amber-500 text-black",
    status: "same" as const,
  };
}

function applyCrewModsToStats(
  base: { drift: number; accel: number; grip: number; steer: number },
  mods?: CrewCardModifiers | null
) {
  if (!mods) return { ...base };
  let { drift, accel, grip, steer } = base;

  // 1. Min Stat Floor (only lifts stats up, never lowers them)
  if (mods.minStatFloor && mods.minStatFloor > 0) {
    drift = Math.max(drift, mods.minStatFloor);
    accel = Math.max(accel, mods.minStatFloor);
    grip = Math.max(grip, mods.minStatFloor);
    steer = Math.max(steer, mods.minStatFloor);
  }

  // 2. Boost Lowest / Weakest Stat (e.g. Zip-Tie Pit Engineering, max 25)
  if (mods.boostWeakestStat && mods.boostWeakestStat > 0) {
    const minVal = Math.min(drift, accel, grip, steer);
    if (drift === minVal) drift = Math.max(drift, Math.min(25, drift + mods.boostWeakestStat));
    else if (accel === minVal) accel = Math.max(accel, Math.min(25, accel + mods.boostWeakestStat));
    else if (grip === minVal) grip = Math.max(grip, Math.min(25, grip + mods.boostWeakestStat));
    else steer = Math.max(steer, Math.min(25, steer + mods.boostWeakestStat));
  }

  // 3. Stat Bonuses (strictly positive advantages, capped at max 25)
  if (mods.driftBonus && mods.driftBonus > 0) {
    drift = Math.max(drift, Math.min(25, drift + mods.driftBonus));
  }
  if (mods.accelBonus && mods.accelBonus > 0) {
    accel = Math.max(accel, Math.min(25, accel + mods.accelBonus));
  }
  if (mods.gripBonus && mods.gripBonus > 0) {
    grip = Math.max(grip, Math.min(25, grip + mods.gripBonus));
  }
  if (mods.steerBonus && mods.steerBonus > 0) {
    steer = Math.max(steer, Math.min(25, steer + mods.steerBonus));
  }

  return { drift, accel, grip, steer };
}

function shuffleThreeIndices(): [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2] {
  const arr: Array<0 | 1 | 2> = [0, 1, 2];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return [arr[0], arr[1], arr[2]];
}

function pickTopThreeIds(cards: MemberCard[]): [string, string, string] {
  const sorted = [...cards].sort((a, b) => getCardPower(b) - getCardPower(a));
  const c0 = sorted[0] ?? cards[0];
  const c1 = sorted[1] ?? sorted[0] ?? cards[0];
  const c2 = sorted[2] ?? sorted[1] ?? sorted[0] ?? cards[0];
  return [c0.id, c1.id, c2.id];
}

function MysteryCardBack({
  label = "MYSTERY CARD",
  accent = "amber",
}: {
  label?: string;
  accent?: "amber" | "cyan" | "rose";
}) {
  const borderClass =
    accent === "cyan"
      ? "border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.2)]"
      : accent === "rose"
        ? "border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.2)]"
        : "border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)]";
  return (
    <div
      className={`relative flex aspect-[63/88] w-full flex-col items-center justify-between overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-3 text-center select-none ${borderClass}`}
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 35%, rgba(245,158,11,0.45), transparent 65%)",
        }}
      />
      <div className="relative z-10 flex w-full items-center justify-between text-[9px] font-black uppercase tracking-widest text-amber-400/80">
        <span>PHD CLASH</span>
        <span>LOCKED</span>
      </div>

      <div className="relative z-10 my-auto flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-8 opacity-90" />
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-amber-300">
          ???
        </span>
      </div>

      <p className="relative z-10 text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
    </div>
  );
}

export function DriftClashArena({
  cards,
  initialOpponent,
  initialStats,
  initialClashStats,
  hasEarlyAccess = true,
  isAdmin = false,
  userId,
  pCredits,
  onPCreditsChange,
  onStatsChange,
  onRewardEarned,
  onCardsChange,
  onOpenStoreTab,
}: {
  cards: MemberCard[];
  initialOpponent: ClashOpponent;
  initialStats?: ClashPlayerStats;
  initialClashStats?: ClashPlayerStats;
  hasEarlyAccess?: boolean;
  isAdmin?: boolean;
  userId?: string;
  pCredits?: number;
  onPCreditsChange?: (newPCredits: number) => void;
  onStatsChange?: (nextClashStats: ClashPlayerStats) => void;
  onRewardEarned?: (newPCredits: number, nextClashStats: ClashPlayerStats) => void;
  onCardsChange?: (updatedCards: MemberCard[]) => void;
  onOpenStoreTab: () => void;
}) {
  const startingStats = initialStats ?? initialClashStats ?? {
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    dailyWinClaimed: false,
  };

  // Mode switcher: "quick" for standard match, "challenges" for cups & tournaments
  const [arenaLobbyTab, setArenaLobbyTab] = useState<"quick" | "challenges">("quick");
  const [activeChallenge, setActiveChallenge] = useState<TandemClashChallenge | null>(null);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<string[]>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeWonCelebration, setChallengeWonCelebration] = useState<{
    challengeTitle: string;
    rewardGranted: number;
    challengeCompleted: boolean;
  } | null>(null);
  const [internalPCredits, setInternalPCredits] = useState(pCredits ?? 0);
  useEffect(() => {
    if (typeof pCredits === "number") setInternalPCredits(pCredits);
  }, [pCredits]);

  // Early Access Beta Admin modal state
  const [showEarlyAccessModal, setShowEarlyAccessModal] = useState(false);
  const [earlyAccessRoster, setEarlyAccessRoster] = useState<EarlyAccessMemberItem[]>([]);
  const [loadingEarlyAccessRoster, setLoadingEarlyAccessRoster] = useState(false);
  const [earlyAccessSearch, setEarlyAccessSearch] = useState("");
  const [togglingEarlyAccessUserId, setTogglingEarlyAccessUserId] = useState<string | null>(null);

  async function loadEarlyAccessRoster() {
    setLoadingEarlyAccessRoster(true);
    try {
      const res = await listClashEarlyAccessRosterAction();
      if (res.success) {
        setEarlyAccessRoster(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingEarlyAccessRoster(false);
    }
  }

  async function handleToggleEarlyAccessInArena(member: EarlyAccessMemberItem) {
    if (member.role === "admin") return;
    setTogglingEarlyAccessUserId(member.id);
    const newStatus = !member.hasEarlyAccess;
    setEarlyAccessRoster((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: newStatus } : m))
    );
    try {
      const res = newStatus
        ? await grantClashEarlyAccessAction(member.id)
        : await revokeClashEarlyAccessAction(member.id);
      if (!res.success) {
        setEarlyAccessRoster((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
        );
      }
    } catch {
      setEarlyAccessRoster((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
      );
    } finally {
      setTogglingEarlyAccessUserId(null);
    }
  }

  // Live Clash Game Cards config (Crew Advantages, Debuff Cards, UK Track Cards)
  const [gameCardsConfig, setGameCardsConfig] = useState<ClashGameCardsConfig>({
    crewCards: CREW_CARD_SET,
    debuffCards: DEBUFF_CARD_SET,
    trackCards: UK_TRACK_CARD_SET,
  });

  useEffect(() => {
    let mounted = true;
    getClashGameCardsConfigAction()
      .then((cfg) => {
        if (mounted && cfg) {
          setGameCardsConfig(cfg);
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, []);

  const [localCards, setLocalCards] = useState<MemberCard[]>(cards);
  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  const [pitReport, setPitReport] = useState<
    Array<{
      type: "fault" | "repaired";
      cardId: string;
      cardName: string;
      faultName?: string;
      faultIcon?: string;
      battlesNeeded?: number;
      freshBattles?: number;
    }>
  >([]);
  const [repairingCarId, setRepairingCarId] = useState<string | null>(null);

  async function handleQuickRepair(car: MemberCard, consumable: MemberCard) {
    setRepairingCarId(car.id);
    try {
      const res = await applyMaintenanceRepairAction({
        carCardId: car.id,
        maintenanceCardId: consumable.id,
      });
      if (res.success) {
        setLocalCards((prev) =>
          prev
            .filter((c) => c.id !== consumable.id)
            .map((c) => (c.id === car.id ? res.data.car : c))
        );
      }
    } catch (err) {
      console.error("Failed to apply quick repair:", err);
    } finally {
      setRepairingCarId(null);
    }
  }

  const crewCatalogDefs: CrewCardDefinition[] = gameCardsConfig.crewCards;
  const debuffCatalogDefs: DebuffCardDefinition[] = gameCardsConfig.debuffCards;
  const trackCatalogDefs: TrackCardDefinition[] = gameCardsConfig.trackCards;

  // Split player's collection into Car Cards, Maintenance Consumables, and Crew Advantage Cards
  const carCards = useMemo(
    () => localCards.filter((c) => !isCrewCard(c) && c.cardType !== "maintenance"),
    [localCards]
  );

  const maintenanceCards = useMemo(
    () => localCards.filter((c) => c.cardType === "maintenance"),
    [localCards]
  );

  // Refresh owned Crew Cards with latest Advantage definitions from gameCardsConfig, scaled to the card's pulled tier
  const ownedCrewCards = useMemo(() => {
    return localCards
      .filter((c) => isCrewCard(c))
      .map((c) => {
        const def =
          crewCatalogDefs.find(
            (d) => d.id === c.crewCardId || d.id === c.id || d.name === c.name
          ) ??
          CREW_CARD_SET.find(
            (d) => d.id === c.crewCardId || d.id === c.id || d.name === c.name
          );
        if (!def) return c;
        const targetTier = c.tier ?? def.tier ?? "bronze";
        const scaledDef = scaleCrewCardDefinition(def, targetTier);
        const freshData = crewDefinitionToCardData(scaledDef);
        return {
          ...c,
          crewCardId: def.id,
          name: freshData.name,
          tier: freshData.tier,
          ability: freshData.ability,
          effect: freshData.effect,
          driver: freshData.driver,
          team: freshData.team,
          imageUrl: freshData.imageUrl,
          crewIcon: freshData.crewIcon,
        };
      });
  }, [localCards, crewCatalogDefs]);

  // Robust resolver for Crew Card definitions, preserving and scaling to the card's pulled rarity tier
  function resolveCrewDef(card?: MemberCard | null): CrewCardDefinition {
    if (!card) return scaleCrewCardDefinition(crewCatalogDefs[0] ?? CREW_CARD_SET[0], "bronze");
    const found =
      crewCatalogDefs.find(
        (d) => d.id === card.crewCardId || d.id === card.id || d.name === card.name
      ) ??
      CREW_CARD_SET.find(
        (d) => d.id === card.crewCardId || d.id === card.id || d.name === card.name
      );
    const baseDef = found ?? crewCatalogDefs[0] ?? CREW_CARD_SET[0];
    const targetTier = card.tier ?? baseDef.tier ?? "bronze";
    return scaleCrewCardDefinition(baseDef, targetTier);
  }

  // Filter for healthy car cards without active mechanical faults
  const healthyCarCards = useMemo(
    () => carCards.filter((c) => !isCarBroken(c)),
    [carCards]
  );

  // Ensure at least 3 Car Cards (pad with Academy Loaner Cars if healthy cars < 3)
  const usableCarCards = useMemo(
    () =>
      healthyCarCards.length >= 3
        ? healthyCarCards
        : [
            ...healthyCarCards,
            ...LOANER_CARDS.slice(0, Math.max(0, 3 - healthyCarCards.length)),
          ],
    [healthyCarCards]
  );
  const usingLoanerCars = healthyCarCards.length < 3;

  // Ensure at least 3 Crew Advantage Cards (pad with Starter Loaner Crew Cards if player owns < 3)
  const usableCrewCards = useMemo(() => {
    if (ownedCrewCards.length >= 3) return ownedCrewCards;
    const needed = 3 - ownedCrewCards.length;
    return [...ownedCrewCards, ...STARTER_LOANER_CREW_CARDS.slice(0, needed)];
  }, [ownedCrewCards]);
  const usingLoanerCrew = ownedCrewCards.length < 3;

  const [clashStats, setClashStats] = useState<ClashPlayerStats>(startingStats);
  const [opponent, setOpponent] = useState<ClashOpponent>(initialOpponent);
  const utcCountdown = useUtcMidnightCountdown();

  // Guard against playing against oneself in casual lobby (never override challenge cups)
  useEffect(() => {
    if (activeChallenge) return;
    if (!cards || cards.length === 0) return;
    const playerCardIdSet = new Set(cards.map((c) => c.id));
    const playerUserId = cards.find((c) => Boolean(c.userId))?.userId;
    const hasOwnCardInRival = opponent.cards.some(
      (c) => playerCardIdSet.has(c.id) || (Boolean(playerUserId) && c.userId === playerUserId)
    );
    if (hasOwnCardInRival) {
      findNewClashOpponentAction()
        .then((res) => {
          if (res && res.success && res.data) {
            setOpponent(res.data);
          }
        })
        .catch(() => null);
    }
  }, [cards, opponent.cards, activeChallenge]);

  // Step 1 Loadout state: 3 Car IDs + 3 Crew IDs
  const [selectedCarIds, setSelectedCarIds] = useState<[string, string, string]>(() =>
    pickTopThreeIds(usableCarCards)
  );
  const [selectedCrewIds, setSelectedCrewIds] = useState<[string, string, string]>(() =>
    pickTopThreeIds(usableCrewCards)
  );

  // Step 2: Randomised UK Track Card state
  const [activeTrackDef, setActiveTrackDef] = useState<TrackCardDefinition>(
    () => UK_TRACK_CARD_SET[0]
  );
  const [rouletteTrackIdx, setRouletteTrackIdx] = useState(0);
  const [trackLockedIn, setTrackLockedIn] = useState(false);

  // Step 3: 3-Corner Battle state
  const [activeSectors, setActiveSectors] = useState<
    [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec]
  >(() => rollThreeClashSectors());
  const [playerCarOrder, setPlayerCarOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  const [rivalCarOrder, setRivalCarOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  const [playerCarAssignments, setPlayerCarAssignments] = useState<Array<0 | 1 | 2 | null>>([null, null, null]);
  const [rivalCarAssignments, setRivalCarAssignments] = useState<Array<0 | 1 | 2 | null>>([null, null, null]);
  const [rivalCrewOrder, setRivalCrewOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  const [playerMatchDebuffs, setPlayerMatchDebuffs] = useState<
    [DebuffCardDefinition, DebuffCardDefinition, DebuffCardDefinition]
  >(() => rollThreeDebuffCards(DEBUFF_CARD_SET));
  const [rivalMatchDebuffs, setRivalMatchDebuffs] = useState<
    [DebuffCardDefinition, DebuffCardDefinition, DebuffCardDefinition]
  >(() => rollThreeDebuffCards(DEBUFF_CARD_SET));

  const [activeCornerIdx, setActiveCornerIdx] = useState<0 | 1 | 2>(0);
  const [battleAnimStep, setBattleAnimStep] = useState<BattleAnimStep>("cards_entrance");
  const [debuffScenario, setDebuffScenario] = useState<DebuffScenario | null>(null);
  const [cornerSubStage, setCornerSubStage] = useState<CornerSubStage>("car_draw");
  const [carDrawShuffleTick, setCarDrawShuffleTick] = useState(0);
  const [carDrawLocked, setCarDrawLocked] = useState(false);

  // Track which of the 3 selected Crew Cards (indices 0, 1, 2) the player and rival have played on each corner
  const [playerCrewAssignments, setPlayerCrewAssignments] = useState<Array<number | null>>([null, null, null]);
  const [rivalCrewAssignments, setRivalCrewAssignments] = useState<Array<number | null>>([null, null, null]);
  const [playedCrewIndices, setPlayedCrewIndices] = useState<Array<0 | 1 | 2>>([]);
  const [cornerResults, setCornerResults] = useState<EvaluatedCornerResult[]>([]);
  // Previewing crew card selection in crew_prep phase
  const [previewCrewIdx, setPreviewCrewIdx] = useState<number | null>(null);
  // Previewing car card selection in car_select phase
  const [previewCarSlot, setPreviewCarSlot] = useState<0 | 1 | 2 | null>(null);

  // Sub-stage 3 animation flags
  const [debuffRevealed, setDebuffRevealed] = useState(false);
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [cornerStamped, setCornerStamped] = useState(false);
  const [expandedCornerDetails, setExpandedCornerDetails] = useState<Record<number, boolean>>({});

  function toggleCornerDetails(idx: number) {
    setExpandedCornerDetails((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  }

  // UI Navigation & Modals
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [loadoutSection, setLoadoutSection] = useState<LoadoutSection>("cars");
  const [pickerModalTarget, setPickerModalTarget] = useState<{
    type: "car" | "crew";
    slotIdx: 0 | 1 | 2;
  } | null>(null);
  const [showCatalogModal, setShowCatalogModal] = useState<
    "crew" | "debuff" | "track" | null
  >(null);
  const [showHowToPlayModal, setShowHowToPlayModal] = useState<boolean>(false);
  const [howToPlayTab, setHowToPlayTab] = useState<HowToPlayTab>("quickstart");
  const [challengeReplayConfirm, setChallengeReplayConfirm] = useState<TandemClashChallenge | null>(null);

  function openHowToPlay(tab: HowToPlayTab = "quickstart") {
    setHowToPlayTab(tab);
    setShowHowToPlayModal(true);
  }
  const [viewerState, setViewerState] = useState<{
    list: MemberCard[];
    index: number;
  } | null>(null);

  const [battleBanner, setBattleBanner] = useState<{
    won: boolean;
    playerCorners: number;
    opponentCorners: number;
    tiedCorners: number;
    rewardGranted: number;
    streakBonusGranted: number;
  } | null>(null);

  const [, startTransition] = useTransition();
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  function clearTimers() {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }

  useEffect(() => () => clearTimers(), []);

  // Lock body scroll while full-screen game stage is open
  useEffect(() => {
    if (phase === "lobby") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Keyboard navigation for the Large Card Viewer Modal
  useEffect(() => {
    if (!viewerState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setViewerState(null);
      } else if (e.key === "ArrowLeft") {
        setViewerState((prev) =>
          prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
        );
      } else if (e.key === "ArrowRight") {
        setViewerState((prev) =>
          prev && prev.index < prev.list.length - 1
            ? { ...prev, index: prev.index + 1 }
            : prev
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerState]);

  const [catalogTierTab, setCatalogTierTab] = useState<FullArtTier>("bronze");

  // Catalog preview card lists scaled to the selected rarity tab
  const catalogCrewMemberCards = useMemo<MemberCard[]>(
    () =>
      crewCatalogDefs.map((def) => {
        const scaled = scaleCrewCardDefinition(def, catalogTierTab);
        return {
          id: `${def.id}-${catalogTierTab}`,
          userId: "catalog",
          ...crewDefinitionToCardData(scaled),
          styleIds: [],
          kept: true,
          rerolled: false,
          createdAt: 0,
        };
      }),
    [crewCatalogDefs, catalogTierTab]
  );

  const catalogDebuffMemberCards = useMemo<MemberCard[]>(
    () =>
      debuffCatalogDefs.map((def) => {
        const scaled = scaleDebuffCardDefinition(def, catalogTierTab);
        return {
          id: `${def.id}-${catalogTierTab}`,
          userId: "catalog",
          ...debuffDefinitionToCardData(scaled),
          styleIds: [],
          kept: true,
          rerolled: false,
          createdAt: 0,
        };
      }),
    [debuffCatalogDefs, catalogTierTab]
  );

  const catalogTrackMemberCards = useMemo<MemberCard[]>(
    () =>
      trackCatalogDefs.map((def) => ({
        id: def.id,
        userId: "catalog",
        ...trackDefinitionToCardData(def),
        styleIds: [],
        kept: true,
        rerolled: false,
        createdAt: 0,
      })),
    [trackCatalogDefs]
  );

  // Resolve Player's 3 Selected Car Cards
  const selectedCarCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    const resolved = selectedCarIds.map(
      (id, idx) =>
        usableCarCards.find((c) => c.id === id) ??
        usableCarCards[idx] ??
        LOANER_CARDS[idx]
    );
    return [resolved[0], resolved[1], resolved[2]];
  }, [selectedCarIds, usableCarCards]);

  // Check how many currently equipped cars violate the active challenge restrictions
  const challengeIneligibleCount = useMemo(() => {
    if (!activeChallenge) return 0;
    return selectedCarCards.filter(
      (c) => !isCarEligibleForChallenge(c, activeChallenge).eligible
    ).length;
  }, [selectedCarCards, activeChallenge]);

  const isLineupEligible = challengeIneligibleCount === 0;

  // Resolve Player's 3 Selected Crew Advantage Cards
  const selectedCrewCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    const resolved = selectedCrewIds.map(
      (id, idx) =>
        usableCrewCards.find((c) => c.id === id) ??
        usableCrewCards[idx] ??
        STARTER_LOANER_CREW_CARDS[idx]
    );
    return [resolved[0], resolved[1], resolved[2]];
  }, [selectedCrewIds, usableCrewCards]);

  // Resolve Rival's 3 Crew Advantage Cards (uses opponent.crewCards or Starter Loaner Crew Cards)
  const rivalCrewCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    if (opponent.crewCards && opponent.crewCards.length === 3) {
      return opponent.crewCards;
    }
    if (opponent.crewCard) {
      return [
        opponent.crewCard,
        STARTER_LOANER_CREW_CARDS[1],
        STARTER_LOANER_CREW_CARDS[2],
      ];
    }
    return STARTER_LOANER_CREW_CARDS;
  }, [opponent.crewCards, opponent.crewCard]);

  // Convert active UK Track definition into a FullArtCard-compatible MemberCard
  const activeTrackCard = useMemo<MemberCard>(
    () => ({
      id: activeTrackDef.id,
      userId: "track",
      ...trackDefinitionToCardData(activeTrackDef),
      styleIds: [],
      kept: true,
      rerolled: false,
      createdAt: 0,
    }),
    [activeTrackDef]
  );

  // Helper to assign a Car or Crew card into one of the 3 slots without duplicates
  function assignCardToSlot(
    type: "car" | "crew",
    slotIdx: 0 | 1 | 2,
    cardId: string
  ) {
    const setter = type === "car" ? setSelectedCarIds : setSelectedCrewIds;
    setter((prev) => {
      const next: [string, string, string] = [...prev] as [string, string, string];
      const existingIdx = next.indexOf(cardId);
      if (existingIdx !== -1 && existingIdx !== slotIdx) {
        next[existingIdx] = next[slotIdx];
      }
      next[slotIdx] = cardId;
      return next;
    });
    setPickerModalTarget(null);
  }

  // Launch Step 1: Select 3 Car Cards & 3 Crew Cards (Quick Standard Match)
  function handleLaunchGame() {
    if (!hasEarlyAccess) {
      return;
    }
    clearTimers();
    setActiveChallenge(null);
    setChallengeWonCelebration(null);
    triggerDriftWheelIntro();
    setSelectedCarIds(pickTopThreeIds(usableCarCards));
    setSelectedCrewIds(pickTopThreeIds(usableCrewCards));
    setLoadoutSection("cars");
    setPickerModalTarget(null);
    setBattleBanner(null);
    setCornerResults([]);
    setPlayedCrewIndices([]);
    setPlayerCrewAssignments([null, null, null]);
    setRivalCrewAssignments([null, null, null]);
    setPlayerCarAssignments([null, null, null]);
    setRivalCarAssignments([null, null, null]);
    setPreviewCarSlot(null);
    setPlayerCarOrder([0, 1, 2]);
    setRivalCarOrder([0, 1, 2]);
    setPhase("lineup");
  }

  // Launch Step 1 via Challenge Cup
  async function handleLaunchChallenge(challenge: TandemClashChallenge) {
    if (!hasEarlyAccess) {
      alert("Tandem Clash is currently in private preview. Closed beta access is required.");
      return;
    }
    clearTimers();
    setChallengeLoading(true);
    try {
      const res = await startChallengeBattleAction(challenge.id);
      if (!res.success || !res.data) {
        alert((!res.success && res.error) || "Could not enter challenge.");
        setChallengeLoading(false);
        return;
      }

      if (typeof res.data.pCredits === "number") {
        setInternalPCredits(res.data.pCredits);
        onPCreditsChange?.(res.data.pCredits);
      }

      setActiveChallenge(res.data.challenge);
      setOpponent(res.data.opponent);
      setChallengeWonCelebration(null);

      // Auto-pick strictly from eligible cars for this challenge
      const eligibleCars = usableCarCards.filter(
        (c) => isCarEligibleForChallenge(c, challenge).eligible
      );
      if (eligibleCars.length < 3) {
        alert(
          `You need at least 3 qualifying ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : ""} cars in your garage to enter this challenge. (${eligibleCars.length}/3 available)`
        );
        setChallengeLoading(false);
        return;
      }
      setSelectedCarIds(pickTopThreeIds(eligibleCars));
      setSelectedCrewIds(pickTopThreeIds(usableCrewCards));

      triggerDriftWheelIntro();
      setLoadoutSection("cars");
      setPickerModalTarget(null);
      setBattleBanner(null);
      setCornerResults([]);
      setPlayedCrewIndices([]);
      setPlayerCrewAssignments([null, null, null]);
      setRivalCrewAssignments([null, null, null]);
      setPlayerCarAssignments([null, null, null]);
      setRivalCarAssignments([null, null, null]);
      setPreviewCarSlot(null);
      setPlayerCarOrder([0, 1, 2]);
      setRivalCarOrder([0, 1, 2]);
      setPhase("lineup");
    } catch (err) {
      console.error("handleLaunchChallenge error:", err);
      alert("Error entering challenge cup.");
    } finally {
      setChallengeLoading(false);
    }
  }

  function handleRequestReplayChallenge(challenge: TandemClashChallenge) {
    if (challenge.entryCostPCredits > 0) {
      setChallengeReplayConfirm(challenge);
    } else {
      handleLaunchChallenge(challenge);
    }
  }

  // Launch Step 2: Randomise UK Track Card Roulette + Matchmaking
  function handleStartTrackRoulette() {
    if (activeChallenge) {
      const ineligible = selectedCarCards.filter(
        (c) => !isCarEligibleForChallenge(c, activeChallenge).eligible
      );
      if (ineligible.length > 0) {
        alert(
          `Cannot start challenge match: ${ineligible.length} of your equipped cars do not meet the challenge restrictions (${activeChallenge.allowedRarity !== "any" ? activeChallenge.allowedRarity.toUpperCase() + " only" : ""}).`
        );
        return;
      }
    }

    clearTimers();
    setPickerModalTarget(null);
    setTrackLockedIn(false);
    setCornerResults([]);
    setPlayedCrewIndices([]);
    setPlayerCrewAssignments([null, null, null]);
    setRivalCrewAssignments([null, null, null]);
    setPlayerCarAssignments([null, null, null]);
    setRivalCarAssignments([null, null, null]);
    setPreviewCarSlot(null);
    setPlayerCarOrder([0, 1, 2]);
    setRivalCarOrder([0, 1, 2]);
    setPhase("track_roulette");

    const tracks = trackCatalogDefs.length > 0 ? trackCatalogDefs : UK_TRACK_CARD_SET;
    const chosenTrack = rollUkTrackCard(tracks);
    const rolledSectors = rollThreeClashSectors();
    setActiveSectors(rolledSectors);
    const debuffPool =
      debuffCatalogDefs.length >= 3 ? debuffCatalogDefs : DEBUFF_CARD_SET;
    setPlayerMatchDebuffs(rollThreeDebuffCards(debuffPool));
    setRivalMatchDebuffs(rollThreeDebuffCards(debuffPool));
    setRivalCrewOrder([0, 1, 2]);

    // Animate roulette cycling through UK tracks
    const totalTicks = 12;
    for (let i = 0; i < totalTicks; i++) {
      const t = setTimeout(() => {
        setRouletteTrackIdx(i % tracks.length);
      }, i * 130);
      timersRef.current.push(t);
    }

    startTransition(async () => {
      // In challenge cups, the opponent is strictly configured for the cup spec; only casual lobby randomizes rival
      const oppPromise = !activeChallenge ? findNewClashOpponentAction().catch(() => null) : null;
      await new Promise((r) => setTimeout(r, totalTicks * 130 + 150));
      if (oppPromise) {
        const oppRes = await oppPromise;
        if (oppRes && oppRes.success) {
          setOpponent(oppRes.data);
        }
      }
      setActiveTrackDef(chosenTrack);
      setTrackLockedIn(true);
    });
  }

  // ── STEP 3: ARCADE GAME VIEW CORNER BATTLE ANIMATION ────────────────────────
  function startCornerBattle(cornerIdx: 0 | 1 | 2) {
    clearTimers();
    setActiveCornerIdx(cornerIdx);

    // If this corner already has an assigned car, crew and evaluated result (e.g. replaying)
    if (
      playerCarAssignments[cornerIdx] !== null &&
      playerCrewAssignments[cornerIdx] !== null &&
      cornerResults[cornerIdx]
    ) {
      launchCornerBattleAnimation(cornerIdx, true);
      return;
    }

    // Determine available unplayed cars from the player's 3 loadout slots
    const alreadyDeployed = playerCarAssignments.slice(0, cornerIdx).filter((x): x is 0 | 1 | 2 => x !== null);
    const availableCars = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
      (idx) => !alreadyDeployed.includes(idx)
    );

    // When only 1 car is left (Corner 3) -> AUTO-SELECT!
    if (availableCars.length === 1) {
      handleDeployCar(availableCars[0], cornerIdx);
      return;
    }

    // For Corner 1 (3 cars available) or Corner 2 (2 cars available) -> prompt car selection!
    setPreviewCarSlot(availableCars[0]);
    setPhase("car_select");
  }

  function handleDeployCar(chosenCarSlot: 0 | 1 | 2, targetCornerIdx: 0 | 1 | 2 = activeCornerIdx) {
    clearTimers();
    const cornerIdx = targetCornerIdx;

    // 1. Assign player car for this corner
    const nextPlayerCars = [...playerCarAssignments];
    nextPlayerCars[cornerIdx] = chosenCarSlot;
    setPlayerCarAssignments(nextPlayerCars);

    const nextPlayerOrder = [...playerCarOrder];
    nextPlayerOrder[cornerIdx] = chosenCarSlot;
    setPlayerCarOrder(nextPlayerOrder as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]);

    // 2. Auto-pick rival car from rival's unused cars
    const alreadyDeployedRival = rivalCarAssignments.slice(0, cornerIdx).filter((x): x is 0 | 1 | 2 => x !== null);
    const remainingRivalCars = ([0, 1, 2] as const).filter(
      (idx) => !alreadyDeployedRival.includes(idx)
    );
    const rivalChosen = remainingRivalCars[0] ?? 0;
    const nextRivalCars = [...rivalCarAssignments];
    nextRivalCars[cornerIdx] = rivalChosen;
    setRivalCarAssignments(nextRivalCars);

    const nextRivalOrder = [...rivalCarOrder];
    nextRivalOrder[cornerIdx] = rivalChosen;
    setRivalCarOrder(nextRivalOrder as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]);

    // 3. Launch corner battle!
    launchCornerBattleAnimation(cornerIdx, false);
  }

  function launchCornerBattleAnimation(cornerIdx: 0 | 1 | 2, isReplay = false) {
    clearTimers();
    setActiveCornerIdx(cornerIdx);
    setPhase("corner_battle");

    if (isReplay) {
      setBattleAnimStep("cards_entrance");
      const t0 = setTimeout(() => setBattleAnimStep("head_to_head"), 1100);
      const t1 = setTimeout(() => setBattleAnimStep("crew_overlay"), 2200);
      const t2 = setTimeout(() => setBattleAnimStep("battle_shake_1"), 3600);
      const t3 = setTimeout(() => setBattleAnimStep("debuff_overlay"), 4800);
      const t4 = setTimeout(() => setBattleAnimStep("battle_shake_2"), 6400);
      const t5 = setTimeout(() => setBattleAnimStep("knockout_and_winner"), 7800);
      const t6 = setTimeout(() => setBattleAnimStep("corner_finished"), 9200);
      timersRef.current.push(t0, t1, t2, t3, t4, t5, t6);
      return;
    }

    // 1. Cards Entrance: 0ms (Card pops in on left, rival on right)
    setBattleAnimStep("cards_entrance");

    // 2. Head-to-Head: 1100ms (Both cards slide in head-to-head)
    const t0 = setTimeout(() => {
      setBattleAnimStep("head_to_head");
    }, 1100);

    // 3. Prompt Crew Card: 2200ms (Battle pauses! Crew cards appear spread at bottom)
    const t1 = setTimeout(() => {
      const alreadyPlayedCrew = playerCrewAssignments
        .slice(0, cornerIdx)
        .filter((x): x is number => x !== null);
      const available = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
        (idx) => !alreadyPlayedCrew.includes(idx) && !playedCrewIndices.includes(idx)
      );
      if (available.length === 1) {
        // Auto-select the last remaining crew card without prompting on Corner 3!
        handleApplyCrewAndResumeBattle(available[0], cornerIdx);
      } else {
        setPreviewCrewIdx(available[0] ?? 0);
        setBattleAnimStep("prompt_crew");
      }
    }, 2200);

    timersRef.current.push(t0, t1);
  }

  function handleApplyCrewAndResumeBattle(chosenCrewIdx: number, targetCornerIdx?: 0 | 1 | 2) {
    clearTimers();
    const cornerIdx = targetCornerIdx !== undefined ? targetCornerIdx : activeCornerIdx;
    setActiveCornerIdx(cornerIdx);

    // 1. Record player assignment
    const nextPlayerAssignments = [...playerCrewAssignments];
    nextPlayerAssignments[cornerIdx] = chosenCrewIdx;
    setPlayerCrewAssignments(nextPlayerAssignments);

    // 2. Auto-pick rival crew from unused rival crew cards
    const remainingRival = ([0, 1, 2] as const).filter((idx) => !rivalCrewAssignments.includes(idx));
    const rivalChosenIdx = remainingRival[0] ?? rivalCrewOrder[cornerIdx] ?? 0;
    const nextRivalAssignments = [...rivalCrewAssignments];
    nextRivalAssignments[cornerIdx] = rivalChosenIdx;
    setRivalCrewAssignments(nextRivalAssignments);

    // 3. Resolve cards and evaluate
    const playerCarSlot = playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0;
    const rivalCarSlot = rivalCarAssignments[cornerIdx] ?? rivalCarOrder[cornerIdx] ?? 0;
    const playerCar = selectedCarCards[playerCarSlot];
    const rivalCar = opponent.cards[rivalCarSlot] ?? opponent.cards[0];
    const playerCrew = selectedCrewCards[chosenCrewIdx];
    const rivalCrew = rivalCrewCards[rivalChosenIdx];
    const playerDebuffDef = playerMatchDebuffs[cornerIdx];
    const rivalDebuffDef = rivalMatchDebuffs[cornerIdx];

    const result = evaluateCornerMatchup({
      cornerIdx,
      sector: activeSectors[cornerIdx],
      playerCard: playerCar,
      rivalCard: rivalCar,
      playerCrewCard: playerCrew,
      rivalCrewCard: rivalCrew,
      playerDebuffCard: playerDebuffDef,
      rivalDebuffCard: rivalDebuffDef,
      trackCard: activeTrackDef,
      crewPool: crewCatalogDefs,
    });

    setPlayedCrewIndices((prev) => [...prev, chosenCrewIdx as 0 | 1 | 2]);
    setCornerResults((prev) => {
      const next = [...prev];
      next[cornerIdx] = result;
      return next;
    });

    // 4. Resume arcade battle animation!
    // Crew cards overlay & number updates apply
    setBattleAnimStep("crew_overlay");

    // Door-to-door clash shake 1
    const t1 = setTimeout(() => {
      setBattleAnimStep("battle_shake_1");
    }, 1600);

    // Open funny debuff incident popup and PAUSE battle!
    const t2 = setTimeout(() => {
      const scenario = DEBUFF_SCENARIOS[Math.floor(Math.random() * DEBUFF_SCENARIOS.length)];
      setDebuffScenario(scenario);
      setBattleAnimStep("prompt_debuff");
    }, 3200);

    timersRef.current.push(t1, t2);
  }

  function handleContinueFromDebuff() {
    clearTimers();
    // That's when debuffs are applied!
    setBattleAnimStep("debuff_overlay");

    // After 1800ms of seeing the debuffs applied, proceed to apex clash & results
    const t1 = setTimeout(() => {
      setBattleAnimStep("battle_shake_2");
    }, 1800);

    const t2 = setTimeout(() => {
      setBattleAnimStep("knockout_and_winner");
    }, 3400);

    const t3 = setTimeout(() => {
      setBattleAnimStep("corner_finished");
    }, 4800);

    timersRef.current.push(t1, t2, t3);
  }

  function handleSkipBattleAnimation() {
    clearTimers();
    const cornerIdx = activeCornerIdx;
    if (!cornerResults[cornerIdx]) {
      const alreadyPlayedCrew = playerCrewAssignments
        .slice(0, cornerIdx)
        .filter((x): x is number => x !== null);
      const available = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
        (idx) => !alreadyPlayedCrew.includes(idx) && !playedCrewIndices.includes(idx)
      );
      const chosenCrew = previewCrewIdx ?? available[0] ?? 0;
      handleApplyCrewAndResumeBattle(chosenCrew, cornerIdx);
    }
    setBattleAnimStep("corner_finished");
  }

  function handleNextCornerOrVerdict() {
    clearTimers();
    if (activeCornerIdx < 2) {
      startCornerBattle((activeCornerIdx + 1) as 0 | 1 | 2);
    } else {
      finishBattleAndShowVerdict();
    }
  }

  function finishBattleAndShowVerdict(passedResults?: EvaluatedCornerResult[]) {
    clearTimers();
    const baseResults = passedResults ?? cornerResults;
    const allThreeResults: EvaluatedCornerResult[] = [0, 1, 2].map((idx) => {
      const cornerIdx = idx as 0 | 1 | 2;
      if (baseResults[cornerIdx]) {
        return baseResults[cornerIdx];
      }
      const playerCarSlot = playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0;
      const rivalCarSlot = rivalCarAssignments[cornerIdx] ?? rivalCarOrder[cornerIdx] ?? 0;
      const playerCrewSlot = playerCrewAssignments[cornerIdx] ?? idx;
      const rivalCrewSlot = rivalCrewAssignments[cornerIdx] ?? rivalCrewOrder[cornerIdx] ?? idx;

      const pCar = selectedCarCards[playerCarSlot];
      const rCar = opponent.cards[rivalCarSlot] ?? opponent.cards[0];
      const pCrew = selectedCrewCards[playerCrewSlot];
      const rCrew = rivalCrewCards[rivalCrewSlot];
      const pDebuff = playerMatchDebuffs[cornerIdx];
      const rDebuff = rivalMatchDebuffs[cornerIdx];

      return evaluateCornerMatchup({
        cornerIdx,
        sector: activeSectors[cornerIdx],
        playerCard: pCar,
        rivalCard: rCar,
        playerCrewCard: pCrew,
        rivalCrewCard: rCrew,
        playerDebuffCard: pDebuff,
        rivalDebuffCard: rDebuff,
        trackCard: activeTrackDef,
        crewPool: crewCatalogDefs,
      });
    });

    setCornerResults(allThreeResults);

    let playerCorners = 0;
    let opponentCorners = 0;
    let tiedCorners = 0;
    let playerTotalScore = 0;
    let opponentTotalScore = 0;

    for (const r of allThreeResults) {
      if (!r) continue;
      playerTotalScore += r.playerScore;
      opponentTotalScore += r.rivalScore;
      if (r.won) playerCorners++;
      else if (r.tied) tiedCorners++;
      else opponentCorners++;
    }

    const won =
      playerCorners > opponentCorners ||
      (playerCorners === opponentCorners && playerTotalScore >= opponentTotalScore);

    setBattleBanner({
      won,
      playerCorners,
      opponentCorners,
      tiedCorners,
      rewardGranted: 0,
      streakBonusGranted: 0,
    });
    setPhase("verdict");

    startTransition(async () => {
      if (activeChallenge) {
        const res = await completeChallengeBattleAction({
          challengeId: activeChallenge.id,
          won,
          playedCarCardIds: selectedCarIds,
        });
        if (res.success) {
          setClashStats(res.data.stats);
          setBattleBanner({
            won,
            playerCorners,
            opponentCorners,
            tiedCorners,
            rewardGranted: res.data.rewardGranted,
            streakBonusGranted: 0,
          });
          setChallengeWonCelebration({
            challengeTitle: activeChallenge.title,
            rewardGranted: res.data.rewardGranted,
            challengeCompleted: res.data.challengeCompleted,
          });
          if (res.data.challengeCompleted) {
            setCompletedChallengeIds((prev) =>
              prev.includes(activeChallenge.id) ? prev : [...prev, activeChallenge.id]
            );
          }
          setPitReport(res.data.faultEvents ?? []);
          setInternalPCredits(res.data.pCredits);
          onPCreditsChange?.(res.data.pCredits);
          onStatsChange?.(res.data.stats);
          onRewardEarned?.(res.data.pCredits, res.data.stats);

          // Update car durability immediately in state
          if (res.data.updatedCars && res.data.updatedCars.length > 0) {
            const updateMap = new Map(res.data.updatedCars.map((c) => [c.id, c]));
            setLocalCards((prev) => {
              const next = prev.map((c) => updateMap.get(c.id) ?? c);
              onCardsChange?.(next);
              return next;
            });
          } else if (selectedCarIds && selectedCarIds.length > 0) {
            const playedSet = new Set(selectedCarIds.filter((id) => !id.startsWith("loaner-")));
            setLocalCards((prev) => {
              const next = prev.map((c) => {
                if (!playedSet.has(c.id)) return c;
                const cur = c.battlesRemaining ?? c.maxBattles ?? 6;
                return { ...c, battlesRemaining: Math.max(0, cur - 1) };
              });
              onCardsChange?.(next);
              return next;
            });
          }
        }
      } else {
        const res = await completeClashBattleAction({
          won,
          playedCarCardIds: selectedCarIds,
        });
        if (res.success) {
          setClashStats(res.data.stats);
          setBattleBanner({
            won,
            playerCorners,
            opponentCorners,
            tiedCorners,
            rewardGranted: res.data.rewardGranted,
            streakBonusGranted: res.data.streakBonusGranted,
          });
          setPitReport(res.data.faultEvents ?? []);
          setInternalPCredits(res.data.pCredits);
          onPCreditsChange?.(res.data.pCredits);
          onStatsChange?.(res.data.stats);
          onRewardEarned?.(res.data.pCredits, res.data.stats);

          // Update car durability immediately in state
          if (res.data.updatedCars && res.data.updatedCars.length > 0) {
            const updateMap = new Map(res.data.updatedCars.map((c) => [c.id, c]));
            setLocalCards((prev) => {
              const next = prev.map((c) => updateMap.get(c.id) ?? c);
              onCardsChange?.(next);
              return next;
            });
          } else if (selectedCarIds && selectedCarIds.length > 0) {
            const playedSet = new Set(selectedCarIds.filter((id) => !id.startsWith("loaner-")));
            setLocalCards((prev) => {
              const next = prev.map((c) => {
                if (!playedSet.has(c.id)) return c;
                const cur = c.battlesRemaining ?? c.maxBattles ?? 6;
                return { ...c, battlesRemaining: Math.max(0, cur - 1) };
              });
              onCardsChange?.(next);
              return next;
            });
          }
        }
      }
    });
  }

  const runningScore = useMemo(() => {
    let you = 0;
    let rival = 0;
    const count =
      phase === "verdict"
        ? 3
        : phase === "corner_battle"
          ? activeCornerIdx + (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished" ? 1 : 0)
          : 0;
    for (let i = 0; i < count; i++) {
      const r = cornerResults[i];
      if (!r) continue;
      if (r.won) you++;
      else if (!r.tied) rival++;
    }
    return { you, rival };
  }, [phase, activeCornerIdx, battleAnimStep, cornerResults]);

  // Remaining unplayed Crew Card slot indices (0, 1, 2)
  const remainingCrewSlotIndices = useMemo(() => {
    return ([0, 1, 2] as Array<0 | 1 | 2>).filter(
      (idx) => !playedCrewIndices.includes(idx)
    );
  }, [playedCrewIndices]);

  // Remaining unplayed Car Card indices at the start of activeCornerIdx
  const remainingPlayerCarIndicesForCorner = useMemo(() => {
    return playerCarOrder.slice(activeCornerIdx);
  }, [playerCarOrder, activeCornerIdx]);

  const remainingRivalCarIndicesForCorner = useMemo(() => {
    return rivalCarOrder.slice(activeCornerIdx);
  }, [rivalCarOrder, activeCornerIdx]);

  // ── LOBBY VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl">
        <button
          type="button"
          onClick={() => setArenaLobbyTab("quick")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs sm:text-sm font-black uppercase tracking-wider transition-all ${
            arenaLobbyTab === "quick"
              ? "bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-black shadow-lg"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span>⚡</span> Quick Match Arena
        </button>
        <button
          type="button"
          onClick={() => setArenaLobbyTab("challenges")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs sm:text-sm font-black uppercase tracking-wider transition-all ${
            arenaLobbyTab === "challenges"
              ? "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white shadow-lg"
              : "text-zinc-400 hover:text-white hover:bg-zinc-900"
          }`}
        >
          <span>🏆</span> Challenges &amp; Tournaments
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
              arenaLobbyTab === "challenges"
                ? "bg-white/20 text-white"
                : "bg-purple-500/20 text-purple-300"
            }`}
          >
            NEW
          </span>
        </button>
      </div>

      {arenaLobbyTab === "challenges" ? (
        <ClashChallengesView
          userCards={localCards}
          pCredits={internalPCredits}
          userId={userId}
          isAdmin={isAdmin}
          completedChallengeIds={completedChallengeIds}
          onSelectChallenge={handleLaunchChallenge}
          onPCreditsChange={(bal) => {
            setInternalPCredits(bal);
            onPCreditsChange?.(bal);
          }}
        />
      ) : (
        <>
          {/* Challenger Tournament Feature Banner */}
          <button
            type="button"
            onClick={() => setArenaLobbyTab("challenges")}
            className="group relative w-full overflow-hidden rounded-3xl border border-purple-500/40 bg-gradient-to-br from-zinc-900 via-purple-950/30 to-zinc-950 p-5 sm:p-6 text-left shadow-2xl transition-all duration-300 hover:border-purple-400 hover:shadow-purple-500/20 hover:scale-[1.008]"
          >
            {/* Ambient Background Glows */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-purple-600/20 to-pink-600/20 blur-3xl transition-opacity group-hover:opacity-100 opacity-60"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-purple-900/20 blur-2xl"
              aria-hidden
            />

            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 sm:gap-5">
                {/* Glowing Trophy Medallion */}
                <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-purple-400/40 bg-gradient-to-br from-purple-500/25 via-fuchsia-600/20 to-black shadow-inner shadow-purple-500/30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
                  <span className="text-2xl sm:text-3xl drop-shadow-[0_2px_8px_rgba(236,72,153,0.5)]">
                    🏆
                  </span>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-fuchsia-500" />
                  </span>
                </div>

                <div className="space-y-1.5 max-w-xl">
                  {/* Eyebrow & Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                      Challenger Series
                    </span>
                    <span className="rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-black text-purple-200">
                      ⚡ Daily P-Credit Cups
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                      Rarity &amp; Custom Bosses
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg sm:text-xl font-black tracking-tight text-white group-hover:text-purple-200 transition-colors">
                    Tandem Clash Challenges &amp; Tournaments
                  </h3>

                  {/* Description */}
                  <p className="text-xs sm:text-sm leading-relaxed text-zinc-300">
                    Test your garage in Bronze, Silver, Gold, and Legend spec cups or take on custom rival crews to win daily P-Credit purses!
                  </p>

                  {/* Quick Cup Tiers Strip */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-800/50 bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      🥉 Bronze Cup
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                      🥈 Silver Cup
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-yellow-600/50 bg-yellow-950/40 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                      🥇 Gold Cup
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-purple-600/50 bg-purple-950/40 px-2 py-0.5 text-[10px] font-bold text-purple-200">
                      👑 Legend Cup
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2 pt-2 sm:pt-0 shrink-0">
                <span className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-5 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-purple-500/25 transition-all duration-300 group-hover:shadow-purple-500/50 group-hover:scale-105">
                  Enter Arena
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80 tabular-nums">
                  ⏳ Resets in {utcCountdown}
                </span>
              </div>
            </div>
          </button>

          <section className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-5 text-white shadow-xl sm:p-7">
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl"
          aria-hidden
        />
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-black">
                3 Cars · 3 Crew Advantages · UK Track &amp; Debuffs
              </span>
              {!clashStats.dailyWinClaimed ? (
                <span className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-black text-emerald-300">
                  🎁 +{DAILY_CLASH_WIN_REWARD_PCREDITS} P-Credits First Win Today
                </span>
              ) : (
                <span className="rounded-full border border-zinc-700 bg-zinc-800/90 px-2.5 py-0.5 text-[11px] font-bold text-zinc-400 tabular-nums">
                  ✓ Daily Win Claimed (+{STREAK_MILESTONE_REWARD_PCREDITS} P every 3-streak) · ⏳ Resets in {utcCountdown}
                </span>
              )}
            </div>

            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
              Penthouse Tandem Clash
            </h2>
            <p className="max-w-xl text-xs leading-relaxed text-zinc-300 sm:text-sm">
              Lock in <strong>3 Car Cards</strong> and <strong>3 Crew Advantage Cards</strong>, spin for a random <strong>UK Drift Track Card</strong>, and battle through <strong>Corners 1, 2 &amp; 3</strong> with randomised car draws, tactical Crew plays, and sudden Debuff hazards!
            </p>

            {/* Player Record Strip */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Record </span>
                <span className="font-black text-emerald-400">{clashStats.wins}W</span>
                <span className="text-zinc-600"> / </span>
                <span className="font-black text-zinc-300">{clashStats.losses}L</span>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Streak </span>
                <span className="font-black text-amber-400">🔥 {clashStats.streak}</span>
              </div>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase text-cyan-300">Crew Owned </span>
                <span className="font-black text-cyan-200">
                  ⚡ {ownedCrewCards.length}/{crewCatalogDefs.length}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:min-w-[16rem]">
            {hasEarlyAccess ? (
              <button
                type="button"
                onClick={handleLaunchGame}
                className="group relative inline-flex min-h-14 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 py-3.5 text-base font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all hover:scale-[1.02] active:scale-[0.99]"
              >
                <span className="text-xl transition-transform group-hover:scale-110">🎮</span>
                <span>Play Tandem Clash</span>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black/80">
                  {isAdmin ? "Admin" : "Beta"}
                </span>
              </button>
            ) : (
              <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-zinc-900/90 to-zinc-950 p-4 text-center shadow-lg">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-400">
                  <span>🔒</span> Early Access Beta
                </div>
                <h4 className="mt-2 text-sm font-black text-white">Closed Beta Access Required</h4>
                <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                  Tandem Clash is currently in private preview. Only players with granted Early Access permissions can launch battles.
                </p>
                {userId && (
                  <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Your Driver ID
                    </span>
                    <span className="font-mono text-xs font-black text-amber-400 select-all">
                      {userId}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-zinc-400">
                      Share this ID with a Track Admin to receive early access clearance.
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  disabled
                  className="mt-3 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 text-xs font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed"
                >
                  <span>🔒</span> Early Access Required
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => openHowToPlay("quickstart")}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-300 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-500/25 active:scale-[0.99]"
            >
              <span>📖</span> How to Play &amp; Driver Manual
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setShowCatalogModal("crew")}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-[11px] font-black text-cyan-300 hover:bg-cyan-500/20"
              >
                ⚡ Crew ({crewCatalogDefs.length})
              </button>
              <button
                type="button"
                onClick={() => setShowCatalogModal("debuff")}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] font-black text-rose-300 hover:bg-rose-500/20"
              >
                ⚠️ Debuffs ({debuffCatalogDefs.length})
              </button>
              <button
                type="button"
                onClick={() => setShowCatalogModal("track")}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-black text-emerald-300 hover:bg-emerald-500/20"
              >
                🇬🇧 Tracks ({trackCatalogDefs.length})
              </button>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowEarlyAccessModal(true);
                  if (earlyAccessRoster.length === 0) loadEarlyAccessRoster();
                }}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-black text-purple-300 hover:bg-purple-500/20"
              >
                <span>🔒</span> Manage Early Access Beta Roster
              </button>
            )}
          </div>
        </div>
      </section>

      {/* How It Works Structure */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 sm:text-sm">
                🏁 How Tandem Clash Works
              </h3>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                New Engine &amp; Pit Rules
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Tap any card to open the interactive rules overlay with full diagrams and details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openHowToPlay("quickstart")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          >
            <span>📖</span> Open Driver Manual
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. 3 Cars & 3 Corners */}
          <button
            type="button"
            onClick={() => openHowToPlay("quickstart")}
            className="group rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 text-left transition-all hover:border-amber-500/50 hover:bg-zinc-100/90 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:bg-zinc-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-black">
                  1
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  3 Cars &amp; 3 Corners
                </span>
              </div>
              <span className="text-[10px] font-bold text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                Read Guide →
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Choose 3 Cars &amp; 3 Crew Cards (Loaner cards backfill if needed). You decide which car to send each corner. Win <strong>2 of 3 corners</strong> to win!
            </p>
          </button>

          {/* 2. Durability & Faults */}
          <button
            type="button"
            onClick={() => openHowToPlay("durability")}
            className="group rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/10 dark:border-amber-500/20 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-black">
                  2
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  Durability &amp; Breakdowns
                </span>
              </div>
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-400">
                NEW
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Cars have <strong>2–10 battles</strong> of durability. At 0, they suffer 1 of 4 faults (⚙️ Engine, 🕹️ Gearbox, 🔧 Steer, ⚡ ESC) and sit out 2–5 battles.
            </p>
          </button>

          {/* 3. Maintenance Kits */}
          <button
            type="button"
            onClick={() => openHowToPlay("maintenance")}
            className="group rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-3.5 text-left transition-all hover:border-cyan-500/60 hover:bg-cyan-500/10 dark:border-cyan-500/20 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-xs font-black text-black">
                  3
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  Pit Repairs Consumables
                </span>
              </div>
              <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-black text-cyan-400">
                NEW
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Standard packs drop repair kits (Bronze -1 to Legend -5 full fix). Use <strong>🛠️ Quick Fix</strong> in the car picker to repair instantly!
            </p>
          </button>

          {/* 4. Crew Advantages */}
          <button
            type="button"
            onClick={() => openHowToPlay("crew")}
            className="group rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3.5 text-left transition-all hover:border-purple-500/60 hover:bg-purple-500/10 dark:border-purple-500/20 dark:bg-purple-950/20 dark:hover:bg-purple-950/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs font-black text-white">
                  4
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  Crew Cards &amp; Rarity
                </span>
              </div>
              <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-black text-purple-400">
                SCALED
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              100% positive buffs scaling from Bronze to Legend. Higher tiers deliver massive stat boosts, flat point spikes, and <strong>Debuff Shields</strong>!
            </p>
          </button>

          {/* 5. UK Tracks & Hazards */}
          <button
            type="button"
            onClick={() => openHowToPlay("tracks")}
            className="group rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-left transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-black">
                  5
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  UK Tracks &amp; Hazards
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
                Read Guide →
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Iconic UK venues roll with bespoke track rules. Random shared corner debuffs hit both cars—shield your score with crew synergy.
            </p>
          </button>

          {/* 6. Scoring & Rewards */}
          <button
            type="button"
            onClick={() => openHowToPlay("scoring")}
            className="group rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 text-left transition-all hover:border-rose-500/60 hover:bg-rose-500/10 dark:border-rose-500/20 dark:bg-rose-950/20 dark:hover:bg-rose-950/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white">
                  6
                </span>
                <span className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  Scoring &amp; P-Credits
                </span>
              </div>
              <span className="text-[10px] font-bold text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                Read Guide →
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Clear corner telemetry. Win daily to earn <strong>+25 P-Credits</strong> and build win streaks for +10 P-Credits milestone bonuses!
            </p>
          </button>
        </div>
      </section>
    </>
  )}

      {/* Catalog Modal for Crew, Debuff, or UK Track Cards */}
      {showCatalogModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Clash Cards Set Catalog"
          >
            <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-amber-500/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3.5 sm:px-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {showCatalogModal === "crew"
                      ? `100% Positive Advantages · Pullable in Standard Packs (${ownedCrewCards.length} Owned)`
                      : showCatalogModal === "debuff"
                        ? "Random Corner Hazards Applied to Both Drivers"
                        : "Automated UK RC Drift Venues (Buff + Debuff)"}
                  </span>
                  <h3 className="text-base font-black sm:text-lg">
                    {showCatalogModal === "crew"
                      ? `⚡ Crew Advantage Cards (${crewCatalogDefs.length})`
                      : showCatalogModal === "debuff"
                        ? `⚠️ Random Debuff Cards (${debuffCatalogDefs.length})`
                        : `🇬🇧 UK Drift Track Cards (${trackCatalogDefs.length})`}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("crew")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "crew"
                        ? "bg-cyan-500 text-black"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    ⚡ Crew
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("debuff")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "debuff"
                        ? "bg-rose-500 text-white"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Debuffs
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("track")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "track"
                        ? "bg-emerald-500 text-black"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    🇬🇧 Tracks
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(null)}
                    className="ml-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {showCatalogModal === "crew" && (
                  <div className="space-y-4">
                    {/* Rarity Variation Stepper Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mr-1">
                          Rarity Variation:
                        </span>
                        {(["bronze", "silver", "gold", "legend"] as const).map((tier) => {
                          const isActive = catalogTierTab === tier;
                          const tabTheme =
                            tier === "bronze"
                              ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
                              : tier === "silver"
                                ? "border-slate-400/60 bg-slate-800/40 text-slate-200"
                                : tier === "gold"
                                  ? "border-amber-400/70 bg-amber-500/20 text-amber-300"
                                  : "border-purple-400/70 bg-purple-950/40 text-purple-300";
                          const oddsText =
                            tier === "bronze"
                              ? "Standard (72.5%)"
                              : tier === "silver"
                                ? "1 in 5 (20%)"
                                : tier === "gold"
                                  ? "1 in 20 (5%)"
                                  : "1 in 40 (2.5%)";
                          const icon =
                            tier === "bronze" ? "🥉" : tier === "silver" ? "🥈" : tier === "gold" ? "🥇" : "👑";

                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setCatalogTierTab(tier)}
                              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition-all ${
                                isActive
                                  ? `${tabTheme} ring-2 ring-amber-400 shadow-md scale-105`
                                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                              }`}
                            >
                              <span>{icon}</span>
                              <span>{tier}</span>
                              <span className="hidden sm:inline text-[9px] font-bold text-zinc-400">
                                ({oddsText})
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-black text-amber-400">
                        <span>⚡ Scaled Advantages:</span>
                        <span className="text-zinc-300 font-bold">
                          {catalogTierTab === "bronze"
                            ? "+1 stats · +1-2 pts · 25% Shield"
                            : catalogTierTab === "silver"
                              ? "+2 stats · +2-3 pts · 50% Shield"
                              : catalogTierTab === "gold"
                                ? "+3 stats · +4-5 pts · 75% Shield"
                                : "+4 stats · +6-8 pts · 100% Shield"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {crewCatalogDefs.map((def, idx) => {
                        const scaledDef = scaleCrewCardDefinition(def, catalogTierTab);
                        const ownedCount = ownedCrewCards.filter(
                          (c) => (c.crewCardId === def.id || c.name === def.name) && (c.tier === catalogTierTab)
                        ).length;
                        const totalOwned = ownedCrewCards.filter(
                          (c) => c.crewCardId === def.id || c.name === def.name
                        ).length;
                        const previewCard = catalogCrewMemberCards[idx];
                        const mods = scaledDef.modifiers;
                        return (
                          <div
                            key={def.id}
                            className={`flex flex-col justify-between rounded-2xl border p-2 transition-transform hover:-translate-y-1 ${
                              ownedCount > 0
                                ? "border-cyan-500/60 bg-cyan-950/20"
                                : "border-zinc-800 bg-zinc-900/50 opacity-90"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setViewerState({ list: catalogCrewMemberCards, index: idx })
                              }
                              className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/70"
                              aria-label={`View ${scaledDef.name}`}
                            >
                              <FullArtCard card={previewCard} className="drop-shadow-lg" />
                            </button>

                            {/* Scaled Modifiers Micro-Badges */}
                            <div className="mt-2 flex flex-wrap gap-1 px-1">
                              {mods.driftBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.driftBonus} D
                                </span>
                              ) : null}
                              {mods.accelBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.accelBonus} A
                                </span>
                              ) : null}
                              {mods.gripBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.gripBonus} G
                                </span>
                              ) : null}
                              {mods.steerBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.steerBonus} S
                                </span>
                              ) : null}
                              {mods.boostWeakestStat ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.boostWeakestStat} Low
                                </span>
                              ) : null}
                              {mods.minStatFloor ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  Floor {mods.minStatFloor}
                                </span>
                              ) : null}
                              {mods.debuffShield ? (
                                <span className="rounded bg-cyan-500/20 border border-cyan-400/50 px-1 py-0.5 text-[8px] font-black text-cyan-300">
                                  🛡️ {Math.round(mods.debuffShield * 100)}%
                                </span>
                              ) : null}
                              {mods.flatBonus ? (
                                <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1 py-0.5 text-[8px] font-black text-amber-300">
                                  +{mods.flatBonus} Pts
                                </span>
                              ) : null}
                              {mods.underdogBonus ? (
                                <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1 py-0.5 text-[8px] font-black text-amber-300">
                                  +{mods.underdogBonus} Underdog
                                </span>
                              ) : null}
                              {mods.giantSlayerBonus ? (
                                <span className="rounded bg-pink-500/20 border border-pink-400/50 px-1 py-0.5 text-[8px] font-black text-pink-300">
                                  +{mods.giantSlayerBonus} Slayer
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1.5 flex items-center justify-between px-1 text-[11px]">
                              <span className="font-bold text-zinc-400">
                                #{String(def.setNumber).padStart(2, "0")}
                              </span>
                              {ownedCount > 0 ? (
                                <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-black text-black">
                                  Owned ({catalogTierTab}) ×{ownedCount}
                                </span>
                              ) : totalOwned > 0 ? (
                                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                                  Other Tiers ({totalOwned})
                                </span>
                              ) : (
                                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                                  In Packs
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showCatalogModal === "debuff" && (
                  <div className="space-y-4">
                    {/* Debuff Rarity Odds Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mr-1">
                          Hazard Severity:
                        </span>
                        {(["bronze", "silver", "gold", "legend"] as const).map((tier) => {
                          const isActive = catalogTierTab === tier;
                          const tabTheme =
                            tier === "bronze"
                              ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
                              : tier === "silver"
                                ? "border-slate-400/60 bg-slate-800/40 text-slate-200"
                                : tier === "gold"
                                  ? "border-amber-400/70 bg-amber-500/20 text-amber-300"
                                  : "border-purple-400/70 bg-purple-950/40 text-purple-300";
                          const oddsText =
                            tier === "bronze"
                              ? "Standard (72.5%)"
                              : tier === "silver"
                                ? "1 in 5 (20%)"
                                : tier === "gold"
                                  ? "1 in 20 (5%)"
                                  : "1 in 40 (2.5%)";
                          const icon =
                            tier === "bronze" ? "🥉" : tier === "silver" ? "🥈" : tier === "gold" ? "🥇" : "👑";

                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setCatalogTierTab(tier)}
                              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition-all ${
                                isActive
                                  ? `${tabTheme} ring-2 ring-rose-500 shadow-md scale-105`
                                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                              }`}
                            >
                              <span>{icon}</span>
                              <span>{tier}</span>
                              <span className="hidden sm:inline text-[9px] font-bold text-zinc-400">
                                ({oddsText})
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-black text-rose-400">
                        <span>⚠️ Scaled Penalties:</span>
                        <span className="text-zinc-300 font-bold">
                          {catalogTierTab === "bronze"
                            ? "-1 stat · -1 pt"
                            : catalogTierTab === "silver"
                              ? "-2 stats · -2 pts"
                              : catalogTierTab === "gold"
                                ? "-3 stats · -4 pts"
                                : "-4 stats · -6 pts"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {debuffCatalogDefs.map((def, idx) => {
                        const scaledDef = scaleDebuffCardDefinition(def, catalogTierTab);
                        const previewCard = catalogDebuffMemberCards[idx];
                        const pen = scaledDef.penalties;
                        return (
                          <div
                            key={def.id}
                            className="flex flex-col justify-between rounded-2xl border border-rose-500/40 bg-rose-950/15 p-2 transition-transform hover:-translate-y-1"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setViewerState({ list: catalogDebuffMemberCards, index: idx })
                              }
                              className="block w-full rounded-xl text-left"
                              aria-label={`View ${scaledDef.name}`}
                            >
                              <FullArtCard card={previewCard} className="drop-shadow-lg" />
                            </button>

                            {/* Scaled Penalty Micro-Badges */}
                            <div className="mt-2 flex flex-wrap gap-1 px-1">
                              {pen.driftPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.driftPenalty} DRIFT
                                </span>
                              ) : null}
                              {pen.accelPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.accelPenalty} ACCEL
                                </span>
                              ) : null}
                              {pen.gripPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.gripPenalty} GRIP
                                </span>
                              ) : null}
                              {pen.steerPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.steerPenalty} STEER
                                </span>
                              ) : null}
                              {pen.flatPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.flatPenalty} PTS
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1.5 px-1 text-[10px] font-bold text-rose-300 line-clamp-2">
                              {scaledDef.effect}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showCatalogModal === "track" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {trackCatalogDefs.map((def, idx) => {
                      const previewCard = catalogTrackMemberCards[idx];
                      return (
                        <div
                          key={def.id}
                          className="flex flex-col justify-between rounded-2xl border border-amber-500/40 bg-amber-950/20 p-2 transition-transform hover:-translate-y-1"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setViewerState({ list: catalogTrackMemberCards, index: idx })
                            }
                            className="block w-full rounded-xl text-left"
                            aria-label={`View ${def.name}`}
                          >
                            <FullArtCard card={previewCard} className="drop-shadow-lg" />
                          </button>
                          <div className="mt-2 space-y-1 px-1 text-[10px]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-black text-amber-300">
                              🏆 Gold Venue
                            </span>
                            <p className="line-clamp-2 text-zinc-300">{def.effect}</p>
                            <p className="font-semibold text-emerald-400">
                              🎲 Buff &amp; Hazard rolled on match spin
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Admin Early Access Beta Management Modal */}
      {showEarlyAccessModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Manage Early Access Beta Roster"
            onClick={() => setShowEarlyAccessModal(false)}
          >
            <div
              className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white sm:h-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-purple-500/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3.5 sm:px-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    Track Admin Control Panel
                  </span>
                  <h3 className="text-base font-black sm:text-lg">
                    🔒 Tandem Clash Early Access Roster
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadEarlyAccessRoster}
                    disabled={loadingEarlyAccessRoster}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {loadingEarlyAccessRoster ? "..." : "↻ Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEarlyAccessModal(false)}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <input
                  type="text"
                  value={earlyAccessSearch}
                  onChange={(e) => setEarlyAccessSearch(e.target.value)}
                  placeholder="Filter drivers by name, email, or user ID..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />

                <div className="divide-y divide-zinc-800">
                  {earlyAccessRoster
                    .filter((m) => {
                      if (!earlyAccessSearch.trim()) return true;
                      const q = earlyAccessSearch.toLowerCase();
                      return (
                        (m.name || "").toLowerCase().includes(q) ||
                        (m.email || "").toLowerCase().includes(q) ||
                        (m.id || "").toLowerCase().includes(q)
                      );
                    })
                    .map((m) => {
                      const isAdminMember = m.role === "admin";
                      const isToggling = togglingEarlyAccessUserId === m.id;
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-zinc-100">
                                {m.name || "Driver"}
                              </span>
                              {isAdminMember && (
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-amber-400">
                                  👑 Admin
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                  m.hasEarlyAccess
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {isAdminMember
                                  ? "Auto Access"
                                  : m.hasEarlyAccess
                                  ? "Granted ✓"
                                  : "Locked 🔒"}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              <span>{m.email}</span> · <span className="font-mono text-zinc-500">ID: {m.id}</span>
                            </div>
                          </div>

                          <div>
                            {isAdminMember ? (
                              <span className="text-[11px] text-zinc-500 italic">Always Active</span>
                            ) : (
                              <button
                                type="button"
                                disabled={isToggling}
                                onClick={() => handleToggleEarlyAccessInArena(m)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                                  m.hasEarlyAccess
                                    ? "border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                    : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:opacity-90 shadow-sm"
                                }`}
                              >
                                {isToggling
                                  ? "..."
                                  : m.hasEarlyAccess
                                  ? "✕ Revoke"
                                  : "⚡ Grant"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── DEDICATED FULL-SCREEN GAME STAGE (PORTAL) ──────────────────────── */}
      {phase !== "lobby" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex h-[100dvh] w-screen flex-col overflow-hidden bg-zinc-950 text-white"
            role="dialog"
            aria-modal="true"
            aria-label="Penthouse Tandem Clash Game Stage"
          >
            {/* Top Game Stage Bar */}
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 bg-black/75 px-4 py-2.5 backdrop-blur-md sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-black">
                  ⚡
                </span>
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {phase === "lineup"
                      ? `Step 1 · Select 3 Cars & 3 Crew Advantage Cards`
                      : phase === "track_roulette"
                        ? `Step 2 · Randomising UK Drift Track Card`
                        : phase === "car_select"
                          ? `Step 3 · Corner ${activeCornerIdx + 1} of 3 · Deploy Car Card`
                          : phase === "corner_battle"
                            ? `Step 3 · Corner ${activeCornerIdx + 1} of 3 (${activeTrackDef.name})`
                            : "Final Judge Verdict"}
                  </span>
                  <h2 className="text-xs font-black text-white sm:text-sm">
                    Penthouse Tandem Clash
                  </h2>
                </div>
              </div>

              {/* Center Live Scoreboard during Battle/Verdict */}
              {(phase === "car_select" || phase === "corner_battle" || phase === "verdict") && (
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-1">
                  <span className="text-[10px] font-black uppercase text-amber-400">YOU</span>
                  <span className="text-base font-black text-white">{runningScore.you}</span>
                  <span className="text-xs font-bold text-zinc-600">–</span>
                  <span className="text-base font-black text-white">{runningScore.rival}</span>
                  <span className="text-[10px] font-black uppercase text-rose-400">RIVAL</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openHowToPlay("quickstart")}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
                  title="How to Play & Rules Guide"
                >
                  📖 Rules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearTimers();
                    setPickerModalTarget(null);
                    setPhase("lobby");
                  }}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                >
                  ✕ Exit
                </button>
              </div>
            </header>

            {/* Main Stage Body */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-5">
              <div className="mx-auto max-w-3xl">
                {/* ── STEP 1: SELECT 3 CAR CARDS & 3 CREW CARDS ────────────── */}
                {phase === "lineup" && (
                  <div className="space-y-4">
                    {/* Active Challenge Header Banner */}
                    {activeChallenge && (
                      <div
                        className={`rounded-2xl border p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg ${
                          CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.borderClass || "border-purple-500/50"
                        } ${
                          CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.bgGradientClass || "bg-purple-950/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">
                            {CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.icon || "🏆"}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase text-black">
                                CHALLENGE CUP ACTIVE
                              </span>
                              <h4 className="text-sm font-black text-white">{activeChallenge.title}</h4>
                            </div>
                            <p className="text-[11px] text-zinc-300">
                              Restriction:{" "}
                              <strong className="text-white">
                                {activeChallenge.allowedRarity === "any"
                                  ? "Open Rarity"
                                  : `${activeChallenge.allowedRarity.toUpperCase()} Only`}
                                {activeChallenge.maxTotalScore ? ` · Max ${activeChallenge.maxTotalScore} PTS` : ""}
                              </strong>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] font-bold uppercase text-zinc-400">Purse Reward</span>
                          <span className="text-sm font-black text-emerald-400">
                            ⚡ +{activeChallenge.rewardPCredits} P-Credits
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Loadout Stepper Switcher */}
                    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1.5">
                      <button
                        type="button"
                        onClick={() => setLoadoutSection("cars")}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
                          loadoutSection === "cars"
                            ? "bg-amber-500 text-black shadow-md"
                            : "bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black uppercase">
                            🚗 1. Your 3 Car Cards
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              loadoutSection === "cars" ? "text-black/80" : "text-zinc-400"
                            }`}
                          >
                            Drawn in random order across Corners 1–3
                          </span>
                        </div>
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black">
                          3/3 Ready
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLoadoutSection("crew")}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
                          loadoutSection === "crew"
                            ? "bg-cyan-500 text-black shadow-md"
                            : "bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black uppercase">
                            ⚡ 2. Your 3 Crew Cards
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              loadoutSection === "crew" ? "text-black/80" : "text-zinc-400"
                            }`}
                          >
                            100% Advantages · Play 1 per corner
                          </span>
                        </div>
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black">
                          3/3 Ready
                        </span>
                      </button>
                    </div>

                    {loadoutSection === "cars" ? (
                      <div className="rounded-3xl border border-amber-500/40 bg-zinc-900/90 p-4 shadow-xl sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
                              STEP 1A · SELECT YOUR 3 CAR CARDS
                            </span>
                            <h3 className="mt-1 text-base font-black text-white sm:text-lg">
                              Your 3-Car Tandem Lineup
                            </h3>
                            <p className="text-xs text-zinc-400">
                              At each corner, 1 of your remaining Car Cards is randomly drawn against 1 of the Challenger&apos;s 3 cars!
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (activeChallenge) {
                                  const eligible = usableCarCards.filter(
                                    (c) => isCarEligibleForChallenge(c, activeChallenge).eligible
                                  );
                                  if (eligible.length >= 3) {
                                    setSelectedCarIds(pickTopThreeIds(eligible));
                                  } else {
                                    alert(
                                      `Only ${eligible.length} qualifying cars found in your garage for this challenge.`
                                    );
                                  }
                                } else {
                                  setSelectedCarIds(pickTopThreeIds(usableCarCards));
                                }
                              }}
                              className="rounded-xl border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-300 hover:bg-amber-500/25"
                            >
                              ⚡ Auto-Pick Best 3
                            </button>
                            <button
                              type="button"
                              onClick={() => setLoadoutSection("crew")}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-sky-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-md hover:scale-[1.02]"
                            >
                              <span>Next: Crew Cards →</span>
                            </button>
                          </div>
                        </div>

                        {usingLoanerCars && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
                            🚗 Academy Loaner Cars have been activated to fill your 3-car lineup until you pull more cars!
                          </div>
                        )}

                        {challengeIneligibleCount > 0 && activeChallenge && (
                          <div className="rounded-2xl border border-rose-500/50 bg-rose-500/15 p-3 text-xs font-bold text-rose-300">
                            ⚠️ {challengeIneligibleCount} of your equipped cars do not meet the <strong>{activeChallenge.title}</strong> restrictions ({activeChallenge.allowedRarity !== "any" ? `${activeChallenge.allowedRarity.toUpperCase()} Only` : ""}{activeChallenge.maxTotalScore ? ` · Max ${activeChallenge.maxTotalScore} PTS` : ""}). Please swap them with qualifying cars to launch the match.
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                          {selectedCarCards.map((car, idx) => {
                            const slotIdx = idx as 0 | 1 | 2;
                            const isLoaner = car.userId === "loaner";
                            const carEligibility = activeChallenge
                              ? isCarEligibleForChallenge(car, activeChallenge)
                              : { eligible: true };
                            return (
                              <div
                                key={`${slotIdx}-${car.id}`}
                                className={`flex flex-col justify-between rounded-2xl border p-2 sm:p-3 ${
                                  !carEligibility.eligible
                                    ? "border-rose-500/80 bg-rose-950/20"
                                    : "border-zinc-800 bg-zinc-950"
                                }`}
                              >
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-black">
                                  <span className="text-amber-400">CAR #{slotIdx + 1}</span>
                                  {!carEligibility.eligible ? (
                                    <span className="rounded bg-rose-500/30 border border-rose-500 px-1.5 py-0.5 text-[9px] text-rose-200 animate-pulse">
                                      INELIGIBLE
                                    </span>
                                  ) : isLoaner ? (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                                      LOANER
                                    </span>
                                  ) : (
                                    <span className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[9px] text-emerald-400">
                                      🔋 {car.battlesRemaining ?? car.maxBattles ?? 6}L
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewerState({ list: selectedCarCards, index: slotIdx })
                                  }
                                  className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                                  aria-label={`View ${car.name}`}
                                >
                                  <FullArtCard card={car} />
                                </button>
                                <div className="mt-2 space-y-1.5">
                                  <p className="truncate text-center text-xs font-black text-white">
                                    {car.name}
                                  </p>
                                  {!carEligibility.eligible && (
                                    <p className="text-center text-[10px] font-bold text-rose-400 leading-tight">
                                      {carEligibility.reason}
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPickerModalTarget({ type: "car", slotIdx })
                                    }
                                    className="min-h-9 w-full rounded-xl border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-black text-amber-300 hover:bg-amber-500/25"
                                  >
                                    🔄 Swap Car #{slotIdx + 1}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-cyan-500/40 bg-zinc-900/90 p-4 shadow-xl sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                              STEP 1B · SELECT YOUR 3 CREW ADVANTAGE CARDS
                            </span>
                            <h3 className="mt-1 text-base font-black text-white sm:text-lg">
                              Your 3 Pit Crew Advantage Cards
                            </h3>
                            <p className="text-xs text-zinc-400">
                              All Crew Cards are 100% positive advantages! You will choose 1 to play on Corner 1, 1 on Corner 2, and your final Crew Card on Corner 3.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCrewIds(pickTopThreeIds(usableCrewCards))}
                              className="rounded-xl border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-500/25"
                            >
                              ⚡ Auto-Pick Best 3
                            </button>
                            <button
                              type="button"
                              disabled={!isLineupEligible}
                              onClick={handleStartTrackRoulette}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-md shadow-amber-500/25 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <span>
                                {!isLineupEligible ? "⚠️ Lineup Invalid" : "Spin UK Track →"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {usingLoanerCrew && (
                          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200">
                            ⚡ Starter Loaner Crew Cards are activated for your empty slots until you pull more Crew Cards from Standard Packs!
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                          {selectedCrewCards.map((crew, idx) => {
                            const slotIdx = idx as 0 | 1 | 2;
                            const isLoaner = crew.userId === "loaner";
                            return (
                              <div
                                key={`${slotIdx}-${crew.id}`}
                                className="flex flex-col justify-between rounded-2xl border border-cyan-500/30 bg-zinc-950 p-2 sm:p-3"
                              >
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-black">
                                  <span className="text-cyan-400">CREW #{slotIdx + 1}</span>
                                  {isLoaner && (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                                      LOANER
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewerState({ list: selectedCrewCards, index: slotIdx })
                                  }
                                  className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                                  aria-label={`View ${crew.name}`}
                                >
                                  <FullArtCard card={crew} />
                                </button>
                                <div className="mt-2 space-y-1.5">
                                  <p className="truncate text-center text-xs font-black text-white flex items-center justify-center gap-1.5">
                                    <span className="text-sm">{crew.crewIcon || resolveCrewDef(crew).icon}</span>
                                    <span className="truncate">{crew.name}</span>
                                  </p>
                                  <p className="line-clamp-2 text-center text-[10px] font-semibold text-cyan-300">
                                    {crew.effect}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPickerModalTarget({ type: "crew", slotIdx })
                                    }
                                    className="min-h-9 w-full rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/25"
                                  >
                                    🔄 Swap Crew #{slotIdx + 1}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 1 Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      {loadoutSection === "cars" ? (
                        <button
                          type="button"
                          onClick={() => setLoadoutSection("crew")}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-sky-500 px-6 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:scale-[1.01] sm:text-sm"
                        >
                          <span>⚡ Next: Select Your 3 Crew Advantage Cards →</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setLoadoutSection("cars")}
                            className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-black text-zinc-200 hover:bg-zinc-800"
                          >
                            ← Back to 3 Car Cards
                          </button>

                          <button
                            type="button"
                            disabled={!isLineupEligible}
                            onClick={handleStartTrackRoulette}
                            className="inline-flex min-h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:scale-[1.01] sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span>
                              {!isLineupEligible
                                ? `⚠️ ${challengeIneligibleCount} Ineligible Car(s) in Lineup`
                                : "🇬🇧 Lock Loadout & Spin UK Track →"}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── STEP 2: UK TRACK ROULETTE ANIMATION & RIVAL LOCK ────── */}
                {phase === "track_roulette" && (
                  <div className="flex min-h-[70dvh] flex-col items-center justify-center space-y-5 text-center">
                    {!trackLockedIn ? (
                      <>
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-4 py-1 text-xs font-black uppercase tracking-widest text-emerald-300 animate-pulse">
                          🇬🇧 Spinning UK Drift Venue Roulette...
                        </span>
                        <h3 className="text-2xl font-black text-white sm:text-3xl">
                          Selecting Track &amp; Challenger...
                        </h3>

                        {(() => {
                          const tracks =
                            trackCatalogDefs.length > 0 ? trackCatalogDefs : UK_TRACK_CARD_SET;
                          const spinningTrack = tracks[rouletteTrackIdx % tracks.length];
                          const spinningCard: MemberCard = {
                            id: spinningTrack.id,
                            userId: "track",
                            ...trackDefinitionToCardData(spinningTrack),
                            styleIds: [],
                            kept: true,
                            rerolled: false,
                            createdAt: 0,
                          };
                          return (
                            <div className="mx-auto w-52 sm:w-60 transition-transform duration-150 scale-105">
                              <FullArtCard card={spinningCard} className="drop-shadow-2xl" />
                            </div>
                          );
                        })()}
                        <p className="text-xs font-bold text-zinc-400">
                          Matching your 3 Cars &amp; 3 Crew Cards against a rival UK driver...
                        </p>
                      </>
                    ) : (
                      <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="space-y-1">
                          <span className="inline-block rounded-full bg-emerald-500 px-3.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-black">
                            🇬🇧 UK Track Locked In!
                          </span>
                          <h3 className="text-2xl font-black text-white sm:text-3xl">
                            {activeTrackDef.icon} {activeTrackDef.name}
                          </h3>
                          <p className="text-xs font-bold text-zinc-400">
                            {activeTrackDef.region} · {activeTrackDef.ability}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 items-center gap-4 rounded-3xl border border-emerald-500/40 bg-zinc-900/90 p-4 text-left sm:grid-cols-[13rem_1fr] sm:p-5">
                          <button
                            type="button"
                            onClick={() =>
                              setViewerState({ list: [activeTrackCard], index: 0 })
                            }
                            className="mx-auto block w-44 sm:w-full rounded-2xl transition-transform hover:-translate-y-0.5"
                            aria-label={`View ${activeTrackCard.name}`}
                          >
                            <FullArtCard card={activeTrackCard} className="drop-shadow-xl" />
                          </button>

                          <div className="space-y-3">
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                🇬🇧 Track Buff · Match Roll
                              </span>
                              <p className="mt-0.5 text-xs font-black text-emerald-200">
                                {activeTrackDef.buffLabel}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                                ⚠️ Track Hazard Debuff · Match Roll
                              </span>
                              <p className="mt-0.5 text-xs font-black text-rose-200">
                                {activeTrackDef.debuffLabel}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                🕵️ Rival Challenger Ready
                              </span>
                              <p className="mt-0.5 text-sm font-black text-white">
                                {opponent.driverName}{" "}
                                <span className="text-xs font-bold text-zinc-400">
                                  ({opponent.teamName})
                                </span>
                              </p>
                              <p className="text-[11px] text-zinc-400">
                                3 Car Cards + 3 Crew Advantage Cards locked face-down
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => startCornerBattle(0)}
                          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:scale-[1.01] sm:text-base"
                        >
                          <span>🏁 Let&apos;s Play: Deploy Car (Corner 1) →</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── STEP 2.5: SELECT CAR CARD FOR CORNER 1 OR 2 (FANNED-OUT HAND SPREAD) ── */}
                {phase === "car_select" &&
                  (() => {
                    const sector = activeSectors[activeCornerIdx];
                    const alreadyDeployed = playerCarAssignments
                      .slice(0, activeCornerIdx)
                      .filter((x): x is 0 | 1 | 2 => x !== null);
                    const availableCarIndices = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
                      (idx) => !alreadyDeployed.includes(idx)
                    );

                    const activeSlot =
                      previewCarSlot !== null && availableCarIndices.includes(previewCarSlot)
                        ? previewCarSlot
                        : availableCarIndices[0];
                    const activeCar = selectedCarCards[activeSlot];
                    const activeSectorScore = scoreCardForSector(activeCar, sector.id);

                    return (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header Banner */}
                        <div className="rounded-3xl border border-amber-500/40 bg-zinc-950/90 p-4 sm:p-5 text-center shadow-xl backdrop-blur-md space-y-2">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs font-black text-amber-300 uppercase tracking-wider">
                              ⚡ CORNER {sector.number} OF 3 TACTICAL DEPLOYMENT
                            </span>
                            <span className="rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">
                              🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                            </span>
                          </div>

                          <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                            Select Car for {sector.name}
                          </h3>

                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-zinc-300">
                            <span>Corner Formula:</span>
                            <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 font-black text-amber-300">
                              {sector.formulaBadge}
                            </span>
                            <span className="text-zinc-400 hidden sm:inline">({sector.subtitle})</span>
                          </div>

                          {/* Dynamic Track Surface Buff & Hazard Callouts */}
                          {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                              {activeTrackDef.buffLabel && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-bold text-emerald-300">
                                  <span>🟢 Track Buff:</span> {activeTrackDef.buffLabel}
                                </span>
                              )}
                              {activeTrackDef.debuffLabel && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-bold text-rose-300">
                                  <span>⚠️ Track Hazard:</span> {activeTrackDef.debuffLabel}
                                </span>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-zinc-400 max-w-md mx-auto">
                            Pick a car card from your hand below to deploy into the tandem clash!
                          </p>
                        </div>

                        {/* Fanned Out Car Hand Spread */}
                        <div className="relative py-4 sm:py-6 overflow-visible">
                          <div className="flex items-end justify-center -space-x-8 sm:-space-x-12 pb-4 w-full max-w-2xl mx-auto overflow-visible">
                            {availableCarIndices.map((slotIdx, spreadIdx) => {
                              const car = selectedCarCards[slotIdx];
                              const sectorScore = scoreCardForSector(car, sector.id);
                              const isSelected = activeSlot === slotIdx;

                              const total = availableCarIndices.length;
                              let fanRotation = "rotate-0";
                              if (total === 3) {
                                if (spreadIdx === 0) fanRotation = "-rotate-6 -translate-y-1";
                                else if (spreadIdx === 1) fanRotation = "rotate-0 -translate-y-3";
                                else if (spreadIdx === 2) fanRotation = "rotate-6 -translate-y-1";
                              } else if (total === 2) {
                                if (spreadIdx === 0) fanRotation = "-rotate-4 -translate-y-2";
                                else if (spreadIdx === 1) fanRotation = "rotate-4 -translate-y-2";
                              }

                              return (
                                <button
                                  key={car.id || slotIdx}
                                  type="button"
                                  onClick={() => setPreviewCarSlot(slotIdx)}
                                  onDoubleClick={() => handleDeployCar(slotIdx)}
                                  className={`group relative flex flex-col items-center rounded-3xl transition-all duration-300 select-none text-left ${fanRotation} ${
                                    isSelected
                                      ? "-translate-y-8 sm:-translate-y-10 scale-105 sm:scale-110 z-30 rotate-0 ring-4 ring-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.7)]"
                                      : "opacity-80 hover:opacity-100 hover:-translate-y-4 hover:scale-102 z-10 shadow-2xl"
                                  }`}
                                >
                                  {/* Overlaid Micro Header Badges */}
                                  <div className="absolute -top-3.5 inset-x-2 z-30 flex items-center justify-between pointer-events-none">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow ${
                                        isSelected
                                          ? "bg-amber-400 text-black border border-amber-300"
                                          : "bg-zinc-900/90 text-zinc-300 border border-zinc-700"
                                      }`}
                                    >
                                      SLOT #{slotIdx + 1}
                                    </span>
                                    <span className="rounded-full bg-emerald-500 text-black font-black px-2 py-0.5 text-[9px] shadow border border-emerald-400">
                                      ⚡ {sectorScore.total}
                                    </span>
                                  </div>

                                  {/* The Full Art Card */}
                                  <div className="w-36 sm:w-48 max-w-[190px] pointer-events-none drop-shadow-xl">
                                    <FullArtCard card={car} />
                                  </div>

                                  {/* Selection Glow / Badge */}
                                  {isSelected && (
                                    <div className="absolute -bottom-3 inset-x-4 z-30 flex justify-center pointer-events-none">
                                      <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black shadow-lg animate-pulse">
                                        ✓ SELECTED
                                      </span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Selected Car Telemetry & Deploy Action Dock */}
                        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-4 sm:p-5 max-w-xl mx-auto shadow-2xl backdrop-blur-md space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                SELECTED DRIFT MACHINE
                              </span>
                              <h4 className="text-base sm:text-lg font-black text-white truncate">
                                {activeCar.name}
                              </h4>
                              <p className="text-[11px] font-bold text-zinc-400">
                                Driver: {activeCar.driver || "Team Pilot"} · {activeCar.team || "Team PHD"}
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                                SECTOR RATING
                              </span>
                              <div className="text-xl sm:text-2xl font-black text-emerald-400">
                                ⚡ {activeSectorScore.total} PTS
                              </div>
                            </div>
                          </div>

                          {/* Base Stats Pills */}
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">DRIFT</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.drift)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">ACCEL</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.accel)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">GRIP</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.grip)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">STEER</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.steer)}</span>
                            </div>
                          </div>

                          {/* Deploy Action Button */}
                          <button
                            type="button"
                            onClick={() => handleDeployCar(activeSlot)}
                            className="mt-2 min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 py-3 text-sm sm:text-base font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(245,158,11,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                          >
                            🏁 Deploy {activeCar.name.split(" ")[0]} into Corner {sector.number} →
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                {/* ── STEP 3: CORNER 1 → CORNER 2 → CORNER 3 BATTLE ────────── */}
                {/* ── STEP 3: ARCADE GAME VIEW CORNER BATTLE (CINEMATIC ARENA) ── */}
                {phase === "corner_battle" &&
                  (() => {
                    const sector = activeSectors[activeCornerIdx];
                    const cornerInfo = {
                      number: sector.number,
                      title: sector.name,
                      subtitle: sector.subtitle,
                      eventDescription: sector.eventDescription,
                      formulaBadge: sector.formulaBadge,
                    };

                    const playerCar = selectedCarCards[playerCarOrder[activeCornerIdx]];
                    const rivalCar = opponent.cards[rivalCarOrder[activeCornerIdx]] ?? opponent.cards[0];

                    // Resolve crew cards based on user's manual selection for this corner (or fallback)
                    const assignedPlayerCrewIdx = playerCrewAssignments[activeCornerIdx] ?? remainingCrewSlotIndices[0] ?? 0;
                    const assignedRivalCrewIdx = rivalCrewAssignments[activeCornerIdx] ?? rivalCrewOrder[activeCornerIdx] ?? 0;
                    const playerCrew = selectedCrewCards[assignedPlayerCrewIdx];
                    const rivalCrew = rivalCrewCards[assignedRivalCrewIdx];
                    const playerDebuffDef = playerMatchDebuffs[activeCornerIdx];
                    const rivalDebuffDef = rivalMatchDebuffs[activeCornerIdx];
                    const currentResult = cornerResults[activeCornerIdx];

                    // Base Stats (Normalized)
                    const pBase = getNormalizedCardStats(playerCar);
                    const rBase = getNormalizedCardStats(rivalCar);

                    // Crew Stats
                    const pCrewDef = resolveCrewDef(playerCrew);
                    const rCrewDef = resolveCrewDef(rivalCrew);
                    const pCrewMods = pCrewDef.modifiers;
                    const rCrewMods = rCrewDef.modifiers;

                    const pCrewStats = applyCrewModsToStats(pBase, pCrewMods);
                    const rCrewStats = applyCrewModsToStats(rBase, rCrewMods);

                    // Track & Debuff Stats (shielded by crew debuffShield)
                    const pShield = Math.min(1, Math.max(0, pCrewMods?.debuffShield ?? 0));
                    const rShield = Math.min(1, Math.max(0, rCrewMods?.debuffShield ?? 0));

                    const tRules = activeTrackDef.rules ?? {};
                    const pTrackBreakdown = computeTrackBreakdown({
                      card: playerCar,
                      trackCard: activeTrackDef,
                      shield: pShield,
                    });
                    const rTrackBreakdown = computeTrackBreakdown({
                      card: rivalCar,
                      trackCard: activeTrackDef,
                      shield: rShield,
                    });

                    const pDebuffBreakdown = computeDebuffBreakdown({
                      card: playerCar,
                      debuffCard: playerDebuffDef,
                      trackCard: activeTrackDef,
                      shield: pShield,
                    });

                    const rDebuffBreakdown = computeDebuffBreakdown({
                      card: rivalCar,
                      debuffCard: rivalDebuffDef,
                      trackCard: activeTrackDef,
                      shield: rShield,
                    });

                    const pTrackStats = {
                      drift: Math.min(25, pCrewStats.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, pCrewStats.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, pCrewStats.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, pCrewStats.steer + (tRules.steerBuff ?? 0)),
                    };
                    const rTrackStats = {
                      drift: Math.min(25, rCrewStats.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, rCrewStats.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, rCrewStats.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, rCrewStats.steer + (tRules.steerBuff ?? 0)),
                    };

                    const pFinalStats = {
                      drift: Math.max(1, pTrackStats.drift - pDebuffBreakdown.effectiveDriftPenalty),
                      accel: Math.max(1, pTrackStats.accel - pDebuffBreakdown.effectiveAccelPenalty),
                      grip: Math.max(1, pTrackStats.grip - pDebuffBreakdown.effectiveGripPenalty),
                      steer: Math.max(1, pTrackStats.steer - pDebuffBreakdown.effectiveSteerPenalty),
                    };
                    const rFinalStats = {
                      drift: Math.max(1, rTrackStats.drift - rDebuffBreakdown.effectiveDriftPenalty),
                      accel: Math.max(1, rTrackStats.accel - rDebuffBreakdown.effectiveAccelPenalty),
                      grip: Math.max(1, rTrackStats.grip - rDebuffBreakdown.effectiveGripPenalty),
                      steer: Math.max(1, rTrackStats.steer - rDebuffBreakdown.effectiveSteerPenalty),
                    };

                    const isCrewStage =
                      battleAnimStep === "crew_overlay" ||
                      battleAnimStep === "battle_shake_1" ||
                      battleAnimStep === "prompt_debuff";
                    const isPromptCrew = battleAnimStep === "prompt_crew";
                    const isDebuffOrLater =
                      battleAnimStep === "debuff_overlay" ||
                      battleAnimStep === "battle_shake_2" ||
                      battleAnimStep === "knockout_and_winner" ||
                      battleAnimStep === "corner_finished";

                    // During prompt_crew, compute live preview diffs directly from previewCrewIdx
                    const activePreviewCrewCard = selectedCrewCards[previewCrewIdx ?? remainingCrewSlotIndices[0] ?? 0];
                    const activePreviewCrewDef = resolveCrewDef(activePreviewCrewCard);
                    const previewMods = activePreviewCrewDef?.modifiers ?? {};
                    const previewCrewStats = applyCrewModsToStats(pBase, previewMods);

                    const pDisplayStats = isDebuffOrLater
                      ? pFinalStats
                      : isCrewStage
                        ? pCrewStats
                        : isPromptCrew
                          ? previewCrewStats
                          : pBase;

                    const rDisplayStats = isDebuffOrLater
                      ? rFinalStats
                      : isCrewStage
                        ? rCrewStats
                        : rBase;

                    // Diffs calculation
                    const pDiffTarget = isDebuffOrLater
                      ? pFinalStats
                      : isCrewStage
                        ? pCrewStats
                        : isPromptCrew
                          ? previewCrewStats
                          : pBase;
                    const pDiffBase = isDebuffOrLater ? pCrewStats : pBase;

                    const pDiffs = {
                      drift: (isCrewStage || isPromptCrew || isDebuffOrLater) && pDiffTarget.drift !== pDiffBase.drift
                        ? getStatDiffInfo(pDiffTarget.drift, pDiffBase.drift)
                        : null,
                      accel: (isCrewStage || isPromptCrew || isDebuffOrLater) && pDiffTarget.accel !== pDiffBase.accel
                        ? getStatDiffInfo(pDiffTarget.accel, pDiffBase.accel)
                        : null,
                      grip: (isCrewStage || isPromptCrew || isDebuffOrLater) && pDiffTarget.grip !== pDiffBase.grip
                        ? getStatDiffInfo(pDiffTarget.grip, pDiffBase.grip)
                        : null,
                      steer: (isCrewStage || isPromptCrew || isDebuffOrLater) && pDiffTarget.steer !== pDiffBase.steer
                        ? getStatDiffInfo(pDiffTarget.steer, pDiffBase.steer)
                        : null,
                    };

                    const rDiffTarget = isDebuffOrLater
                      ? rFinalStats
                      : isCrewStage
                        ? rCrewStats
                        : rBase;
                    const rDiffBase = isDebuffOrLater ? rCrewStats : rBase;

                    const rDiffs = {
                      drift: (isCrewStage || isDebuffOrLater) && rDiffTarget.drift !== rDiffBase.drift
                        ? getStatDiffInfo(rDiffTarget.drift, rDiffBase.drift)
                        : null,
                      accel: (isCrewStage || isDebuffOrLater) && rDiffTarget.accel !== rDiffBase.accel
                        ? getStatDiffInfo(rDiffTarget.accel, rDiffBase.accel)
                        : null,
                      grip: (isCrewStage || isDebuffOrLater) && rDiffTarget.grip !== rDiffBase.grip
                        ? getStatDiffInfo(rDiffTarget.grip, rDiffBase.grip)
                        : null,
                      steer: (isCrewStage || isDebuffOrLater) && rDiffTarget.steer !== rDiffBase.steer
                        ? getStatDiffInfo(rDiffTarget.steer, rDiffBase.steer)
                        : null,
                    };

                    const showPlayerCrewGlow = isCrewStage || (isPromptCrew && previewCrewIdx !== null);
                    const showPlayerStatChanges = isCrewStage || isDebuffOrLater || (isPromptCrew && previewCrewIdx !== null);

                    const pBaseCornerScore = scoreCardForSector(playerCar, sector.id).total;
                    const rBaseCornerScore = scoreCardForSector(rivalCar, sector.id).total;

                    const pPreviewScore =
                      scoreCardForSector(
                        {
                          ...playerCar,
                          stats: {
                            drift: String(previewCrewStats.drift),
                            accel: String(previewCrewStats.accel),
                            grip: String(previewCrewStats.grip),
                            steer: String(previewCrewStats.steer),
                          },
                        },
                        sector.id
                      ).total + (previewMods.flatBonus ?? 0);

                    const pCrewScore =
                      scoreCardForSector(
                        {
                          ...playerCar,
                          stats: {
                            drift: String(pCrewStats.drift),
                            accel: String(pCrewStats.accel),
                            grip: String(pCrewStats.grip),
                            steer: String(pCrewStats.steer),
                          },
                        },
                        sector.id
                      ).total + (pCrewMods.flatBonus ?? 0);

                    const rCrewScore =
                      scoreCardForSector(
                        {
                          ...rivalCar,
                          stats: {
                            drift: String(rCrewStats.drift),
                            accel: String(rCrewStats.accel),
                            grip: String(rCrewStats.grip),
                            steer: String(rCrewStats.steer),
                          },
                        },
                        sector.id
                      ).total + (rCrewMods.flatBonus ?? 0);

                    const pScore = isDebuffOrLater
                      ? (currentResult?.playerScore ?? pCrewScore)
                      : isCrewStage
                        ? pCrewScore
                        : isPromptCrew
                          ? pPreviewScore
                          : pBaseCornerScore;

                    const rScore = isDebuffOrLater
                      ? (currentResult?.rivalScore ?? rCrewScore)
                      : isCrewStage
                        ? rCrewScore
                        : rBaseCornerScore;

                    // Dynamic card class positioning for Player
                    let pCardClass = "transition-all duration-500 will-change-transform ";
                    if (battleAnimStep === "cards_entrance") {
                      pCardClass += "-translate-x-8 opacity-80 rotate-2 duration-700 ease-out";
                    } else if (battleAnimStep === "head_to_head" || battleAnimStep === "prompt_crew" || battleAnimStep === "prompt_debuff") {
                      pCardClass += "translate-x-[12%] sm:translate-x-[16%] scale-100 rotate-1 z-20 duration-500";
                    } else if (battleAnimStep === "crew_overlay") {
                      pCardClass += "translate-x-[12%] sm:translate-x-[16%] scale-105 rotate-1 z-20 duration-300";
                    } else if (battleAnimStep === "battle_shake_1") {
                      pCardClass += "translate-x-[20%] sm:translate-x-[26%] rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "debuff_overlay") {
                      pCardClass += "translate-x-[6%] sm:translate-x-[8%] rotate-1 z-20";
                    } else if (battleAnimStep === "battle_shake_2") {
                      pCardClass += "translate-x-[24%] sm:translate-x-[34%] rotate-6 animate-clash-shake z-20";
                    } else if (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") {
                      if (currentResult?.won) {
                        pCardClass += "translate-x-[40%] sm:translate-x-[46%] scale-110 rotate-0 animate-winner-pulse z-30 drop-shadow-[0_0_35px_rgba(245,158,11,0.85)]";
                      } else if (currentResult?.tied) {
                        pCardClass += "translate-x-[12%] scale-105 rotate-1 z-20";
                      } else {
                        pCardClass += "animate-spinout-left z-10 pointer-events-none";
                      }
                    }

                    // Dynamic card class positioning for Rival
                    let rCardClass = "transition-all duration-500 will-change-transform ";
                    if (battleAnimStep === "cards_entrance") {
                      rCardClass += "translate-x-8 opacity-80 -rotate-2 duration-700 ease-out";
                    } else if (battleAnimStep === "head_to_head" || battleAnimStep === "prompt_crew" || battleAnimStep === "prompt_debuff") {
                      rCardClass += "-translate-x-[12%] sm:-translate-x-[16%] scale-100 -rotate-1 z-20 duration-500";
                    } else if (battleAnimStep === "crew_overlay") {
                      rCardClass += "-translate-x-[12%] sm:-translate-x-[16%] scale-105 -rotate-1 z-20 duration-300";
                    } else if (battleAnimStep === "battle_shake_1") {
                      rCardClass += "-translate-x-[20%] sm:-translate-x-[26%] -rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "debuff_overlay") {
                      rCardClass += "-translate-x-[6%] sm:-translate-x-[8%] -rotate-1 z-20";
                    } else if (battleAnimStep === "battle_shake_2") {
                      rCardClass += "-translate-x-[24%] sm:-translate-x-[34%] -rotate-6 animate-clash-shake z-20";
                    } else if (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") {
                      if (!currentResult?.won && !currentResult?.tied) {
                        rCardClass += "-translate-x-[40%] sm:-translate-x-[46%] scale-110 rotate-0 animate-winner-pulse z-30 drop-shadow-[0_0_35px_rgba(244,63,94,0.85)]";
                      } else if (currentResult?.tied) {
                        rCardClass += "-translate-x-[12%] scale-105 -rotate-1 z-20";
                      } else {
                        rCardClass += "animate-spinout-right z-10 pointer-events-none";
                      }
                    }

                    return (
                      <div className="space-y-3.5">
                        {/* 3-Corner Progress Stepper */}
                        <div className="grid grid-cols-3 gap-2">
                          {activeSectors.map((c, idx) => {
                            const done = idx < activeCornerIdx;
                            const currentStep = idx === activeCornerIdx;
                            const res = cornerResults[idx];
                            return (
                              <button
                                key={`${c.id}-${idx}`}
                                type="button"
                                onClick={() => startCornerBattle(idx as 0 | 1 | 2)}
                                className={`rounded-xl border px-3 py-2 text-center transition-all ${
                                  currentStep
                                    ? "border-amber-500 bg-amber-500/15 text-white ring-2 ring-amber-500/40"
                                    : done && res
                                      ? res.won
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                        : res.tied
                                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                          : "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                      : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800"
                                }`}
                              >
                                <span className="block text-[10px] font-black uppercase truncate">
                                  {c.icon} Corner {c.number}
                                </span>
                                <span className="block text-[9px] font-bold text-zinc-400 truncate">
                                  {c.name.split("·")[1]?.trim() ?? c.name}
                                </span>
                                <span className="text-[11px] font-extrabold">
                                  {done && res
                                    ? res.won
                                      ? `Won (${res.playerScore}–${res.rivalScore})`
                                      : res.tied
                                        ? `Tied (${res.playerScore}–${res.rivalScore})`
                                        : `Lost (${res.playerScore}–${res.rivalScore})`
                                    : currentStep
                                      ? battleAnimStep === "cards_entrance"
                                        ? "Cars Entering..."
                                        : battleAnimStep === "head_to_head"
                                          ? "Head to Head! ⚔️"
                                          : battleAnimStep === "prompt_crew"
                                            ? "Pick Crew Card ⚡"
                                            : battleAnimStep === "crew_overlay"
                                              ? "Crew Advantage!"
                                              : battleAnimStep === "battle_shake_1" || battleAnimStep === "battle_shake_2"
                                                ? "Tandem Clash!"
                                                : battleAnimStep === "debuff_overlay"
                                                  ? "Debuffs Applied!"
                                                  : battleAnimStep === "knockout_and_winner"
                                                    ? (currentResult?.won ? "You Won!" : currentResult?.tied ? "Dead Heat Tie! ⚖️" : "Rival Won!")
                                                    : "Corner Done"
                                      : "Upcoming"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Top Telemetry & Track Banner */}
                        <div className="flex flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                                🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                              </span>
                              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
                                {cornerInfo.formulaBadge}
                              </span>
                              <span className="text-xs font-black text-white">
                                {sector.icon} {cornerInfo.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-black text-zinc-200 border border-zinc-700">
                                SCORE: <strong className="text-amber-400">{runningScore.you}</strong> – <strong className="text-rose-400">{runningScore.rival}</strong>
                              </span>
                              {battleAnimStep !== "corner_finished" && (
                                <button
                                  type="button"
                                  onClick={handleSkipBattleAnimation}
                                  className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700"
                                >
                                  ⚡ Skip Animation
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Dynamic Track Surface Buff & Hazard Sub-strip */}
                          {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-zinc-800/60 text-[10px]">
                              <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">TRACK CONDITIONS:</span>
                              {activeTrackDef.buffLabel && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-300">
                                  <span>🟢 Buff:</span> {activeTrackDef.buffLabel}
                                </span>
                              )}
                              {activeTrackDef.debuffLabel && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 font-bold text-rose-300">
                                  <span>⚠️ Hazard:</span> {activeTrackDef.debuffLabel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ── ARCADE GAME VIEW BATTLE ARENA ── */}
                        <div className="relative min-h-[500px] sm:min-h-[540px] w-full overflow-hidden rounded-3xl border-2 border-amber-500/30 bg-gradient-to-b from-zinc-950 via-zinc-900 to-black p-3 sm:p-5 shadow-2xl">
                          {/* Asphalt track curbs & markings */}
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,#ef4444_0,#ef4444_20px,#ffffff_20px,#ffffff_40px)] opacity-60" />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,#ef4444_0,#ef4444_20px,#ffffff_20px,#ffffff_40px)] opacity-60" />
                          <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 border-l border-dashed border-zinc-700/60" />
                          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-36 w-36 rounded-full border border-amber-500/20 bg-amber-500/5 blur-[1px]" />

                          {/* Stage Grid: Left (Player) vs Right (Rival) */}
                          <div className="relative z-10 grid grid-cols-2 items-start gap-2 sm:gap-6 min-h-[380px]">
                            {/* PLAYER SIDE (LEFT) */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between px-1">
                                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-amber-300">
                                  YOU · {playerCar.name.split(" ")[0]}
                                </span>
                                <span className="text-xs font-black text-amber-400">
                                  {pScore} PTS
                                </span>
                              </div>

                              {/* Player Card Container */}
                              <div className={`relative mx-auto w-32 sm:w-44 max-w-full ${pCardClass}`}>
                                {/* Crew Glow Aura around Player Card */}
                                {showPlayerCrewGlow && (
                                  <>
                                    <div className="pointer-events-none absolute -inset-2.5 sm:-inset-3.5 rounded-3xl bg-gradient-to-r from-amber-400/50 via-yellow-300/40 to-emerald-400/50 blur-xl animate-pulse z-0" />
                                    <div className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.85)] animate-pulse z-20" />
                                  </>
                                )}

                                {/* Floating Stat Value Changes Animated Directly Over Player Card */}
                                {showPlayerStatChanges && (
                                  <div className="pointer-events-none absolute inset-x-0 top-2 sm:top-3 z-30 flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                                    <div className="flex flex-wrap justify-center gap-1 px-1">
                                      {pDiffs.drift && pDiffs.drift.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.drift.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">DRIFT</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.drift.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.accel && pDiffs.accel.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.accel.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">ACCEL</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.accel.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.grip && pDiffs.grip.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.grip.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">GRIP</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.grip.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.steer && pDiffs.steer.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.steer.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">STEER</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.steer.text}
                                          </span>
                                        </div>
                                      )}
                                      {/* Flat Score Points Bonus */}
                                      {(isCrewStage || isPromptCrew) && (() => {
                                        const activeMods = isPromptCrew ? previewMods : isCrewStage ? pCrewMods : null;
                                        const flatPts = activeMods?.flatBonus ?? 0;
                                        if (flatPts <= 0) return null;
                                        return (
                                          <div className="animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 border-amber-400 px-1.5 py-0.5 shadow-lg text-amber-300">
                                            <span className="text-[8px] sm:text-[9px] font-black uppercase">BONUS</span>
                                            <span className="text-xs sm:text-sm font-black">+{flatPts} PTS</span>
                                          </div>
                                        );
                                      })()}
                                      {/* Debuff Shield Indicator */}
                                      {(isCrewStage || isPromptCrew) && (() => {
                                        const activeMods = isPromptCrew ? previewMods : isCrewStage ? pCrewMods : null;
                                        const shield = activeMods?.debuffShield ?? 0;
                                        if (shield <= 0) return null;
                                        return (
                                          <div className="animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 border-cyan-400 px-1.5 py-0.5 shadow-lg text-cyan-300">
                                            <span className="text-[8px] sm:text-[9px] font-black uppercase">SHIELD</span>
                                            <span className="text-xs sm:text-sm font-black">{Math.round(shield * 100)}%</span>
                                          </div>
                                        );
                                      })()}

                                      {/* PROMINENT TOTAL DEBUFF SUMMARY BADGE */}
                                      {isDebuffOrLater && pDebuffBreakdown.hasAnyDebuff && (
                                        <div className="animate-pulse flex items-center justify-center gap-1 rounded-xl bg-rose-950/95 border-2 border-rose-500 px-2 py-0.5 shadow-[0_0_15px_rgba(244,63,94,0.7)] text-white w-full max-w-[200px]">
                                          <span className="text-[10px]">⚠️</span>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                                            TOTAL:
                                          </span>
                                          <span className="text-[10px] sm:text-xs font-black text-rose-100 truncate">
                                            {pDebuffBreakdown.totalSummary}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <FullArtCard
                                  card={{
                                    ...playerCar,
                                    stats: {
                                      drift: String(pDisplayStats.drift),
                                      accel: String(pDisplayStats.accel),
                                      grip: String(pDisplayStats.grip),
                                      steer: String(pDisplayStats.steer),
                                    },
                                  }}
                                  className="drop-shadow-2xl"
                                />

                                {/* Debuff Micro Badge */}
                                {isDebuffOrLater && (
                                  <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 rounded-lg border border-rose-500/80 bg-zinc-950/95 py-0.5 px-1.5 shadow-xl backdrop-blur-md">
                                    <span className="text-xs shrink-0">{playerDebuffDef.icon}</span>
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate">
                                      {playerDebuffDef.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* RIVAL SIDE (RIGHT) */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between px-1">
                                <span className="truncate text-xs font-black text-rose-400">
                                  {rScore} PTS
                                </span>
                                <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate max-w-[100px]">
                                  {opponent.driverName}
                                </span>
                              </div>

                              {/* Rival Card Container */}
                              <div className={`relative mx-auto w-32 sm:w-44 max-w-full ${rCardClass}`}>
                                {/* Crew Glow Aura around Rival Card */}
                                {isCrewStage && (
                                  <>
                                    <div className="pointer-events-none absolute -inset-2.5 sm:-inset-3.5 rounded-3xl bg-gradient-to-r from-rose-500/50 via-amber-400/40 to-pink-500/50 blur-xl animate-pulse z-0" />
                                    <div className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.85)] animate-pulse z-20" />
                                  </>
                                )}

                                {/* Floating Stat Value Changes Animated Directly Over Rival Card */}
                                {(isCrewStage || isDebuffOrLater) && (
                                  <div className="pointer-events-none absolute inset-x-0 top-2 sm:top-3 z-30 flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                                    <div className="flex flex-wrap justify-center gap-1 px-1">
                                      {rDiffs.drift && rDiffs.drift.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.drift.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">DRIFT</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.drift.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.accel && rDiffs.accel.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.accel.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">ACCEL</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.accel.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.grip && rDiffs.grip.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.grip.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">GRIP</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.grip.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.steer && rDiffs.steer.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.steer.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">STEER</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.steer.text}
                                          </span>
                                        </div>
                                      )}

                                      {/* PROMINENT TOTAL DEBUFF SUMMARY BADGE FOR RIVAL */}
                                      {isDebuffOrLater && rDebuffBreakdown.hasAnyDebuff && (
                                        <div className="animate-pulse flex items-center justify-center gap-1 rounded-xl bg-rose-950/95 border-2 border-rose-500 px-2 py-0.5 shadow-[0_0_15px_rgba(244,63,94,0.7)] text-white w-full max-w-[200px]">
                                          <span className="text-[10px]">⚠️</span>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                                            TOTAL:
                                          </span>
                                          <span className="text-[10px] sm:text-xs font-black text-rose-100 truncate">
                                            {rDebuffBreakdown.totalSummary}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <FullArtCard
                                  card={{
                                    ...rivalCar,
                                    stats: {
                                      drift: String(rDisplayStats.drift),
                                      accel: String(rDisplayStats.accel),
                                      grip: String(rDisplayStats.grip),
                                      steer: String(rDisplayStats.steer),
                                    },
                                  }}
                                  className="drop-shadow-2xl"
                                />

                                {/* Debuff Micro Badge */}
                                {isDebuffOrLater && (
                                  <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 rounded-lg border border-rose-500/80 bg-zinc-950/95 py-0.5 px-1.5 shadow-xl backdrop-blur-md">
                                    <span className="text-xs shrink-0">{rivalDebuffDef.icon}</span>
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate">
                                      {rivalDebuffDef.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center Battle Indicator: Head-to-Head */}
                          {battleAnimStep === "head_to_head" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-amber-400 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
                                <span className="text-xl">⚔️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                  HEAD-TO-HEAD FACE-OFF!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Staging at the start line!</p>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator 1: Battle Shake 1 */}
                          {battleAnimStep === "battle_shake_1" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-amber-400 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
                                <span className="text-xl">⚡</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                  DOOR-TO-DOOR TANDEM CLASH!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Cars rubbing doors in the clipping zone!</p>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator: Debuff Overlay Hit */}
                          {battleAnimStep === "debuff_overlay" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200 px-3">
                              <div className="inline-block rounded-2xl border-2 border-rose-500 bg-zinc-950/95 p-3 sm:px-6 sm:py-3.5 shadow-[0_0_35px_rgba(244,63,94,0.7)] backdrop-blur-md">
                                <span className="text-2xl animate-pulse">⚠️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-400">
                                  CORNER DEBUFFS APPLIED!
                                </p>
                                <div className="mt-1.5 flex flex-col sm:flex-row items-center justify-center gap-2 text-[10px] sm:text-[11px] font-bold text-zinc-200">
                                  <div className="flex items-center gap-1 rounded-lg bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 text-rose-200">
                                    <span>YOU:</span>
                                    <span className="text-white font-extrabold">{playerDebuffDef.name}</span>
                                    <span className="text-rose-300">({pDebuffBreakdown.totalSummary})</span>
                                  </div>
                                  <div className="flex items-center gap-1 rounded-lg bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 text-rose-200">
                                    <span>RIVAL:</span>
                                    <span className="text-white font-extrabold">{rivalDebuffDef.name}</span>
                                    <span className="text-rose-300">({rDebuffBreakdown.totalSummary})</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ── INTERACTIVE CREW CARD SPREAD AT BOTTOM (OPTIMIZED FOR MOBILE) ── */}
                          {battleAnimStep === "prompt_crew" && (
                            <div className="absolute inset-x-0 bottom-2 sm:bottom-3 z-40 flex flex-col items-center px-2 animate-in slide-in-from-bottom-4 duration-300">
                              {/* Micro instruction pill */}
                              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/95 border border-amber-500/50 px-3 py-0.5 shadow-lg backdrop-blur-md">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                                  ⚡ SELECT CREW CARD ({remainingCrewSlotIndices.length} Available)
                                </span>
                              </div>

                              {/* Overlapping Hand Spread of Crew Cards */}
                              <div className="flex items-end justify-center -space-x-4 sm:-space-x-6 pb-1.5 w-full max-w-md mx-auto">
                                {remainingCrewSlotIndices.map((crewIdx, spreadIdx) => {
                                  const crewCard = selectedCrewCards[crewIdx];
                                  const def = resolveCrewDef(crewCard);
                                  const mods = def.modifiers;
                                  const isSelected = previewCrewIdx === crewIdx;

                                  const total = remainingCrewSlotIndices.length;
                                  let fanRotation = "rotate-0";
                                  if (total === 3) {
                                    if (spreadIdx === 0) fanRotation = "-rotate-3";
                                    else if (spreadIdx === 2) fanRotation = "rotate-3";
                                  } else if (total === 2) {
                                    if (spreadIdx === 0) fanRotation = "-rotate-2";
                                    else if (spreadIdx === 1) fanRotation = "rotate-2";
                                  }

                                  return (
                                    <button
                                      key={crewCard.id || crewIdx}
                                      type="button"
                                      onClick={() => setPreviewCrewIdx(crewIdx)}
                                      className={`group relative flex flex-col justify-between w-28 sm:w-32 h-36 sm:h-40 rounded-2xl border-2 p-2.5 text-left transition-all duration-200 select-none ${fanRotation} ${
                                        isSelected
                                          ? "-translate-y-4 scale-105 z-30 rotate-0 border-amber-400 bg-gradient-to-b from-amber-950/95 via-zinc-900 to-black shadow-[0_0_30px_rgba(245,158,11,0.65)] ring-2 ring-amber-400/80"
                                          : "border-zinc-700 bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 hover:border-zinc-500 hover:-translate-y-1 z-10 opacity-90 shadow-xl"
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-xl sm:text-2xl drop-shadow">{def.icon}</span>
                                          {isSelected && (
                                            <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[8px] font-black uppercase text-black">
                                              ✓
                                            </span>
                                          )}
                                        </div>
                                        <span className="mt-1 block text-[8px] font-black uppercase tracking-wider text-amber-400 truncate">
                                          {def.category || "Tactical"}
                                        </span>
                                        <h5 className="text-[11px] sm:text-xs font-black text-white line-clamp-2 leading-tight">
                                          {crewCard.name}
                                        </h5>
                                      </div>

                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {mods.driftBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.driftBonus} D
                                          </span>
                                        ) : null}
                                        {mods.accelBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.accelBonus} A
                                          </span>
                                        ) : null}
                                        {mods.gripBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.gripBonus} G
                                          </span>
                                        ) : null}
                                        {mods.steerBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.steerBonus} S
                                          </span>
                                        ) : null}
                                        {mods.boostWeakestStat ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.boostWeakestStat} Low Stat
                                          </span>
                                        ) : null}
                                        {mods.minStatFloor ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            Floor {mods.minStatFloor}
                                          </span>
                                        ) : null}
                                        {mods.flatBonus ? (
                                          <span className="rounded bg-amber-500/25 border border-amber-400/60 px-1 py-0.5 text-[9px] font-black text-amber-300">
                                            +{mods.flatBonus} Pts
                                          </span>
                                        ) : null}
                                        {mods.underdogBonus ? (
                                          <span className="rounded bg-amber-500/25 border border-amber-400/60 px-1 py-0.5 text-[9px] font-black text-amber-300">
                                            +{mods.underdogBonus} Underdog
                                          </span>
                                        ) : null}
                                        {mods.giantSlayerBonus ? (
                                          <span className="rounded bg-pink-500/25 border border-pink-400/60 px-1 py-0.5 text-[9px] font-black text-pink-300">
                                            +{mods.giantSlayerBonus} Slayer
                                          </span>
                                        ) : null}
                                        {mods.debuffShield ? (
                                          <span className="rounded bg-cyan-500/25 border border-cyan-400/60 px-1 py-0.5 text-[9px] font-black text-cyan-300">
                                            🛡️ {Math.round(mods.debuffShield * 100)}%
                                          </span>
                                        ) : null}
                                        {mods.cornerSpecialist ? (
                                          <span className="rounded bg-purple-500/25 border border-purple-400/60 px-1 py-0.5 text-[9px] font-black text-purple-300">
                                            +{mods.cornerSpecialist.bonusPoints} Spec
                                          </span>
                                        ) : null}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Confirm Button */}
                              <button
                                type="button"
                                onClick={() => handleApplyCrewAndResumeBattle(previewCrewIdx ?? remainingCrewSlotIndices[0] ?? 0, activeCornerIdx)}
                                className="inline-flex min-h-10 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(245,158,11,0.55)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                              >
                                <span>⚡ Apply Crew &amp; Clash! →</span>
                              </button>
                            </div>
                          )}

                          {/* ── INTERACTIVE FUNNY TRACK HAZARD INCIDENT POPUP (1 of 20 SCENARIOS) ── */}
                          {battleAnimStep === "prompt_debuff" && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
                              <div className="relative w-full max-w-sm sm:max-w-md rounded-3xl border-2 border-amber-500/80 bg-zinc-950 p-5 sm:p-6 shadow-[0_0_60px_rgba(245,158,11,0.5)] text-center">
                                {/* Header Badge */}
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-500/20 px-3 py-1 mb-2">
                                  <span className="text-xs animate-pulse">⚠️</span>
                                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-300">
                                    Corner {activeCornerIdx + 1} Hazard Incident
                                  </span>
                                </div>

                                {/* Animated Big Emoji Circle */}
                                <div className="mx-auto my-3 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-amber-500/20 via-zinc-900 to-black text-4xl sm:text-5xl shadow-[0_0_25px_rgba(245,158,11,0.3)] animate-bounce">
                                  {debuffScenario?.icon || "⚠️"}
                                </div>

                                {/* Title */}
                                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white mt-1">
                                  {debuffScenario?.title || "Track Incident!"}
                                </h3>

                                {/* Small Description */}
                                <p className="text-xs sm:text-sm text-zinc-300 mt-2 px-1 leading-relaxed">
                                  {debuffScenario?.description || "A sudden mishap on the track disrupted corner entry!"}
                                </p>

                                {/* Debuffs Notice Box */}
                                <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-950/25 p-3 text-left">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-rose-300">
                                      Incoming Hazard Penalties
                                    </span>
                                    <span className="text-[8px] font-bold text-zinc-400">
                                      Applied on Continue
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between rounded-xl bg-black/60 px-2.5 py-1.5 border border-zinc-800">
                                      <span className="text-[9px] font-black text-rose-400 shrink-0">YOU:</span>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-xs">{playerDebuffDef.icon}</span>
                                        <span className="text-[11px] font-extrabold text-white truncate max-w-[140px]">
                                          {playerDebuffDef.name}
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-black text-rose-300 shrink-0">
                                        {pDebuffBreakdown.hasAnyDebuff ? pDebuffBreakdown.totalSummary : "No Debuff"}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-black/60 px-2.5 py-1.5 border border-zinc-800">
                                      <span className="text-[9px] font-black text-zinc-400 shrink-0">RIVAL:</span>
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-xs">{rivalDebuffDef.icon}</span>
                                        <span className="text-[11px] font-extrabold text-white truncate max-w-[140px]">
                                          {rivalDebuffDef.name}
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-black text-rose-300 shrink-0">
                                        {rDebuffBreakdown.hasAnyDebuff ? rDebuffBreakdown.totalSummary : "No Debuff"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Continue Button */}
                                <button
                                  type="button"
                                  onClick={handleContinueFromDebuff}
                                  className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                                >
                                  <span>Continue &amp; Apply Debuffs</span>
                                  <span className="text-base">→</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator 2: Battle Shake 2 */}
                          {battleAnimStep === "battle_shake_2" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-rose-500 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(244,63,94,0.6)]">
                                <span className="text-xl">💥</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-300">
                                  FINAL APEX TRANSITION!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Full throttle into the outer clip!</p>
                              </div>
                            </div>
                          )}

                          {/* Knockout & Winner Celebratory Banner */}
                          {(battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") && currentResult && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-40 text-center animate-in zoom-in-75 duration-400">
                              <div className={`inline-block rounded-3xl border-2 px-6 py-4 shadow-2xl backdrop-blur-md ${
                                currentResult.won
                                  ? "border-amber-400 bg-black/90 shadow-[0_0_50px_rgba(245,158,11,0.7)]"
                                  : currentResult.tied
                                    ? "border-amber-400 bg-black/90 shadow-[0_0_50px_rgba(245,158,11,0.7)]"
                                    : "border-rose-500 bg-black/90 shadow-[0_0_50px_rgba(244,63,94,0.7)]"
                              }`}>
                                <span className="text-3xl sm:text-4xl">
                                  {currentResult.won ? "🏆" : currentResult.tied ? "⚖️" : "💥"}
                                </span>
                                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
                                  {currentResult.won
                                    ? `CORNER ${activeCornerIdx + 1} WON!`
                                    : currentResult.tied
                                      ? "DEAD HEAT TIE!"
                                      : `RIVAL TAKES CORNER ${activeCornerIdx + 1}!`}
                                </h3>
                                <p className={`mt-1 text-xs sm:text-sm font-black ${
                                  currentResult.won ? "text-emerald-400" : currentResult.tied ? "text-amber-400" : "text-rose-400"
                                }`}>
                                  {currentResult.playerScore} PTS vs {currentResult.rivalScore} PTS
                                  {currentResult.won && ` (+${currentResult.playerScore - currentResult.rivalScore} PTS LEAD)`}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── STEP 3 FOOTER / NEXT CORNER ACTION BUTTON ── */}
                        {battleAnimStep === "corner_finished" && (
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 animate-in fade-in slide-in-from-bottom-3 duration-400">
                            <button
                              type="button"
                              onClick={() => startCornerBattle(activeCornerIdx)}
                              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                            >
                              🔄 Replay Corner {activeCornerIdx + 1}
                            </button>

                            <button
                              type="button"
                              onClick={handleNextCornerOrVerdict}
                              className="inline-flex min-h-13 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-7 py-3 text-sm font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:scale-[1.02] transition-transform"
                            >
                              {activeCornerIdx === 0
                                ? "🏁 Onto Corner 2 →"
                                : activeCornerIdx === 1
                                  ? "🏁 Onto Final Corner 3 →"
                                  : "🏆 View Final Scores & Verdict →"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* ── STEP 4: FINAL PODIUM VERDICT ───────────────────────── */}
                {phase === "verdict" && battleBanner && (
                  <div className="space-y-4">
                    <div
                      className={`rounded-3xl border-2 p-5 text-center shadow-2xl ${
                        battleBanner.won
                          ? "border-emerald-400/60 bg-gradient-to-b from-emerald-950/80 via-zinc-950 to-black"
                          : "border-rose-500/50 bg-gradient-to-b from-rose-950/70 via-zinc-950 to-black"
                      }`}
                    >
                      <span className="inline-block rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-black uppercase tracking-widest text-amber-300">
                        Final Judge Decision · 🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                      </span>
                      {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px]">
                          {activeTrackDef.buffLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-bold text-emerald-300">
                              <span>🟢 Track Buff:</span> {activeTrackDef.buffLabel}
                            </span>
                          )}
                          {activeTrackDef.debuffLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-bold text-rose-300">
                              <span>⚠️ Track Hazard:</span> {activeTrackDef.debuffLabel}
                            </span>
                          )}
                        </div>
                      )}
                      <h3 className="mt-1 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                        {battleBanner.won ? "🏆 TANDEM VICTORY!" : "😤 DEFEATED ON TRACK"}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-zinc-300">
                        {battleBanner.tiedCorners > 0 ? (
                          <>
                            You won <strong className="text-emerald-400">{battleBanner.playerCorners}</strong>,{" "}
                            tied <strong className="text-amber-400">{battleBanner.tiedCorners}</strong>, and lost{" "}
                            <strong className="text-rose-400">{battleBanner.opponentCorners}</strong> of 3 corners against{" "}
                            <strong className="text-white">{opponent.driverName}</strong> ({opponent.teamName})
                          </>
                        ) : (
                          <>
                            You won <strong className="text-white">{battleBanner.playerCorners}</strong> of 3 corners against{" "}
                            <strong className="text-white">{opponent.driverName}</strong> ({opponent.teamName})
                          </>
                        )}
                      </p>

                      <div className="mt-2 flex items-center justify-center gap-2">
                        <span className="rounded-full bg-zinc-950/80 border border-zinc-700 px-3.5 py-1 text-xs font-black text-zinc-200">
                          MATCH TOTAL:{" "}
                          <strong className="text-amber-400">
                            {cornerResults.reduce((sum, r) => sum + (r?.playerScore ?? 0), 0)}
                          </strong>{" "}
                          –{" "}
                          <strong className="text-rose-400">
                            {cornerResults.reduce((sum, r) => sum + (r?.rivalScore ?? 0), 0)}
                          </strong>{" "}
                          PTS
                        </span>
                      </div>

                      {(battleBanner.rewardGranted > 0 ||
                        battleBanner.streakBonusGranted > 0) && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-black shadow-lg">
                          <span>
                            🪙 +
                            {battleBanner.rewardGranted + battleBanner.streakBonusGranted}{" "}
                            P-Credits Earned!
                          </span>
                        </div>
                      )}

                      {activeChallenge && battleBanner.won && (
                        <div
                          className={`mt-4 rounded-2xl border-2 p-3 text-center shadow-lg ${
                            CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.borderClass || "border-purple-500"
                          } ${
                            CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.bgGradientClass || "bg-purple-950/60"
                          }`}
                        >
                          <span className="text-2xl">🏆</span>
                          <h4 className="text-base font-black text-white">
                            CHALLENGE CUP WON: {activeChallenge.title}
                          </h4>
                          <p className="text-xs text-zinc-300 mt-0.5">
                            You conquered this challenge series and claimed the victory purse!
                          </p>
                          {activeChallenge.rewardPCredits > 0 && (
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1 text-xs font-black text-black">
                              ⚡ +{activeChallenge.rewardPCredits} P-Credits Awarded!
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3-Corner Complete Breakdown with full Buffs & Debuffs Telemetry */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {cornerResults.map((s, idx) => {
                        if (!s) return null;
                        const pCrewDef = resolveCrewDef(s.playerCrewCard);
                        const rCrewDef = resolveCrewDef(s.rivalCrewCard);
                        const pMods = pCrewDef.modifiers ?? {};
                        const rMods = rCrewDef.modifiers ?? {};
                        const pShield = Math.min(1, Math.max(0, pMods.debuffShield ?? 0));
                        const rShield = Math.min(1, Math.max(0, rMods.debuffShield ?? 0));

                        const pDebuff = s.playerDebuffBreakdown ?? computeDebuffBreakdown({
                          card: s.playerCard,
                          debuffCard: s.playerDebuffCard,
                          trackCard: s.trackCard,
                          shield: pShield,
                        });
                        const rDebuff = s.rivalDebuffBreakdown ?? computeDebuffBreakdown({
                          card: s.rivalCard,
                          debuffCard: s.rivalDebuffCard,
                          trackCard: s.trackCard,
                          shield: rShield,
                        });
                        const pTrack = s.playerTrackBreakdown ?? computeTrackBreakdown({
                          card: s.playerCard,
                          trackCard: s.trackCard,
                          shield: pShield,
                        });
                        const rTrack = s.rivalTrackBreakdown ?? computeTrackBreakdown({
                          card: s.rivalCard,
                          trackCard: s.trackCard,
                          shield: rShield,
                        });

                        // Player buffs
                        const pBuffBadges: string[] = [];
                        if (pMods.driftBonus) pBuffBadges.push(`+${pMods.driftBonus} DRIFT`);
                        if (pMods.accelBonus) pBuffBadges.push(`+${pMods.accelBonus} ACCEL`);
                        if (pMods.gripBonus) pBuffBadges.push(`+${pMods.gripBonus} GRIP`);
                        if (pMods.steerBonus) pBuffBadges.push(`+${pMods.steerBonus} STEER`);
                        if (pMods.flatBonus) pBuffBadges.push(`+${pMods.flatBonus} PTS`);
                        if (pShield > 0) pBuffBadges.push(`🛡️ ${Math.round(pShield * 100)}% Shield`);
                        if (pMods.minStatFloor) pBuffBadges.push(`Floor ${pMods.minStatFloor}`);
                        if (pMods.boostWeakestStat) pBuffBadges.push(`+${pMods.boostWeakestStat} Low Stat`);
                        if (pMods.underdogBonus) pBuffBadges.push(`+${pMods.underdogBonus} Underdog`);

                        // Player penalties
                        const pPenBadges: string[] = [];
                        if (pDebuff.effectiveDriftPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveDriftPenalty} DRIFT`);
                        if (pDebuff.effectiveAccelPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveAccelPenalty} ACCEL`);
                        if (pDebuff.effectiveGripPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveGripPenalty} GRIP`);
                        if (pDebuff.effectiveSteerPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveSteerPenalty} STEER`);
                        if (pDebuff.conditionMet && pDebuff.effectiveConditionPenalty > 0) {
                          pPenBadges.push(
                            `${pDebuff.conditionStat?.toUpperCase()} ${pDebuff.conditionOp} ${pDebuff.conditionThreshold} (-${pDebuff.effectiveConditionPenalty} PTS)`
                          );
                        }
                        if (pDebuff.effectiveFlatPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveFlatPenalty} PTS`);

                        // Rival buffs
                        const rBuffBadges: string[] = [];
                        if (rMods.driftBonus) rBuffBadges.push(`+${rMods.driftBonus} DRIFT`);
                        if (rMods.accelBonus) rBuffBadges.push(`+${rMods.accelBonus} ACCEL`);
                        if (rMods.gripBonus) rBuffBadges.push(`+${rMods.gripBonus} GRIP`);
                        if (rMods.steerBonus) rBuffBadges.push(`+${rMods.steerBonus} STEER`);
                        if (rMods.flatBonus) rBuffBadges.push(`+${rMods.flatBonus} PTS`);
                        if (rShield > 0) rBuffBadges.push(`🛡️ ${Math.round(rShield * 100)}% Shield`);
                        if (rMods.minStatFloor) rBuffBadges.push(`Floor ${rMods.minStatFloor}`);
                        if (rMods.boostWeakestStat) rBuffBadges.push(`+${rMods.boostWeakestStat} Low Stat`);
                        if (rMods.underdogBonus) rBuffBadges.push(`+${rMods.underdogBonus} Underdog`);

                        // Rival penalties
                        const rPenBadges: string[] = [];
                        if (rDebuff.effectiveDriftPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveDriftPenalty} DRIFT`);
                        if (rDebuff.effectiveAccelPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveAccelPenalty} ACCEL`);
                        if (rDebuff.effectiveGripPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveGripPenalty} GRIP`);
                        if (rDebuff.effectiveSteerPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveSteerPenalty} STEER`);
                        if (rDebuff.conditionMet && rDebuff.effectiveConditionPenalty > 0) {
                          rPenBadges.push(
                            `${rDebuff.conditionStat?.toUpperCase()} ${rDebuff.conditionOp} ${rDebuff.conditionThreshold} (-${rDebuff.effectiveConditionPenalty} PTS)`
                          );
                        }
                        if (rDebuff.effectiveFlatPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveFlatPenalty} PTS`);

                        return (
                          <div
                            key={s.sector.id}
                            className={`rounded-3xl border-2 p-3 sm:p-4 space-y-3 shadow-xl backdrop-blur-md ${
                              s.won
                                ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/40 via-zinc-950 to-black"
                                : s.tied
                                  ? "border-amber-500/40 bg-gradient-to-b from-amber-950/30 via-zinc-950 to-black"
                                  : "border-rose-500/50 bg-gradient-to-b from-rose-950/40 via-zinc-950 to-black"
                            }`}
                          >
                            {/* Corner Header */}
                            <div className="flex items-center justify-between gap-1 text-xs font-black">
                              <span className="flex items-center gap-1.5 text-white truncate">
                                <span>{s.sector.icon}</span>
                                <span>Corner {idx + 1} · {s.sector.name}</span>
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                  s.won
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : s.tied
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                }`}
                              >
                                {s.won ? "WON" : s.tied ? "TIED" : "LOST"} · {s.playerScore} vs {s.rivalScore}
                              </span>
                            </div>

                            {/* Overlapping Matchup Cars Display (Winner Overlaps Loser) */}
                            <div className="relative py-2">
                              <div className="relative flex items-center justify-center -space-x-8 sm:-space-x-12 select-none overflow-visible">
                                {/* Player Car */}
                                <div
                                  className={`transition-all duration-300 ${
                                    s.won
                                      ? "relative z-20 w-36 sm:w-44 scale-105 rotate-0 shadow-[0_0_30px_rgba(245,158,11,0.6)] ring-2 ring-amber-400 rounded-2xl"
                                      : s.tied
                                        ? "relative z-10 w-32 sm:w-38 scale-95 -rotate-2 opacity-95"
                                        : "relative z-10 w-32 sm:w-38 scale-95 -rotate-3 opacity-75 grayscale-[20%]"
                                  }`}
                                >
                                  {s.won && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 px-2.5 py-0.5 text-[9px] font-black uppercase text-black shadow-lg">
                                      👑 WINNER
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewerState({
                                        list: [s.playerCard, s.rivalCard],
                                        index: 0,
                                      })
                                    }
                                    className="block w-full text-left transition-transform hover:scale-102"
                                    aria-label={`View ${s.playerCard.name}`}
                                  >
                                    <FullArtCard card={s.playerCard} />
                                  </button>
                                </div>

                                {/* Rival Car */}
                                <div
                                  className={`transition-all duration-300 ${
                                    !s.won && !s.tied
                                      ? "relative z-20 w-36 sm:w-44 scale-105 rotate-0 shadow-[0_0_30px_rgba(244,63,94,0.6)] ring-2 ring-rose-500 rounded-2xl"
                                      : s.tied
                                        ? "relative z-10 w-32 sm:w-38 scale-95 rotate-2 opacity-95"
                                        : "relative z-10 w-32 sm:w-38 scale-95 rotate-3 opacity-75 grayscale-[20%]"
                                  }`}
                                >
                                  {!s.won && !s.tied && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 via-rose-400 to-pink-500 px-2.5 py-0.5 text-[9px] font-black uppercase text-white shadow-lg">
                                      👑 WINNER
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewerState({
                                        list: [s.playerCard, s.rivalCard],
                                        index: 1,
                                      })
                                    }
                                    className="block w-full text-left transition-transform hover:scale-102"
                                    aria-label={`View ${s.rivalCard.name}`}
                                  >
                                    <FullArtCard card={s.rivalCard} />
                                  </button>
                                </div>
                              </div>

                              {/* Centered Comparative Score Bar */}
                              <div className="mt-2.5 flex items-center justify-center gap-2">
                                <span
                                  className={`rounded-xl px-2.5 py-1 text-center text-[11px] font-black transition-all ${
                                    s.won
                                      ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-sm"
                                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  You · <strong className={s.won ? "text-amber-200" : "text-white"}>{s.playerScore} PTS</strong>
                                </span>
                                <span className="text-[10px] font-black text-zinc-600">VS</span>
                                <span
                                  className={`rounded-xl px-2.5 py-1 text-center text-[11px] font-black transition-all ${
                                    !s.won && !s.tied
                                      ? "bg-rose-500/25 border border-rose-400 text-rose-300 shadow-sm"
                                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  Rival · <strong className={!s.won && !s.tied ? "text-rose-200" : "text-white"}>{s.rivalScore} PTS</strong>
                                </span>
                              </div>
                            </div>

                            {/* View Details Accordion Trigger */}
                            <button
                              type="button"
                              onClick={() => toggleCornerDetails(idx)}
                              className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-left text-[11px] font-black transition-all hover:border-amber-500/40 hover:bg-zinc-850"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-300">
                                <span>📊</span>
                                <span>
                                  {expandedCornerDetails[idx]
                                    ? "Hide Corner Details"
                                    : "View Details (Buffs, Debuffs & Formula)"}
                                </span>
                              </span>
                              <span
                                className={`text-[10px] text-zinc-400 transition-transform duration-200 ${
                                  expandedCornerDetails[idx] ? "rotate-180 text-amber-400" : ""
                                }`}
                              >
                                ▼
                              </span>
                            </button>

                            {/* Collapsible Detailed Telemetry: Buffs & Debuffs */}
                            {expandedCornerDetails[idx] && (
                              <div className="space-y-2 rounded-2xl bg-black/60 p-2.5 text-[10px] border border-zinc-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* YOUR BUFFS & DEBUFFS */}
                                <div className="space-y-1.5 rounded-xl bg-zinc-950/90 p-2 border border-zinc-800">
                                  <div className="flex items-center justify-between text-[11px] font-black">
                                    <span className="text-amber-400 uppercase tracking-wider">
                                      YOU · ADVANTAGES &amp; HAZARDS
                                    </span>
                                    <span className="font-extrabold text-white">{s.playerScore} PTS</span>
                                  </div>

                                  {/* Crew Advantage */}
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                                      <span>⚡ {pCrewDef.icon}</span>
                                      <span className="truncate">{pCrewDef.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pBuffBadges.length > 0 ? (
                                        pBuffBadges.map((b, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-300"
                                          >
                                            {b}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">{pCrewDef.ability}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* 🇬🇧 Track Card Buffs & Hazards */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                                      <span>🇬🇧 {s.trackCard.icon}</span>
                                      <span className="truncate">{s.trackCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-cyan-200 bg-cyan-950 border border-cyan-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {pTrack.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pTrack.badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                                            b.type === "buff"
                                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                              : b.type === "hazard"
                                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                                                : "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                                          }`}
                                        >
                                          {b.text}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Hazard / Debuff */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                                      <span>⚠️ {s.playerDebuffCard.icon}</span>
                                      <span className="truncate">{s.playerDebuffCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-rose-200 bg-rose-950 border border-rose-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {pDebuff.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pPenBadges.length > 0 ? (
                                        pPenBadges.map((p, pIdx) => (
                                          <span
                                            key={pIdx}
                                            className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[9px] font-black text-rose-300"
                                          >
                                            {p}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">No penalties applied</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* RIVAL BUFFS & DEBUFFS */}
                                <div className="space-y-1.5 rounded-xl bg-zinc-950/90 p-2 border border-zinc-800">
                                  <div className="flex items-center justify-between text-[11px] font-black">
                                    <span className="text-zinc-400 uppercase tracking-wider">
                                      RIVAL · ADVANTAGES &amp; HAZARDS
                                    </span>
                                    <span className="font-extrabold text-zinc-300">{s.rivalScore} PTS</span>
                                  </div>

                                  {/* Rival Crew Advantage */}
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                      <span>⚡ {rCrewDef.icon}</span>
                                      <span className="truncate">{rCrewDef.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rBuffBadges.length > 0 ? (
                                        rBuffBadges.map((b, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-black text-amber-300"
                                          >
                                            {b}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">{rCrewDef.ability}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* 🇬🇧 Rival Track Card Buffs & Hazards */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                                      <span>🇬🇧 {s.trackCard.icon}</span>
                                      <span className="truncate">{s.trackCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-cyan-200 bg-cyan-950 border border-cyan-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {rTrack.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rTrack.badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                                            b.type === "buff"
                                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                              : b.type === "hazard"
                                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                                                : "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                                          }`}
                                        >
                                          {b.text}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Rival Hazard / Debuff */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                                      <span>⚠️ {s.rivalDebuffCard.icon}</span>
                                      <span className="truncate">{s.rivalDebuffCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-rose-200 bg-rose-950 border border-rose-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {rDebuff.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rPenBadges.length > 0 ? (
                                        rPenBadges.map((p, pIdx) => (
                                          <span
                                            key={pIdx}
                                            className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[9px] font-black text-rose-300"
                                          >
                                            {p}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">No penalties applied</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Judge Telemetry & Formula Breakdown */}
                                <div className="rounded-xl bg-zinc-900/90 p-2 border border-zinc-800 text-[9px] space-y-1">
                                  <span className="block font-black text-zinc-400 uppercase tracking-wider">
                                    ⚖️ Corner Telemetry &amp; Formula
                                  </span>
                                  <p className="font-mono text-zinc-300 break-words">
                                    <strong className="text-amber-400">YOU:</strong> {s.playerBreakdown} ={" "}
                                    <strong className="text-white">{s.playerScore} pts</strong>
                                  </p>
                                  <p className="font-mono text-zinc-400 break-words">
                                    <strong className="text-zinc-300">RIVAL:</strong> {s.rivalBreakdown} ={" "}
                                    <strong className="text-zinc-200">{s.rivalScore} pts</strong>
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Pit Garage Status & Mechanical Report */}
                    {pitReport.length > 0 && (
                      <div className="rounded-3xl border border-amber-500/40 bg-zinc-900/90 p-4 space-y-2.5 text-left shadow-lg">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <span>🛠️</span> Pit Garage Report
                          </span>
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            Mechanical Wear &amp; Repairs
                          </span>
                        </div>
                        <div className="space-y-2">
                          {pitReport.map((ev, rIdx) => (
                            <div
                              key={rIdx}
                              className={`flex items-center justify-between gap-3 rounded-2xl p-3 border ${
                                ev.type === "fault"
                                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl">{ev.type === "fault" ? ev.faultIcon || "⚠️" : "✅"}</span>
                                <div>
                                  <p className="text-xs font-black">
                                    {ev.cardName}: {ev.type === "fault" ? `Mechanical Breakdown · ${ev.faultName}` : "Fully Repaired & Race Ready!"}
                                  </p>
                                  <p className="text-[11px] opacity-80 leading-relaxed">
                                    {ev.type === "fault"
                                      ? `Car broke down! Must sit out ${ev.battlesNeeded} battles in maintenance or use a ${ev.faultName} Repair Kit.`
                                      : `Pit crew completed full maintenance overhaul. ${ev.freshBattles} fresh battles ready!`}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      {activeChallenge ? (
                        <>
                          {completedChallengeIds.includes(activeChallenge.id) ||
                          challengeWonCelebration?.challengeCompleted ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/60 px-6 text-sm font-black uppercase text-emerald-300 shadow-lg">
                                ✓ Challenge Completed Today
                              </span>
                              <span className="text-[11px] font-bold text-zinc-400 tabular-nums">
                                Daily purse claimed · Resets in {utcCountdown}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestReplayChallenge(activeChallenge)}
                              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-6 text-sm font-black uppercase text-white shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:scale-[1.02]"
                            >
                              <span>🔄 Replay Challenge Cup</span>
                              {activeChallenge.entryCostPCredits > 0 && (
                                <span className="rounded-full bg-black/40 border border-amber-400/50 px-2 py-0.5 text-[10px] font-black text-amber-300">
                                  🪙 {activeChallenge.entryCostPCredits}
                                </span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              clearTimers();
                              setActiveChallenge(null);
                              setArenaLobbyTab("challenges");
                              setPhase("lobby");
                            }}
                            className="min-h-12 rounded-2xl border border-purple-500/50 bg-purple-950/40 px-5 text-xs font-black uppercase tracking-wider text-purple-300 hover:bg-purple-900/50"
                          >
                            🏆 All Challenges
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              clearTimers();
                              setActiveChallenge(null);
                              setPhase("lobby");
                            }}
                            className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                          >
                            Back to Lobby
                          </button>
                        </>
                      ) : hasEarlyAccess ? (
                        <button
                          type="button"
                          onClick={handleLaunchGame}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-sm font-black uppercase text-black shadow-lg hover:scale-[1.02]"
                        >
                          <span>🎮 Play Again (New UK Track &amp; Rival)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-800 px-6 text-sm font-black uppercase text-zinc-500 cursor-not-allowed"
                        >
                          <span>🔒 Early Access Required</span>
                        </button>
                      )}
                      {!activeChallenge && (
                        <button
                          type="button"
                          onClick={() => setPhase("lobby")}
                          className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                        >
                          Back to Lobby
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nested Picker Modal for Swapping a Car Card or Crew Card Slot */}
            {pickerModalTarget && (
              <div
                className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
                onClick={() => setPickerModalTarget(null)}
              >
                <div
                  className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-amber-500/40 bg-zinc-950 p-4 text-white shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                        {pickerModalTarget.type === "car"
                          ? `Select Car Card for Slot #${pickerModalTarget.slotIdx + 1}`
                          : `Select Crew Advantage Card for Slot #${pickerModalTarget.slotIdx + 1}`}
                      </span>
                      <h4 className="text-base font-black">
                        {pickerModalTarget.type === "car"
                          ? "Choose from your Car Cards"
                          : "Choose from your Crew Advantage Cards"}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerModalTarget(null)}
                      className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                    {(pickerModalTarget.type === "car"
                      ? (carCards.length >= 3 ? carCards : usableCarCards)
                      : usableCrewCards
                    ).map((c, idx, list) => {
                      const isSelectedHere =
                        pickerModalTarget.type === "car"
                          ? selectedCarIds[pickerModalTarget.slotIdx] === c.id
                          : selectedCrewIds[pickerModalTarget.slotIdx] === c.id;
                      const broken = pickerModalTarget.type === "car" && isCarBroken(c);
                      const eligibility =
                        pickerModalTarget.type === "car" && activeChallenge
                          ? isCarEligibleForChallenge(c, activeChallenge)
                          : { eligible: true };
                      const isEligible = eligibility.eligible;
                      const matchingRepair = broken
                        ? maintenanceCards.find((m) => canRepairCarWithMaintenanceCard(c, m))
                        : null;
                      return (
                        <div
                          key={c.id}
                          className={`flex flex-col justify-between rounded-2xl border-2 p-2 text-left transition-all ${
                            broken
                              ? "border-rose-500/50 bg-rose-950/20"
                              : !isEligible
                                ? "border-zinc-800 bg-zinc-950/40 opacity-70"
                                : isSelectedHere
                                  ? "border-amber-400 bg-amber-500/15"
                                  : "border-zinc-800 bg-zinc-900 hover:border-amber-500/60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setViewerState({ list, index: idx })}
                            className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                            aria-label={`View ${c.name}`}
                          >
                            <FullArtCard card={c} />
                          </button>
                          <div className="mt-2 space-y-1.5 px-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-zinc-300">
                                {rarityLabel(c.tier)}
                              </span>
                              <span className="text-[10px] font-bold text-amber-300">
                                {pickerModalTarget.type === "car"
                                  ? (broken
                                      ? "⚠️ Broken"
                                      : `🔋 ${c.battlesRemaining ?? c.maxBattles ?? 6}L`)
                                  : "⚡ Crew"}
                              </span>
                            </div>
                            {broken ? (
                              <div className="space-y-1 pt-0.5">
                                <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-center">
                                  <span className="text-[10px] font-black uppercase text-rose-400 block truncate">
                                    ⚠️ {c.fault?.name || "Broken"}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block">
                                    Sits out {c.fault?.battlesRemaining} battle(s)
                                  </span>
                                </div>
                                {matchingRepair ? (
                                  <button
                                    type="button"
                                    disabled={repairingCarId === c.id}
                                    onClick={() => handleQuickRepair(c, matchingRepair)}
                                    className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-500 py-1.5 text-[10px] font-black uppercase text-black hover:opacity-95 shadow-md"
                                  >
                                    {repairingCarId === c.id
                                      ? "Repairing..."
                                      : `🛠️ Quick Fix (-${matchingRepair.repairBattles}L)`}
                                  </button>
                                ) : (
                                  <div className="rounded-xl bg-zinc-800/80 px-1 py-1 text-center text-[9px] text-zinc-500 italic">
                                    Needs {c.fault?.type} Kit
                                  </div>
                                )}
                              </div>
                            ) : !isEligible ? (
                              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-center">
                                <span className="text-[10px] font-black uppercase text-amber-400 block truncate">
                                  🔒 Ineligible
                                </span>
                                <span className="text-[9px] text-zinc-400 block">
                                  {eligibility.reason}
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  assignCardToSlot(
                                    pickerModalTarget.type,
                                    pickerModalTarget.slotIdx,
                                    c.id
                                  )
                                }
                                className={`w-full rounded-xl py-1.5 text-[11px] font-black transition-colors ${
                                  isSelectedHere
                                    ? "bg-amber-500 text-black"
                                    : "bg-zinc-800 text-amber-300 hover:bg-amber-500 hover:text-black"
                                }`}
                              >
                                {isSelectedHere
                                  ? "✓ Equipped"
                                  : `Select Slot #${pickerModalTarget.slotIdx + 1}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

      {/* ── LARGE CARD VIEWER MODAL ────────────────────────────────────────── */}
      {viewerState &&
        typeof document !== "undefined" &&
        (() => {
          const card = viewerState.list[viewerState.index];
          if (!card) return null;
          const isCrew = isCrewCard(card);
          const isDebuff = card.cardType === "debuff";
          const isTrack = card.cardType === "track";

          return createPortal(
            <div
              className="fixed inset-0 z-[10000] flex h-[100dvh] w-screen items-stretch justify-center overflow-y-auto bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clash-large-card-title"
              onClick={() => setViewerState(null)}
            >
              <div
                className="relative my-auto grid h-full w-full gap-6 overflow-y-auto bg-zinc-950 p-5 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:w-[min(60rem,94vw)] sm:rounded-3xl sm:border sm:border-amber-500/30 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto w-full max-w-[22rem]">
                  <FullArtCard card={card} className="drop-shadow-2xl" />
                </div>

                <div className="flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                          {rarityLabel(card.tier)}{" "}
                          {isCrew
                            ? "· Crew Advantage Card"
                            : isDebuff
                              ? "· Corner Debuff Card"
                              : isTrack
                                ? "· UK Drift Track Card"
                                : "· Car Card"}
                        </p>
                        <h2 id="clash-large-card-title" className="text-2xl font-black text-white">
                          {card.name}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewerState(null)}
                        className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
                      >
                        Close
                      </button>
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="font-bold text-zinc-400">
                        {isCrew || isDebuff || isTrack ? "Category" : "Driver"}
                      </dt>
                      <dd>{card.driver || "—"}</dd>
                      <dt className="font-bold text-zinc-400">
                        {isCrew || isDebuff || isTrack ? "Set" : "Team"}
                      </dt>
                      <dd>{card.team || "—"}</dd>
                      <dt className="font-bold text-zinc-400">
                        {isCrew
                          ? "Advantage Trigger"
                          : isDebuff
                            ? "Hazard Trigger"
                            : isTrack
                              ? "Surface"
                              : "Chassis"}
                      </dt>
                      <dd className="font-semibold text-amber-300">
                        {card.ability?.trim() || (!isCrew && !isDebuff && !isTrack ? (card as { chassis?: string }).chassis?.trim() || card.name : "—")}
                      </dd>
                      <dt className="font-bold text-zinc-400">Effect</dt>
                      <dd className="leading-relaxed text-zinc-200">
                        {card.effect || "—"}
                      </dd>
                      {!isCrew && !isDebuff && !isTrack && (
                        <>
                          <dt className="font-bold text-zinc-400">Stats</dt>
                          <dd className="font-bold text-amber-300">
                            DRIFT {normalizeStatValue(card.stats.drift)} · ACCEL {normalizeStatValue(card.stats.accel)} · GRIP{" "}
                            {normalizeStatValue(card.stats.grip)} · STEER {normalizeStatValue(card.stats.steer)}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      onClick={() =>
                        setViewerState((prev) =>
                          prev && prev.index > 0
                            ? { ...prev, index: prev.index - 1 }
                            : prev
                        )
                      }
                      disabled={viewerState.index <= 0}
                    >
                      ← Previous
                    </button>
                    <span className="text-xs font-bold text-zinc-400">
                      {viewerState.index + 1} of {viewerState.list.length}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      onClick={() =>
                        setViewerState((prev) =>
                          prev && prev.index < prev.list.length - 1
                            ? { ...prev, index: prev.index + 1 }
                            : prev
                        )
                      }
                      disabled={viewerState.index >= viewerState.list.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

      {/* Challenge Replay Entry Fee Confirmation Modal */}
      {challengeReplayConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="relative w-full max-w-sm rounded-3xl border-2 border-purple-500/80 bg-zinc-950 p-6 shadow-[0_0_50px_rgba(168,85,247,0.45)] text-center">
            {/* Icon Badge */}
            <div className="mx-auto my-2 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-purple-400/40 bg-purple-500/20 text-3xl shadow-inner animate-pulse">
              🔄
            </div>

            {/* Header */}
            <h3 className="text-lg font-black uppercase tracking-tight text-white mt-2">
              Replay Challenge Cup?
            </h3>

            {/* Challenge Title */}
            <p className="text-xs font-bold text-purple-300 mt-1">
              {challengeReplayConfirm.title}
            </p>

            {/* Fee Deduct Notice Box */}
            <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-3.5 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block mb-1">
                ⚠️ Entry Fee Required
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed">
                Replaying this challenge will deduct{" "}
                <strong className="text-amber-400 font-black text-sm">
                  {challengeReplayConfirm.entryCostPCredits} P-Credits
                </strong>{" "}
                again.
              </p>
              <span className="text-[10px] text-zinc-400 block mt-2">
                Current Balance: <strong className="text-white">{internalPCredits} P-Credits</strong>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const ch = challengeReplayConfirm;
                  setChallengeReplayConfirm(null);
                  handleLaunchChallenge(ch);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-5 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-[0_0_25px_rgba(168,85,247,0.5)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Pay {challengeReplayConfirm.entryCostPCredits} P-Credits &amp; Replay</span>
                <span>→</span>
              </button>
              <button
                type="button"
                onClick={() => setChallengeReplayConfirm(null)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Manual & Instructions on How to Play Overlay */}
      <ClashHowToPlayModal
        isOpen={showHowToPlayModal}
        onClose={() => setShowHowToPlayModal(false)}
        initialTab={howToPlayTab}
        onOpenCatalog={(category) => {
          setShowCatalogModal(category);
        }}
      />
    </div>
  );
}
