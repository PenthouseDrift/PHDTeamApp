"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { getComments, addComment, toggleCommentLike, type Comment } from "@/actions/comments";
import type { ShellEntry } from "@/types";

interface ShellDetailModalProps {
  entry: ShellEntry;
  authorName: string;
  onClose: () => void;
}

export function ShellDetailModal({ entry, authorName, onClose }: ShellDetailModalProps) {
  const { data: session } = useSession();
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
      <div className="p-4 border-b border-zinc-200">
        <h3 className="text-sm font-semibold text-zinc-900">
          Comments ({comments.length})
        </h3>
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
                <button
                  onClick={() => handleLikeComment(comment.commentId)}
                  className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 hover:text-blue-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.723-9.97a9.296 9.296 0 0 0 3.622-2.867" />
                  </svg>
                  {comment.likes > 0 && <span>{comment.likes}</span>}
                </button>
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
          <div className="p-4 border-b border-zinc-200">
            <p className="text-sm font-medium text-zinc-900">{authorName}</p>
            {entry.description && (
              <p className="text-sm text-zinc-600 mt-1">{entry.description}</p>
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
            <p className="text-sm font-medium text-zinc-900">{authorName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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
