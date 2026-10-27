import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listSavedCards } from "@/actions/admin/cards";
import { listFullArtCards } from "@/actions/admin/full-art-cards";
import { CardMakerTabs } from "@/components/cards/CardMakerTabs";

export const dynamic = "force-dynamic";
// The AI art server action runs under this route, and image generation can take a while.
export const maxDuration = 60;

export default async function CardMakerPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const [originalSaved, fullArtSaved] = await Promise.all([listSavedCards(), listFullArtCards()]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link data-page-back href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500">
          ← Back to Admin Dashboard
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Card maker</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Build a PHD trading card: add an image, fill in the details, then save it or print it. On the Full art tab, pick a
          bronze, silver, gold or legend tier and the AI art style follows it. The Original tab is the first card design.
        </p>
      </div>
      <CardMakerTabs initialFullArtSaved={fullArtSaved} initialOriginalSaved={originalSaved} />
    </div>
  );
}
