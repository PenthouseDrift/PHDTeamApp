import Link from "next/link";
import { getActiveRentals } from "@/actions/admin/rentals";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getAllMembers } from "@/actions/admin/members";
import { getMemberRoster } from "@/lib/member-roster";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";
import { RefreshDataButton } from "@/components/admin/RefreshDataButton";
import { CheckInWizard } from "@/components/admin/CheckInWizard";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";
import { CheckInDesk } from "@/components/admin/desk/CheckInDesk";
import { DeskTodayList } from "@/components/admin/desk/DeskTodayList";
import type { RosterMember } from "@/components/admin/desk/desk-utils";
import { auth } from "@/lib/auth";
import { getDashboardVersion } from "@/lib/dashboard-pref";

export const dynamic = "force-dynamic";

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const { member: initialMemberId } = await searchParams;
  const session = await auth();
  // Same cached lookup the layout already did, so this costs nothing extra.
  const isNew = session?.user ? (await getDashboardVersion(session.user.id)) === "new" : false;

  // New experience: the redesigned check-in desk. It only needs names (a cheap,
  // cached directory); wallet and membership are read live for the ONE person
  // chosen. Classic keeps the wizard and the full members list below.
  if (isNew) {
    const [activeRentals, todayCheckIns, directory] = await Promise.all([
      getActiveRentals(),
      getTodayCheckIns(),
      getMemberRoster(),
    ]);
    const roster: RosterMember[] = directory.map((m) => ({
      id: m.id,
      name: m.name,
      nickname: m.nickname,
      email: m.email,
      image: m.image,
      role: m.role,
    }));
    const checkedIn: Record<string, number> = {};
    for (const c of todayCheckIns) {
      if (!c.userId.startsWith("guest_")) checkedIn[c.userId] = Math.max(checkedIn[c.userId] ?? 0, c.timestamp);
    }
    const unpaid = todayCheckIns.filter((c) => c.unpaid).length;
    const runningRentals = activeRentals.filter((r) => r.status === "active").length;

    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-3 gap-2">
          {[
            { label: "Checked in", value: todayCheckIns.length, tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Unpaid", value: unpaid, tone: unpaid > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-400" },
            { label: "Rentals running", value: runningRentals, tone: "text-blue-600 dark:text-blue-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <dd className={`text-2xl font-black ${s.tone}`}>{s.value}</dd>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{s.label}</dt>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <CheckInDesk roster={roster} checkedIn={checkedIn} initialMemberId={initialMemberId} />
            <ActiveRentalsWidget initialRentals={activeRentals} />
          </div>
          <DeskTodayList checkIns={todayCheckIns} />
        </div>
      </div>
    );
  }

  const [activeRentals, todayCheckIns, members] = await Promise.all([
    getActiveRentals(),
    getTodayCheckIns(),
    getAllMembers(),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
          >
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
            Daily Track Check-In
          </h1>
        </div>
        <RefreshDataButton path="/admin/check-in" />
      </div>

      {/* Primary action: multi-step check-in wizard */}
      <CheckInWizard members={members} />

      {/* Active car rentals */}
      <ActiveRentalsWidget initialRentals={activeRentals} />

      {/* Checked in today */}
      <TodayCheckIns checkIns={todayCheckIns} />
    </div>
  );
}
