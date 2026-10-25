import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getConcessions } from "@/actions/admin/concessions";
import ConcessionsClient from "./ConcessionsClient";

export const dynamic = "force-dynamic";

export default async function ConcessionsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const overview = await getConcessions();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              🧃
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                Drinks &amp; Snacks
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Cost vs sell price, profit per item and overall margin
              </p>
            </div>
          </div>
          <Link
            data-page-back
            href="/admin/activity/revenue"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-indigo-500 transition-colors bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 self-start"
          >
            ← Revenue
          </Link>
        </div>

        <ConcessionsClient initial={overview} />

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Stock is priced by the case: enter the case cost and how many units are in a case, and
          cost per unit is worked out for you (e.g. £22.39 ÷ 24 = £0.93). Margin is profit as a
          percentage of the sell price; case profit is the profit if a whole case sells through.
        </p>
      </div>
    </div>
  );
}
