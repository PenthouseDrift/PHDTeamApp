export default function CarsLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-10 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>

        {/* Car Cards Grid Skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="aspect-video w-full bg-zinc-200/80 dark:bg-zinc-800/80" />
              <div className="p-4 space-y-2">
                <div className="h-5 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-4 w-1/3 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
