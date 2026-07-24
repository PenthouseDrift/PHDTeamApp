export default function DashboardLoading() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div className="space-y-2">
            <div className="h-6 w-52 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-4 w-32 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-md" />
          </div>
        </div>

        {/* Daily Check-In Banner Skeleton */}
        <div className="rounded-xl bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 h-16" />

        {/* Membership Status & QR Code Section Skeleton */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 shadow-sm">
          <div className="space-y-3">
            <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
            <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5 space-y-4">
            <div className="h-4 w-60 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
            <div className="flex justify-center pt-2">
              <div className="h-52 w-52 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </div>
        </div>

        {/* Wallet & Pass Balances Card Skeleton */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
          <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800" />
            <div className="h-28 rounded-xl bg-zinc-100 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800" />
          </div>
        </div>

        {/* Quick Links Skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col items-center justify-center gap-2" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
