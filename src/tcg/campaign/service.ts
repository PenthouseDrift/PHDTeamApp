import { randomInt } from "crypto";
import type { MemberCard } from "@/lib/card-roll";
import { isCarBroken } from "@/lib/mechanical-faults";
import { applyMaintenanceRepairAction } from "../actions";
import { ALL_MEMBER_CARDS_INDEX, memberCardKey, memberCardsIndexKey, parseStoredCard } from "@/lib/member-card-store";
import { redis } from "@/lib/redis";
import { grantPCredits, spendPCredits } from "../storage";
import { mulberry32 } from "../battle-sim";
import { loadArtPool } from "./art-pool";
import { calibrate } from "./calibrate";
import { CAMPAIGN_ROUNDS, CARS_TO_PICK, ENTRY_FEES, OFFER_SIZE, prizeFor, REROLLS_PER_CUP, RIVAL_POOL_SIZE } from "./config";
import { bestCrewFor, isCampaignCar } from "./garage";
import { bestTierOf, personaFor, pickArt, profileFor, showcaseTiersFor, toOpponent, tierRank } from "./generate";
import {
  claimPayout,
  clearOffer,
  clearTicket,
  loadActiveRun,
  loadOffer,
  loadRerollsLeft,
  loadTicket,
  releasePayout,
  saveOffer,
  saveRerollsLeft,
  saveRun,
  saveTicket,
  withUserLock,
} from "./store";
import { targetWinPctFor } from "./targets";
import { wearAfterBattle } from "./wear";
import type {
  CampaignBattle,
  CampaignDraft,
  CampaignEntry,
  CampaignMaintenance,
  CampaignOffer,
  CampaignRoundPlan,
  CampaignRoundResult,
  CampaignRoundView,
  CampaignRun,
  CampaignView,
  EntryChoice,
  RoundState,
} from "./types";

/**
 * The Drift Campaign's rules. Server side only; actions.ts is the door the browser uses and checks the admin role first.
 *
 * Flow: start (the player picks three of their own cars; the six rivals are built and checked by simulation), then for
 * each round begin a battle in the arena and report the result. Win all six to be champion.
 * A loss ends the run. Leaving the track in the middle of a battle counts as a loss, because a battle cannot be resumed.
 *
 * Like the rest of Tandem Clash, the battle itself is played in the browser and the browser reports who won. This mode is
 * admin only, so nothing is paid out and there is no prize to cheat for.
 */

const TOTAL_ROUNDS = CAMPAIGN_ROUNDS.length;

function roundView(run: CampaignRun, plan: CampaignRoundPlan): CampaignRoundView {
  const spec = CAMPAIGN_ROUNDS[plan.round - 1];
  const result = run.results.find((r) => r.round === plan.round);
  let state: RoundState = "upcoming";
  if (result) state = result.won ? "won" : "lost";
  else if (run.status === "active" && plan.round - 1 === run.currentRound) state = "current";
  return {
    round: plan.round,
    name: spec.name,
    short: spec.short,
    icon: spec.icon,
    driverName: plan.driverName,
    teamName: plan.teamName,
    portraitUrl: plan.portraitUrl,
    rosterTier: plan.rosterTier,
    state,
    result,
  };
}

const FREE_TEST: CampaignEntry = { kind: "test", fee: 0 };
const entryOf = (run: CampaignRun): CampaignEntry => run.entry ?? FREE_TEST;
const winsOf = (run: CampaignRun): number => run.results.filter((r) => r.won).length;

function toView(run: CampaignRun, note?: string, balance?: number): CampaignView {
  const entry = entryOf(run);
  const wins = winsOf(run);
  return {
    id: run.id,
    status: run.status,
    cars: run.cars,
    crew: run.crew,
    rounds: run.rounds.map((plan) => roundView(run, plan)),
    currentRound: run.currentRound,
    battleStarted: run.battleStarted,
    note,
    entry,
    wins,
    prize: entry.fee > 0 ? prizeFor(entry.fee, wins) : 0,
    payout: run.payout ?? null,
    endedBy: run.endedBy,
    balance,
  };
}

