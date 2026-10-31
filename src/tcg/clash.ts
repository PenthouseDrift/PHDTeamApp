"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { CREW_CARD_SET, crewDefinitionToCardData, isCrewCard } from "@/lib/crew-cards";
import {
  ALL_MEMBER_CARDS_INDEX,
  COMMUNITY_POOL_INDEX,
  ensureCommunityPool,
  memberCardKey,
  memberCardsIndexKey,
  parseStoredCard,
} from "@/lib/member-card-store";
import type { MemberCard, StoredMemberCard } from "@/lib/card-roll";
import type { ActionResult } from "@/types";
import {
  CLASH_TRACK_CONDITIONS,
  DAILY_CLASH_WIN_REWARD_PCREDITS,
  STARTER_LOANER_CREW_CARD,
  STARTER_LOANER_CREW_CARDS,
  STREAK_MILESTONE_REWARD_PCREDITS,
  getCardPower,
  getCollectorProgress,
  optimizeLineupForTrack,
} from "./progression";
import { getPCredits, grantPCredits } from "./storage";
import type {
  ClashOpponent,
  ClashPlayerStats,
  DriftClashLeaderboardEntry,
} from "./types";

const clashStatsKey = (userId: string) => `tcg:clash:stats:${userId}`;
const clashDailyWinKey = (userId: string, utcDate: string) =>
  `tcg:clash:daily:${userId}:${utcDate}`;
const clashStreakBonusKey = (userId: string, utcDate: string) =>
  `tcg:clash:streakbonus:${userId}:${utcDate}`;

const CLASH_EARLY_ACCESS_SET = "tcg:clash_early_access_users";

/**
 * Check whether a user has permission to play the Tandem Clash early access beta.
 * Track Admins automatically have permanent access.
 */
export async function hasClashEarlyAccess(
  userId?: string | null,
  role?: string | null
): Promise<boolean> {
  if (!userId) return false;
  if (role === "admin") return true;
  try {
    const isMember = await redis.sismember(CLASH_EARLY_ACCESS_SET, userId);
    return Boolean(isMember);
  } catch (error) {
    console.error("[clash] error checking early access:", error);
    return false;
  }
}

export async function grantClashEarlyAccess(userId: string): Promise<boolean> {
  if (!userId) return false;
  await redis.sadd(CLASH_EARLY_ACCESS_SET, userId);
  await redis.hset(`member:${userId}`, { clashEarlyAccess: "true" }).catch(() => null);
  return true;
}

export async function revokeClashEarlyAccess(userId: string): Promise<boolean> {
  if (!userId) return false;
  await redis.srem(CLASH_EARLY_ACCESS_SET, userId);
  await redis.hset(`member:${userId}`, { clashEarlyAccess: "false" }).catch(() => null);
  return true;
}

