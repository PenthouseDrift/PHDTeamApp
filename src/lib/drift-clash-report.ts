import type { ActivityEntry } from "@/lib/activity";

/**
 * The Drift Clash report: what the card game takes and pays out, in total and month by month.
 *
 * Real money (GBP) is P-Credit bundle sales. Each one is in the activity log as "TCG Store: <bundle name>" with the amount
 * paid, so those are summed exactly. These sales are also counted in the Revenue report's Online column.
 *
 * Tandem Tour moves P-Credits (not pounds): entry and reroll fees come in, prizes go out. That comes from the Tour ledger.
 *
 * Months and days are UTC, matching the Revenue report, so the two agree.
 */

export interface ClashBundleLine {
  name: string;
  purchases: number;
  pCredits: number;
  revenue: number;
}

export interface ClashDay {
  day: string;
  label: string;
  purchases: number;
  pCredits: number;
  revenue: number;
}

export interface ClashSales {
  purchases: number;
  pCredits: number;
  revenue: number;
  /** Different members who bought. */
  buyers: number;
}

export interface ClashMonth extends ClashSales {
  month: string;
  label: string;
  bundles: ClashBundleLine[];
  days: ClashDay[];
}

export interface TourEconomy {
  /** Tours started, split into free and paid. */
  started: number;
  free: number;
  paid: number;
  /** P-Credits taken in as entry and reroll fees, after refunds. */
  pIn: number;
  /** P-Credits paid out as prizes and streak bonuses. */
  pOut: number;
  /** pIn minus pOut: positive means P-Credits left circulation. */
  net: number;
  completed: number;
  /** Pack credits given as prizes. */
  packCredits: number;
}

export interface TourMonth extends TourEconomy {
  month: string;
  label: string;
}

export interface DriftClashReport {
  currency: string;
  sales: ClashSales & { averagePurchase: number };
  bundles: ClashBundleLine[];
  months: ClashMonth[];
  tour: { totals: TourEconomy; months: TourMonth[]; entries: number };
  /** The first and last sale in the report, as dates. */
  firstSale: string | null;
  lastSale: string | null;
}

