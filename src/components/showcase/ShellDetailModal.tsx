"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { getComments, addComment, toggleCommentLike, type Comment } from "@/actions/comments";
import { hasUserVoted } from "@/actions/showcase";
import { VoteButton } from "./VoteButton";
import type { ShellEntry } from "@/types";

interface ShellDetailModalProps {
  entry: ShellEntry;
  authorName: string;
  userId?: string;
  hasVoted?: boolean;
  onClose: () => void;
}

export function ShellDetailModal({ entry, authorName, userId, hasVoted = false, onClose }: ShellDetailModalProps) {
  const { data: session } = useSession();
  const currentUserId = userId || session?.user?.id;
  const [voted, setVoted] = useState(hasVoted);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getComments(entry.shellId);
      setComments(data);
      setLoading(false);
    }
    load();
  }, [entry.shellId]);

  useEffect(() => {
    async function checkVote() {
      if (currentUserId) {
        const userVoted = await hasUserVoted(entry.shellId, currentUserId);
        setVoted(userVoted);
      }
    }
    checkVote();
  }, [entry.shellId, currentUserId]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !session?.user?.id) return;

    startTransition(async () => {
      const result = await addComment(entry.shellId, session.user.id, newComment);
      if (result.success) {
        setComments([...comments, result.data]);
        setNewComment("");
      }
    });
  }

  function handleLikeComment(commentId: string) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const result = await toggleCommentLike(commentId, session.user.id);
      if (result.success) {
        setComments(comments.map(c =>
          c.commentId === commentId
            ? { ...c, likes: result.data.newCount }
            : c
        ));
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
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          Comments ({comments.length})
        </h3>
        {currentUserId && (
          <div className="flex items-center gap-1 bg-zinc-100 px-2.5 py-1 rounded-full border border-zinc-200">
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
          <p className="text-sm text-zinc-400 text-center py-4">Loading...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-4">No comments yet. Be the first!</p>
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
                  <span className="text-xs font-medium text-zinc-900">{comment.userName}</span>
                  <span className="text-[10px] text-zinc-400">{formatTime(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-700 mt-0.5">{comment.text}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleLikeComment(comment.commentId)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold text-zinc-600 bg-zinc-100 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-zinc-200"
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
        <form onSubmit={handleSubmitComment} className="p-4 border-t border-zinc-200 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            maxLength={500}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        className="relative w-full max-w-5xl h-[90vh] max-h-[800px] mx-4 rounded-2xl bg-white overflow-hidden hidden md:flex"
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
        <div className="w-80 border-l border-zinc-200 flex flex-col">
          {/* Author header */}
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 truncate">{authorName}</p>
              {entry.description && (
                <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{entry.description}</p>
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
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Mobile: stacked with toggle */}
      <div
        className="relative w-full h-full md:hidden flex flex-col bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-200">
          <div>
            <p className="text-sm font-bold text-zinc-900">{authorName}</p>
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
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                showComments ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
              </svg>
              {comments.length}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {showComments ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {commentsSection}
          </div>
        ) : (
          <div className="flex-1 bg-black flex items-center justify-center">
            <img
              src={entry.imageUrl}
              alt={entry.description || "Shell"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {/* Description on image view */}
        {!showComments && entry.description && (
          <div className="p-3 border-t border-zinc-200">
            <p className="text-sm text-zinc-600">{entry.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
