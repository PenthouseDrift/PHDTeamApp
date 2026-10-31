import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  listTandemClashChallengesAction,
  listAdminChallengeCandidateCardsAction,
} from "@/tcg/challenges-actions";
import { TcgChallengesAdmin } from "@/tcg/components/TcgChallengesAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminChallengesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/admin");

  const [chRes, candRes] = await Promise.all([
    listTandemClashChallengesAction(),
    listAdminChallengeCandidateCardsAction(),
  ]);

  const initialChallenges = chRes.success && chRes.data ? chRes.data.challenges : [];
  const initialCandidateCards = candRes.success && candRes.data ? candRes.data : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            data-page-back
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500"
          >
            ← Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
              Tandem Clash Challenges &amp; Tournaments
            </h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-black uppercase text-purple-600 dark:text-purple-400">
              Admin Manager
            </span>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
            Configure automated rarity cups, power caps, victory rewards, and hand-pick custom rival teams from member cards and pullable set cards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/card-maker?tab=clash-cards"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 text-xs font-black text-amber-700 shadow-sm transition-colors hover:bg-amber-500/25 dark:text-amber-300"
          >
            ⚡ Crew, Debuff &amp; Track Cards
          </Link>
          <Link
            href="/cards?tab=clash"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-black text-black shadow-sm transition-colors hover:bg-amber-400"
          >
            🎮 Open Arena Cups
          </Link>
        </div>
      </div>

      <TcgChallengesAdmin
        initialChallenges={initialChallenges}
        initialCandidateCards={initialCandidateCards}
      />
    </div>
  );
}
