"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { VoteButton } from "./VoteButton";
import { addComment, getComments, toggleCommentLike, type Comment } from "@/actions/comments";
import type { ShellEntry } from "@/types";

interface ShellDetailModalProps {
  entry: ShellEntry;
  authorName: string;
  userId: string;
  hasVoted: boolean;
  onClose: () => void;
}

export function ShellDetailModal({
  entry,
  authorName,
  userId: currentUserId,
  hasVoted: initialHasVoted,
  onClose,
}: ShellDetailModalProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [voted] = useState(initialHasVoted);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let mounted = true;
    async function loadComments() {
      const data = await getComments(entry.shellId);
      if (mounted) {
        setComments(data);
        setLoading(false);
      }
    }
    loadComments();
    return () => {
      mounted = false;
    };
  }, [entry.shellId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !session?.user?.id) return;

    const text = newComment.trim();
    setNewComment("");

    startTransition(async () => {
      const res = await addComment(entry.shellId, session.user.id, text);
      if (res.success && res.data) {
        setComments((prev) => [...prev, res.data]);
      }
    });
  }

  function handleLikeComment(commentId: string) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await toggleCommentLike(commentId, session.user.id);
      if (res.success) {
        setComments((prev) =>
          prev.map((c) => (c.commentId === commentId ? { ...c, likes: res.data.newCount } : c))
        );
      }
    });
  }

  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const commentsSection = (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Comments ({comments.length})
        </h3>
        {currentUserId && (
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700">
            <VoteButton
              shellId={entry.shellId}
              userId={currentUserId}
              initialVoted={voted}
              initialCount={entry.voteCount}
              isOwnEntry={entry.userId === currentUserId}
            />
          </div>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">Loading...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">No comments yet. Be the first!</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.commentId} className="flex gap-3">
              {comment.userImage ? (
                <img src={comment.userImage} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {comment.userName[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{comment.userName}</span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatTime(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">{comment.text}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleLikeComment(comment.commentId)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors border border-zinc-200 dark:border-zinc-700"
                    title="Like comment"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A12.23 12.23 0 0 1 6 14.502c0-1.547.288-3.024.81-4.382.155-.397.55-.633.975-.633H10.5V5.25c0-.966.784-1.75 1.75-1.75.526 0 .997.232 1.317.6l2.128 2.394a4.5 4.5 0 0 1 1.137 2.946v1.31h3.125c.966 0 1.75.784 1.75 1.75 0 .285-.068.555-.188.795l-2.072 4.144a1.75 1.75 0 0 1-1.565 1.011H7.493Z" />
                    </svg>
                    <span>{comment.likes || 0} Likes</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment input */}
      {session?.user && (
        <form onSubmit={handleSubmitComment} className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            maxLength={500}
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || isPending}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            Post
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Desktop: side by side */}
      <div
        className="relative w-full max-w-5xl h-[90vh] max-h-[800px] mx-4 rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden hidden md:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="flex-1 bg-black flex items-center justify-center">
          <img
            src={entry.imageUrl}
            alt={entry.description || "Shell"}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Comments sidebar */}
        <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-900">
          {/* Author header */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{authorName}</p>
              {entry.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{entry.description}</p>
              )}
            </div>
            {currentUserId && (
              <div className="flex-shrink-0 ml-2">
                <VoteButton
                  shellId={entry.shellId}
                  userId={currentUserId}
                  initialVoted={voted}
                  initialCount={entry.voteCount}
                  isOwnEntry={entry.userId === currentUserId}
                />
              </div>
            )}
          </div>
          {commentsSection}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-800/90 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Mobile: stacked with toggle */}
      <div
        className="relative w-full h-full md:hidden flex flex-col bg-white dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{authorName}</p>
          </div>
          <div className="flex items-center gap-3">
            {currentUserId && (
              <VoteButton
                shellId={entry.shellId}
                userId={currentUserId}
                initialVoted={voted}
                initialCount={entry.voteCount}
                isOwnEntry={entry.userId === currentUserId}
              />
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="aspect-square bg-black flex items-center justify-center">
            <img
              src={entry.imageUrl}
              alt={entry.description || "Shell"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          {entry.description && (
            <p className="p-3 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">{entry.description}</p>
          )}
          {commentsSection}
        </div>
      </div>
    </div>
  );
}
