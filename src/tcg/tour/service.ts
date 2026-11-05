import { randomBytes, randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import type { MemberCard } from "@/lib/card-roll";
import { getCardCredits, grantCardCredits } from "@/lib/card-credits";
import { isCrewCard } from "@/lib/crew-cards";
import { isCarBroken } from "@/lib/mechanical-faults";
import {
  ALL_MEMBER_CARDS_INDEX,
  memberCardKey,
  memberCardsIndexKey,
  parseStoredCard,
} from "@/lib/member-card-store";
import { getNormalizedCardStats } from "@/tcg/progression";
import { TCG_MARKET_BY_CARD_KEY, getPCredits, grantPCredits, spendPCredits } from "@/tcg/storage";
import { buildBot, loadoutAverage } from "./bots";
import { nextPrizeAfter, prizeForWins } from "./config";
import { repairAmount } from "./condition";
import { finishRound, prepareRound, type ResolveInput } from "./engine";
import { RUN_SECONDS } from "./replay/course-timing";
import { angleLimit, decodeTrace, prepareDrive, simulateDrive } from "./replay/drive-sim";
import { TOUR_LOANER_CARS, TOUR_LOANER_CREW } from "./loaners";
import { addLadderPoints, addLedger, addNote, bumpDaily, bumpStat, bumpStatFloat, claimActiveSlot, claimOnce, clearNotes, daysBetween, endMarkKey, getActiveRunId, isOnEarlyAccessList, kitMarkKey, loadDaily, loadProfile, loadRun, loadTourConfig, pickGhost, recordDrive, releaseActiveSlot, saveGhost, saveRun, setActiveRun, takeNotes, ukDate, underRateLimit, updateProfile, withRunLock } from "./store";
import { applyRatingDelta, ladderPoints } from "./rating";
import { makeRng } from "./rng";
import {
  applyContinue,
  applyKit,
  applyPick,
  applyReroll,
  applyRoundResult,
  bestRoundOf,
  createRunState,
  rerollCost,
  tourIsOver,
} from "./run-logic";
import { getUpgradeDef } from "./upgrades";
import {
  STANCES,
  TOUR_MAX_CARS,
  TOUR_MAX_CREW,
  TOUR_MAX_KITS,
  type Stance,
  type TourConfig,
  type TourEligibleCards,
  type TourDriveSpec,
  type TourGhost,
  type TourLobbyView,
  type TourLoadout,
  type TourOpponent,
  type TourOpponentPreview,
  type TourRunState,
  type TourRunView,
  type TourSummary,
} from "./types";

/**
 * Tandem Tour server logic. Plain functions that take the signed-in member explicitly; actions.ts is the thin
 * "use server" layer that checks the session and calls these. Keeping the logic here means the cron sweeper can call
 * it too, without exposing it to the browser.
 */

export interface TourUser {
  id: string;
  name: string;
  role?: string | null;
}

const isAdmin = (u: TourUser) => u.role === "admin";

// ── Access ──────────────────────────────────────────────────────────────────

export async function getAccess(user: TourUser): Promise<{ ok: boolean; reason: string | null; config: TourConfig }> {
  const config = await loadTourConfig();
  if (isAdmin(user)) return { ok: true, reason: config.enabled ? null : "Only admins can see Tandem Tour until it is switched on.", config };
  if (!config.enabled) return { ok: false, reason: "Tandem Tour isn't open yet.", config };
  if (config.earlyAccessOnly && !(await isOnEarlyAccessList(user.id))) {
    return { ok: false, reason: "Tandem Tour is in early access. It will open to everyone soon.", config };
  }
  return { ok: true, reason: null, config };
}

async function requireAccess(user: TourUser): Promise<TourConfig> {
  const access = await getAccess(user);
  if (!access.ok) throw new Error(access.reason ?? "Tandem Tour isn't available.");
  if (!(await underRateLimit(user.id))) throw new Error("You're going a bit fast. Wait a moment and try again.");
  return access.config;
}

// ── Cards ───────────────────────────────────────────────────────────────────

type Kind = "car" | "crew" | "kit" | "other";

function kindOf(card: Pick<MemberCard, "cardType" | "crewCardId" | "name">): Kind {
  if (card.cardType === "maintenance") return "kit";
  if (isCrewCard(card)) return "crew";
  if (!card.cardType || card.cardType === "car") return card.crewCardId ? "other" : "car";
  return "other";
}

async function loadOwnCards(userId: string): Promise<MemberCard[]> {
  const ids = ((await redis.zrange(memberCardsIndexKey(userId), 0, 599, { rev: true })) as unknown[]).map(String);
  if (ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => memberCardKey(id)));
  const out: MemberCard[] = [];
  for (const raw of rows) {
    const stored = parseStoredCard(raw);
    if (!stored || stored.userId !== userId || stored.archived) continue;
    const { referenceUrl, ...card } = stored;
    void referenceUrl;
    out.push(card);
  }
  return out;
}

