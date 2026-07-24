export default function TuningAdvisorLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-4 w-72 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
        </div>

        {/* Step 1: Car & Calibration Selector Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <div className="h-5 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-11 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
            <div className="h-11 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          </div>
        </div>

        {/* Step 2: Track Surface Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60" />
            ))}
          </div>
        </div>

        {/* Step 3: Goals Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
