"use client";

import { useState, useTransition } from "react";
import { togglePostLike, addFeedComment, getFeedComments, type FeedPost, type FeedComment } from "@/actions/feed";

interface FeedViewProps {
  posts: FeedPost[];
  userId: string;
  likedMap: Record<string, boolean>;
}

export function FeedView({ posts, userId, likedMap }: FeedViewProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">No posts yet. Be the first to share!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.postId} post={post} userId={userId} initialLiked={likedMap[post.postId] || false} />
      ))}
    </div>
  );
}

function PostCard({ post, userId, initialLiked }: { post: FeedPost; userId: string; initialLiked: boolean }) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleLike() {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(newLiked ? likeCount + 1 : Math.max(0, likeCount - 1));

    startTransition(async () => {
      const result = await togglePostLike(post.postId, userId);
      if (result.success) {
        setLiked(result.data.liked);
        setLikeCount(result.data.newCount);
      } else {
        setLiked(!newLiked);
        setLikeCount(likeCount);
      }
    });
  }

  async function handleShowComments() {
    setShowComments(!showComments);
    if (!commentsLoaded) {
      const data = await getFeedComments(post.postId);
      setComments(data);
      setCommentsLoaded(true);
    }
  }

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    startTransition(async () => {
      const result = await addFeedComment(post.postId, userId, newComment);
      if (result.success) {
        setComments([...comments, result.data]);
        setNewComment("");
      }
    });
  }

  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return (
    <article className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        {post.userImage ? (
          <img src={post.userImage} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs">
            {post.userName[0]}
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{post.userName}</p>
          <p className="text-xs text-zinc-500">{formatTime(post.createdAt)}</p>
        </div>
      </div>

      {/* Content */}
      {post.text && (
        <p className="px-4 pb-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{post.text}</p>
      )}

      {/* Images */}
      {post.images.length > 0 && (
        <div className={`grid gap-0.5 ${post.images.length === 1 ? "" : "grid-cols-2"}`}>
          {post.images.map((img, i) => (
            <img key={i} src={img} alt="" className="w-full aspect-square object-cover" />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-6 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <button
          onClick={handleLike}
          disabled={post.userId === userId}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            liked ? "text-blue-600" : "text-zinc-500 hover:text-blue-500"
          } ${post.userId === userId ? "opacity-50 cursor-default" : ""}`}
        >
          <svg className="w-5 h-5" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={liked ? 0 : 1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.723-9.97a9.296 9.296 0 0 0 3.622-2.867M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
          </svg>
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>

        <button
          onClick={handleShowComments}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
          </svg>
          {post.commentCount > 0 && <span>{post.commentCount}</span>}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-3">
          {comments.map((c) => (
            <div key={c.commentId} className="flex gap-2">
              {c.userImage ? (
                <img src={c.userImage} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {c.userName[0]}
                </div>
              )}
              <div>
                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{c.userName}</span>
                <span className="text-[10px] text-zinc-400 ml-2">{formatTime(c.createdAt)}</span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.text}</p>
              </div>
            </div>
          ))}
          <form onSubmit={handleAddComment} className="flex gap-2 pt-1">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={!newComment.trim() || isPending}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
