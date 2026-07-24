export default function NotificationsLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-8 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>

        {/* Notifications List Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-3 w-24 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
