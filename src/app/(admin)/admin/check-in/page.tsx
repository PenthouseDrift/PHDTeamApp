import Link from "next/link";
import { getActiveRentals } from "@/actions/admin/rentals";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getAllMembers } from "@/actions/admin/members";
import { ActiveRentalsWidget } from "@/components/admin/ActiveRentalsWidget";
import { RefreshDataButton } from "@/components/admin/RefreshDataButton";
import { CheckInWizard } from "@/components/admin/CheckInWizard";
import { TodayCheckIns } from "@/components/admin/TodayCheckIns";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
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
