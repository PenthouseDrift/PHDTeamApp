import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDriftClashReport } from "@/actions/admin/drift-clash-report";
import DriftClashReportClient from "./DriftClashReportClient";

export const dynamic = "force-dynamic";

export default async function AdminDriftClashReportPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const report = await getDriftClashReport();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              🏁
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Drift Clash Report</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">P-Credit sales in total and month by month, plus the Tandem Tour economy</p>
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

        <DriftClashReportClient report={report} />

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Money is P-Credit bundle sales, taken from the activity log (&quot;TCG Store&quot; purchases) at the amount actually paid. These
          sales are also counted in the Revenue report&apos;s Online column. P-Credits sold use today&apos;s bundle sizes, so a bundle whose size was
          changed later is counted at the new size. Tandem Tour figures come from the Tour ledger, which keeps the most recent 5000
          entries, so older months may be incomplete. Months and days are UTC, matching Revenue. Spending P-Credits on packs, marketplace
          sales, quick sells, Clash rewards and challenges are not recorded with dates and amounts, so they are not in this report.
        </p>
      </div>
    </div>
  );
}
