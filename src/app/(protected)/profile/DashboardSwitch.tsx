"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDashboardPreference } from "@/actions/profile";

/**
 * Profile setting: the new app experience (/dashboard2) is the default; this
 * lets a member switch back to the classic app. Persisted per member (not per
 * device) via setDashboardPreference; while on, /dashboard sends the member to
 * the new dashboard.
 */
export function DashboardSwitch({ initialVersion }: { initialVersion: "classic" | "new" }) {
  const router = useRouter();
  const [version, setVersion] = useState(initialVersion);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isNew = version === "new";

  function toggle() {
    const next = isNew ? "classic" : "new";
    setError(null);
    startTransition(async () => {
      const res = await setDashboardPreference(next);
      if (res.success) {
        setVersion(res.data);
        // Land on the dashboard they just chose so the change is obvious.
        router.push(res.data === "new" ? "/dashboard2" : "/dashboard");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New app experience</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        The redesigned app: simpler navigation, one-tap check-in, and your membership and passes in
        one place. Your garage, marketplace and everything else are still here. Prefer the old
        layout? Turn this off to switch back to the classic app at any time.
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={isNew}
        onClick={toggle}
        disabled={isPending}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
      >
        <span>
          <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Use the new app experience
          </span>
          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
            {isNew ? "On — you're using the new layout and navigation" : "Off — you're using the classic app"}
          </span>
        </span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            isNew ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              isNew ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>

      {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