async function listedCardIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const found = (await redis.hmget(TCG_MARKET_BY_CARD_KEY, ...ids)) as Record<string, unknown> | null;
    return new Set(Object.entries(found ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k]) => k));
  } catch {
    return new Set();
  }
}

export async function getEligibleCards(user: TourUser): Promise<TourEligibleCards> {
  const cards = await loadOwnCards(user.id);
  const listed = await listedCardIds(cards.map((c) => c.id));
  const power = (c: MemberCard) => {
    const n = getNormalizedCardStats(c);
    return n.drift + n.accel + n.grip + n.steer;
  };
  const out: TourEligibleCards = {
    cars: [], crew: [], kits: [], blocked: [], maxCars: TOUR_MAX_CARS, maxCrew: TOUR_MAX_CREW, maxKits: TOUR_MAX_KITS,
  };
  for (const card of cards) {
    const kind = kindOf(card);
    if (kind === "other") continue;
    if (listed.has(card.id) || card.listedPrice) {
      out.blocked.push({ card, reason: "Listed for sale on the Marketplace" });
      continue;
    }
    if (kind === "car") {
      if (isCarBroken(card)) out.blocked.push({ card, reason: "Broken: it needs a repair first" });
      else out.cars.push(card);
    } else if (kind === "crew") out.crew.push(card);
    else out.kits.push(card);
  }
  out.cars.sort((a, b) => power(b) - power(a));
  return out;
}

// ── Views ───────────────────────────────────────────────────────────────────

export function toRunView(state: TourRunState, config: TourConfig): TourRunView {
  const cost = rerollCost(state, config);
  return {
    id: state.id,
    status: state.status,
    step: state.step,
    round: state.round,
    maxRounds: state.maxRounds,
    strikes: state.strikes,
    maxStrikes: state.maxStrikes,
    wins: state.wins,
    loadout: state.loadout,
    condition: state.condition,
    usedKitIds: state.usedKitIds,
    upgrades: state.upgrades.map((u) => ({ ...u, def: getUpgradeDef(u.id, config, true) })),
    offers: state.offers
      ? state.offers.map((id) => getUpgradeDef(id, config, true)).filter((d): d is NonNullable<typeof d> => d !== null).map((def) => ({ def }))
      : null,
    rerollsUsed: state.rerollsUsed,
    rerollPrice: cost ?? -1,
    nextRoundInfo: { round: state.round },
    opponent: state.preview,
    drive: state.drive?.spec ?? null,
    stanceHistory: state.stanceHistory,
    rounds: state.rounds,
    lastLog: state.lastLog,
    summary: state.summary,
    decisionTimerSeconds: config.decisionTimerSeconds,
  };
}

async function ownedRun(user: TourUser, runId: string): Promise<TourRunState> {
  const state = await loadRun(runId);
  if (!state || state.userId !== user.id) throw new Error("That Tour wasn't found.");
  return state;
}

// ── Lobby ───────────────────────────────────────────────────────────────────

export async function getLobby(user: TourUser): Promise<TourLobbyView> {
  const access = await getAccess(user);
  const config = access.config;
  const [profile, daily, pCredits, packCredits, notes, activeId] = await Promise.all([
    loadProfile(user.id, config.tuning.startRating),
    loadDaily(user.id),
    getPCredits(user.id),
    getCardCredits(user.id),
    takeNotes(user.id),
    getActiveRunId(user.id),
  ]);
  let hasActiveRun = false;
  if (activeId) {
    const run = await loadRun(activeId);
    hasActiveRun = Boolean(run && run.status === "active");
    if (!hasActiveRun) await releaseActiveSlot(user.id);
  }
  const free = isAdmin(user) && config.adminsRunFree;
  const personalCap = profile.dailyLimit > 0 ? profile.dailyLimit : Infinity;
  const paidCap = Math.min(config.maxPaidRunsPerDay, personalCap);
  return {
    enabled: config.enabled,
    canPlay: access.ok,
    reason: access.reason,
    rating: profile.rating,
    streak: profile.streak,
    freezes: profile.freezes,
    bestWins: profile.bestWins,
    tours: profile.tours,
    freeRunsLeft: free ? 99 : Math.max(0, config.freeRunsPerDay - daily.free),
    paidRunsLeft: Math.max(0, paidCap - daily.paid),
    entryPrice: config.entryPricePCredits,
    rerollPrice: config.rerollPricePCredits,
    maxRounds: config.maxRounds,
    maxStrikes: config.maxStrikes,
    bestAccuracy: profile.bestAccuracy,
    averageAccuracy: profile.drives > 0 ? profile.accuracySum / profile.drives : 0,
    drives: profile.drives,
    prizes: config.prizes,
    streakRewards: config.streakRewards,
    notes,
    hasActiveRun,
    pCredits,
    packCredits,
    optOut: profile.optOut,
    dailyLimit: profile.dailyLimit,
    spentToday: daily.spent,
    decisionTimerSeconds: config.decisionTimerSeconds,
    tutorialSeen: profile.tutorialSeen,
  };
}

