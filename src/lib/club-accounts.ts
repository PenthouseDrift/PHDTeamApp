/**
 * Club accounts: a simple ledger of where the club's money is. Pure (no server imports) so client components can use it.
 *
 * Money is kept as whole pence (integers), so adding up never drifts the way pounds-and-pence floats can.
 */

export const CLUB_ACCOUNTS = [
  { id: "sumup", label: "SumUp bank", icon: "🏦" },
  { id: "cash", label: "Cash", icon: "💷" },
  { id: "kitty", label: "Kitty", icon: "🐷" },
] as const;

export type ClubAccountId = (typeof CLUB_ACCOUNTS)[number]["id"];

/** "in" and "out" are plain entries; the two "transfer" kinds are the two halves of a move between accounts. */
export type ClubEntryKind = "in" | "out" | "transfer_in" | "transfer_out";

export interface ClubLedgerEntry {
  id: string;
  account: ClubAccountId;
  kind: ClubEntryKind;
  /** Always positive; the kind says which way it went. */
  amountPence: number;
  /** The day it happened, YYYY-MM-DD (may be earlier than the day it was recorded). */
  date: string;
  note: string;
  createdAt: number;
  createdById: string;
  createdByName: string;
  /** For a transfer: the entry on the other account. */
  pairId?: string;
}

export interface ClubLedger {
  /** Current balance of each account, in pence. Can be negative. */
  balances: Record<ClubAccountId, number>;
  /** Newest first. */
  entries: ClubLedgerEntry[];
  /** How many entries exist in all (entries holds the latest of them). */
  totalEntries: number;
}

export const EMPTY_BALANCES: Record<ClubAccountId, number> = { sumup: 0, cash: 0, kitty: 0 };

/** The largest single entry: £1,000,000. Anything bigger is a typo. */
export const MAX_ENTRY_PENCE = 100_000_000;
export const MAX_NOTE_LENGTH = 200;

export function isClubAccount(value: unknown): value is ClubAccountId {
  return CLUB_ACCOUNTS.some((a) => a.id === value);
}

export function accountLabel(id: ClubAccountId): string {
  return CLUB_ACCOUNTS.find((a) => a.id === id)?.label ?? id;
}

export function accountIcon(id: ClubAccountId): string {
  return CLUB_ACCOUNTS.find((a) => a.id === id)?.icon ?? "💷";
}

/** Whether an entry adds to its account (+1) or takes from it (-1). */
export function entryDirection(kind: ClubEntryKind): 1 | -1 {
  return kind === "in" || kind === "transfer_in" ? 1 : -1;
}

/** An amount typed in pounds ("12.50", 12.5) as whole pence, or null when it isn't a sensible positive amount. */
export function poundsToPence(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  // Read the digits as written (not as a float), and refuse more than two decimal places, so no amount is ever silently rounded.
  const text = String(raw).trim().replace(/^£/, "").replace(/,/g, "");
  if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const [pounds, cents = ""] = text.split(".");
  const pence = Number(pounds || "0") * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(pence) || pence < 1 || pence > MAX_ENTRY_PENCE) return null;
  return pence;
}

/** 123456 -> "£1,234.56"; -500 -> "-£5.00". */
export function formatPence(pence: number): string {
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100).toLocaleString("en-GB");
  const rest = String(abs % 100).padStart(2, "0");
  return `${pence < 0 ? "-" : ""}£${pounds}.${rest}`;
}

