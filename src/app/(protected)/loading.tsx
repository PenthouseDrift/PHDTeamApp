export default function ProtectedLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-4 w-72 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
        </div>
        <div className="h-10 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
      </div>

      {/* Main Content Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-sm"
          >
            <div className="h-40 w-full bg-zinc-200/70 dark:bg-zinc-800/70 rounded-xl" />
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
              <div className="h-4 w-1/2 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
            </div>
            <div className="flex justify-between items-center pt-2">
              <div className="h-4 w-20 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-md" />
              <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
