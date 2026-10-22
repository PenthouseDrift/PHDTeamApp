import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getFacilitatedPayoutReport } from "@/actions/phd-facilitated";
import { FacilitatedPayoutReportClient } from "@/components/marketplace/FacilitatedPayoutReportClient";

export const dynamic = "force-dynamic";

/**
 * Admin-only report of "Facilitated by PHD" sales — items members listed that
 * PHD sold on their behalf. Shows how much PHD owes each ORIGINAL OWNER so
 * payouts are clear and can be settled. Completely separate from the ASBO-RC
 * consignment report.
 */
export default async function AdminFacilitatedSalesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const report = await getFacilitatedPayoutReport();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 pb-6 space-y-1">
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors"
          >
            ← Back to Reports
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Owner Payouts</h1>
            <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-300 dark:border-indigo-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Facilitated by PHD
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Items members listed that Penthouse Drift sold on their behalf. Each sold unit shows
            how much we owe the original owner; the club keeps the rest of the sale price. Settle
            each owner once you&apos;ve paid them.
          </p>
        </div>

        {report ? (
          <FacilitatedPayoutReportClient report={report} />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Unable to load the owner payouts report.
          </div>
        )}
      </div>
    </div>
  );
}