export async function setPrefs(user: TourUser, prefs: { optOut?: boolean; dailyLimit?: number; tutorialSeen?: boolean }): Promise<void> {
  const fields: Record<string, string | number> = {};
  if (prefs.optOut !== undefined) fields.optOut = prefs.optOut ? "1" : "0";
  if (prefs.dailyLimit !== undefined) fields.dailyLimit = Math.max(0, Math.min(50, Math.floor(prefs.dailyLimit) || 0));
  if (prefs.tutorialSeen !== undefined) fields.tutorialSeen = prefs.tutorialSeen ? "1" : "0";
  await updateProfile(user.id, fields);
}

export async function dismissNotes(user: TourUser): Promise<void> {
  await clearNotes(user.id);
}

// ── Starting a Tour ─────────────────────────────────────────────────────────

export async function startTour(user: TourUser, input: { carIds: string[]; crewIds: string[]; kitIds: string[]; actionKey: string }): Promise<TourRunView> {
  try {
    return await startTourInner(user, input);
  } catch (error) {
    // Let the member try again with the same request key.
    if (/^[a-z0-9-]{8,64}$/i.test(input.actionKey || "")) {
      await redis.del(`tcg:tour:start:${user.id}:${input.actionKey}`).catch(() => null);
    }
    throw error;
  }
}

async function startTourInner(user: TourUser, input: { carIds: string[]; crewIds: string[]; kitIds: string[]; actionKey: string }): Promise<TourRunView> {
  const config = await requireAccess(user);
  if (!/^[a-z0-9-]{8,64}$/i.test(input.actionKey || "")) throw new Error("Something went wrong. Please try again.");

  // The same request twice (a double tap, a retry) gives back the Tour it already started.
  const first = await claimOnce(`tcg:tour:start:${user.id}:${input.actionKey}`, 3600);
  if (!first) {
    const existing = await getActiveRunId(user.id);
    const run = existing ? await loadRun(existing) : null;
    if (run && run.status === "active") return toRunView(run, config);
    throw new Error("That request was already handled.");
  }

  // Cards: only the member's own, eligible ones, within the limits.
  const eligible = await getEligibleCards(user);
  const pickFrom = (pool: MemberCard[], ids: string[], max: number, label: string) => {
    const unique = [...new Set(ids)];
    if (unique.length > max) throw new Error(`You can bring at most ${max} ${label}.`);
    return unique.map((id) => {
      const card = pool.find((c) => c.id === id);
      if (!card) throw new Error(`One of the ${label} you chose isn't available any more. Please choose again.`);
      return card;
    });
  };
  const cars = pickFrom(eligible.cars, input.carIds, TOUR_MAX_CARS, "cars");
  const crew = pickFrom(eligible.crew, input.crewIds, TOUR_MAX_CREW, "crew cards");
  const kits = pickFrom(eligible.kits, input.kitIds, TOUR_MAX_KITS, "repair kits");
  // Loaners fill the gaps so a new member can still play.
  while (cars.length < 3) cars.push(TOUR_LOANER_CARS[cars.length % TOUR_LOANER_CARS.length]);
  while (crew.length < 3) crew.push(TOUR_LOANER_CREW[crew.length % TOUR_LOANER_CREW.length]);
  const loadout: TourLoadout = { cars: dedupeById(cars), crew: dedupeById(crew), kits };

  // One Tour at a time.
  if (!(await claimActiveSlot(user.id))) {
    const existing = await getActiveRunId(user.id);
    const run = existing ? await loadRun(existing) : null;
    if (run && run.status === "active") throw new Error("You already have a Tour in progress. Resume it from the lobby.");
    await releaseActiveSlot(user.id);
    if (!(await claimActiveSlot(user.id))) throw new Error("You already have a Tour in progress.");
  }

  // Charge: a free run if one is left, otherwise the entry price. Anything that fails after this refunds.
  const paid = { free: true, pCredits: 0 };
  let undo: (() => Promise<void>) | null = null;
  try {
    const profile = await loadProfile(user.id, config.tuning.startRating);
    const free = isAdmin(user) && config.adminsRunFree;
    if (!free) {
      const daily = await loadDaily(user.id);
      let usedFree = false;
      if (daily.free < config.freeRunsPerDay) {
        const n = await bumpDaily(user.id, "free", 1);
        if (n <= config.freeRunsPerDay) {
          usedFree = true;
          undo = async () => void (await bumpDaily(user.id, "free", -1));
        } else await bumpDaily(user.id, "free", -1);
      }
      if (!usedFree) {
        const cap = Math.min(config.maxPaidRunsPerDay, profile.dailyLimit > 0 ? profile.dailyLimit : Infinity);
        if (daily.paid >= cap) {
          throw new Error(
            cap <= 0
              ? "There are no free runs left today."
              : `You've reached your limit of ${cap} paid run${cap === 1 ? "" : "s"} today. Free runs come back tomorrow.`
          );
        }
        const price = config.entryPricePCredits;
        if (price > 0) {
          const spent = await spendPCredits(user.id, price);
          if (!spent.ok) throw new Error(`A paid run costs ${price} P-Credits and you have ${spent.balance}.`);
        }
        const n = await bumpDaily(user.id, "paid", 1);
        if (n > cap) {
          await bumpDaily(user.id, "paid", -1);
          if (price > 0) await grantPCredits(user.id, price);
          throw new Error("You've reached your paid run limit for today.");
        }
        if (price > 0) await bumpDaily(user.id, "spent", price);
        paid.free = false;
        paid.pCredits = price;
        undo = async () => {
          await bumpDaily(user.id, "paid", -1);
          if (price > 0) {
            await bumpDaily(user.id, "spent", -price);
            await grantPCredits(user.id, price);
          }
        };
      }
    }

    const id = randomUUID();
    const state = createRunState({
      id,
      userId: user.id,
      userName: user.name,
      seed: randomBytes(24).toString("hex"),
      config,
      loadout,
      rating: profile.rating,
      paid,
      now: Date.now(),
    });
    await saveRun(state);
    await setActiveRun(user.id, id);

    await bumpStat("started", 1);
    await bumpStat(paid.free ? "free_runs" : "paid_runs", 1);
    if (paid.pCredits > 0) await bumpStat("pcredits_in", paid.pCredits);
    await addLedger({ type: "start", userId: user.id, runId: id, free: paid.free, charged: paid.pCredits });
    return toRunView(state, config);
  } catch (error) {
    if (undo) await undo().catch((e) => console.error("[tour] refund failed:", e));
    await releaseActiveSlot(user.id).catch(() => null);
    throw error;
  }
}

