export default function NewsfeedLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header Skeleton */}
        <div className="h-7 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />

        {/* Events Carousel Skeleton */}
        <div className="h-36 w-full rounded-2xl bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />

        {/* Create Post Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <div className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
          </div>
        </div>

        {/* Post Items Skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-3 w-20 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-zinc-200/70 dark:bg-zinc-800/70 rounded-md" />
              <div className="h-4 w-4/5 bg-zinc-200/70 dark:bg-zinc-800/70 rounded-md" />
            </div>
            <div className="h-48 w-full rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
            <div className="flex gap-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
              <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
