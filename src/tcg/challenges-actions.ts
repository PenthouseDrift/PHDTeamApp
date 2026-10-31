"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import type { ActionResult } from "@/types";
import type { MemberCard, StoredMemberCard } from "@/lib/card-roll";
import {
  ALL_MEMBER_CARDS_INDEX,
  memberCardKey,
  memberCardsIndexKey,
  fullArtCardKey,
  parseStoredCard,
} from "@/lib/member-card-store";
import { sanitizeFullArtCard, type FullArtCardData } from "@/lib/full-art-card";
import {
  CREW_CARD_SET,
  scaleCrewCardDefinition,
  crewDefinitionToCardData,
} from "@/lib/crew-cards";
import {
  getPCredits,
  grantPCredits,
  spendPCredits,
} from "./storage";
import {
  hasClashEarlyAccess,
  getPlayerClashStats,
  completeClashBattleAction,
} from "./clash";
import {
  SYSTEM_CHALLENGES,
  isCarEligibleForChallenge,
  getCarNormalizedTotalScore,
  getBestCrewCardsForRarity,
  type AdminChallengeInput,
  type TandemClashChallenge,
} from "./challenges-types";
import type { ClashOpponent, ClashPlayerStats } from "./types";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const CHALLENGES_INDEX_KEY = "tcg:challenges:index";
const challengeKey = (id: string) => `tcg:challenge:${id}`;
const userCompletedChallengesKey = (userId: string, date: string) =>
  `tcg:challenges:completed:${userId}:${date}`;

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function parseChallenge(raw: unknown): TandemClashChallenge | null {
  try {
    const val = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!val || typeof val !== "object") return null;
    return val as TandemClashChallenge;
  } catch {
    return null;
  }
}

/** Fetch challenge definition by ID, applying admin customizations stored in Redis */
export async function getChallengeById(challengeId: string): Promise<TandemClashChallenge | null> {
  const raw = await redis.get(challengeKey(challengeId));
  const custom = parseChallenge(raw);
  const sys = SYSTEM_CHALLENGES.find((c) => c.id === challengeId);
  if (custom) {
    return {
      ...custom,
      isSystem: Boolean(sys),
      // Built-in rarity cups allow all cars matching the tier without an arbitrary score cap
      maxTotalScore: sys ? null : custom.maxTotalScore,
    };
  }
  return sys ?? null;
}

/** Convert a stored card into public format */
function toPublicCard(c: StoredMemberCard): MemberCard {
  const { referenceUrl, ...rest } = c;
  void referenceUrl;
  return rest;
}

/**
 * List all active Challenges (Built-in automated Rarity/Stat cups + Admin custom challenges)
 * and the user's completed challenge IDs.
 */
export async function listTandemClashChallengesAction(): Promise<
  ActionResult<{
    challenges: TandemClashChallenge[];
    completedIds: string[];
    pCredits: number;
  }>
> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "Authentication required" };
    }

    // 1. Fetch Admin Custom / Override Challenges from Redis
    const customIds = (await redis.zrange(CHALLENGES_INDEX_KEY, 0, -1, { rev: true })) as string[];
    let customChallenges: TandemClashChallenge[] = [];
    if (customIds && customIds.length > 0) {
      const rows = await redis.mget(...customIds.map((id) => challengeKey(String(id))));
      customChallenges = rows
        .map(parseChallenge)
        .filter((c): c is TandemClashChallenge => c !== null);
    }

    // Merge system challenges with Redis overrides in-place (preserving isSystem: true)
    const systemIds = new Set(SYSTEM_CHALLENGES.map((s) => s.id));
    const mergedSystem = SYSTEM_CHALLENGES.map((sys) => {
      const override = customChallenges.find((c) => c.id === sys.id);
      if (!override) return sys;
      return {
        ...override,
        isSystem: true,
        // Built-in rarity cups allow all cars matching the tier without an arbitrary score cap
        maxTotalScore: null,
      };
    });

    // Custom challenges are only bespoke challenges whose ID is not a system cup
    const bespokeCustom = customChallenges.filter((c) => !systemIds.has(c.id));
    const allChallenges = [...mergedSystem, ...bespokeCustom];

    // 2. Fetch completed challenge IDs for current user today
    const today = todayUtc();
    const completedRaw = await redis.smembers(userCompletedChallengesKey(userId, today));
    const completedIds = Array.isArray(completedRaw) ? (completedRaw as string[]) : [];

    // 3. User P-Credits
    const pCredits = await getPCredits(userId);

    return {
      success: true,
      data: {
        challenges: allChallenges,
        completedIds,
        pCredits,
      },
    };
  } catch (error) {
    console.error("[challenges-actions] listTandemClashChallengesAction error:", error);
    return {
      success: false,
      error: "Could not load Tandem Clash challenges.",
    };
  }
}