/** Record a round's result and move the run on. */
function applyResult(run: CampaignRun, result: CampaignRoundResult): void {
  run.results.push(result);
  run.battleStarted = false;
  if (!result.won) {
    run.status = "eliminated";
    return;
  }
  run.currentRound += 1;
  if (run.currentRound >= TOTAL_ROUNDS) run.status = "champion";
}

function forfeit(run: CampaignRun, by: "withdrew" | "left-track"): void {
  run.endedBy = by;
  applyResult(run, { round: run.currentRound + 1, won: false, playerCorners: 0, opponentCorners: 3, forfeited: true });
}

/**
 * Work out and pay the prize once a cup has ended. Safe to call again: it only ever pays once. A test cup pays nothing.
 * Call it before saving the run, so the "settled" mark is saved with it. Returns the new balance if anything was paid.
 */
async function settle(userId: string, run: CampaignRun): Promise<number | undefined> {
  if (run.status === "active" || run.settled) return undefined;
  const entry = entryOf(run);
  const reward = entry.fee > 0 ? prizeFor(entry.fee, winsOf(run)) : 0;
  let balance: number | undefined;
  if (reward > 0 && (await claimPayout(run.id))) {
    try {
      balance = await grantPCredits(userId, reward);
    } catch (error) {
      await releasePayout(run.id);
      throw error;
    }
  }
  run.payout = reward;
  run.settled = true;
  return balance;
}

/** Runs saved by the first version of this mode (cars dealt to the player, status "drafting") have no place in the new flow. */
function isCurrentRun(run: CampaignRun): boolean {
  return Array.isArray(run.cars) && ["active", "champion", "eliminated"].includes(run.status);
}

/**
 * The member's current run, or null. A battle that was started and never reported (the page was closed or reloaded)
 * cannot be picked up again, so it is settled here as a loss.
 */
export async function getCampaign(userId: string): Promise<CampaignView | null> {
  const run = await loadActiveRun(userId);
  if (!run || !isCurrentRun(run)) return null;
  if (run.status === "active" && run.battleStarted) {
    try {
      return await withUserLock(userId, async () => {
        const fresh = await loadActiveRun(userId);
        if (!fresh) return null;
        if (fresh.status === "active" && fresh.battleStarted) {
          forfeit(fresh, "left-track");
          const balance = await settle(userId, fresh);
          await saveRun(fresh);
          return toView(fresh, "You left the track in the middle of a battle, which counts as a loss.", balance);
        }
        return toView(fresh);
      });
    } catch {
      return toView(run);
    }
  }
  return toView(run);
}

/** The member's own cards, as the cup will use them. The picture-source copy is left out. */
async function loadMemberCards(userId: string): Promise<MemberCard[]> {
  const ids = ((await redis.zrange(memberCardsIndexKey(userId), 0, 499, { rev: true })) as string[]).map(String);
  if (ids.length === 0) return [];
  const rows = await redis.mget(...ids.map(memberCardKey));
  return rows
    .map(parseStoredCard)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(({ referenceUrl, ...card }) => {
      void referenceUrl;
      return card as MemberCard;
    });
}

/** Six random cars from the member's deck, picked with a fair shuffle. */
function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Six random cars, with a floor on quality: if the deck has any silver-or-better car, at least one is in the six. Without
 * this a deck of mostly bronze cars could deal six bronzes while a silver sat unused. `avoid` keeps a re-roll from dealing
 * the old six again when the deck is big enough.
 */
function dealSix(cars: MemberCard[], avoid: string[] = []): MemberCard[] {
  const fresh = cars.filter((c) => !avoid.includes(c.id));
  const pool = fresh.length >= Math.min(OFFER_SIZE, cars.length) ? fresh : cars;
  const dealt = shuffled(pool).slice(0, OFFER_SIZE);
  if (!dealt.some((c) => tierRank(c.tier) >= 1)) {
    const strong = pool.filter((c) => tierRank(c.tier) >= 1 && !dealt.includes(c));
    if (strong.length > 0 && dealt.length > 0) dealt[dealt.length - 1] = strong[randomInt(0, strong.length)];
  }
  return dealt;
}

