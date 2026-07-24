import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getActiveRentals } from "@/actions/admin/rentals";
import { MemberList } from "@/components/admin/MemberList";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const [members, todayCheckIns, activeRentals] = await Promise.all([
    getAllMembers(),
    getTodayCheckIns(),
    getActiveRentals(),
  ]);

  const checkedInIds = new Set(todayCheckIns.map((c) => c.userId));
  const checkedInMembers = members.filter((m) => checkedInIds.has(m.member.id));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <AutoRefresh interval={5000} />
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Members & Check-In</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {members.length} registered member{members.length !== 1 ? "s" : ""} • {todayCheckIns.length} checked in today
        </p>
      </div>

      {/* Active Car Rentals Widget */}
      <ActiveRentalsWidget initialRentals={activeRentals} />

      {/* Today's Check-Ins */}
      <TodayCheckIns checkIns={todayCheckIns} />

      {/* All Members */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">All Members</h2>
        <MemberList members={members} checkedInMembers={checkedInMembers} />
      </div>
    </div>
  );
}
