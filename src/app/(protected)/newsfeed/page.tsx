import { auth } from "@/lib/auth";
import { getFeedPosts, hasUserLikedPost } from "@/actions/feed";
import { getUpcomingEvents } from "@/actions/events";
import { FeedView } from "./FeedView";
import { EventsCarousel } from "./EventsCarousel";
import { CreatePostForm } from "./CreatePostForm";

export const dynamic = "force-dynamic";

export default async function NewsfeedPage() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;

  // Fetch posts and events in parallel
  const [posts, events] = await Promise.all([
    getFeedPosts(),
    getUpcomingEvents(),
  ]);

  // Check likes in parallel
  const likedEntries = await Promise.all(
    posts.map(async (post) => {
      const liked = await hasUserLikedPost(post.postId, userId);
      return [post.postId, liked] as [string, boolean];
    })
  );
  const likedMap = new Map(likedEntries);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Newsfeed</h1>

        {/* Events carousel */}
        {events.length > 0 && <EventsCarousel events={events} />}

        {/* Create post */}
        <CreatePostForm userId={userId} userImage={session.user.image} userName={session.user.name} />

        {/* Feed posts */}
        <FeedView posts={posts} userId={userId} likedMap={Object.fromEntries(likedMap)} />
      </div>
    </div>
  );
}
