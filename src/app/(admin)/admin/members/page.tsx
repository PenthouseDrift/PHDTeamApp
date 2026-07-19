import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { MemberList } from "@/components/admin/MemberList";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const members = await getAllMembers();
  const todayCheckIns = await getTodayCheckIns();

  // Get unique checked-in user IDs
  const checkedInIds = new Set(todayCheckIns.map((c) => c.userId));

  // Split members into checked-in today and not checked in
  const checkedInMembers = members.filter((m) => checkedInIds.has(m.member.id));
  const notCheckedInMembers = members.filter((m) => !checkedInIds.has(m.member.id));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Members & Check-In</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {members.length} registered member{members.length !== 1 ? "s" : ""} • {todayCheckIns.length} checked in today
        </p>
      </div>

      {/* Today's Check-Ins */}
      <TodayCheckIns checkIns={todayCheckIns} />

      {/* All Members - Not Checked In */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          All Members
          {notCheckedInMembers.length > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
              ({notCheckedInMembers.length} not checked in)
            </span>
          )}
        </h2>
        <MemberList members={notCheckedInMembers} checkedInMembers={checkedInMembers} />
      </div>
    </div>
  );
}
