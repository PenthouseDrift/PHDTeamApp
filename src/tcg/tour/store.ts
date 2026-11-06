import { redis } from "@/lib/redis";
import { DEFAULT_TOUR_CONFIG, sanitizeTourConfig } from "./config";
import type { Rng } from "./rng";
import type { TourConfig, TourGhost, TourRunState } from "./types";

/**
 * Redis access for Tandem Tour. Plain functions (no "use server"), used by actions.ts and the cron routes.
 *
 * Keys (all new, prefix tcg:tour:):
 *   config                        Tour Config override (JSON)         config:log      change log (list)
 *   run:<runId>                   Run state (JSON, 7 days)            active:<userId> the member's active run id
 *   ghosts:<round>                zset ghostId -> rating              ghostlist:<round> list, oldest at the tail
 *   ghost:<ghostId>               Ghost snapshot (JSON, 14 days)
 *   profile:<userId>              hash: rating, bestWins, tours, streak, freezes, lastPlayDate, optOut, dailyLimit, tutorialSeen
 *   daily:<userId>:<UK date>      hash: free, paid, spent
 *   ladder:<weekKey>              zset userId -> points               notes:<userId> lobby lines (list)
 *   stats:<UK date>               hash of economy counters            ledger        audit list of every charge and prize
 *   early_access                  set of member ids allowed in during early access
 *   lock:<runId>, rl:<userId>:<minute>, end:<runId>, start:<key>   short-lived guards
 */

const K = {
  config: "tcg:tour:config",
  configLog: "tcg:tour:config:log",
  run: (id: string) => `tcg:tour:run:${id}`,
  active: (userId: string) => `tcg:tour:active:${userId}`,
  ghosts: (round: number) => `tcg:tour:ghosts:${round}`,
  ghostList: (round: number) => `tcg:tour:ghostlist:${round}`,
  ghost: (id: string) => `tcg:tour:ghost:${id}`,
  profile: (userId: string) => `tcg:tour:profile:${userId}`,
  daily: (userId: string, date: string) => `tcg:tour:daily:${userId}:${date}`,
  ladder: (week: string) => `tcg:tour:ladder:${week}`,
  notes: (userId: string) => `tcg:tour:notes:${userId}`,
  stats: (date: string) => `tcg:tour:stats:${date}`,
  ledger: "tcg:tour:ledger",
  earlyAccess: "tcg:tour:early_access",
  activeIndex: "tcg:tour:runs:active",
  lock: (runId: string) => `tcg:tour:lock:${runId}`,
  rate: (userId: string, minute: number) => `tcg:tour:rl:${userId}:${minute}`,
  endMark: (runId: string) => `tcg:tour:end:${runId}`,
  kitMark: (runId: string, kitId: string) => `tcg:tour:kit:${runId}:${kitId}`,
};

const RUN_TTL = 7 * 86400;
const GHOST_TTL = 14 * 86400;

function parseJson<T>(raw: unknown): T | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