/**
 * Dynamically builds or loads the rival opponent for a challenge.
 * For automated challenges, selects the BEST member cards meeting the challenge restrictions.
 */
export async function getChallengeOpponentAction(
  challengeId: string
): Promise<ActionResult<ClashOpponent>> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Authentication required" };

    // Find challenge definition (checks Redis overrides first, then system defaults)
    const challenge = await getChallengeById(challengeId);
    if (!challenge) {
      return { success: false, error: "Challenge not found" };
    }

    // Case A: Custom Admin Challenge with hand-picked cards
    if (challenge.customRival?.carCardIds && challenge.customRival.carCardIds.length >= 3) {
      const cardIds = challenge.customRival.carCardIds.slice(0, 3);
      const pickedCars: MemberCard[] = [];

      for (const cid of cardIds) {
        // Try member card first
        const rawM = await redis.get(memberCardKey(cid));
        const parsedM = parseStoredCard(rawM);
        if (parsedM) {
          pickedCars.push(toPublicCard(parsedM));
          continue;
        }
        // Try full art set card
        const rawFA = await redis.get(fullArtCardKey(cid));
        if (rawFA) {
          try {
            const faVal = typeof rawFA === "string" ? JSON.parse(rawFA) : rawFA;
            const san = sanitizeFullArtCard(faVal);
            pickedCars.push({
              id: cid,
              userId: "set-card",
              name: san.name,
              ability: san.ability,
              effect: san.effect,
              tier: san.tier,
              stats: san.stats,
              imageUrl: san.imageUrl,
              imageZoom: san.imageZoom,
              imageX: san.imageX,
              imageY: san.imageY,
              driver: san.driver || "Pro Spec",
              team: san.team || "Team PHD",
              styleIds: [],
              kept: true,
              rerolled: false,
              createdAt: 0,
            });
          } catch {}
        }
      }

      if (pickedCars.length === 3) {
        const defaultTier = challenge.allowedRarity !== "any" ? challenge.allowedRarity : "gold";
        let crewCards: [MemberCard, MemberCard, MemberCard];

        if (
          challenge.customRival.crewCards &&
          challenge.customRival.crewCards.length === 3
        ) {
          crewCards = challenge.customRival.crewCards.map((item) => {
            const def = CREW_CARD_SET.find((d) => d.id === item.cardId) ?? CREW_CARD_SET[0];
            const tier = item.tier || defaultTier;
            return crewDefinitionToCardData(scaleCrewCardDefinition(def, tier)) as MemberCard;
          }) as [MemberCard, MemberCard, MemberCard];
        } else {
          crewCards = getBestCrewCardsForRarity(defaultTier);
        }

        const challengeCars = pickedCars.map((c, idx) => ({
          ...c,
          driver: challenge.customRival?.driverName || `${challenge.title} #${idx + 1}`,
          team: challenge.customRival?.teamName || challenge.title,
        }));

        return {
          success: true,
          data: {
            id: `opponent-${challenge.id}`,
            driverName: challenge.customRival.driverName || challenge.title,
            teamName: challenge.customRival.teamName || challenge.badge || challenge.title,
            title: challenge.customRival.title || challenge.title,
            crewPower: challengeCars.reduce((sum, c) => sum + getCarNormalizedTotalScore(c), 0),
            cards: challengeCars,
            crewCard: crewCards[0],
            crewCards,
          },
        };
      }
    }

    // Case B: Automated Challenge -> Query candidate cards for the challenge's spec
    const allIds = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, 999, { rev: true })) as string[];
    let candidateCards: MemberCard[] = [];
    const targetTier = challenge.allowedRarity !== "any" ? challenge.allowedRarity : "bronze";

    if (allIds && allIds.length > 0) {
      // Load batch of member cards
      const sampleIds = allIds.slice(0, 300);
      const rows = await redis.mget(...sampleIds.map((id) => memberCardKey(String(id))));
      const cards = rows
        .map(parseStoredCard)
        .filter((c): c is StoredMemberCard => c !== null && !c.archived && !c.cardType && !c.crewCardId)
        .map(toPublicCard);

      // Filter strictly by challenge restrictions and exclude player's own cards
      candidateCards = cards.filter((c) => {
        if (userId && c.userId === userId) return false;
        if (challenge.allowedRarity && challenge.allowedRarity !== "any") {
          if (c.tier !== challenge.allowedRarity) return false;
        }
        if (typeof challenge.maxTotalScore === "number" && challenge.maxTotalScore > 0) {
          const total = getCarNormalizedTotalScore(c);
          if (total > challenge.maxTotalScore) return false;
        }
        return true;
      });

      // Sort candidate cards by score descending to get the ABSOLUTE BEST
      candidateCards.sort((a, b) => getCarNormalizedTotalScore(b) - getCarNormalizedTotalScore(a));
    }

    // Pick top 3 cards
    const selectedBestCars: MemberCard[] = [];
    for (const card of candidateCards) {
      if (selectedBestCars.length >= 3) break;
      if (!selectedBestCars.some((c) => c.id === card.id)) {
        selectedBestCars.push(card);
      }
    }

    // Backfill if fewer than 3 cards meeting the constraints
    const backfillNames = ["Spec-R Works", "Apex RDX", "Ghost S15"];
    while (selectedBestCars.length < 3) {
      const idx = selectedBestCars.length;
      const targetStat =
        challenge.maxTotalScore && challenge.maxTotalScore <= 60
          ? "15"
          : targetTier === "legend"
            ? "23"
            : targetTier === "gold"
              ? "19"
              : targetTier === "silver"
                ? "17"
                : "15";

      selectedBestCars.push({
        id: `challenge-filler-${targetTier}-${idx}`,
        userId: "challenge-bot",
        name: `${challenge.title} ${backfillNames[idx]}`,
        ability: "Pro Competition Chassis",
        effect: "Hand-tuned precision RC drift setup.",
        tier: targetTier,
        stats: { drift: targetStat, accel: targetStat, grip: targetStat, steer: targetStat },
        imageUrl: "/icons/icon-512.png",
        imageZoom: 106,
        imageX: 50,
        imageY: 50,
        driver: `${challenge.badge || challenge.title} #${idx + 1}`,
        team: challenge.title,
        styleIds: [],
        kept: true,
        rerolled: false,
        createdAt: 0,
      });
    }

    // Sanitize challenge cars: enforce exact tier and strip individual member ownership
    const sanitizedChallengeCars: MemberCard[] = selectedBestCars.map((c, idx) => ({
      ...c,
      tier: targetTier,
      driver: `${challenge.badge || challenge.title} #${idx + 1}`,
      team: challenge.title,
    }));

    const tierForCrew = challenge.allowedRarity !== "any" ? challenge.allowedRarity : "gold";
    const crewCards = getBestCrewCardsForRarity(tierForCrew);

    const opponent: ClashOpponent = {
      id: `opponent-${challenge.id}`,
      driverName: challenge.title,
      teamName: challenge.badge || challenge.title,
      title: challenge.subtitle,
      crewPower: sanitizedChallengeCars.reduce((sum, c) => sum + getCarNormalizedTotalScore(c), 0),
      cards: sanitizedChallengeCars,
      crewCard: crewCards[0],
      crewCards,
    };

    return { success: true, data: opponent };
  } catch (error) {
    console.error("[challenges-actions] getChallengeOpponentAction error:", error);
    return { success: false, error: "Could not generate challenge opponent." };
  }
}

