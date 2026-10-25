"use client";

import { useState, useTransition } from "react";
import { setAutoCheckInPreferences } from "@/actions/profile";
import type { AutoCheckInPref } from "@/lib/auto-checkin-prefs";

/**
 * Profile setting: check me in automatically when I buy a day pass / rental
 * hour. The two switches are independent and each saves on its own.
 */
export function AutoCheckInSettings({ initialDayPass, initialRental }: { initialDayPass: AutoCheckInPref; initialRental: AutoCheckInPref }) {
  const [values, setValues] = useState<{ dayPass: AutoCheckInPref; rental: AutoCheckInPref }>({
    dayPass: initialDayPass,
    rental: initialRental,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"dayPass" | "rental" | null>(null);
  const [, startTransition] = useTransition();

  function toggle(key: "dayPass" | "rental") {
    const next = values[key] !== true;
    setError(null);
    setBusy(key);
    startTransition(async () => {
      const res = await setAutoCheckInPreferences({ [key]: next });
      if (res.success) setValues((v) => ({ ...v, [key]: next }));
      else setError(res.error);
      setBusy(null);
    });
  }

  const rows = [
    { key: "dayPass" as const, title: "Day passes", hint: "Check me in when I buy a day pass" },
    { key: "rental" as const, title: "Rental hours", hint: "Check me in when I buy a rental hour" },
  ];

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Auto check-in</h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        When a track event is open and you buy a pass, we can check you in straight away. Otherwise your pass waits in your wallet.
      </p>
      <div className="space-y-2">
        {rows.map((row) => {
          const on = values[row.key] === true;
          const unset = values[row.key] === null;
          return (
            <button
              key={row.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(row.key)}
              disabled={busy !== null}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
            >
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                  {unset ? "Not set yet · " : ""}
                  {row.hint}
                </span>
              </span>
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  on ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
