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
      <div className="flex items-center gap-1 text-xs text-zinc-400">
        <ThumbsUpIcon filled={false} className="h-4 w-4" />
        <span>{count}</span>
      </div>
    );
  }

  function handleVote() {
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
        setVoted(!newVoted);
        setCount(count);
      }
    });
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleVote(); }}
      disabled={isPending}
      className="flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
      aria-label={voted ? "Remove vote" : "Vote for this shell"}
    >
      <ThumbsUpIcon filled={voted} className={`h-4 w-4 transition-colors ${voted ? "text-blue-500" : "text-zinc-400 hover:text-blue-400"}`} />
      <span className={voted ? "text-blue-600 font-medium" : "text-zinc-500"}>
        {count}
      </span>
    </button>
  );
}

function ThumbsUpIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.723-9.97a9.296 9.296 0 0 0 3.622-2.867M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
    </svg>
  );
}
