import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMemberCars } from "@/actions/cars";
import { getMemberHash } from "@/lib/dashboard-pref";
import { getCardCredits } from "@/lib/card-credits";
import { listMyCards } from "@/actions/member-cards";
import { getMemberSpecSheets } from "@/actions/spec-sheets";
import { CardPackWizard } from "@/components/member-cards/CardPackWizard";

export const dynamic = "force-dynamic";
// Drawing the card with AI runs under this route and can take a while.
export const maxDuration = 60;

export default async function NewCardPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  const userId = session.user.id;

  const [hash, carsResult, credits, myCards, initialSpecSheets] = await Promise.all([
    getMemberHash(userId),
    getMemberCars(userId),
    getCardCredits(userId),
    listMyCards(),
    getMemberSpecSheets(userId),
  ]);
  const nickname = typeof hash?.nickname === "string" ? hash.nickname.trim() : "";
  const accountName = session.user.name?.trim() ?? "";
  const defaultName = nickname || accountName;
  // Other names to tap: nickname, full account name, first name.
  const nameOptions = [...new Set([nickname, accountName, accountName.split(/\s+/)[0] ?? ""].filter((n) => n && n.length <= 30))];
  // Teams from this member's earlier cards, newest first.
  const recentTeams = [...new Set(myCards.map((c) => c.team).filter(Boolean))].slice(0, 4);
  const cars = (carsResult.success ? carsResult.data : []).map((c) => ({
    carId: c.carId,
    name: c.name,
    chassis: c.chassis ?? "",
    images: c.images,
  }));

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1">
          <Link data-page-back href="/cards" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            ← My cards
          </Link>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Open a card pack</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            You have {credits} card credit{credits === 1 ? "" : "s"}. Earn 1 each time you check in at the track, or 2 with a membership.
          </p>
        </div>
        <CardPackWizard
          userId={userId}
          defaultName={defaultName}
          nameOptions={nameOptions}
          recentTeams={recentTeams}
          cars={cars}
          initialCredits={credits}
          initialSpecSheets={initialSpecSheets}
        />
      </div>
    </div>
  );
}