/**
 * The six cars for the current paid entry: the ones already dealt if there are any, otherwise a fresh deal. Cars are read
 * fresh each time, so wear and repairs show. Call with the member's lock held.
 */
async function currentOffer(userId: string): Promise<CampaignOffer> {
  const cars = (await loadMemberCards(userId)).filter(isCampaignCar);
  if (cars.length < CARS_TO_PICK) throw new Error(`You need at least ${CARS_TO_PICK} car cards in your deck to enter the cup.`);
  const rerollsLeft = await loadRerollsLeft(userId);
  const saved = (await loadOffer(userId)).map((id) => cars.find((c) => c.id === id)).filter((c): c is MemberCard => Boolean(c));
  if (saved.length >= Math.min(OFFER_SIZE, cars.length)) return { cars: saved, rerollsLeft };
  const dealt = dealSix(cars);
  await saveOffer(userId, dealt.map((c) => c.id));
  return { cars: dealt, rerollsLeft };
}

/** A paid entry that is waiting for its cars to be picked, if the member has one. Lets the tab pick up where it left off. */
export async function getDraft(userId: string): Promise<CampaignDraft | null> {
  const ticket = await loadTicket(userId);
  if (!ticket) return null;
  try {
    return await withUserLock(userId, async () => ({ entry: ticket.entry, offer: await currentOffer(userId) }));
  } catch {
    return null;
  }
}

/**
 * Pay the entry and deal the first six cars. This is where the fee is taken: before any cars are seen. Paying also gives a
 * full set of re-rolls for this entry, which is the only way to get them back. A paid entry stays until the cup is started
 * or withdrawn from, so leaving the page does not lose it and cannot be used to dodge the fee. Free test entries are for
 * admins only.
 */
export async function payEntry(userId: string, choice: EntryChoice, isAdmin: boolean): Promise<{ draft: CampaignDraft; balance?: number }> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    if (run && isCurrentRun(run) && run.status === "active") throw new Error("A campaign is already in progress.");

    // Already paid and waiting: show it again rather than charging twice.
    const waiting = await loadTicket(userId);
    if (waiting) return { draft: { entry: waiting.entry, offer: await currentOffer(userId) } };

    let entry: CampaignEntry;
    if (choice === "test") {
      if (!isAdmin) throw new Error("Free test entries are for admins only.");
      entry = { kind: "test", fee: 0 };
    } else {
      if (!ENTRY_FEES.includes(Number(choice))) throw new Error("Choose one of the entry fees.");
      entry = { kind: "paid", fee: Number(choice) };
    }

    // Check the deck can play before taking any money.
    const cars = (await loadMemberCards(userId)).filter(isCampaignCar);
    if (cars.length < CARS_TO_PICK) throw new Error(`You need at least ${CARS_TO_PICK} car cards in your deck to enter the cup.`);

    let balance: number | undefined;
    if (entry.fee > 0) {
      const spend = await spendPCredits(userId, entry.fee);
      if (!spend.ok) throw new Error(`Not enough P-Credits: this entry costs ${entry.fee} and you have ${spend.balance}.`);
      balance = spend.balance;
    }
    try {
      await clearOffer(userId);
      await saveRerollsLeft(userId, REROLLS_PER_CUP);
      await saveTicket(userId, { entry, paidAt: Date.now() });
      const offer = await currentOffer(userId);
      return { draft: { entry, offer }, balance };
    } catch (error) {
      // Nothing was dealt, so the fee goes back.
      await clearTicket(userId).catch(() => null);
      if (entry.fee > 0) await grantPCredits(userId, entry.fee).catch(() => null);
      throw error;
    }
  });
}

/**
 * Walk away from a paid entry before the cup starts. The entry fee is lost, the six cars are dropped, and the member starts
 * again from the entry step (a new entry means a new fee and a new set of re-rolls).
 */
export async function withdrawDraft(userId: string): Promise<boolean> {
  return withUserLock(userId, async () => {
    const ticket = await loadTicket(userId);
    if (!ticket) return false;
    await clearTicket(userId);
    await clearOffer(userId);
    return true;
  });
}