/**
 * Enters and launches a Challenge.
 * Deducts entry P-Credits if configured.
 */
export async function startChallengeBattleAction(
  challengeId: string
): Promise<
  ActionResult<{
    challenge: TandemClashChallenge;
    opponent: ClashOpponent;
    pCredits: number;
  }>
> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Authentication required" };

    const hasAccess = await hasClashEarlyAccess(userId, session.user.role);
    if (!hasAccess) {
      return {
        success: false,
        error: "Tandem Clash is currently in private Early Access.",
      };
    }

    const challenge = await getChallengeById(challengeId);
    if (!challenge) {
      return { success: false, error: "Challenge not found" };
    }

    // Enforce once-per-day completion limit
    const today = todayUtc();
    const alreadyWonToday = await redis.sismember(
      userCompletedChallengesKey(userId, today),
      challengeId
    );
    if (alreadyWonToday) {
      return {
        success: false,
        error: "You have already completed this Challenge Cup today! Resets daily at 00:00 UTC.",
      };
    }

    // Verify user owns at least 3 qualifying cars for this challenge
    const userCardIds = (await redis.zrange(memberCardsIndexKey(userId), 0, 499, { rev: true })) as string[];
    let userCars: MemberCard[] = [];
    if (userCardIds && userCardIds.length > 0) {
      const rows = await redis.mget(...userCardIds.map((id) => memberCardKey(String(id))));
      userCars = rows.map(parseStoredCard).filter((c): c is StoredMemberCard => c !== null).map(toPublicCard);
    }
    const qualifyingCount = userCars.filter((c) => isCarEligibleForChallenge(c, challenge).eligible).length;
    if (qualifyingCount < 3) {
      return {
        success: false,
        error: `You need at least 3 qualifying ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : ""} cars in your deck to enter this challenge (you have ${qualifyingCount}/3).`,
      };
    }

    // Deduct entry cost if applicable
    let pCredits = await getPCredits(userId);
    if (challenge.entryCostPCredits > 0) {
      const spend = await spendPCredits(userId, challenge.entryCostPCredits);
      if (!spend.ok) {
        return {
          success: false,
          error: `Insufficient P-Credits. This challenge requires ${challenge.entryCostPCredits} P-Credits (you have ${spend.balance}).`,
        };
      }
      pCredits = spend.balance;
    }

    // Generate opponent
    const oppRes = await getChallengeOpponentAction(challengeId);
    if (!oppRes.success || !oppRes.data) {
      // Refund entry fee if opponent generation failed
      if (challenge.entryCostPCredits > 0) {
        pCredits = await grantPCredits(userId, challenge.entryCostPCredits);
      }
      const errMsg = !oppRes.success ? oppRes.error : "Could not generate challenge rival.";
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      data: {
        challenge,
        opponent: oppRes.data,
        pCredits,
      },
    };
  } catch (error) {
    console.error("[challenges-actions] startChallengeBattleAction error:", error);
    return { success: false, error: "Could not enter challenge." };
  }
}