function dedupeById(cards: MemberCard[]): MemberCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export async function resumeTour(user: TourUser): Promise<TourRunView | null> {
  const config = await requireAccess(user);
  const id = await getActiveRunId(user.id);
  if (!id) return null;
  const first = await loadRun(id);
  if (!first || first.status !== "active") {
    await releaseActiveSlot(user.id);
    return null;
  }
  if (first.step !== "drive") return toRunView(first, config);

  // The page was closed or reloaded in the middle of a drive. One restart is allowed per Tour; after that the drive is
  // scored as left unsteered, so reloading can't be used to try a drive over and over.
  return withRunLock(id, async () => {
    const state = await loadRun(id);
    if (!state || state.status !== "active" || state.step !== "drive" || !state.drive) return state ? toRunView(state, config) : null;
    const used = state.restartsUsed ?? 0;
    if (used < 1) {
      const next: TourRunState = { ...state, restartsUsed: used + 1, drive: { ...state.drive, startedAt: Date.now() }, updatedAt: Date.now() };
      await saveRun(next);
      return toRunView(next, config);
    }
    return finishDriveWith(user, state, new Int8Array(0), true, config);
  });
}

// ── Pit Phase ───────────────────────────────────────────────────────────────

export async function pickUpgrade(user: TourUser, runId: string, upgradeId: string | null): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status !== "active" || state.step !== "pit") throw new Error("You can't choose an upgrade right now.");
    if (!state.offers) return toRunView(state, config);
    if (upgradeId !== null && !state.offers.includes(upgradeId)) throw new Error("That upgrade wasn't offered.");
    const next = { ...applyPick(state, upgradeId, config), updatedAt: Date.now() };
    await saveRun(next);
    return toRunView(next, config);
  });
}

export async function rerollOffers(user: TourUser, runId: string): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status !== "active" || state.step !== "pit" || !state.offers) throw new Error("You can't reroll right now.");
    const cost = rerollCost(state, config);
    if (cost === null) throw new Error("You've used your free reroll.");
    if (cost > 0) {
      const spent = await spendPCredits(user.id, cost);
      if (!spent.ok) throw new Error(`A reroll costs ${cost} P-Credits and you have ${spent.balance}.`);
      await bumpStat("pcredits_in", cost);
      await addLedger({ type: "reroll", userId: user.id, runId, charged: cost });
    }
    const next = { ...applyReroll(state, config), updatedAt: Date.now() };
    await saveRun(next);
    return toRunView(next, config);
  });
}

