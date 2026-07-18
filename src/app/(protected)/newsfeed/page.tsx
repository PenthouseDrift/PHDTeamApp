import { redis } from "@/lib/redis";
import { getPageFeed, type RawFacebookPost } from "@/lib/facebook";
import type { FacebookPost } from "@/types";

export const dynamic = "force-dynamic";

function transformPost(raw: RawFacebookPost): FacebookPost {
  const images: string[] = [];

  if (raw.full_picture) {
    images.push(raw.full_picture);
  }

  // Extract images from attachments
  if (raw.attachments?.data) {
    for (const attachment of raw.attachments.data) {
      if (attachment.media?.image?.src && !images.includes(attachment.media.image.src)) {
        images.push(attachment.media.image.src);
      }
      if (attachment.subattachments?.data) {
        for (const sub of attachment.subattachments.data) {
          if (sub.media?.image?.src && !images.includes(sub.media.image.src)) {
            images.push(sub.media.image.src);
          }
        }
      }
    }
  }

  // Check for unsupported content types
  const unsupportedTypes = ["video_inline", "video", "poll", "note"];
  const hasUnsupportedContent =
    raw.attachments?.data?.some((a) => unsupportedTypes.includes(a.type)) ?? false;

  return {
    id: raw.id,
    message: raw.message ?? "",
    createdTime: raw.created_time,
    images,
    hasUnsupportedContent,
  };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

async function getFeed(): Promise<{ posts: FacebookPost[]; stale: boolean }> {
  try {
    // Try cached feed first
    const cached = await redis.get("facebook:feed");
    if (cached && typeof cached === "string" && cached.startsWith("[")) {
      const raw: RawFacebookPost[] = JSON.parse(cached);
      return { posts: raw.map(transformPost), stale: false };
    }

    // Cache miss or invalid: fetch directly
    const raw = await getPageFeed(20);
    if (raw.length > 0) {
      await redis.set("facebook:feed", JSON.stringify(raw));
      await redis.set("facebook:feed:updated", Date.now().toString());
      return { posts: raw.map(transformPost), stale: false };
    }

    return { posts: [], stale: false };
  } catch {
    // If API fails, try stale cache
    try {
      const stale = await redis.get("facebook:feed");
      if (stale && typeof stale === "string" && stale.startsWith("[")) {
        const raw: RawFacebookPost[] = JSON.parse(stale);
        return { posts: raw.map(transformPost), stale: true };
      }
    } catch {
      // ignore parse errors on stale cache
    }
    return { posts: [], stale: true };
  }
}

export default async function NewsfeedPage() {
  const { posts, stale } = await getFeed();

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Newsfeed</h1>
          <p className="text-sm text-zinc-400">
            Latest updates from Penthouse Drift
          </p>
        </div>

        {/* Stale/Error Banner */}
        {(stale || posts.length === 0) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-300">
              {posts.length === 0
                ? "Feed is currently unavailable. Please check back later."
                : "Feed may not reflect latest updates."}
            </p>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-xl bg-white p-5 transition-colors hover:bg-zinc-900/80"
            >
              {/* Date */}
              <time
                dateTime={post.createdTime}
                className="text-xs font-medium text-zinc-400"
              >
                {formatDate(post.createdTime)}
              </time>

              {/* Message */}
              {post.message && (
                <div className="mt-2">
                  {post.message.length > 500 ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {post.message.slice(0, 500)}...{" "}
                      <a
                        href={`https://facebook.com/${post.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-amber-400 hover:text-amber-300"
                      >
                        Read more on Facebook
                      </a>
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {post.message}
                    </p>
                  )}
                </div>
              )}

              {/* Images */}
              {post.images.length > 0 && (
                <div
                  className={`mt-3 grid gap-2 ${
                    post.images.length === 1
                      ? "grid-cols-1"
                      : "grid-cols-2"
                  }`}
                >
                  {post.images.slice(0, 4).map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt=""
                      className="w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}

              {/* Unsupported content notice */}
              {post.hasUnsupportedContent && (
                <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-100/50 px-3 py-2">
                  <p className="text-xs text-zinc-400">
                    Additional content available on{" "}
                    <a
                      href={`https://facebook.com/${post.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-amber-400 hover:text-amber-300"
                    >
                      Facebook
                    </a>
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>

        {/* Empty state */}
        {posts.length === 0 && !stale && (
          <div className="py-12 text-center">
            <p className="text-zinc-400">No posts to display.</p>
          </div>
        )}
      </div>
    </div>
  );
}
