import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCardCredits } from "@/lib/card-credits";
import { listMyCards } from "@/actions/member-cards";
import { CardCollection } from "@/components/member-cards/CardCollection";

export const dynamic = "force-dynamic";
// A newly opened card can be re-rolled from the large view, which draws new art and can take a while.
export const maxDuration = 60;

export default async function CardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const [cards, credits] = await Promise.all([listMyCards(), getCardCredits(session.user.id)]);

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">My cards</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Collect cards of your own car. Earn a credit each time you check in at the track and open a pack.
          </p>
        </div>
        <CardCollection initialCards={cards} credits={credits} canDelete={session.user.role === "admin"} />
      </div>
    </div>
  );
}