export async function useRepairKit(user: TourUser, runId: string, kitId: string, carId: string): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status !== "active" || state.step !== "pit") throw new Error("You can only use a repair kit in the Pit Phase.");
    const kit = state.loadout.kits.find((k) => k.id === kitId);
    if (!kit) throw new Error("That repair kit isn't in your loadout.");
    if (state.usedKitIds.includes(kitId)) throw new Error("That repair kit has already been used.");
    if (!state.loadout.cars.some((c) => c.id === carId)) throw new Error("That car isn't in your loadout.");
    if ((state.condition[carId] ?? 100) >= 100) throw new Error("That car is already in perfect condition.");

    // The kit is a real card: check it is still theirs, then spend it. The mark makes sure it is spent once.
    const stored = parseStoredCard(await redis.get(memberCardKey(kitId)));
    if (!stored || stored.userId !== user.id || stored.cardType !== "maintenance") {
      throw new Error("That repair kit is no longer in your collection.");
    }
    if (!(await claimOnce(kitMarkKey(runId, kitId)))) throw new Error("That repair kit has already been used.");
    await Promise.all([
      redis.del(memberCardKey(kitId)),
      redis.zrem(memberCardsIndexKey(user.id), kitId),
      redis.zrem(ALL_MEMBER_CARDS_INDEX, kitId),
    ]);
    await addLedger({ type: "kit_consumed", userId: user.id, runId, kitId });

    const next = { ...applyKit(state, kitId, carId, repairAmount(stored.tier, config)), updatedAt: Date.now() };
    try {
      await saveRun(next);
    } catch {
      await saveRun(next); // one retry: the kit is already spent, so the repair must not be lost
    }
    return toRunView(next, config);
  });
}

// ── Setting up a Round ──────────────────────────────────────────────────────

export async function beginRound(user: TourUser, runId: string): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status !== "active") throw new Error("This Tour has ended.");
    if (state.step === "setup" && state.opponent) return toRunView(state, config);
    if (state.step !== "pit") throw new Error("You can't start a Round right now.");
    if (state.offers) throw new Error("Choose an upgrade first (or skip it).");

    const rating = state.rating + state.ratingDelta;
    const oppRng = makeRng(`${state.seed}:opp:${state.round}`);
    const ghost = await pickGhost({
      round: state.round,
      rating,
      band: config.tuning.ratingBand,
      ownerId: user.id,
      excludeIds: state.facedGhostIds,
      rng: oppRng,
    });
    const opponent: TourOpponent = ghost
      ? {
          kind: "ghost",
          ghostId: ghost.id,
          ownerId: ghost.ownerId,
          name: ghost.ownerName,
          rating: ghost.rating,
          car: ghost.car,
          crew: ghost.crew,
          upgrades: ghost.upgrades,
          condition: ghost.condition,
          stance: ghost.stance,
          accuracy: ghost.accuracy?.length === 3 ? ghost.accuracy : [config.tuning.skillPivot, config.tuning.skillPivot, config.tuning.skillPivot],
        }
      : buildBot({
          round: state.round,
          rating,
          playerAvg: loadoutAverage(state.loadout.cars),
          stanceHistory: state.stanceHistory,
          rng: oppRng,
          config,
        });

    // What the member may know. Information upgrades are used up here.
    const upgrades = state.upgrades.map((u) => ({ ...u }));
    const use = (kind: string) => {
      const held = upgrades.find((u) => getUpgradeDef(u.id, config, true)?.effect.kind === kind && (u.usesLeft ?? 0) > 0);
      if (held) held.usesLeft = (held.usesLeft ?? 1) - 1;
      return Boolean(held);
    };
    const seesStats = use("reveal_stats");
    const hint = use("stance_hint");
    const hintRng = makeRng(`${state.seed}:hint:${state.round}`);
    const others = STANCES.filter((s) => s !== opponent.stance);
    const stats = getNormalizedCardStats(opponent.car);
    const preview: TourOpponentPreview = {
      kind: opponent.kind,
      name: opponent.name,
      rating: opponent.rating,
      carName: opponent.car.name,
      carTier: opponent.car.tier,
      carImageUrl: opponent.car.imageUrl,
      carStats: seesStats ? stats : null,
      notStance: hint ? others[Math.floor(hintRng() * others.length)] : null,
    };

    const next: TourRunState = {
      ...state,
      step: "setup",
      opponent,
      preview,
      upgrades: upgrades.filter((u) => u.usesLeft === undefined || u.usesLeft > 0),
      updatedAt: Date.now(),
    };
    await saveRun(next);
    return toRunView(next, config);
  });
}