/**
 * Deal a different six, using one of the member's re-rolls (up to three per paid entry). The count lives on their profile and
 * is only ever spent here; it comes back only with a new entry. If the deck has enough other cars, none of the old six are
 * dealt again.
 */
export async function rerollCars(userId: string): Promise<CampaignOffer> {
  return withUserLock(userId, async () => {
    if (!(await loadTicket(userId))) throw new Error("Pay your entry first.");
    const previous = await loadOffer(userId);
    if (previous.length === 0) throw new Error("Draw your cars first.");
    const rerollsLeft = await loadRerollsLeft(userId);
    if (rerollsLeft <= 0) throw new Error("You have no re-rolls left for this entry.");

    const cars = (await loadMemberCards(userId)).filter(isCampaignCar);
    const dealt = dealSix(cars, previous);

    // Spend the re-roll first, so a failure after this point can never hand out a free one.
    await saveRerollsLeft(userId, rerollsLeft - 1);
    await saveOffer(userId, dealt.map((c) => c.id));
    return { cars: dealt, rerollsLeft: rerollsLeft - 1 };
  });
}

/**
 * Start the cup with three of the six dealt cars. The entry was already paid, so nothing is charged here. The cars are used
 * exactly as they are; the stats that get generated are the rivals'. The six rivals are built from the picked cars and
 * checked by simulation, so each round is about as hard as its target win rate says.
 */
export async function startCampaign(userId: string, carIds: string[]): Promise<CampaignView> {
  return withUserLock(userId, async () => {
    const existing = await loadActiveRun(userId);
    if (existing && isCurrentRun(existing) && existing.status === "active") throw new Error("A campaign is already in progress. Withdraw from it first.");

    const ticket = await loadTicket(userId);
    if (!ticket) throw new Error("Pay your entry first.");
    const entry = ticket.entry;

    const picked = [...new Set(carIds)];
    if (picked.length !== CARS_TO_PICK) throw new Error(`Pick exactly ${CARS_TO_PICK} different cars.`);

    const offered = await loadOffer(userId);
    if (offered.length === 0) throw new Error("Draw your cars first.");
    if (picked.some((id) => !offered.includes(id))) throw new Error("You can only pick from the six cars you were dealt.");

    const owned = await loadMemberCards(userId);
    const cars = picked.map((id) => owned.find((c) => c.id === id));
    if (cars.some((c) => !c)) throw new Error("One of those cars is not in your deck.");
    const chosen = cars as MemberCard[];
    if (chosen.some((c) => !isCampaignCar(c))) throw new Error("Only car cards can enter the cup.");

    const side = { cars: chosen, crew: bestCrewFor(owned) };
    const profile = profileFor(side);

    // Rivals use pictures the player's cars do not, and different ones each round where the pool is big enough.
    const seed = randomInt(1, 2_000_000_000);
    const pool = await loadArtPool();
    const rng = mulberry32(seed ^ 0x2545f491);
    const avoid = new Set(chosen.map((c) => c.imageUrl));
    const inputs = CAMPAIGN_ROUNDS.map((spec) => {
      const art = pickArt(pool, RIVAL_POOL_SIZE, rng, avoid);
      for (const a of art) avoid.add(a.key);
      return {
        round: spec.round,
        targetPct: targetWinPctFor(spec.round),
        persona: personaFor(spec.round, TOTAL_ROUNDS, rng),
        art,
        // From the Quarter-Final the rivals show off real cards of a high rarity, as high as the player's cards can still beat.
        showcase: showcaseTiersFor(spec.round, bestTierOf(chosen)),
      };
    });

    const { rounds } = calibrate(side, profile, inputs, seed);

    const now = Date.now();
    const run: CampaignRun = {
      id: `campaign-${now.toString(36)}-${seed.toString(36)}`,
      userId,
      createdAt: now,
      updatedAt: now,
      status: "active",
      seed,
      cars: chosen,
      crew: side.crew,
      rounds: [],
      currentRound: 0,
      battleStarted: false,
      results: [],
      entry,
    };
    run.rounds = rounds.map((r) => {
      const spec = CAMPAIGN_ROUNDS[r.round - 1];
      const opponent = toOpponent(`campaign-${run.id}-r${r.round}`, spec.name, r.persona, r.build);
      return {
        round: r.round,
        driverName: r.persona.driver,
        teamName: r.persona.team,
        portraitUrl: opponent.cards[0]?.imageUrl ?? "",
        targetWinPct: r.targetPct,
        estimatedWinPct: Math.round(r.estimatedPct),
        strength: Math.round(r.strength * 100) / 100,
        rosterTier: r.tier,
        opponent,
      };
    });
    await saveRun(run);
    await clearOffer(userId);
    await clearTicket(userId);
    return toView(run);
  });
}