// ── Dates (UK) ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD in the club's time zone. */
export function ukDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** The Monday of this week (UK), used as the weekly ladder key. */
export function weekKey(now: Date = new Date()): string {
  const today = ukDate(now);
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ── Config ──────────────────────────────────────────────────────────────────

export async function loadTourConfig(): Promise<TourConfig> {
  try {
    const raw = await redis.get(K.config);
    if (!raw) return DEFAULT_TOUR_CONFIG;
    return sanitizeTourConfig(raw);
  } catch (error) {
    console.error("[tour] could not read the Tour Config, using defaults:", error);
    return DEFAULT_TOUR_CONFIG;
  }
}

export async function saveTourConfig(input: unknown, adminId: string): Promise<TourConfig> {
  const before = await loadTourConfig();
  const next = { ...sanitizeTourConfig(input), updatedAt: Date.now() };
  await redis.set(K.config, JSON.stringify(next));
  await redis.lpush(K.configLog, JSON.stringify({ at: Date.now(), by: adminId, before, after: next }));
  await redis.ltrim(K.configLog, 0, 99);
  return next;
}

export async function isOnEarlyAccessList(userId: string): Promise<boolean> {
  try {
    return Boolean(await redis.sismember(K.earlyAccess, userId));
  } catch {
    return false;
  }
}

// ── Member profile ──────────────────────────────────────────────────────────

export interface TourProfile {
  rating: number;
  bestWins: number;
  tours: number;
  streak: number;
  freezes: number;
  lastPlayDate: string;
  optOut: boolean;
  dailyLimit: number;
  tutorialSeen: boolean;
  /** Driving record: the best average line accuracy of a drive, the total of all drives, and how many. */
  bestAccuracy: number;
  accuracySum: number;
  drives: number;
}

const toNum = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export async function loadProfile(userId: string, startRating: number): Promise<TourProfile> {
  const h = ((await redis.hgetall(K.profile(userId))) ?? {}) as Record<string, unknown>;
  return {
    rating: toNum(h.rating, startRating),
    bestWins: toNum(h.bestWins, 0),
    tours: toNum(h.tours, 0),
    streak: toNum(h.streak, 0),
    freezes: h.freezes === undefined ? 1 : toNum(h.freezes, 1),
    lastPlayDate: typeof h.lastPlayDate === "string" ? h.lastPlayDate : "",
    optOut: h.optOut === "1" || h.optOut === 1 || h.optOut === true,
    dailyLimit: toNum(h.dailyLimit, 0),
    tutorialSeen: h.tutorialSeen === "1" || h.tutorialSeen === 1 || h.tutorialSeen === true,
    bestAccuracy: toNum(h.bestAccuracy, 0),
    accuracySum: toNum(h.accuracySum, 0),
    drives: toNum(h.drives, 0),
  };
}

/** Add a drive to the member's driving record. */
export async function recordDrive(userId: string, averageAccuracy: number): Promise<void> {
  const key = K.profile(userId);
  await redis.hincrbyfloat(key, "accuracySum", averageAccuracy);
  await redis.hincrby(key, "drives", 1);
  const best = toNum(await redis.hget(key, "bestAccuracy"), 0);
  if (averageAccuracy > best) await redis.hset(key, { bestAccuracy: averageAccuracy });
}

export async function updateProfile(userId: string, fields: Partial<Record<keyof TourProfile, string | number>>): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await redis.hset(K.profile(userId), fields as Record<string, string | number>);
}

// ── Daily record (free and paid runs) ───────────────────────────────────────

export interface DailyRecord {
  free: number;
  paid: number;
  spent: number;
}

export async function loadDaily(userId: string, date = ukDate()): Promise<DailyRecord> {
  const h = ((await redis.hgetall(K.daily(userId, date))) ?? {}) as Record<string, unknown>;
  return { free: toNum(h.free, 0), paid: toNum(h.paid, 0), spent: toNum(h.spent, 0) };
}

/** Add to a counter and return the new value. */
export async function bumpDaily(userId: string, field: keyof DailyRecord, by: number, date = ukDate()): Promise<number> {
  const key = K.daily(userId, date);
  const next = await redis.hincrby(key, field, by);
  await redis.expire(key, 3 * 86400);
  return next;
}

// ── Runs ────────────────────────────────────────────────────────────────────

export async function loadRun(runId: string): Promise<TourRunState | null> {
  return parseJson<TourRunState>(await redis.get(K.run(runId)));
}

export async function saveRun(state: TourRunState): Promise<void> {
  await redis.set(K.run(state.id), JSON.stringify(state), { ex: RUN_TTL });
  // An index of live runs by when they last moved, so the idle sweeper can find the stale ones.
  if (state.status === "active") await redis.zadd(K.activeIndex, { score: state.updatedAt, member: state.id });
  else await redis.zrem(K.activeIndex, state.id);
}

/** Active runs that have not moved since `before` (a time in ms). */
export async function listIdleRunIds(before: number, limit = 100): Promise<string[]> {
  return ((await redis.zrange(K.activeIndex, 0, before, { byScore: true, offset: 0, count: limit })) as unknown[]).map(String);
}

export async function getActiveRunId(userId: string): Promise<string | null> {
  const v = await redis.get(K.active(userId));
  return typeof v === "string" && v.length > 0 && v !== "pending" ? v : null;
}

/** Claim the member's single active-run slot. Returns false when they already have one. */
export async function claimActiveSlot(userId: string): Promise<boolean> {
  const ok = await redis.set(K.active(userId), "pending", { nx: true, ex: RUN_TTL });
  return ok === "OK";
}

export async function setActiveRun(userId: string, runId: string): Promise<void> {
  await redis.set(K.active(userId), runId, { ex: RUN_TTL });
}

