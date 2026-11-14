import Link from "next/link";
import { getCheckInsByDate } from "@/actions/admin/checkins";
import { CheckInHistory } from "@/components/admin/CheckInHistory";
import { excludeAdminCheckIns } from "@/lib/checkin-stats";

export const dynamic = "force-dynamic";

export default async function CheckInHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const selectedDate = params.date || new Date().toISOString().split("T")[0];
  const checkIns = await getCheckInsByDate(selectedDate);
  // Admins are auto checked in, so the headline total leaves them out (they stay in the list).
  const attendeeCount = (await excludeAdminCheckIns(checkIns)).length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          data-page-back
          href="/admin/activity"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
        >
          ← Reports
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Check-In History</h1>
        <p className="text-sm text-zinc-500 mt-1">
          View who attended on previous days
        </p>
      </div>

      <CheckInHistory checkIns={checkIns} attendeeCount={attendeeCount} selectedDate={selectedDate} />
    </div>
  );
}
