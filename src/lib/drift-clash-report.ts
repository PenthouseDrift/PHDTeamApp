import type { ActivityEntry } from "@/lib/activity";

/**
 * The Drift Clash report: what the card game takes and pays out, in total and month by month.
 *
 * Real money (GBP) is P-Credit bundle sales. Each one is in the activity log as "TCG Store: <bundle name>" with the amount
 * paid, so those are summed exactly. These sales are also counted in the Revenue report's Online column.
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


export interface DriftClashReport {
  currency: string;
  sales: ClashSales & { averagePurchase: number };
  bundles: ClashBundleLine[];
  months: ClashMonth[];
  /** The first and last sale in the report, as dates. */
  firstSale: string | null;
  lastSale: string | null;
}

export const EMPTY_SALES: ClashSales = { purchases: 0, pCredits: 0, revenue: 0, buyers: 0 };

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
    firstSale: first === Infinity ? null : dateLabel(first),
    lastSale: last === 0 ? null : dateLabel(last),
  };
}