// ── Driving a Round ─────────────────────────────────────────────────────────

/** The longest a drive may have been open and still be scored from the recording. */
const DRIVE_MAX_AGE_MS = 6 * 3600 * 1000;
/** The drive takes RUN_SECONDS, plus a countdown. A recording sent much faster than that cannot be real. */
const DRIVE_MIN_MS = RUN_SECONDS * 0.8 * 1000;
/** No driver is believed to be better than this; the real figure is still kept in the ledger. */
const ACCURACY_CAP = 0.95;

/** An opponent's driving per corner. A Tour started before driving existed has none, so it drives at the neutral level. */
function rivalAccuracyOf(opponent: TourOpponent, config: TourConfig): number[] {
  const a = opponent.accuracy;
  return Array.isArray(a) && a.length === 3 ? a : [config.tuning.skillPivot, config.tuning.skillPivot, config.tuning.skillPivot];
}

function ratingOf(state: TourRunState) {
  return state.rating + state.ratingDelta;
}

function resolveInput(state: TourRunState, config: TourConfig, carId: string, stance: Stance, opponent: TourOpponent): ResolveInput {
  return {
    round: state.round,
    rating: ratingOf(state),
    loadout: state.loadout,
    condition: state.condition,
    upgrades: state.upgrades,
    carId,
    stance,
    opponent,
    strikes: state.strikes,
    config,
    rng: makeRng(`${state.seed}:round:${state.round}`),
  };
}

/**
 * Lock in the car and the stance and open the drive. The server works out everything the cards decide now, stores it,
 * and gives the browser what it needs to run the drive. The result comes when the recording is sent back.
 */
export async function startDrive(user: TourUser, runId: string, carId: string, stance: Stance): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status === "active" && state.step === "drive" && state.drive) return toRunView(state, config);
    if ((state.step === "result" || state.step === "ended") && state.lastLog) return toRunView(state, config);
    if (state.status !== "active" || state.step !== "setup" || !state.opponent) throw new Error("There's no Round to drive right now.");
    if (!STANCES.includes(stance)) throw new Error("Choose a stance.");
    if (!state.loadout.cars.some((c) => c.id === carId)) throw new Error("That car isn't in your loadout.");

    const opponent = state.opponent;
    const chosenCar = state.loadout.cars.find((c) => c.id === carId);
    const prepared = prepareRound(resolveInput(state, config, carId, stance, opponent));
    const spec: TourDriveSpec = {
      round: state.round,
      sectorIds: prepared.sectors.map((s) => s.id),
      sectorNames: prepared.sectors.map((s) => s.name),
      trackName: prepared.trackName,
      trackIcon: prepared.trackIcon,
      paceBase: { player: prepared.corners.map((c) => c.player.pre), rival: prepared.corners.map((c) => c.rival.pre) },
      rivalAccuracy: rivalAccuracyOf(opponent, config),
      swing: config.tuning.skillSwing,
      pivot: config.tuning.skillPivot,
      rivalName: opponent.name,
      rivalKind: opponent.kind,
      carName: chosenCar?.name ?? "Your car",
      carTier: chosenCar?.tier,
      carImageUrl: chosenCar?.imageUrl,
      angleLimit: angleLimit(prepared.playerCondition, Number(chosenCar?.stats?.grip)),
      tyres: prepared.playerCondition,
      seconds: RUN_SECONDS,
    };
    const next: TourRunState = { ...state, step: "drive", drive: { carId, stance, startedAt: Date.now(), prepared, spec }, updatedAt: Date.now() };
    await saveRun(next);
    return toRunView(next, config);
  });
}

/**
 * Score the drive. The browser sends only what it recorded of the steering; the server runs the same driving simulation on
 * it to get the line accuracy, so a score can't be made up. Then the Round is decided.
 */
export async function submitDrive(user: TourUser, runId: string, recording: unknown): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    // A repeated request (a lost response, a double tap) gets the result that was already decided.
    if ((state.step === "result" || state.step === "ended") && state.lastLog) return toRunView(state, config);
    if (state.status !== "active" || state.step !== "drive" || !state.drive || !state.opponent) throw new Error("There's no drive to submit.");

    const trace = decodeTrace(recording);
    if (!trace) throw new Error("That recording wasn't valid.");
    const age = Date.now() - state.drive.startedAt;
    if (age < DRIVE_MIN_MS) throw new Error("That drive was finished faster than it can be driven.");
    return finishDriveWith(user, state, trace, age > DRIVE_MAX_AGE_MS, config);
  });
}

