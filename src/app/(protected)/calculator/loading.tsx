export default function CalculatorLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-4 w-72 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
        </div>

        {/* Input Card Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-14 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
            <div className="h-14 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
          </div>
          <div className="h-24 bg-amber-500/10 border border-amber-500/30 rounded-xl" />
        </div>

        {/* Ratio Table Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
