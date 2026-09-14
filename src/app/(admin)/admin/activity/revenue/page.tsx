import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMonthlyRevenue } from "@/actions/admin/activity";
import RevenueTableClient from "./RevenueTableClient";

export const dynamic = "force-dynamic";

export default async function AdminRevenuePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const report = await getMonthlyRevenue();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              💰
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                Monthly Revenue
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Online purchases and in-person (cash) takings, by month
              </p>
            </div>
          </div>
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-indigo-500 transition-colors bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 self-start"
          >
            ← Activity Log
          </Link>
        </div>

        {/* Monthly breakdown — click a month to see per-day takings */}
        <RevenueTableClient months={report.months} />

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Revenue is derived from the activity log. Online figures come from
          in-app card purchases; cash figures come from in-person cash/card check-ins
          (day passes, rentals and cash memberships), priced against the current pricing
          config and any per-member discounts. Wallet redemptions are not counted again
          here because they were already recorded when the pass was purchased. The activity
          log retains the most recent ~5000 entries, so very old months may age out.
        </p>
      </div>
    </div>
  );
}