/** Score a recording (or a forfeited, empty one) and finish the Round. Runs inside the run lock. */
async function finishDriveWith(user: TourUser, state: TourRunState, trace: Int8Array, forfeit: boolean, config: TourConfig): Promise<TourRunView> {
  const drive = state.drive!;
  const opponent = state.opponent!;
  const dc = prepareDrive(drive.spec.sectorIds);
  // The grip limit comes from the car and its condition as the server knows them, never from the browser.
  const driveCar = state.loadout.cars.find((c) => c.id === drive.carId);
  const limit = angleLimit(drive.prepared.playerCondition, Number(driveCar?.stats?.grip));
  const driven = simulateDrive(dc, forfeit ? new Int8Array(0) : trace, limit);
  const raw = driven.accuracy;
  const accuracy = raw.map((a) => Math.min(ACCURACY_CAP, a));

  const input = resolveInput(state, config, drive.carId, drive.stance, opponent);
  const out = finishRound(drive.prepared, { player: accuracy, rival: rivalAccuracyOf(opponent, config), walls: driven.walls, bursts: driven.bursts }, input);

  // The Ghost for this Round: the team, the stance and the driving the member really chose.
  const car = state.loadout.cars.find((c) => c.id === drive.carId)!;
  const ratingNow = ratingOf(state);
  const ghost: TourGhost = {
    id: randomUUID(),
    ownerId: user.id,
    ownerName: user.name,
    round: state.round,
    rating: ratingNow,
    car,
    crew: state.loadout.crew,
    upgrades: state.upgrades,
    condition: state.condition[drive.carId] ?? 100,
    stance: drive.stance,
    accuracy,
    createdAt: Date.now(),
  };

  let next = applyRoundResult(state, out, opponent, drive.stance, Date.now());
  const over = tourIsOver(next);
  if (over) next = await finishTour(next, over, config);
  else await saveRun(next);

  // Side effects after the result is safely stored.
  try {
    const average = accuracy.reduce((s, a) => s + a, 0) / accuracy.length;
    await recordDrive(user.id, average);
    await bumpStat("drives", 1);
    await bumpStatFloat("accuracy_sum", average);
    await addLedger({ type: "drive", userId: user.id, runId: state.id, round: state.round, raw, walls: driven.walls, bursts: driven.bursts, forfeit });
    const profile = await loadProfile(user.id, config.tuning.startRating);
    if (!profile.optOut) await saveGhost(ghost, config.tuning.ghostsPerRound);
    if (opponent.kind === "ghost" && opponent.ownerId) {
      await addNote(opponent.ownerId, `Your team ${out.won ? "lost to" : "beat"} ${user.name} in Round ${state.round}.`);
    }
  } catch (error) {
    console.error("[tour] drive records failed (result already stored):", error);
  }
  return toRunView(next, config);
}

export async function continueAfterRound(user: TourUser, runId: string): Promise<TourRunView> {
  const config = await requireAccess(user);
  return withRunLock(runId, async () => {
    const state = await ownedRun(user, runId);
    if (state.status !== "active" || state.step !== "result") return toRunView(state, config);
    const next = applyContinue(state, config, Date.now());
    await saveRun(next);
    return toRunView(next, config);
  });
}

// ── Ending a Tour ───────────────────────────────────────────────────────────

function nextStreak(profile: { streak: number; freezes: number; lastPlayDate: string }, today: string) {
  if (profile.lastPlayDate === today) return { streak: profile.streak || 1, freezes: profile.freezes, changed: false };
  const gap = profile.lastPlayDate ? daysBetween(profile.lastPlayDate, today) : Infinity;
  let streak = 1;
  let freezes = profile.freezes;
  if (gap === 1) streak = profile.streak + 1;
  else if (gap === 2 && freezes > 0) {
    streak = profile.streak + 1;
    freezes -= 1;
  }
  if (streak > 1 && streak % 7 === 0) freezes = Math.min(2, freezes + 1);
  return { streak, freezes, changed: true };
}

