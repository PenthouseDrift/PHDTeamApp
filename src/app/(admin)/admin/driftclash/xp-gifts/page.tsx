import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { XpGiftsAdmin } from "@/components/admin/driftclash/XpGiftsAdmin";
import { getXpGiftAdminData } from "@/tcg/xp-gift-actions";

export const dynamic = "force-dynamic";

export default async function XpGiftsAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const res = await getXpGiftAdminData();

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
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Free XP gifts</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          A free gift of P-Credits every time a driver earns a set amount of Drift XP. Changes go live as soon as you save.
        </p>
      </div>
      {res.success ? (
        <XpGiftsAdmin initial={res.data} />
      ) : (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {res.error}
        </p>
      )}
    </div>
  );
}
