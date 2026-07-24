export default function CarDetailLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back Link Skeleton */}
        <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-md" />

        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-9 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-9 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          </div>
        </div>

        {/* Photo Gallery Skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80" />
            ))}
          </div>
        </div>

        {/* Calibration Setups Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
            <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4" />
          ))}
        </div>
      </div>
    </div>
  );
}
