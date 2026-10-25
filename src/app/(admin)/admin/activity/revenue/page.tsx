import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDailyRevenue } from "@/actions/admin/activity";
import { formatGBP } from "@/lib/activity-pricing";

export const dynamic = "force-dynamic";

export default async function AdminRevenuePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  // Today only (UTC). This fetches just the current day's entries, so the page
  // loads fast. The full month lives on a separate page linked below.
  const today = await getDailyRevenue();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              💰
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                Today&apos;s Revenue
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {today?.label ?? "Today"} · online and in-person (cash) takings
              </p>
            </div>
          </div>
          <Link
            data-page-back
            href="/admin/activity"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-indigo-500 transition-colors bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 self-start"
          >
            ← Reports
          </Link>
        </div>

        {/* Today's summary cards */}
        {today && today.breakdown.total === 0 && today.attendance.onTrack === 0 && today.attendance.rentals === 0 ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Nothing recorded yet today
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Online purchases and in-person cash check-ins will appear here as they happen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Online"
              value={formatGBP(today?.breakdown.online ?? 0)}
              accent="text-indigo-600 dark:text-indigo-400"
            />
            <SummaryCard
              label="Cash"
              value={formatGBP(today?.breakdown.door ?? 0)}
              accent="text-amber-600 dark:text-amber-400"
            />
            <SummaryCard
              label="Total"
              value={formatGBP(today?.breakdown.total ?? 0)}
              accent="text-emerald-600 dark:text-emerald-400"
              emphasize
            />
          </div>
        )}

        {/* Attendance + entry count */}
        {today && (today.attendance.onTrack > 0 || today.attendance.rentals > 0 || today.count > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {today.attendance.onTrack > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold px-3 py-1.5">
                👥 {today.attendance.onTrack} on track
              </span>
            )}
            {today.attendance.rentals > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 font-bold px-3 py-1.5">
                🏎️ {today.attendance.rentals} rentals
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-bold px-3 py-1.5">
              {today.count} revenue {today.count === 1 ? "entry" : "entries"}
            </span>
          </div>
        )}

        {/* Links through to the deeper reports */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/activity/revenue/monthly"
            className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-colors group"
          >
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Monthly revenue</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Full breakdown by month with per-day takings
              </p>
            </div>
            <span className="text-zinc-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all text-lg" aria-hidden>
              →
            </span>
          </Link>
          <Link
            href="/admin/activity/revenue/concessions"
            className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-colors group"
          >
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Drinks &amp; snacks</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Cost vs sell price and profit margin per item
              </p>
            </div>
            <span className="text-zinc-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all text-lg" aria-hidden>
              →
            </span>
          </Link>
        </div>

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Today&apos;s figures are derived from the activity log for the current day (UTC).
          Online figures come from in-app card purchases; cash figures come from in-person
          cash/card check-ins (day passes, rentals and cash memberships), priced against the
          current pricing config and any per-member discounts. Wallet redemptions are not
          counted again here because they were already recorded when the pass was purchased.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  emphasize = false,
}: {
  label: string;
  value: string;
  accent: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-zinc-900 px-5 py-6 ${
        emphasize
          ? "border-emerald-500/30 bg-emerald-500/[0.03]"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-2 font-black tracking-tight ${emphasize ? "text-3xl" : "text-2xl"} ${accent}`}>
        {value}
      </p>
    </div>
  );
}
