"use client";

import { useTransition, useState } from "react";
import { toggleVote } from "@/actions/showcase";

interface VoteButtonProps {
  shellId: string;
  userId: string;
  initialVoted: boolean;
  initialCount: number;
  isOwnEntry: boolean;
}

export function VoteButton({
  shellId,
  userId,
  initialVoted,
  initialCount,
  isOwnEntry,
}: VoteButtonProps) {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  if (isOwnEntry) {
    return (
      <div className="flex items-center gap-1 text-xs text-zinc-500">
        <svg
          className="h-3.5 w-3.5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span>{count}</span>
      </div>
    );
  }

  function handleVote() {
    // Optimistic update
    const newVoted = !voted;
    const newCount = newVoted ? count + 1 : Math.max(0, count - 1);
    setVoted(newVoted);
    setCount(newCount);

    startTransition(async () => {
      const result = await toggleVote(shellId, userId);
      if (result.success) {
        setVoted(result.data.voted);
        setCount(result.data.newCount);
      } else {
        // Revert optimistic update on failure
        setVoted(!newVoted);
        setCount(count);
      }
    });
  }

  return (
    <button
      onClick={handleVote}
      disabled={isPending}
      className="flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
      aria-label={voted ? "Remove vote" : "Vote for this shell"}
    >
      <svg
        className={`h-3.5 w-3.5 transition-colors ${
          voted ? "text-amber-400" : "text-zinc-500 hover:text-amber-300"
        }`}
        fill={voted ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={voted ? 0 : 2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <span className={voted ? "text-amber-400" : "text-zinc-500"}>
        {count}
      </span>
    </button>
  );
}
