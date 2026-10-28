import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAllMemberCards } from "@/actions/admin/member-cards";
import { MemberCardsAdmin } from "@/components/admin/MemberCardsAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MemberCardsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const { cards, total } = await listAllMemberCards();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <Link data-page-back href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500">
          ← Back to Admin Dashboard
        </Link>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">Member cards</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Every card members have opened, with who owns it. Cards a member re-rolled away are kept here too, shown faded.
        </p>
      </div>
      <MemberCardsAdmin initialCards={cards} total={total} />
    </div>
  );
}
