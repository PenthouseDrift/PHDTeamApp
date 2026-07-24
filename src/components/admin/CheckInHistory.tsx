"use client";

import { useRouter } from "next/navigation";
import type { CheckInEntry } from "@/actions/admin/checkins";

interface CheckInHistoryProps {
  checkIns: CheckInEntry[];
  selectedDate: string;
}

export function CheckInHistory({ checkIns, selectedDate }: CheckInHistoryProps) {
  const router = useRouter();
  const todayStr = new Date().toISOString().split("T")[0];
  const isToday = selectedDate === todayStr;

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) {
      router.push(`/admin/history?date=${e.target.value}`);
    }
  }

  function navigateDate(daysOffset: number) {
    const current = new Date(selectedDate + "T00:00:00");
    current.setDate(current.getDate() + daysOffset);
    const newDateStr = current.toISOString().split("T")[0];
    router.push(`/admin/history?date=${newDateStr}`);
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const formattedDateTitle = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Date Navigation Bar with Back / Forth Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {/* Previous Day Button */}
          <button
            type="button"
            onClick={() => navigateDate(-1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3.5 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            ← Previous Day
          </button>

          {/* Today Jump Button */}
          {!isToday && (
            <button
              type="button"
              onClick={() => router.push(`/admin/history?date=${todayStr}`)}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-xs font-extrabold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              Today
            </button>
          )}

          {/* Next Day Button */}
          <button
            type="button"
            disabled={isToday}
            onClick={() => navigateDate(1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3.5 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next Day →
          </button>
        </div>

        {/* Date Input Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="date-picker" className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Pick Date:
          </label>
          <input
            id="date-picker"
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            max={todayStr}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
          />
        </div>
      </div>

      {/* Check-In Results List */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {formattedDateTitle}
            </h2>
            {isToday && (
              <span className="inline-block mt-0.5 text-[10px] font-black text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Live Today
              </span>
            )}
          </div>
          <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-extrabold text-amber-600 dark:text-amber-400">
            {checkIns.length} {checkIns.length === 1 ? "Check-In" : "Check-Ins"}
          </span>
        </div>

        {checkIns.length === 0 ? (
          <div className="py-8 text-center space-y-1">
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No check-ins recorded for this date.</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Use the date navigation controls above to view other days.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {checkIns.map((entry, i) => (
              <div
                key={`${entry.userId}-${i}`}
                className="flex items-center justify-between rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                    {entry.memberName ? entry.memberName[0].toUpperCase() : "M"}
                  </div>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.memberName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="capitalize rounded-md bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                    {entry.method}
                  </span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">{formatTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
