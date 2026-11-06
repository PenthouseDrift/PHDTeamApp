import { redis } from "@/lib/redis";
import { REROLLS_PER_CUP, RUN_TTL_SECONDS } from "./config";
import type { CampaignEntry, CampaignRun, RolledTier } from "./types";

/**
 * Redis storage for the Drift Campaign. A run is one JSON value; each member has at most one current run, found
 * through `tcg:campaign:active:<userId>`.
 */

const K = {
  run: (id: string) => `tcg:campaign:run:${id}`,
  active: (userId: string) => `tcg:campaign:active:${userId}`,
  lock: (userId: string) => `tcg:campaign:lock:${userId}`,
  offer: (userId: string) => `tcg:campaign:offer:${userId}`,
  profile: (userId: string) => `tcg:campaign:profile:${userId}`,
  paid: (runId: string) => `tcg:campaign:paid:${runId}`,
  ticket: (userId: string) => `tcg:campaign:ticket:${userId}`,
};

export async function loadRun(id: string): Promise<CampaignRun | null> {
  const raw = await redis.get(K.run(id));
  if (!raw) return null;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as CampaignRun;
  } catch {
    return null;
  }
}

export async function loadActiveRun(userId: string): Promise<CampaignRun | null> {
  const id = await redis.get<string>(K.active(userId));
  return id ? loadRun(String(id)) : null;
}

export async function saveRun(run: CampaignRun): Promise<void> {
  run.updatedAt = Date.now();
  await redis.set(K.run(run.id), JSON.stringify(run), { ex: RUN_TTL_SECONDS });
  await redis.set(K.active(run.userId), run.id, { ex: RUN_TTL_SECONDS });
}

/** One action at a time per member, so a double click cannot play a round twice. Calibration can take a while, so the lock is long. */
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const got = await redis.set(K.lock(userId), "1", { nx: true, ex: 90 });
  if (got !== "OK") throw new Error("Hold on, the last action is still being processed.");
  try {
    return await fn();
  } finally {
    await redis.del(K.lock(userId)).catch(() => null);
  }
}

/**
 * The six cars dealt to a member to choose three from. Kept until a cup starts, so leaving the picker and coming back
 * shows the same six and the deal cannot be re-rolled.
 */
// Long, because the six belong to a paid entry: they must not expire and hand out a free re-deal.
const OFFER_TTL_SECONDS = 60 * 60 * 24 * 30;

const ROLLED_TIERS: RolledTier[] = ["bronze", "silver", "gold", "legend"];

/** The dealt cars with the rarity each slot rolled. A deal saved before rolls were recorded has no roll (null). */
export async function loadOfferSlots(userId: string): Promise<Array<{ id: string; rolled: RolledTier | null }>> {
  const raw = await redis.get(K.offer(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      if (entry && typeof entry === "object" && "id" in entry) {
        const rolled = (entry as { rolled?: unknown }).rolled;
        return {
          id: String((entry as { id: unknown }).id),
          rolled: ROLLED_TIERS.includes(rolled as RolledTier) ? (rolled as RolledTier) : null,
        };
      }
      return { id: String(entry), rolled: null };
    });
  } catch {
    return [];
  }
}

/** Just the ids of the dealt cars. */
export async function loadOffer(userId: string): Promise<string[]> {
  return (await loadOfferSlots(userId)).map((s) => s.id);
}

export async function saveOffer(userId: string, slots: Array<{ id: string; rolled: RolledTier }>): Promise<void> {
  await redis.set(K.offer(userId), JSON.stringify(slots), { ex: OFFER_TTL_SECONDS });
}

export async function clearOffer(userId: string): Promise<void> {
  await redis.del(K.offer(userId));
}

/**
 * The member's campaign profile. It holds the re-rolls left for choosing cars and has no expiry, so the count cannot be
 * reset by waiting, reloading, or abandoning a cup.
 */
export async function loadRerollsLeft(userId: string): Promise<number> {
  const raw = await redis.get(K.profile(userId));
  if (!raw) return REROLLS_PER_CUP;
  try {
    const profile = (typeof raw === "string" ? JSON.parse(raw) : raw) as { rerollsLeft?: unknown; cap?: unknown };
    const n = Number(profile.rerollsLeft);
    if (!Number.isFinite(n)) return REROLLS_PER_CUP;
    // If the allowance was raised since this was saved, the extra re-rolls are added. Profiles saved before the cap was
    // recorded were made when it was 2.
    const savedCap = Number.isFinite(Number(profile.cap)) ? Number(profile.cap) : 2;
    const raised = Math.max(0, REROLLS_PER_CUP - savedCap);
    return Math.min(REROLLS_PER_CUP, Math.max(0, Math.trunc(n)) + raised);
  } catch {
    return REROLLS_PER_CUP;
  }
}

export async function saveRerollsLeft(userId: string, rerollsLeft: number): Promise<void> {
  await redis.set(K.profile(userId), JSON.stringify({ rerollsLeft, cap: REROLLS_PER_CUP, updatedAt: Date.now() }));
}

/** One mark per cup: true the first time, false after. Stops a prize being paid twice. */
export async function claimPayout(runId: string): Promise<boolean> {
  return (await redis.set(K.paid(runId), "1", { nx: true, ex: 60 * 60 * 24 * 30 })) === "OK";
}

export async function releasePayout(runId: string): Promise<void> {
  await redis.del(K.paid(runId)).catch(() => null);
}

/**
 * A paid entry that has not started yet. It is made when the member pays and removed when they start the cup or withdraw.
 * It has no expiry: an entry that was paid for is never quietly dropped, and leaving the page does not undo it.
 */
export interface EntryTicket {
  entry: CampaignEntry;
  paidAt: number;
}

export async function loadTicket(userId: string): Promise<EntryTicket | null> {
  const raw = await redis.get(K.ticket(userId));
  if (!raw) return null;
  try {
    const t = (typeof raw === "string" ? JSON.parse(raw) : raw) as EntryTicket;
    return t && t.entry && typeof t.entry.fee === "number" ? t : null;
  } catch {
    return null;
  }
}

export async function saveTicket(userId: string, ticket: EntryTicket): Promise<void> {
  await redis.set(K.ticket(userId), JSON.stringify(ticket));
}

export async function clearTicket(userId: string): Promise<void> {
  await redis.del(K.ticket(userId));
}
