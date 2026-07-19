import { getCheckInsByDate } from "@/actions/admin/checkins";
import { CheckInHistory } from "@/components/admin/CheckInHistory";

export const dynamic = "force-dynamic";

export default async function CheckInHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const selectedDate = params.date || new Date().toISOString().split("T")[0];
  const checkIns = await getCheckInsByDate(selectedDate);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Check-In History</h1>
        <p className="text-sm text-zinc-500 mt-1">
          View who attended on previous days
        </p>
      </div>

      <CheckInHistory checkIns={checkIns} selectedDate={selectedDate} />
    </div>
  );
}
