import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BattlePassAdmin } from "@/components/admin/driftclash/BattlePassAdmin";
import { getBattlePassAdminData } from "@/tcg/battle-pass/actions";

export const dynamic = "force-dynamic";

export default async function BattlePassAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const res = await getBattlePassAdminData();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link
          data-page-back
          href="/admin/driftclash"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
        >
          ← Back to DriftClash
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Battle Pass</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          A monthly ladder of Drift XP. Each gift on it holds P-Credits or pack credits. The ladder starts again at 0 on the 1st of every month (London
          time). Changes go live as soon as you save, and anyone who has already reached a gift finds it waiting for them.
        </p>
      </div>
      {res.success ? (
        <BattlePassAdmin initial={res.data} />
      ) : (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {res.error}
        </p>
      )}
    </div>
  );
}