/**
 * Records the outcome of a Challenge battle.
 * If won, awards challenge P-Credits reward and adds to user's completed set.
 */
export async function completeChallengeBattleAction(input: {
  challengeId: string;
  won: boolean;
  playedCarCardIds?: string[];
}): Promise<
  ActionResult<{
    won: boolean;
    rewardGranted: number;
    pCredits: number;
    challengeCompleted: boolean;
    stats: ClashPlayerStats;
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
    if (!userId) return { success: false, error: "Authentication required" };

    const { challengeId, won, playedCarCardIds = [] } = input;

    const challenge = await getChallengeById(challengeId);

    // 1. Process Clash battle result + streak + durability wear via clash core action
    const battleRes = await completeClashBattleAction({ won, playedCarCardIds });
    if (!battleRes.success) {
      return { success: false, error: battleRes.error };
    }

    let pCredits = battleRes.data.pCredits;
    let rewardGranted = battleRes.data.rewardGranted + battleRes.data.streakBonusGranted;
    let challengeCompleted = false;

    // 2. Award Challenge P-Credits if won and mark as completed for today
    const today = todayUtc();
    if (won && challenge) {
      // Server-side verification: Ensure played cars meet challenge restrictions
      if (playedCarCardIds.length >= 3) {
        const rows = await redis.mget(
          ...playedCarCardIds.slice(0, 3).map((id) => memberCardKey(String(id)))
        );
        const cards = rows
          .map(parseStoredCard)
          .filter((c): c is StoredMemberCard => c !== null)
          .map(toPublicCard);
        const allEligible =
          cards.length === 3 &&
          cards.every((c) => isCarEligibleForChallenge(c, challenge).eligible);
        if (!allEligible) {
          return {
            success: false,
            error:
              "One or more cars in your lineup did not meet this challenge's requirements.",
          };
        }
      }

      const alreadyWonToday = await redis.sismember(
        userCompletedChallengesKey(userId, today),
        challenge.id
      );
      if (!alreadyWonToday) {
        challengeCompleted = true;
        await redis.sadd(userCompletedChallengesKey(userId, today), challenge.id);
        await redis.expire(userCompletedChallengesKey(userId, today), 172800);

        if (challenge.rewardPCredits > 0) {
          rewardGranted += challenge.rewardPCredits;
          pCredits = await grantPCredits(userId, challenge.rewardPCredits);
        }
      }
    }

    revalidatePath("/cards");
    revalidatePath("/");

    return {
      success: true,
      data: {
        won,
        rewardGranted,
        pCredits,
        challengeCompleted,
        stats: battleRes.data.stats,
        faultEvents: battleRes.data.faultEvents,
        updatedCars: battleRes.data.updatedCars ?? [],
      },
    };
  } catch (error) {
    console.error("[challenges-actions] completeChallengeBattleAction error:", error);
    return { success: false, error: "Could not record challenge battle outcome." };
  }
}