/** Pay out and close a Tour. Safe to call twice: the second call changes nothing. */
export async function finishTour(
  state: TourRunState,
  endedBy: TourSummary["endedBy"],
  config: TourConfig
): Promise<TourRunState> {
  if (state.status === "ended" && state.summary) return state;
  if (!(await claimOnce(endMarkKey(state.id)))) {
    return (await loadRun(state.id)) ?? state;
  }

  const profile = await loadProfile(state.userId, config.tuning.startRating);
  const today = ukDate();
  const streak = nextStreak(profile, today);

  // Prize: from the table for this Win Count, with the sponsor bonus and any multipliers from the config.
  const row = prizeForWins(config, state.wins);
  let pCredits = row.pCredits;
  const sponsor = state.upgrades.find((u) => getUpgradeDef(u.id, config, true)?.effect.kind === "prize_bonus");
  if (sponsor && state.wins >= 5) pCredits = Math.round(pCredits * (1 + (sponsor.amount ?? 0) / 100));
  if (config.earlyAccessOnly) pCredits = Math.round(pCredits * config.multipliers.earlyAccess);
  const packCredits = row.packCredits;

  // Streak milestone reward.
  const milestone = streak.changed ? config.streakRewards.find((r) => r.days === streak.streak) : undefined;
  const bonusP = milestone ? Math.round(milestone.pCredits * config.multipliers.streak) : 0;
  const bonusPack = milestone ? milestone.packCredits : 0;

  if (pCredits + bonusP > 0) await grantPCredits(state.userId, pCredits + bonusP);
  if (packCredits + bonusPack > 0) await grantCardCredits(state.userId, packCredits + bonusPack);

  const ratingAfter = applyRatingDelta(state.rating, state.ratingDelta);
  await updateProfile(state.userId, {
    rating: ratingAfter,
    bestWins: Math.max(profile.bestWins, state.wins),
    tours: profile.tours + 1,
    streak: streak.streak,
    freezes: streak.freezes,
    lastPlayDate: today,
  });
  await addLadderPoints(state.userId, ladderPoints(state.wins, endedBy === "finished"));
  await bumpStat("completed", 1);
  await bumpStat("wins_total", state.wins);
  if (pCredits + bonusP > 0) await bumpStat("pcredits_out", pCredits + bonusP);
  await addLedger({
    type: "end",
    userId: state.userId,
    runId: state.id,
    wins: state.wins,
    endedBy,
    pCredits: pCredits + bonusP,
    packCredits: packCredits + bonusPack,
    ratingBefore: state.rating,
    ratingAfter,
  });

  const summary: TourSummary = {
    wins: state.wins,
    rounds: state.rounds.length,
    prize: { pCredits, packCredits },
    streakBonus: { pCredits: bonusP, packCredits: bonusPack },
    ratingBefore: state.rating,
    ratingAfter,
    streak: streak.streak,
    bestRound: bestRoundOf(state),
    upgradesUsed: state.picked,
    endedBy,
    nextPrize: nextPrizeAfter(config, state.wins),
  };
  const ended: TourRunState = { ...state, status: "ended", step: "ended", summary, opponent: null, preview: null, offers: null, updatedAt: Date.now() };
  await saveRun(ended);
  await releaseActiveSlot(state.userId);
  return ended;
}

/** Hourly sweep: end Tours nobody has touched for 24 hours, paying the prize for the wins reached. */
export async function endIdleTours(olderThanMs = 24 * 3600 * 1000): Promise<number> {
  const { listIdleRunIds } = await import("./store");
  const config = await loadTourConfig();
  const ids = await listIdleRunIds(Date.now() - olderThanMs);
  let ended = 0;
  for (const id of ids) {
    try {
      const run = await loadRun(id);
      if (!run || run.status !== "active") {
        await redis.zrem("tcg:tour:runs:active", id);
        continue;
      }
      await finishTour(run, "idle", config);
      ended++;
    } catch (error) {
      console.error("[tour] could not end idle Tour", id, error);
    }
  }
  return ended;
}

/**
 * Admin: end a stuck Tour with no prize and give back the entry price if it was paid. The rating, ladder and streak are
 * left alone. Safe to call twice.
 */
export async function cancelTour(runId: string, adminId: string): Promise<{ refunded: number }> {
  const state = await loadRun(runId);
  if (!state) throw new Error("That Tour wasn't found.");
  if (state.status !== "active") return { refunded: 0 };
  if (!(await claimOnce(endMarkKey(runId)))) return { refunded: 0 };

  const refund = state.paid.free ? 0 : state.paid.pCredits;
  if (refund > 0) {
    await grantPCredits(state.userId, refund);
    await bumpDaily(state.userId, "paid", -1);
    await bumpDaily(state.userId, "spent", -refund);
    await bumpStat("pcredits_in", -refund);
  } else if (state.paid.free) {
    await bumpDaily(state.userId, "free", -1);
  }
  await addLedger({ type: "cancel", userId: state.userId, runId, by: adminId, refunded: refund });

  const summary: TourSummary = {
    wins: state.wins,
    rounds: state.rounds.length,
    prize: { pCredits: 0, packCredits: 0 },
    streakBonus: { pCredits: 0, packCredits: 0 },
    ratingBefore: state.rating,
    ratingAfter: state.rating,
    streak: 0,
    bestRound: bestRoundOf(state),
    upgradesUsed: state.picked,
    endedBy: "admin",
    nextPrize: null,
  };
  await saveRun({ ...state, status: "ended", step: "ended", summary, opponent: null, preview: null, offers: null, updatedAt: Date.now() });
  await releaseActiveSlot(state.userId);
  return { refunded: refund };
}
