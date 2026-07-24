export default function WalletLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-4 w-64 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
        </div>

        {/* Pass Balance Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-40 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-3" />
          <div className="h-40 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-3" />
        </div>

        {/* QR Code Pass Selector Skeleton */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="flex justify-center pt-2">
            <div className="h-56 w-56 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
