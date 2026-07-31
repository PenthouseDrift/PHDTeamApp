import Link from "next/link";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getActiveRentals } from "@/actions/admin/rentals";
import { MemberList } from "@/components/admin/MemberList";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";

export const dynamic = "force-dynamic";

export default function AdminMembersPage() {
  return (
    <PullToRefresh>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
          >
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Members &amp; Check-In</h1>
          <Suspense fallback={<div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-1" />}>
            <MembersHeaderStats />
          </Suspense>
        </div>
        <Link
          href="/admin/check-in"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-sm shadow-md transition-all active:scale-[0.99]"
        >
          <span>📱</span> Launch QR Scanner →
        </Link>
      </div>

      <Suspense fallback={<MembersSkeleton />}>
        <MembersData />
      </Suspense>
      </div>
    </PullToRefresh>
  );
}

async function MembersHeaderStats() {
  const [members, todayCheckIns] = await Promise.all([
    getAllMembers(),
    getTodayCheckIns(),
  ]);
  return (
    <p className="text-sm text-zinc-500 mt-1">
      {members.length} registered member{members.length !== 1 ? "s" : ""} • {todayCheckIns.length} checked in today
    </p>
  );
}

async function MembersData() {
  const [session, members, todayCheckIns, activeRentals] = await Promise.all([
    auth(),
    getAllMembers(),
    getTodayCheckIns(),
    getActiveRentals(),
  ]);

  const checkedInIds = new Set(todayCheckIns.map((c) => c.userId));
  const checkedInMembers = members.filter((m) => checkedInIds.has(m.member.id));
  const userRole = session?.user?.role || "member";

  return (
    <>
      <ActiveRentalsWidget initialRentals={activeRentals} />
      <TodayCheckIns checkIns={todayCheckIns} />
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">All Members</h2>
        <MemberList members={members} checkedInMembers={checkedInMembers} userRole={userRole} />
      </div>
    </>
  );
}

function MembersSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 h-24" />
      <div className="space-y-3 mt-8">
        <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="flex gap-2 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          ))}
        </div>
      </div>
      <div className="space-y-4 mt-8">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-10 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div>
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