/** Start the next round's battle. Returns what the arena needs to play it. */
export async function beginRound(userId: string): Promise<CampaignBattle> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    if (!run || run.status !== "active") throw new Error("There is no campaign in progress.");
    if (run.battleStarted) throw new Error("A battle is already under way.");
    // A broken car cannot race. It has to be repaired in the pits first.
    const broken = run.cars.filter((c) => isCarBroken(c));
    if (broken.length > 0) throw new Error(`Repair ${broken.map((c) => c.name).join(" and ")} before the next battle.`);
    const plan = run.rounds[run.currentRound];
    if (!plan) throw new Error("There is no round to play.");

    run.battleStarted = true;
    await saveRun(run);

    const view = toView(run);
    return {
      view,
      round: view.rounds[run.currentRound],
      opponent: plan.opponent,
      // Worn cars are shown as they are, but the arena sets aside a car with a fault. For the cup the three picked cars stay in.
      cars: run.cars.map((c) => ({ ...c, fault: null, battlesRemaining: Math.max(1, c.battlesRemaining ?? c.maxBattles ?? 1) })),
      crew: run.crew,
    };
  });
}

/** Battles the cup could still need from every car: one per round left (all six before it starts). */
function battlesAhead(run: CampaignRun | null): number {
  return run && run.status === "active" ? Math.max(1, TOTAL_ROUNDS - run.currentRound) : TOTAL_ROUNDS;
}

/** A card from the member's deck that they may work on now: one of the dealt six, or one of the cup's three. */
async function workableCar(userId: string, run: CampaignRun | null, carId: string): Promise<void> {
  if (run && run.status === "active") {
    if (run.battleStarted) throw new Error("A battle is under way.");
    if (!run.cars.some((c) => c.id === carId)) throw new Error("That car is not in your cup.");
    return;
  }
  if (!(await loadOffer(userId)).includes(carId)) throw new Error("That car is not one of the six you were dealt.");
}

/** Put a changed car back into the cup, if it is one of the cup's cars. Returns the new view when it is. */
async function syncRun(run: CampaignRun | null, car: MemberCard): Promise<CampaignView | null> {
  if (!run || run.status !== "active") return null;
  const at = run.cars.findIndex((c) => c.id === car.id);
  if (at < 0) return null;
  run.cars[at] = car;
  await saveRun(run);
  return toView(run);
}

const withoutPictureSource = (card: MemberCard): MemberCard => {
  const { referenceUrl, ...rest } = card as MemberCard & { referenceUrl?: string };
  void referenceUrl;
  return rest as MemberCard;
};

/** Used-up Maintenance kits leave the deck completely, as in the normal game. */
async function consumeKit(userId: string, kitId: string): Promise<void> {
  await Promise.all([
    redis.del(memberCardKey(kitId)),
    redis.zrem(memberCardsIndexKey(userId), kitId),
    redis.zrem(ALL_MEMBER_CARDS_INDEX, kitId),
  ]);
}

/**
 * Repair a broken car with a Maintenance kit of the matching kind, the same way as in the normal game: the kit is used
 * up and takes some battles off the fault; when none are left the car is fixed and gets fresh durability.
 */
export async function repairCar(userId: string, carId: string, maintenanceCardId: string): Promise<{ car: MemberCard; view: CampaignView | null }> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    const current = run && isCurrentRun(run) ? run : null;
    await workableCar(userId, current, carId);
    const res = await applyMaintenanceRepairAction({ carCardId: carId, maintenanceCardId });
    if (!res.success) throw new Error(res.error);
    const car = withoutPictureSource(res.data.car);
    return { car, view: await syncRun(current, car) };
  });
}