export async function getClashEarlyAccessUserIds(): Promise<string[]> {
  try {
    const members = await redis.smembers(CLASH_EARLY_ACCESS_SET);
    return (members as string[]) || [];
  } catch {
    return [];
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function publicCard(stored: StoredMemberCard): MemberCard {
  const { referenceUrl, ...card } = stored;
  void referenceUrl;
  return card;
}

function makeBossCrewCard(crewId: string): MemberCard {
  const def = CREW_CARD_SET.find((c) => c.id === crewId);
  if (def) {
    return {
      id: `boss_${def.id}`,
      userId: "boss",
      ...crewDefinitionToCardData(def),
      styleIds: [],
      kept: true,
      rerolled: false,
      createdAt: 0,
    };
  }
  return STARTER_LOANER_CREW_CARD;
}

interface FallbackBossCrew {
  driverName: string;
  teamName: string;
  title: string;
  cards: MemberCard[];
  crewCards: [MemberCard, MemberCard, MemberCard];
}

const FALLBACK_BOSS_CREWS: FallbackBossCrew[] = [
  {
    driverName: "K. Takahashi",
    teamName: "PHD Works",
    title: "Track Boss · P-Tile Phantom",
    cards: [
      {
        id: "boss-phd-1",
        userId: "boss-phd",
        name: "Nissan S15 Spec-R Works",
        ability: "Yokomo MD2.0",
        effect: "Acuvance Fledge 10.5T · Futaba 10PX · Carbon Chassis",
        driver: "K. Takahashi",
        team: "PHD Works",
        tier: "mythic",
        styleIds: ["touge", "cyber"],
        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-phd-2",
        userId: "boss-phd",
        name: "GR Supra A90 Works",
        ability: "Reve D RDX",
        effect: "Hobbywing XD10 Pro · Futaba GYD550",
        driver: "K. Takahashi",
        team: "PHD Works",
        tier: "legend",
        styleIds: ["cyber"],
        stats: { drift: "24", accel: "23", grip: "23", steer: "24" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-phd-3",
        userId: "boss-phd",
        name: "Mazda RX-7 FD3S Spirit R",
        ability: "Overdose Galm Ver.2",
        effect: "Sanwa Super Vortex Gen2 · PGS-LH Servo",
        driver: "K. Takahashi",
        team: "PHD Works",
        tier: "gold",
        styleIds: ["touge"],
        stats: { drift: "20", accel: "19", grip: "19", steer: "19" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
    ],
    crewCards: [
      makeBossCrewCard("crew-28-vip-judge-box"),
      makeBossCrewCard("crew-04-boost-ban"),
      makeBossCrewCard("crew-01-polished-ice"),
    ],
  },
  {
    driverName: "Marcus Vance",
    teamName: "ASBO Racing UK",
    title: "Tandem Assassin · Apex Killer",
    cards: [
      {
        id: "boss-asbo-1",
        userId: "boss-asbo",
        name: "BMW E30 M3 V8 Works",
        ability: "MST MRX-GT",
        effect: "Hobbywing XR10 Pro G2 · Sanwa M17 · Quick-Steer Rack",
        driver: "Marcus Vance",
        team: "ASBO Racing UK",
        tier: "mythic",
        styleIds: ["touge", "cyber"],
        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-asbo-2",
        userId: "boss-asbo",
        name: "Toyota Chaser JZX100 Tourer V",
        ability: "Rhino Shark DDSS",
        effect: "OMG Predator 10.5T · FlySky Noble Pro",
        driver: "Marcus Vance",
        team: "ASBO Racing UK",
        tier: "legend",
        styleIds: ["cyber"],
        stats: { drift: "24", accel: "23", grip: "23", steer: "24" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-asbo-3",
        userId: "boss-asbo",
        name: "Nissan Silvia S14 Kouki",
        ability: "Yokomo YD-2ZX",
        effect: "Acuvance Rad · Sanwa CL-II Gyro Combo",
        driver: "Marcus Vance",
        team: "ASBO Racing UK",
        tier: "gold",
        styleIds: ["touge"],
        stats: { drift: "20", accel: "19", grip: "19", steer: "20" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
    ],
    crewCards: [
      makeBossCrewCard("crew-30-twin-drift-sync"),
      makeBossCrewCard("crew-08-rf-glitch"),
      makeBossCrewCard("crew-27-one-more-time"),
    ],
  },
  {
    driverName: "Leon Mercer",
    teamName: "Slide House Masters",
    title: "Carpet King · Angle Maestro",
    cards: [
      {
        id: "boss-slide-1",
        userId: "boss-slide",
        name: "Subaru BRZ Rocket Bunny",
        ability: "SHIBATA GRK5 Purple",
        effect: "Futaba MC970CR · Sanwa PGS-HR · Active High Caster",
        driver: "Leon Mercer",
        team: "Slide House Masters",
        tier: "mythic",
        styleIds: ["cyber"],
        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-slide-2",
        userId: "boss-slide",
        name: "Mazda RX-8 RE-Amemiya",
        ability: "Yokomo RD2.0 Premium",
        effect: "Hobbywing XD10 · Revox Gyro · Big-Bore Shocks",
        driver: "Leon Mercer",
        team: "Slide House Masters",
        tier: "legend",
        styleIds: ["touge"],
        stats: { drift: "24", accel: "23", grip: "23", steer: "24" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-slide-3",
        userId: "boss-slide",
        name: "Nissan 180SX Type X",
        ability: "Reve D RDX Carbon",
        effect: "Acuvance XARVIS XX · Yokomo SP03D V2",
        driver: "Leon Mercer",
        team: "Slide House Masters",
        tier: "gold",
        styleIds: ["touge", "cyber"],
        stats: { drift: "20", accel: "19", grip: "19", steer: "20" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
    ],
    crewCards: [
      makeBossCrewCard("crew-16-meihan-wall-ride"),
      makeBossCrewCard("crew-24-dual-gain-gyro"),
      makeBossCrewCard("crew-03-wall-clip-zone"),
    ],
  },
  {
    driverName: "Tatsuya Ken",
    teamName: "Team Overdose UK",
    title: "Chassis Sorcerer · High-Roll Elite",
    cards: [
      {
        id: "boss-overdose-1",
        userId: "boss-overdose",
        name: "Toyota GR86 Pandem V3",
        ability: "Overdose Galm Ver.2+ Anti+",
        effect: "Acuvance Fledge 10.5T · Overdose High Traction Chassis",
        driver: "Tatsuya Ken",
        team: "Team Overdose UK",
        tier: "mythic",
        styleIds: ["cyber"],
        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-overdose-2",
        userId: "boss-overdose",
        name: "Nissan Skyline R34 GT-R Drift",
        ability: "Yokomo MD1.0",
        effect: "Hobbywing XD10 Pro · Futaba 7PXR · Rear Bulkhead Weight",
        driver: "Tatsuya Ken",
        team: "Team Overdose UK",
        tier: "legend",
        styleIds: ["touge"],
        stats: { drift: "24", accel: "24", grip: "23", steer: "23" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-overdose-3",
        userId: "boss-overdose",
        name: "Toyota Mark II JZX90 Vertex",
        ability: "SHIBATA GRK-M",
        effect: "Sanwa SV-Plus · PGS-CL · High Steer Kingpins",
        driver: "Tatsuya Ken",
        team: "Team Overdose UK",
        tier: "gold",
        styleIds: ["touge", "cyber"],
        stats: { drift: "20", accel: "19", grip: "19", steer: "20" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
    ],
    crewCards: [
      makeBossCrewCard("crew-20-proximity-laser"),
      makeBossCrewCard("crew-04-boost-ban"),
      makeBossCrewCard("crew-26-carbon-flex-deck"),
    ],
  },
  {
    driverName: "Dan Wright",
    teamName: "Soul RC Syndicate",
    title: "UK Pro Master · Clipping Zone Hunter",
    cards: [
      {
        id: "boss-soul-1",
        userId: "boss-soul",
        name: "Nissan Fairlady 370Z Nismo",
        ability: "MST RMX-EX Carbon",
        effect: "Hobbywing XD10 Pro · Futaba 10PX · Titanium Axles",
        driver: "Dan Wright",
        team: "Soul RC Syndicate",
        tier: "mythic",
        styleIds: ["cyber", "touge"],
        stats: { drift: "25", accel: "25", grip: "25", steer: "25" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-soul-2",
        userId: "boss-soul",
        name: "Toyota Soarer 1JZ Drift",
        ability: "Reve D RDX Alu Hop-ups",
        effect: "Acuvance Rad · Sanwa PGS-LH · Brass Front Mount",
        driver: "Dan Wright",
        team: "Soul RC Syndicate",
        tier: "legend",
        styleIds: ["touge"],
        stats: { drift: "24", accel: "23", grip: "23", steer: "24" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
      {
        id: "boss-soul-3",
        userId: "boss-soul",
        name: "Mitsubishi Lancer Evo IX RWD",
        ability: "Yokomo YD-2SX3",
        effect: "OMG Polar 10.5T · Power HD S15 · High Traction Rear",
        driver: "Dan Wright",
        team: "Soul RC Syndicate",
        tier: "gold",
        styleIds: ["cyber"],
        stats: { drift: "20", accel: "19", grip: "19", steer: "20" },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        kept: true,
        rerolled: false,
        createdAt: 0,
      },
    ],
    crewCards: [
      makeBossCrewCard("crew-29-p1-qualifier"),
      makeBossCrewCard("crew-27-one-more-time"),
      makeBossCrewCard("crew-07-tire-bead-pop"),
    ],
  },
];

export async function getPlayerClashStats(userId: string): Promise<ClashPlayerStats> {
  try {
    const today = todayUtc();
    const [rawStats, dailyClaimed] = await Promise.all([
      redis.hgetall<Record<string, unknown>>(clashStatsKey(userId)),
      redis.get(clashDailyWinKey(userId, today)),
    ]);

    return {
      wins: Math.max(0, Number(rawStats?.wins) || 0),
      losses: Math.max(0, Number(rawStats?.losses) || 0),
      streak: Math.max(0, Number(rawStats?.streak) || 0),
      bestStreak: Math.max(0, Number(rawStats?.bestStreak) || 0),
      dailyWinClaimed: Boolean(dailyClaimed),
    };
  } catch (error) {
    console.error("[driftClash] getPlayerClashStats error:", error);
    return {
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0,
      dailyWinClaimed: false,
    };
  }
}

export async function pickClashOpponent(excludeUserId?: string): Promise<ClashOpponent> {
  try {
    // If excludeUserId was not provided, try to extract current user session
    if (!excludeUserId) {
      const session = await auth();
      excludeUserId = session?.user?.id;
    }

    await ensureCommunityPool();
    let poolIds = (await redis.zrange(COMMUNITY_POOL_INDEX, 0, 199, { rev: true })) as string[];
    if (!poolIds || poolIds.length < 3) {
      poolIds = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, 199, { rev: true })) as string[];
    }

    if (poolIds && poolIds.length > 0) {
      const sampleIds = poolIds.slice(0, 100);
      const rawRows = await redis.mget(...sampleIds.map((id) => memberCardKey(String(id))));
      const validCards = rawRows
        .map(parseStoredCard)
        .filter((c): c is StoredMemberCard => Boolean(c && !c.archived && c.imageUrl));

      // Strictly filter community cars: NEVER include the player's own cards
      const rivalCars = validCards
        .filter((c) => !isCrewCard(c))
        .filter((c) => Boolean(c.userId && (!excludeUserId || c.userId !== excludeUserId)));

      // Collect distinct rival users who have cards in the pool and are NOT the player
      const rivalUserMap = new Map<string, StoredMemberCard[]>();
      for (const car of rivalCars) {
        if (!car.userId || (excludeUserId && car.userId === excludeUserId)) continue;
        const list = rivalUserMap.get(car.userId) || [];
        list.push(car);
        rivalUserMap.set(car.userId, list);
      }
      const rivalUserIds = Array.from(rivalUserMap.keys());

      // If at least 1 genuine rival user exists (never the player):
      if (rivalUserIds.length > 0) {
        // Shuffle rival user candidates so all eligible community members get turns
        const shuffledRivalUserIds = rivalUserIds.slice().sort(() => Math.random() - 0.5);

        for (const candidateUserId of shuffledRivalUserIds) {
          let driverCars: MemberCard[] = [];
          let driverCrewCards: MemberCard[] = [];

          // Check user's card collection from their personal index
          const userCardIds = (await redis.zrange(memberCardsIndexKey(candidateUserId), 0, 99, {
            rev: true,
          })) as string[];

          // Combine with any cards already seen for this user in sample
          const seenCardIds = (rivalUserMap.get(candidateUserId) || []).map((c) => c.id);
          const combinedCardIds = Array.from(new Set([...(userCardIds || []), ...seenCardIds]));

          if (combinedCardIds.length > 0) {
            const userRows = await redis.mget(
              ...combinedCardIds.map((id) => memberCardKey(String(id)))
            );
            for (const row of userRows) {
              const parsed = parseStoredCard(row);
              if (!parsed || parsed.archived || !parsed.imageUrl) continue;
              // STRICT GUARD: Must strictly belong to this rival user, and NEVER to the current player
              if (parsed.userId !== candidateUserId) continue;
              if (excludeUserId && parsed.userId === excludeUserId) continue;

              if (isCrewCard(parsed)) {
                driverCrewCards.push(publicCard(parsed));
              } else {
                driverCars.push(publicCard(parsed));
              }
            }
          }

          // Deduplicate cards by ID
          const uniqueCarsMap = new Map<string, MemberCard>();
          for (const car of driverCars) {
            uniqueCarsMap.set(car.id, car);
          }
          driverCars = Array.from(uniqueCarsMap.values());

          // STRICT REQUIREMENT: Only accept this rival if they actually own AT LEAST 3 car cards!
          // We NEVER pad with cards from other users or fake loaners.
          if (driverCars.length < 3) {
            continue; // Skip to next candidate rival who actually has 3+ cars
          }

          // STRICT REQUIREMENT: The opponent picks their BEST cards (highest power)
          driverCars.sort((a, b) => getCardPower(b) - getCardPower(a));
          const candidateCars: [MemberCard, MemberCard, MemberCard] = [
            driverCars[0],
            driverCars[1],
            driverCars[2],
          ];

          // Deduplicate crew cards by ID
          const uniqueCrewMap = new Map<string, MemberCard>();
          for (const crew of driverCrewCards) {
            uniqueCrewMap.set(crew.id, crew);
          }
          driverCrewCards = Array.from(uniqueCrewMap.values());
          driverCrewCards.sort((a, b) => getCardPower(b) - getCardPower(a));

          // Select Challenger's 3 Crew Cards: pick their BEST owned Crew Cards, filling missing slots with Loaners
          const rivalCrewThree: [MemberCard, MemberCard, MemberCard] = [
            driverCrewCards[0] ?? STARTER_LOANER_CREW_CARDS[0],
            driverCrewCards[1] ?? STARTER_LOANER_CREW_CARDS[1],
            driverCrewCards[2] ?? STARTER_LOANER_CREW_CARDS[2],
          ];
          const selectedRivalCrewCard: MemberCard = rivalCrewThree[0];

          // Optimize Challenger's 3 cars for track + best crew card
          const optimizedThree = optimizeLineupForTrack(
            candidateCars,
            CLASH_TRACK_CONDITIONS[0],
            selectedRivalCrewCard
          );

          // Fetch opponent member profile for accurate nickname/name
          const memberHash = await redis.hmget<Record<string, unknown>>(
            `member:${candidateUserId}`,
            "nickname",
            "name"
          );
          const nickname =
            typeof memberHash?.nickname === "string" ? memberHash.nickname.trim() : "";
          const fullName =
            typeof memberHash?.name === "string" ? memberHash.name.trim() : "";
          const lead = candidateCars[0];
          const driverName = nickname || fullName || lead.driver?.trim() || "PHD Rival";
          const teamName = lead.team?.trim() || "Community Crew";

          const crewPower =
            optimizedThree.reduce((sum, c) => sum + getCardPower(c), 0) +
            rivalCrewThree.reduce((sum, c) => sum + getCardPower(c), 0);
          const titles = [
            "Tandem Challenger",
            "P-Tile Specialist",
            "Night Touge Runner",
            "Outer-Clip Hunter",
            "Penthouse Contender",
          ];
          const title = titles[randomInt(0, titles.length)];

          return {
            id: `opp_${Date.now()}_${randomInt(1000, 9999)}`,
            driverName,
            teamName,
            title,
            crewPower,
            cards: optimizedThree,
            crewCard: selectedRivalCrewCard,
            crewCards: rivalCrewThree,
          };
        }
      }
    }
  } catch (error) {
    console.error("[driftClash] pickClashOpponent error:", error);
  }

  // Fallback when no other community drivers exist: Pick a random Boss from the expanded FALLBACK_BOSS_CREWS pool!
  const boss = FALLBACK_BOSS_CREWS[randomInt(0, FALLBACK_BOSS_CREWS.length)];
  const bossCrewCards = boss.crewCards ?? STARTER_LOANER_CREW_CARDS;
  const leadBossCrewCard = bossCrewCards[0] ?? STARTER_LOANER_CREW_CARD;
  const sortedBossCars = [...boss.cards].sort((a, b) => getCardPower(b) - getCardPower(a)).slice(0, 3);
  const optimizedBossCards = optimizeLineupForTrack(
    sortedBossCars,
    CLASH_TRACK_CONDITIONS[0],
    leadBossCrewCard
  );
  const crewPower =
    optimizedBossCards.reduce((sum, c) => sum + getCardPower(c), 0) +
    bossCrewCards.reduce((sum, c) => sum + getCardPower(c), 0);
  return {
    id: `boss_${Date.now()}_${randomInt(1000, 9999)}`,
    driverName: boss.driverName,
    teamName: boss.teamName,
    title: boss.title,
    crewPower,
    cards: optimizedBossCards,
    crewCard: leadBossCrewCard,
    crewCards: bossCrewCards,
  };
}

export async function findNewClashOpponentAction(): Promise<ActionResult<ClashOpponent>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Please sign in to battle." };
    }
    const hasAccess = await hasClashEarlyAccess(session.user.id, session.user.role);
    if (!hasAccess) {
      return {
        success: false,
        error: "Tandem Clash is currently in private Early Access. Please ask an admin to grant you access.",
      };
    }
    const opponent = await pickClashOpponent(session.user.id);
    return { success: true, data: opponent };
  } catch (error) {
    console.error("[driftClash] findNewClashOpponentAction error:", error);
    return { success: false, error: "Could not find a new rival crew." };
  }
}

export async function completeClashBattleAction(input: {
  won: boolean;
  playedCarCardIds?: string[];
}): Promise<
  ActionResult<{
    stats: ClashPlayerStats;
    rewardGranted: number;
    streakBonusGranted: number;
    pCredits: number;
    faultEvents: Array<{
      type: "fault" | "repaired";
      cardId: string;
      cardName: string;
      faultName?: string;
      faultIcon?: string;
      battlesNeeded?: number;
      freshBattles?: number;
    }>;
    updatedCars?: MemberCard[];
  }>
> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "Please sign in to record your Clash result." };
    }
    const hasAccess = await hasClashEarlyAccess(userId, session.user?.role);
    if (!hasAccess) {
      return {
        success: false,
        error: "Tandem Clash is currently in private Early Access. Please ask an admin to grant you access.",
      };
    }

    const current = await getPlayerClashStats(userId);
    const today = todayUtc();

    const nextWins = input.won ? current.wins + 1 : current.wins;
    const nextLosses = input.won ? current.losses : current.losses + 1;
    const nextStreak = input.won ? current.streak + 1 : 0;
    const nextBestStreak = Math.max(current.bestStreak, nextStreak);

    await redis.hset(clashStatsKey(userId), {
      wins: nextWins,
      losses: nextLosses,
      streak: nextStreak,
      bestStreak: nextBestStreak,
      updatedAt: Date.now(),
    });

    let rewardGranted = 0;
    let streakBonusGranted = 0;
    let dailyWinClaimed = current.dailyWinClaimed;

    if (input.won) {
      const dailyKey = clashDailyWinKey(userId, today);
      const claimedNow = await redis.set(dailyKey, "1", { nx: true, ex: 172800 });
      if (claimedNow === "OK") {
        rewardGranted = DAILY_CLASH_WIN_REWARD_PCREDITS;
        dailyWinClaimed = true;
      }

      // Award +10 P-Credits when hitting a 3-win streak milestone (once per UTC day)
      if (nextStreak > 0 && nextStreak % 3 === 0) {
        const streakKey = clashStreakBonusKey(userId, today);
        const streakClaimed = await redis.set(streakKey, "1", { nx: true, ex: 172800 });
        if (streakClaimed === "OK") {
          streakBonusGranted = STREAK_MILESTONE_REWARD_PCREDITS;
        }
      }
    }

    const totalGrant = rewardGranted + streakBonusGranted;
    const pCredits =
      totalGrant > 0 ? await grantPCredits(userId, totalGrant) : await getPCredits(userId);

    // Mechanical Faults & Pit Maintenance Countdown
    const faultEvents: Array<{
      type: "fault" | "repaired";
      cardId: string;
      cardName: string;
      faultName?: string;
      faultIcon?: string;
      battlesNeeded?: number;
      freshBattles?: number;
    }> = [];
    const savedCardsList: StoredMemberCard[] = [];

    try {
      const { memberCardKey, memberCardsIndexKey, parseStoredCard } = await import(
        "@/lib/member-card-store"
      );
      const { rollCarInitialDurability, rollMechanicalFault } = await import(
        "@/lib/mechanical-faults"
      );

      const playedSet = new Set(
        (input.playedCarCardIds || []).filter((id) => id && !id.startsWith("loaner-"))
      );

      const userCardIds = (await redis.zrange(
        memberCardsIndexKey(userId),
        0,
        999
      )) as string[];

      if (userCardIds && userCardIds.length > 0) {
        const rows = await redis.mget(...userCardIds.map((id) => memberCardKey(String(id))));

        for (const row of rows) {
          const c = parseStoredCard(row);
          if (!c || c.userId !== userId) continue;
          if (
            c.cardType === "crew" ||
            c.cardType === "maintenance" ||
            c.cardType === "debuff" ||
            c.cardType === "track"
          ) {
            continue;
          }

          // Case 1: Car was played in this battle -> wear down durability
          if (playedSet.has(c.id)) {
            const currentDurability =
              typeof c.battlesRemaining === "number"
                ? c.battlesRemaining
                : (c.maxBattles ?? rollCarInitialDurability());

            if (currentDurability > 1) {
              c.battlesRemaining = currentDurability - 1;
              savedCardsList.push(c);
            } else {
              // Durability exhausted -> breaks down!
              c.battlesRemaining = 0;
              const fault = rollMechanicalFault();
              c.fault = fault;
              savedCardsList.push(c);
              faultEvents.push({
                type: "fault",
                cardId: c.id,
                cardName: c.name,
                faultName: fault.name,
                faultIcon: fault.icon,
                battlesNeeded: fault.battlesNeeded,
              });
            }
          }
          // Case 2: Benched car with active fault -> decrement maintenance battles
          else if (c.fault && c.fault.battlesRemaining > 0) {
            const nextRemaining = c.fault.battlesRemaining - 1;
            if (nextRemaining <= 0) {
              // Fully repaired!
              c.fault = null;
              const freshBattles = rollCarInitialDurability();
              c.maxBattles = freshBattles;
              c.battlesRemaining = freshBattles;
              savedCardsList.push(c);
              faultEvents.push({
                type: "repaired",
                cardId: c.id,
                cardName: c.name,
                freshBattles,
              });
            } else {
              c.fault.battlesRemaining = nextRemaining;
              savedCardsList.push(c);
            }
          }
        }

        if (savedCardsList.length > 0) {
          await Promise.all(
            savedCardsList.map((c) => redis.set(memberCardKey(c.id), JSON.stringify(c)))
          );
        }
      }
    } catch (err) {
      console.error("[driftClash] error processing mechanical faults:", err);
    }

    revalidatePath("/cards");
    revalidatePath("/");

    const updatedCars = savedCardsList.map((c) => {
      const { referenceUrl, ...rest } = c;
      void referenceUrl;
      return rest;
    });

    return {
      success: true,
      data: {
        stats: {
          wins: nextWins,
          losses: nextLosses,
          streak: nextStreak,
          bestStreak: nextBestStreak,
          dailyWinClaimed,
        },
        rewardGranted,
        streakBonusGranted,
        pCredits,
        faultEvents,
        updatedCars,
      },
    };
  } catch (error) {
    console.error("[driftClash] completeClashBattleAction error:", error);
    return { success: false, error: "Failed to record Clash result." };
  }
}

export async function getDriftClashLeaderboard(
  limit = 25
): Promise<DriftClashLeaderboardEntry[]> {
  try {
    const allCardIds = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, 999, { rev: true })) as string[];
    if (!allCardIds || allCardIds.length === 0) return [];

    const cardsByUser = new Map<string, MemberCard[]>();
    const packsOpenedByUser = new Map<string, number>();

    for (let i = 0; i < allCardIds.length; i += 100) {
      const slice = allCardIds.slice(i, i + 100);
      const rows = await redis.mget(...slice.map((id) => memberCardKey(String(id))));
      for (const row of rows) {
        const card = parseStoredCard(row);
        if (!card || !card.userId) continue;

        // Every primary card (not bonus, not featured bonus) counts toward packs opened
        if (!card.bonus) {
          packsOpenedByUser.set(card.userId, (packsOpenedByUser.get(card.userId) ?? 0) + 1);
        }

        // Only active, non-archived cards count toward current collection power
        if (card.archived) continue;
        const list = cardsByUser.get(card.userId) ?? [];
        list.push(publicCard(card));
        cardsByUser.set(card.userId, list);
      }
    }

    const userIds = Array.from(cardsByUser.keys());
    if (userIds.length === 0) return [];

    const entries: DriftClashLeaderboardEntry[] = await Promise.all(
      userIds.map(async (uid) => {
        const userCards = cardsByUser.get(uid) ?? [];
        const [memberHash, clashHash] = await Promise.all([
          redis.hmget<Record<string, unknown>>(
            `member:${uid}`,
            "nickname",
            "name",
            "customAvatar",
            "image"
          ),
          redis.hmget<Record<string, unknown>>(clashStatsKey(uid), "wins"),
        ]);

        const nickname =
          typeof memberHash?.nickname === "string" ? memberHash.nickname.trim() : "";
        const fullName =
          typeof memberHash?.name === "string" ? memberHash.name.trim() : "";
        const fallbackDriver = userCards[0]?.driver?.trim() || "PHD Driver";
        const driverName = nickname || fullName || fallbackDriver;

        const customAvatar =
          typeof memberHash?.customAvatar === "string" && memberHash.customAvatar
            ? memberHash.customAvatar
            : null;
        const oauthImage =
          typeof memberHash?.image === "string" && memberHash.image
            ? memberHash.image
            : null;

        const clashWins = Math.max(0, Number(clashHash?.wins) || 0);
        const packsOpened = packsOpenedByUser.get(uid) ?? userCards.length;
        const progress = getCollectorProgress(userCards, clashWins, packsOpened);

        // Find highest-power car card for showcase
        const carOnly = userCards.filter((c) => c.cardType !== "crew" && !c.crewCardId);
        const sortedByPower = [...(carOnly.length > 0 ? carOnly : userCards)].sort(
          (a, b) => getCardPower(b) - getCardPower(a)
        );
        const best = sortedByPower[0];

        return {
          userId: uid,
          driverName,
          avatarUrl: customAvatar || oauthImage,
          totalCards: userCards.length,
          mythicCount: progress.tierCounts.mythic,
          legendCount: progress.tierCounts.legend,
          goldCount: progress.tierCounts.gold,
          collectorPower: progress.totalPower,
          level: progress.level,
          rankTitle: progress.rankTitle,
          rankIcon: progress.rankIcon,
          packsOpened,
          clashWins,
          topCard: best
            ? {
                carName: best.name,
                tier: best.tier,
                imageUrl: best.imageUrl,
              }
            : null,
        };
      })
    );

    return entries
      .sort((a, b) => {
        if (b.collectorPower !== a.collectorPower) return b.collectorPower - a.collectorPower;
        if (b.mythicCount !== a.mythicCount) return b.mythicCount - a.mythicCount;
        return b.totalCards - a.totalCards;
      })
      .slice(0, limit);
  } catch (error) {
    console.error("[driftClash] getDriftClashLeaderboard error:", error);
    return [];
  }
}
