import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAsboRcReport } from "@/actions/asbo-rc";
import { AsboRcReportClient } from "@/components/asbo-rc/AsboRcReportClient";

export const dynamic = "force-dynamic";

export default async function AdminAsboRcPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const report = await getAsboRcReport();

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
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">ASBO-RC Reports</h1>
            <span className="inline-flex items-center rounded-full bg-teal-100 dark:bg-teal-950/80 border border-teal-300 dark:border-teal-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
              Consignment
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Stock provided by ASBO-RC and sold on their behalf. Penthouse Drift keeps 7% of each
            sale; the rest is owed to ASBO-RC. Settle sold items manually, then tick them off.
          </p>
        </div>

        {report ? (
          <AsboRcReportClient report={report} />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Unable to load the ASBO-RC report.
          </div>
        )}
      </div>
    </div>
  );
}