// ── Admin Actions ────────────────────────────────────────────────────────────

/** Create or update an admin custom Challenge */
export async function saveAdminChallengeAction(
  input: AdminChallengeInput
): Promise<ActionResult<TandemClashChallenge>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Admin clearance required" };
    }

    const title = input.title?.trim();
    if (!title) return { success: false, error: "Challenge title is required" };

    const isSystemChallenge = SYSTEM_CHALLENGES.some((s) => s.id === input.id);
    const id = input.id && /^[a-z0-9-]{6,64}$/i.test(input.id) ? input.id : `ch-${randomUUID().slice(0, 8)}`;
    const challenge: TandemClashChallenge = {
      id,
      title,
      subtitle: input.subtitle?.trim() || "Admin Drift Showcase",
      description: input.description?.trim() || "Exclusive bespoke challenge tournament.",
      badge: input.badge?.trim() || (isSystemChallenge ? "System Cup" : "Admin Cup"),
      themeStyle: input.themeStyle || "legend",
      allowedRarity: input.allowedRarity || "any",
      maxTotalScore:
        !isSystemChallenge && typeof input.maxTotalScore === "number" && input.maxTotalScore > 0
          ? input.maxTotalScore
          : null,
      entryCostPCredits: Math.max(0, Math.floor(Number(input.entryCostPCredits) || 0)),
      rewardPCredits: Math.max(0, Math.floor(Number(input.rewardPCredits) || 0)),
      isSystem: isSystemChallenge,
      createdAt: Date.now(),
      customRival: input.customRival ?? null,
    };

    await redis.set(challengeKey(id), JSON.stringify(challenge));
    await redis.zadd(CHALLENGES_INDEX_KEY, { score: challenge.createdAt, member: id });

    revalidatePath("/cards");
    return { success: true, data: challenge };
  } catch (error) {
    console.error("[challenges-actions] saveAdminChallengeAction error:", error);
    return { success: false, error: "Failed to save custom challenge." };
  }
}

