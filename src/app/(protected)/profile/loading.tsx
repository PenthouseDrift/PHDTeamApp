export default function ProfileLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-4 w-60 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
        </div>

        {/* Profile Card Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="h-4 w-32 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="h-12 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
            <div className="h-12 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
            <div className="h-12 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
