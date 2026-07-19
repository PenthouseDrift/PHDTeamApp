"use client";

import { useState } from "react";
import { ShellDetailModal } from "./ShellDetailModal";
import { VoteButton } from "./VoteButton";
import type { ShellEntry } from "@/types";

interface ShellCardWrapperProps {
  entry: ShellEntry;
  authorName: string;
  userId: string;
  hasVoted: boolean;
  isWinner: boolean;
  winnerLabel: string | null;
  commentCount: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function ShellCardWrapper({
  entry,
  authorName,
  userId,
  hasVoted,
  isWinner,
  winnerLabel,
  commentCount,
}: ShellCardWrapperProps) {
  const [showModal, setShowModal] = useState(false);
  const isOwnEntry = entry.userId === userId;

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="group relative overflow-hidden rounded-xl bg-white border border-zinc-200 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      >
        {isWinner && (
          <div className="absolute top-2 left-2 z-10 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-black">
            🏆 {winnerLabel}
          </div>
        )}
        <div className="relative aspect-square overflow-hidden">
          <img
            src={entry.imageUrl}
            alt={entry.description || "Shell design"}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
        <div className="p-3 space-y-2">
          {entry.description && (
            <p className="line-clamp-2 text-xs text-zinc-600">
              {entry.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 truncate max-w-[80px]">{authorName}</span>
            <span className="text-[10px] text-zinc-400">{formatDate(entry.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <VoteButton
              shellId={entry.shellId}
              userId={userId}
              initialVoted={hasVoted}
              initialCount={entry.voteCount}
              isOwnEntry={isOwnEntry}
            />
            {/* Comment count */}
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
              </svg>
              <span>{commentCount}</span>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <ShellDetailModal
          entry={entry}
          authorName={authorName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
