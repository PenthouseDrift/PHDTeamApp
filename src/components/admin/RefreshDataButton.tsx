"use client";

import { useState, useTransition, useEffect } from "react";
import { refreshAdminPath } from "@/actions/admin/refresh";

export function RefreshDataButton({ path }: { path: string }) {
  const [isPending, startTransition] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  // Set the initial mount time as the last refreshed time
  useEffect(() => {
    setLastRefreshed(Date.now());
  }, []);

  function handleRefresh() {
    startTransition(async () => {
      await refreshAdminPath(path);
      setLastRefreshed(Date.now());
    });
  }

  return (
    <div className="flex items-center gap-3">
      {lastRefreshed && (
        <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hidden sm:inline-block">
          Last refreshed: {new Date(lastRefreshed).toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          })}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
      >
        <span className={isPending ? "animate-spin" : ""}>🔄</span>
        {isPending ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );
}
