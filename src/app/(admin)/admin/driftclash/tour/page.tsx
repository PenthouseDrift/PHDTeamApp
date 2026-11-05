import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TourAdmin } from "@/components/admin/driftclash/TourAdmin";
import { getTourAdminData } from "@/tcg/tour/admin-actions";

export const dynamic = "force-dynamic";

export default async function TandemTourAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const res = await getTourAdminData();

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
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Tandem Tour</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Turn the mode on, set what a run costs and what it pays, choose who is in early access and watch the economy. Changes go live as soon as you save.
        </p>
      </div>
      {res.success ? (
        <TourAdmin initial={res.data} />
      ) : (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {res.error}
        </p>
      )}
    </div>
  );
}