export const EMPTY_SALES: ClashSales = { purchases: 0, pCredits: 0, revenue: 0, buyers: 0 };
export const EMPTY_TOUR: TourEconomy = { started: 0, free: 0, paid: 0, pIn: 0, pOut: 0, net: 0, completed: 0, packCredits: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function parseEntries(records: unknown[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const r of records || []) {
    try {
      const e = typeof r === "string" ? JSON.parse(r) : r;
      if (e && typeof e === "object") out.push(e as ActivityEntry);
    } catch {
      /* a record that doesn't parse is skipped */
    }
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Everything the report is built from, already read from storage. */
export interface DriftClashReportInput {
  /** Raw records from the activity log. */
  records: unknown[];
  /** The P-Credit bundles as sold today (name and size). */
  bundles: Array<{ name: string; pCredits: number }>;
  /** The Tandem Tour audit ledger. */
  ledger: Array<Record<string, unknown> & { at: number; type: string }>;
}

export function buildDriftClashReport(input: DriftClashReportInput, currency: string): DriftClashReport {
  // ── P-Credit sales (real money) ──
  // How many P-Credits each bundle gives. The activity log only keeps the bundle's name, so this uses today's bundle sizes.
  const sizeByName = new Map<string, number>();
  for (const b of input.bundles) sizeByName.set(b.name.toLowerCase(), b.pCredits);
  const creditsFor = (label: string): number => {
    const literal = /^([\d,]+)\s+P-Credits$/i.exec(label);
    if (literal) return Number(literal[1].replace(/,/g, "")) || 0;
    return sizeByName.get(label.toLowerCase()) ?? 0;
  };

  interface Acc {
    purchases: number;
    pCredits: number;
    revenue: number;
    buyers: Set<string>;
    bundles: Map<string, ClashBundleLine>;
    days: Map<string, ClashDay>;
  }
  const newAcc = (): Acc => ({ purchases: 0, pCredits: 0, revenue: 0, buyers: new Set(), bundles: new Map(), days: new Map() });
  const total = newAcc();
  const byMonth = new Map<string, Acc>();
  let first = Infinity;
  let last = 0;

  for (const e of parseEntries(input.records)) {
    if (e.isDev || e.type !== "purchase") continue;
    const description = typeof e.description === "string" ? e.description : "";
    if (!description.startsWith("TCG Store:")) continue;
    const amount = num(e.amount);
    if (amount <= 0) continue;
    const ts = num(e.timestamp);
    if (!ts) continue;

    const name = description.slice("TCG Store:".length).trim() || "P-Credits";
    const credits = creditsFor(name);
    first = Math.min(first, ts);
    last = Math.max(last, ts);

    const mKey = monthKey(ts);
    let month = byMonth.get(mKey);
    if (!month) {
      month = newAcc();
      byMonth.set(mKey, month);
    }
    const dKey = dayKey(ts);
    for (const acc of [total, month]) {
      acc.purchases++;
      acc.pCredits += credits;
      acc.revenue += amount;
      if (e.memberId) acc.buyers.add(e.memberId);
      const line = acc.bundles.get(name) ?? { name, purchases: 0, pCredits: 0, revenue: 0 };
      line.purchases++;
      line.pCredits += credits;
      line.revenue += amount;
      acc.bundles.set(name, line);
    }
    const day = month.days.get(dKey) ?? { day: dKey, label: dayLabel(dKey), purchases: 0, pCredits: 0, revenue: 0 };
    day.purchases++;
    day.pCredits += credits;
    day.revenue += amount;
    month.days.set(dKey, day);
  }

  const lines = (m: Map<string, ClashBundleLine>) =>
    [...m.values()].map((l) => ({ ...l, revenue: round2(l.revenue) })).sort((a, b) => b.revenue - a.revenue);

  const months: ClashMonth[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, a]) => ({
      month,
      label: monthLabel(month),
      purchases: a.purchases,
      pCredits: a.pCredits,
      revenue: round2(a.revenue),
      buyers: a.buyers.size,
      bundles: lines(a.bundles),
      days: [...a.days.values()].map((d) => ({ ...d, revenue: round2(d.revenue) })).sort((x, y) => (x.day < y.day ? 1 : -1)),
    }));

  // ── Tandem Tour (P-Credits) ──
  const tourTotals: TourEconomy = { ...EMPTY_TOUR };
  const tourByMonth = new Map<string, TourEconomy>();
  const ledger = input.ledger;
  let tourEntries = 0;
  for (const e of ledger) {
    if (e.type !== "start" && e.type !== "reroll" && e.type !== "end" && e.type !== "cancel") continue;
    tourEntries++;
    const mKey = monthKey(e.at);
    const m = tourByMonth.get(mKey) ?? { ...EMPTY_TOUR };
    tourByMonth.set(mKey, m);
    for (const t of [tourTotals, m]) {
      if (e.type === "start") {
        t.started++;
        if (e.free === true) t.free++;
        else t.paid++;
        t.pIn += num(e.charged);
      } else if (e.type === "reroll") {
        t.pIn += num(e.charged);
      } else if (e.type === "cancel") {
        t.pIn -= num(e.refunded);
      } else {
        t.completed++;
        t.pOut += num(e.pCredits);
        t.packCredits += num(e.packCredits);
      }
    }
  }
  const finishTour = (t: TourEconomy): TourEconomy => ({ ...t, net: t.pIn - t.pOut });

  const tourMonths: TourMonth[] = [...tourByMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, t]) => ({ month, label: monthLabel(month), ...finishTour(t) }));

  return {
    currency,
    sales: {
      purchases: total.purchases,
      pCredits: total.pCredits,
      revenue: round2(total.revenue),
      buyers: total.buyers.size,
      averagePurchase: total.purchases > 0 ? round2(total.revenue / total.purchases) : 0,
    },
    bundles: lines(total.bundles),
    months,
    tour: { totals: finishTour(tourTotals), months: tourMonths, entries: tourEntries },
    firstSale: first === Infinity ? null : dateLabel(first),
    lastSale: last === 0 ? null : dateLabel(last),
  };
}