export async function releaseActiveSlot(userId: string): Promise<void> {
  await redis.del(K.active(userId));
}

/** Run a function while holding a short lock on the run, so two taps cannot play the same step twice. */
export async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const got = await redis.set(K.lock(runId), "1", { nx: true, ex: 20 });
  if (got !== "OK") throw new Error("Hold on, that's still being processed. Try again in a moment.");
  try {
    return await fn();
  } finally {
    await redis.del(K.lock(runId)).catch(() => null);
  }
}

/** One mark per (run, name): true the first time, false after. */
export async function claimOnce(key: string, ttlSeconds = 86400 * 8): Promise<boolean> {
  return (await redis.set(key, "1", { nx: true, ex: ttlSeconds })) === "OK";
}

export const endMarkKey = K.endMark;
export const kitMarkKey = K.kitMark;

/** At most `limit` actions per member per minute. */
export async function underRateLimit(userId: string, limit = 30): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const key = K.rate(userId, minute);
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 90);
  return n <= limit;
}

// ── Ghosts ──────────────────────────────────────────────────────────────────

export async function saveGhost(ghost: TourGhost, cap: number): Promise<void> {
  await redis.set(K.ghost(ghost.id), JSON.stringify(ghost), { ex: GHOST_TTL });
  await redis.zadd(K.ghosts(ghost.round), { score: ghost.rating, member: ghost.id });
  await redis.lpush(K.ghostList(ghost.round), ghost.id);
  const length = await redis.llen(K.ghostList(ghost.round));
  for (let over = length - cap; over > 0; over--) {
    const oldest = (await redis.rpop(K.ghostList(ghost.round))) as string | null;
    if (!oldest) break;
    await Promise.all([redis.zrem(K.ghosts(ghost.round), oldest), redis.del(K.ghost(oldest))]);
  }
}

/**
 * A ghost for this Round within a rating band, widening the band until one is found. Never the member's own, never one
 * they already faced this Tour. Returns null when there is none (the caller then uses a bot).
 */
export async function pickGhost(opts: {
  round: number;
  rating: number;
  band: number;
  ownerId: string;
  excludeIds: string[];
  rng: Rng;
}): Promise<TourGhost | null> {
  const key = K.ghosts(opts.round);
  for (let widen = 0; widen <= 4; widen++) {
    const band = opts.band * (1 + widen);
    const ids = ((await redis.zrange(key, opts.rating - band, opts.rating + band, { byScore: true })) as unknown[]).map(String);
    const open = ids.filter((id) => !opts.excludeIds.includes(id));
    // A handful of tries: expired or opted-out ghosts are dropped as they are found.
    for (let tries = 0; tries < 6 && open.length > 0; tries++) {
      const at = Math.floor(opts.rng() * open.length);
      const [id] = open.splice(at, 1);
      const ghost = parseJson<TourGhost>(await redis.get(K.ghost(id)));
      if (!ghost) {
        await redis.zrem(key, id).catch(() => null);
        continue;
      }
      if (ghost.ownerId === opts.ownerId) continue;
      const owner = await loadProfile(ghost.ownerId, 0);
      if (owner.optOut) continue;
      return ghost;
    }
  }
  return null;
}

// ── Notes, ledger, stats, ladder ────────────────────────────────────────────

export async function addNote(userId: string, text: string): Promise<void> {
  await redis.lpush(K.notes(userId), text);
  await redis.ltrim(K.notes(userId), 0, 19);
}

export async function takeNotes(userId: string): Promise<string[]> {
  const notes = ((await redis.lrange(K.notes(userId), 0, 19)) as unknown[]).map(String);
  return notes;
}

export async function clearNotes(userId: string): Promise<void> {
  await redis.del(K.notes(userId));
}

export async function addLedger(entry: Record<string, unknown>): Promise<void> {
  await redis.lpush(K.ledger, JSON.stringify({ at: Date.now(), ...entry }));
  await redis.ltrim(K.ledger, 0, 4999);
}

/** The newest entries of the audit ledger (the most recent 5000 are kept), newest first. For reports. */
export async function loadLedger(): Promise<Array<Record<string, unknown> & { at: number; type: string }>> {
  const rows = (await redis.lrange(K.ledger, 0, 4999)) as unknown[];
  const out: Array<Record<string, unknown> & { at: number; type: string }> = [];
  for (const raw of rows) {
    const e = parseJson<Record<string, unknown>>(raw);
    if (e && typeof e.at === "number" && typeof e.type === "string") out.push(e as Record<string, unknown> & { at: number; type: string });
  }
  return out;
}

