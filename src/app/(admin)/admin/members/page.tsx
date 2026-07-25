import Link from "next/link";
import { auth } from "@/lib/auth";
import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getActiveRentals } from "@/actions/admin/rentals";
import { MemberList } from "@/components/admin/MemberList";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
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
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <AutoRefresh interval={5000} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
          >
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Members &amp; Check-In</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {members.length} registered member{members.length !== 1 ? "s" : ""} • {todayCheckIns.length} checked in today
          </p>
        </div>
        <Link
          href="/admin/check-in"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-sm shadow-md transition-all active:scale-[0.99]"
        >
          <span>📱</span> Launch QR Scanner →
        </Link>
      </div>

      {/* Active Car Rentals Widget */}
      <ActiveRentalsWidget initialRentals={activeRentals} />

      {/* Today's Check-Ins */}
      <TodayCheckIns checkIns={todayCheckIns} userRole={userRole} />

      {/* All Members */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">All Members</h2>
        <MemberList members={members} checkedInMembers={checkedInMembers} userRole={userRole} />
      </div>
    </div>
  );
}
