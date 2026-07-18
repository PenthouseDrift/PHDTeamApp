"use client";

import { useTransition, useState } from "react";
import { selectWeeklyWinner } from "@/actions/admin/showcase";

interface SelectWinnerButtonProps {
  shellId: string;
  isCurrentWinner: boolean;
}

export function SelectWinnerButton({ shellId, isCurrentWinner }: SelectWinnerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(isCurrentWinner);
  const [error, setError] = useState<string | null>(null);

  function handleSelect() {
    setError(null);
    startTransition(async () => {
      const result = await selectWeeklyWinner(shellId);
      if (result.success) {
        setSelected(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (selected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-400">
        🏆 Current Winner
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={handleSelect}
        disabled={isPending}
        className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {isPending ? "Selecting..." : "Select as Winner"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
