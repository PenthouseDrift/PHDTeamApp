import Link from "next/link";
import { formatGBP } from "@/lib/pricing";
import type { AsboRcReport } from "@/lib/asbo-rc";

interface AsboRcReportsSummaryProps {
  report: AsboRcReport;
  /** Where the "view full report" link points. ASBO-RC members have no admin
   * portal access, so by default this is omitted. */
  detailHref?: string;
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "teal" | "emerald" | "red";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-600 dark:text-amber-400",
    teal: "text-teal-600 dark:text-teal-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4">
      <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 text-lg sm:text-2xl font-black leading-none ${toneClasses[tone]}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * ASBO-RC partner dashboard "Reports" section. Deliberately a very quick
 * overview — a couple of headline numbers plus a link to the full report. All
 * the detail (per-item stock, RRP, settlement) lives on the full report page.
 */
export function AsboRcReportsSummary({ report, detailHref }: AsboRcReportsSummaryProps) {
  const { inStockTotals, outstandingToAsboRc, paidToAsboRc } = report;

  return (
    <section className="rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/20 dark:to-zinc-900 p-5 sm:p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 text-lg">
            🏷️
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-zinc-900 dark:text-zinc-100 leading-tight">
              Reports
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
              Your ASBO-RC consignment at Penthouse Drift
            </p>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-teal-100 dark:bg-teal-950/80 border border-teal-300 dark:border-teal-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
          ASBO-RC
        </span>
      </div>

      {/* Quick numbers — always shown (zeros when there's no stock yet). */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <Stat label="In stock" value={String(inStockTotals.unitCount)} tone="teal" />
        <Stat label="Outstanding" value={formatGBP(outstandingToAsboRc)} tone="red" />
        <Stat label="Paid to you" value={formatGBP(paidToAsboRc)} tone="emerald" />
      </div>

      {report.overall.itemCount === 0 && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          No ASBO-RC consignment items yet. Items marked &ldquo;Sold by ASBO-RC&rdquo; in the
          marketplace will appear here.
        </p>
      )}

      {detailHref && (
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 dark:text-teal-400 hover:text-teal-600 transition-colors"
        >
          View full report →
        </Link>
      )}
    </section>
  );
}
