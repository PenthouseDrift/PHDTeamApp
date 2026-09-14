"use client";

import { useState } from "react";
import { formatGBP } from "@/lib/activity-pricing";
import type { MonthlyRevenue, Attendance } from "@/actions/admin/activity";

function AttendanceBadges({ attendance }: { attendance: Attendance }) {
  if (attendance.onTrack === 0 && attendance.rentals === 0) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 align-middle">
      {attendance.onTrack > 0 && (
        <span
          title="People on track (day passes + members)"
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold px-1.5 py-0.5"
        >
          👥 {attendance.onTrack}
        </span>
      )}
      {attendance.rentals > 0 && (
        <span
          title="Car rentals"
          className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 text-[10px] font-bold px-1.5 py-0.5"
        >
          🏎️ {attendance.rentals}
        </span>
      )}
    </span>
  );
}

// Current month key in YYYY-MM (UTC), matching how the revenue action buckets.
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function RevenueTableClient({ months }: { months: MonthlyRevenue[] }) {
  // Open the current month by default (only if it has revenue and is present).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([currentMonthKey()]));

  function toggle(month: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  if (months.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          No revenue recorded yet
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Online purchases and in-person cash check-ins will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800 text-left">
            <tr>
              <th className="px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400">
                Month
              </th>
              <th className="px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right">
                Online
              </th>
              <th className="px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right">
                Cash
              </th>
              <th className="px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right">
                Total
              </th>
              <th className="hidden sm:table-cell px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right">
                Entries
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {months.map((m) => {
              const isOpen = expanded.has(m.month);
              return (
                <MonthRows key={m.month} month={m} isOpen={isOpen} onToggle={() => toggle(m.month)} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthRows({
  month: m,
  isOpen,
  onToggle,
}: {
  month: MonthlyRevenue;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
        aria-expanded={isOpen}
      >
        <td className="px-4 sm:px-6 py-4 font-bold text-zinc-900 dark:text-zinc-100">
          <span className="inline-flex items-center gap-2">
            <span
              className={`text-zinc-400 transition-transform duration-200 ${
                isOpen ? "rotate-90" : ""
              }`}
              aria-hidden
            >
              ▶
            </span>
            {m.label}
          </span>
          <AttendanceBadges attendance={m.attendance} />
        </td>
        <td className="px-4 sm:px-6 py-4 text-right font-medium text-indigo-600 dark:text-indigo-400">
          {formatGBP(m.breakdown.online)}
        </td>
        <td className="px-4 sm:px-6 py-4 text-right font-medium text-amber-600 dark:text-amber-400">
          {formatGBP(m.breakdown.door)}
        </td>
        <td className="px-4 sm:px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-base">
          {formatGBP(m.breakdown.total)}
        </td>
        <td className="hidden sm:table-cell px-4 sm:px-6 py-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {m.count}
        </td>
      </tr>

      {isOpen &&
        m.days.map((d) => (
          <tr key={d.day} className="bg-zinc-50/60 dark:bg-zinc-950/30 text-xs">
            <td className="px-4 sm:px-6 py-2.5 pl-10 sm:pl-14 text-zinc-600 dark:text-zinc-400 font-medium">
              {d.label}
              <AttendanceBadges attendance={d.attendance} />
            </td>
            <td className="px-4 sm:px-6 py-2.5 text-right text-indigo-600/90 dark:text-indigo-400/90">
              {formatGBP(d.breakdown.online)}
            </td>
            <td className="px-4 sm:px-6 py-2.5 text-right text-amber-600/90 dark:text-amber-400/90">
              {formatGBP(d.breakdown.door)}
            </td>
            <td className="px-4 sm:px-6 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
              {formatGBP(d.breakdown.total)}
            </td>
            <td className="hidden sm:table-cell px-4 sm:px-6 py-2.5 text-right text-zinc-400 dark:text-zinc-500">
              {d.count}
            </td>
          </tr>
        ))}
    </>
  );
}
