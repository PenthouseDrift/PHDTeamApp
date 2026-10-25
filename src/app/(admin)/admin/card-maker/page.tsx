import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listSavedCards } from "@/actions/admin/cards";
import { CardMaker } from "@/components/cards/CardMaker";

export const dynamic = "force-dynamic";

export default async function CardMakerPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const saved = await listSavedCards();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link data-page-back href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500">
          ← Back to Admin Dashboard
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Card maker</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Build a PHD trading card: add an image, fill in the details, pick the colours, then save it or print it.
        </p>
      </div>
      <CardMaker initialSaved={saved} />
    </div>
  );
}
