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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Members & Check-In</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {members.length} registered member{members.length !== 1 ? "s" : ""} • {todayCheckIns.length} checked in today
          </p>
        </div>

        {userRole === "admin" && (
          <Link
            href="/admin/users"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 text-xs font-extrabold px-4 py-2.5 hover:bg-purple-500/20 transition-colors shrink-0 shadow-sm"
          >
            <span>👥 Manage Users & Roles</span>
          </Link>
        )}
      </div>

      {/* Active Car Rentals Widget */}
      <ActiveRentalsWidget initialRentals={activeRentals} />

      {/* Today's Check-Ins */}
      <TodayCheckIns checkIns={todayCheckIns} />

      {/* All Members */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">All Members</h2>
        <MemberList members={members} checkedInMembers={checkedInMembers} userRole={userRole} />
      </div>
    </div>
  );
}
