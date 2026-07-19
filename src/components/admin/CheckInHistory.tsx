"use client";

import { useRouter } from "next/navigation";
import type { CheckInEntry } from "@/actions/admin/checkins";

interface CheckInHistoryProps {
  checkIns: CheckInEntry[];
  selectedDate: string;
}

export function CheckInHistory({ checkIns, selectedDate }: CheckInHistoryProps) {
  const router = useRouter();

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    router.push(`/admin/history?date=${e.target.value}`);
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div>
        <label htmlFor="date-picker" className="block text-sm font-medium text-zinc-700 mb-1">
          Select Date
        </label>
        <input
          id="date-picker"
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          max={new Date().toISOString().split("T")[0]}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* Results */}
      <div className="rounded-xl bg-white border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h2>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
            {checkIns.length} {checkIns.length === 1 ? "person" : "people"}
          </span>
        </div>

        {checkIns.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">No check-ins recorded for this date.</p>
        ) : (
          <div className="space-y-2">
            {checkIns.map((entry, i) => (
              <div
                key={`${entry.userId}-${i}`}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3"
              >
                <span className="text-sm font-medium text-zinc-900">{entry.memberName}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="capitalize rounded bg-zinc-200 px-1.5 py-0.5">{entry.method}</span>
                  <span>{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