export async function bumpStat(field: string, by: number): Promise<void> {
  const key = K.stats(ukDate());
  await redis.hincrby(key, field, by);
  await redis.expire(key, 60 * 86400);
}

export async function bumpStatFloat(field: string, by: number): Promise<void> {
  const key = K.stats(ukDate());
  await redis.hincrbyfloat(key, field, by);
  await redis.expire(key, 60 * 86400);
}

export async function addLadderPoints(userId: string, points: number): Promise<void> {
  if (points <= 0) return;
  const key = K.ladder(weekKey());
  await redis.zincrby(key, points, userId);
  await redis.expire(key, 45 * 86400);
}

// ── Admin helpers ───────────────────────────────────────────────────────────

export async function listEarlyAccess(): Promise<string[]> {
  return ((await redis.smembers(K.earlyAccess)) as unknown[]).map(String);
}

export async function addEarlyAccess(userId: string): Promise<void> {
  await redis.sadd(K.earlyAccess, userId);
}

export async function removeEarlyAccess(userId: string): Promise<void> {
  await redis.srem(K.earlyAccess, userId);
}

export interface ConfigLogEntry {
  at: number;
  by: string;
  changes: string[];
}

/** The newest config changes, each with a short list of what changed. */
export async function loadConfigLog(limit = 20): Promise<ConfigLogEntry[]> {
  const rows = (await redis.lrange(K.configLog, 0, limit - 1)) as unknown[];
  const out: ConfigLogEntry[] = [];
  for (const raw of rows) {
    const e = parseJson<{ at: number; by: string; before: TourConfig; after: TourConfig }>(raw);
    if (!e) continue;
    out.push({ at: e.at, by: e.by, changes: diffConfig(e.before, e.after) });
  }
  return out;
}

/** Plain-language list of the top-level values that differ. */
export function diffConfig(before: TourConfig, after: TourConfig): string[] {
  const changes: string[] = [];
  const flat = (c: TourConfig) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === "updatedAt") continue;
      out[k] = JSON.stringify(v);
    }
    return out;
  };
  const a = flat(before);
  const b = flat(after);
  for (const k of Object.keys(b)) {
    if (a[k] === b[k]) continue;
    if (k === "prizes") changes.push("prize table");
    else if (k === "streakRewards") changes.push("streak rewards");
    else if (k === "tuning") changes.push("tuning numbers");
    else if (k === "upgradeOverrides") changes.push("upgrade settings");
    else if (k === "upgradeWeights") changes.push("upgrade rarity weights");
    else if (k === "multipliers") changes.push("multipliers");
    else changes.push(`${k}: ${a[k]} → ${b[k]}`);
  }
  return changes;
}

export interface DayStats {
  date: string;
  started: number;
  free: number;
  paid: number;
  pIn: number;
  pOut: number;
  completed: number;
  winsTotal: number;
  drives: number;
  /** Total of every drive's average accuracy, so the average is accuracySum / drives. */
  accuracySum: number;
}

/** Economy counters for the last `days` days, newest first. */
export async function loadStats(days = 7): Promise<DayStats[]> {
  const out: DayStats[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const date = ukDate(new Date(now - i * 86400000));
    const h = ((await redis.hgetall(K.stats(date))) ?? {}) as Record<string, unknown>;
    out.push({
      date,
      started: toNum(h.started, 0),
      free: toNum(h.free_runs, 0),
      paid: toNum(h.paid_runs, 0),
      pIn: toNum(h.pcredits_in, 0),
      pOut: toNum(h.pcredits_out, 0),
      completed: toNum(h.completed, 0),
      winsTotal: toNum(h.wins_total, 0),
      drives: toNum(h.drives, 0),
      accuracySum: toNum(h.accuracy_sum, 0),
    });
  }
  return out;
}

/** Tours that are still running, oldest activity first. */
export async function listActiveRuns(limit = 50): Promise<TourRunState[]> {
  const ids = ((await redis.zrange(K.activeIndex, 0, limit - 1)) as unknown[]).map(String);
  const runs = await Promise.all(ids.map((id) => loadRun(id)));
  return runs.filter((r): r is TourRunState => r !== null && r.status === "active");
}