/** A real calendar day written YYYY-MM-DD. */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today in the club's time zone, YYYY-MM-DD. */
export function todayInLondon(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "2026-11-14" -> "14 Nov 2026". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** An entry read back from storage (a JSON string or an already parsed object), or null when it isn't a usable entry. */
export function parseClubEntry(raw: unknown): ClubLedgerEntry | null {
  try {
    const e = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<ClubLedgerEntry> | null;
    if (!e || typeof e.id !== "string" || !isClubAccount(e.account) || !isValidDay(e.date)) return null;
    if (typeof e.amountPence !== "number" || !Number.isFinite(e.amountPence)) return null;
    if (e.kind !== "in" && e.kind !== "out" && e.kind !== "transfer_in" && e.kind !== "transfer_out") return null;
    return {
      id: e.id,
      account: e.account,
      kind: e.kind,
      amountPence: e.amountPence,
      date: e.date,
      note: typeof e.note === "string" ? e.note : "",
      createdAt: Number(e.createdAt) || 0,
      createdById: String(e.createdById ?? ""),
      createdByName: String(e.createdByName ?? ""),
      ...(typeof e.pairId === "string" ? { pairId: e.pairId } : {}),
    };
  } catch {
    return null;
  }
}

// ── Money in and out over time ──────────────────────────────────────────────────────────────────────────────────────

/** What a chart can show: every account together, or one account. */
export type ChartScope = "all" | ClubAccountId;
export type ChartPeriod = "day" | "month";

/** Money in and out during one day or month (in pence). */
export interface ClubChartPoint {
  /** YYYY-MM-DD for a day, YYYY-MM for a month. */
  key: string;
  /** Short label for the axis, e.g. "14 Nov" or "Nov". */
  label: string;
  /** Longer label for the readout, e.g. "14 Nov 2026" or "November 2026". */
  title: string;
  inPence: number;
  outPence: number;
}

export type ClubChartData = Record<ChartPeriod, Record<ChartScope, ClubChartPoint[]>>;

export const CHART_DAYS = 30;
export const CHART_MONTHS = 12;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last `count` days ending at `today` (YYYY-MM-DD), oldest first. */
function lastDays(today: string, count: number): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) => dayKey(end - (count - 1 - i) * 86_400_000));
}

/** The last `count` months ending at the month of `today` (YYYY-MM), oldest first. */
function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const back = count - 1 - i;
    const idx = y * 12 + (m - 1) - back;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

function dayLabel(key: string): { label: string; title: string } {
  const [y, m, d] = key.split("-").map(Number);
  return { label: `${d} ${MONTHS_SHORT[m - 1]}`, title: `${d} ${MONTHS_SHORT[m - 1]} ${y}` };
}

function monthLabel(key: string): { label: string; title: string } {
  const [y, m] = key.split("-").map(Number);
  return { label: MONTHS_SHORT[m - 1], title: `${MONTHS_LONG[m - 1]} ${y}` };
}

/**
 * Money in and out per day (the last 30 days) and per month (the last 12), for all accounts together and for each account.
 *
 * Together, moves between accounts are left out: they don't change how much the club has, so they aren't money in or out.
 * For a single account they are counted, because they are money into or out of that account.
 */
export function buildClubChartData(entries: ClubLedgerEntry[], today: string): ClubChartData {
  const scopes: ChartScope[] = ["all", ...CLUB_ACCOUNTS.map((a) => a.id)];
  const build = (keys: string[], labelOf: (key: string) => { label: string; title: string }, bucketOf: (day: string) => string) => {
    const result = {} as Record<ChartScope, ClubChartPoint[]>;
    for (const scope of scopes) {
      const points = new Map<string, ClubChartPoint>(keys.map((key) => [key, { key, ...labelOf(key), inPence: 0, outPence: 0 }]));
      for (const entry of entries) {
        const isTransfer = entry.kind === "transfer_in" || entry.kind === "transfer_out";
        if (scope === "all" ? isTransfer : entry.account !== scope) continue;
        const point = points.get(bucketOf(entry.date));
        if (!point) continue;
        if (entryDirection(entry.kind) === 1) point.inPence += entry.amountPence;
        else point.outPence += entry.amountPence;
      }
      result[scope] = keys.map((key) => points.get(key)!);
    }
    return result;
  };
  return {
    day: build(lastDays(today, CHART_DAYS), dayLabel, (day) => day),
    month: build(lastMonths(today, CHART_MONTHS), monthLabel, (day) => day.slice(0, 7)),
  };
}

/**
 * A tidy top for a chart axis. The chart has four gridlines above zero, so this picks a round step between them (1, 2, 2.5
 * or 5 times a power of ten) and returns four of them: every gridline then lands on a round amount (£1k, £2k, £3k, £4k).
 */
export function niceAxisMax(maxPence: number): number {
  if (maxPence <= 0) return 10_000; // £100 for an empty chart
  const pounds = Math.max(10, maxPence / 100); // never zoom in closer than £10
  const needed = pounds / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(needed)));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= needed) ?? 10;
  return Math.round(step * magnitude * 4 * 100);
}

/** £1,500 -> "£1.5k", £800 -> "£800", for axis labels. */
export function formatAxisPence(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${Number((pounds / 1000).toFixed(1))}k`;
  return `£${Number(pounds.toFixed(2))}`;
}