/**
 * Service a car that is not broken but will not last the battles ahead. Any Maintenance kit will do: it is used up and
 * the car's durability is topped up to cover every battle the cup could still need.
 */
export async function serviceCar(userId: string, carId: string, maintenanceCardId: string): Promise<{ car: MemberCard; view: CampaignView | null }> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    const current = run && isCurrentRun(run) ? run : null;
    await workableCar(userId, current, carId);

    const [carRaw, kitRaw] = await Promise.all([redis.get(memberCardKey(carId)), redis.get(memberCardKey(maintenanceCardId))]);
    const stored = parseStoredCard(carRaw);
    const kit = parseStoredCard(kitRaw);
    if (!stored || stored.userId !== userId || !isCampaignCar(stored)) throw new Error("Car card not found in your deck.");
    if (!kit || kit.userId !== userId || kit.cardType !== "maintenance") throw new Error("Maintenance kit not found in your deck.");
    if (isCarBroken(stored)) throw new Error("That car is broken down. Repair it with a matching kit instead.");

    const ahead = battlesAhead(current);
    const left = typeof stored.battlesRemaining === "number" ? stored.battlesRemaining : (stored.maxBattles ?? 0);
    if (left >= ahead) throw new Error("That car already has enough durability for the battles ahead.");

    stored.battlesRemaining = ahead;
    stored.maxBattles = Math.max(stored.maxBattles ?? 0, ahead);
    await redis.set(memberCardKey(stored.id), JSON.stringify(stored));
    await consumeKit(userId, kit.id);

    const car = withoutPictureSource(stored);
    return { car, view: await syncRun(current, car) };
  });
}

/** The arena finished a battle. Records the win or loss and moves the cup on. */
export async function reportResult(
  userId: string,
  input: { won: boolean; playerCorners: number; opponentCorners: number }
): Promise<CampaignView> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    if (!run || run.status !== "active" || !run.battleStarted) throw new Error("There is no battle to report.");
    const corners = (n: number) => Math.min(3, Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)));
    const result: CampaignRoundResult = {
      round: run.currentRound + 1,
      won: Boolean(input.won),
      playerCorners: corners(input.playerCorners),
      opponentCorners: corners(input.opponentCorners),
    };
    // The battle wears the three cars, win or lose, exactly as a normal Clash battle does.
    const racedIds = run.cars.map((c) => c.id);
    try {
      const { updated, events } = await wearAfterBattle(userId, racedIds);
      run.cars = run.cars.map((c) => updated.get(c.id) ?? c);
      const maintenance: CampaignMaintenance = {
        cars: run.cars.map((c) => ({
          id: c.id,
          name: c.name,
          remaining: typeof c.battlesRemaining === "number" ? c.battlesRemaining : null,
          max: typeof c.maxBattles === "number" ? c.maxBattles : null,
          broken: Boolean(c.fault && c.fault.battlesRemaining > 0) || (typeof c.battlesRemaining === "number" && c.battlesRemaining <= 0),
        })),
        events: events.filter((e) => racedIds.includes(e.cardId) || e.type === "repaired"),
      };
      result.maintenance = maintenance;
    } catch (error) {
      console.error("[campaign] could not apply car wear:", error);
    }
    applyResult(run, result);
    const balance = await settle(userId, run);
    await saveRun(run);
    return toView(run, undefined, balance);
  });
}

/** Withdraw from a cup in progress. The prize for the rounds already won is paid; a new cup can then be entered. */
export async function forfeitCampaign(userId: string): Promise<CampaignView | null> {
  return withUserLock(userId, async () => {
    const run = await loadActiveRun(userId);
    if (!run || !isCurrentRun(run)) return null;
    if (run.status === "active") {
      forfeit(run, "withdrew");
      const balance = await settle(userId, run);
        await saveRun(run);
      return toView(run, "You withdrew from the cup. Reset the campaign to enter again.", balance);
    }
    return toView(run);
  });
}
