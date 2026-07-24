export default function ShowcaseLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-4 w-64 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
          </div>
          <div className="h-10 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
        </div>

        {/* Tabs Skeleton */}
        <div className="h-10 w-full bg-zinc-200/70 dark:bg-zinc-900 rounded-lg" />

        {/* Grid Skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
              <div className="aspect-square w-full bg-zinc-200/80 dark:bg-zinc-800/80 rounded-lg" />
              <div className="space-y-1.5">
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-3 w-1/2 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="h-6 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                <div className="h-6 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