/** Delete an admin custom Challenge or reset a built-in cup to factory defaults */
export async function deleteAdminChallengeAction(
  challengeId: string
): Promise<ActionResult<{ reset: boolean }>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Admin clearance required" };
    }

    await redis.del(challengeKey(challengeId));
    await redis.zrem(CHALLENGES_INDEX_KEY, challengeId);

    const isSystem = SYSTEM_CHALLENGES.some((s) => s.id === challengeId);

    revalidatePath("/cards");
    return { success: true, data: { reset: isSystem } };
  } catch (error) {
    console.error("[challenges-actions] deleteAdminChallengeAction error:", error);
    return { success: false, error: "Failed to delete challenge." };
  }
}

/**
 * List candidate car cards (Member cards & pullable set cards) for admin challenge creation
 */
export async function listAdminChallengeCandidateCardsAction(): Promise<
  ActionResult<Array<{ id: string; name: string; tier: string; driver: string; team: string; imageUrl: string; isSetCard: boolean; totalScore: number }>>
> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Admin clearance required" };

    const candidates: Array<{ id: string; name: string; tier: string; driver: string; team: string; imageUrl: string; isSetCard: boolean; totalScore: number }> = [];

    // 1. Pullable / Saved Set Cards
    const faIds = (await redis.zrange("fullart:index", 0, 99, { rev: true })) as string[];
    if (faIds && faIds.length > 0) {
      const rows = await redis.mget(...faIds.map((id) => fullArtCardKey(String(id))));
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i];
        if (!raw) continue;
        try {
          const val = typeof raw === "string" ? JSON.parse(raw) : raw;
          const san = sanitizeFullArtCard(val);
          if (san.imageUrl && !san.cardType) {
            candidates.push({
              id: faIds[i],
              name: san.name,
              tier: san.tier,
              driver: san.driver || "Pro Pilot",
              team: san.team || "Set Card",
              imageUrl: san.imageUrl,
              isSetCard: true,
              totalScore: getCarNormalizedTotalScore(san),
            });
          }
        } catch {}
      }
    }

    // 2. Member Cards from Community Pool
    const mIds = (await redis.zrange(ALL_MEMBER_CARDS_INDEX, 0, 99, { rev: true })) as string[];
    if (mIds && mIds.length > 0) {
      const rows = await redis.mget(...mIds.map((id) => memberCardKey(String(id))));
      for (let i = 0; i < rows.length; i++) {
        const parsed = parseStoredCard(rows[i]);
        if (parsed && !parsed.cardType && !parsed.crewCardId && parsed.imageUrl) {
          candidates.push({
            id: parsed.id,
            name: parsed.name,
            tier: parsed.tier,
            driver: parsed.driver || parsed.ownerName || "Member",
            team: parsed.team || "Community",
            imageUrl: parsed.imageUrl,
            isSetCard: false,
            totalScore: getCarNormalizedTotalScore(parsed),
          });
        }
      }
    }

    return { success: true, data: candidates };
  } catch (error) {
    console.error("[challenges-actions] listAdminChallengeCandidateCardsAction error:", error);
    return { success: false, error: "Failed to load candidate cards." };
  }
}
