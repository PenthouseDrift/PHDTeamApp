import { redis } from "@/lib/redis";
import { getShowcaseEntries } from "@/actions/showcase";
import { getCurrentWeek, getWeeklyWinners } from "@/actions/admin/showcase";
import { SelectWinnerButton } from "@/components/admin/SelectWinnerButton";

export const dynamic = "force-dynamic";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isSubmittedThisWeek(timestamp: number): boolean {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= SEVEN_DAYS_MS;
}

export default async function AdminShowcaseWinnersPage() {
  const entries = await getShowcaseEntries();
  const { year, week } = await getCurrentWeek();
  const currentWinnerKey = `shells:winner:${year}:${week}`;
  const currentWinnerId = await redis.get(currentWinnerKey);
  const pastWinners = await getWeeklyWinners();

  // Get author names
  const authorNames = new Map<string, string>();
  const uniqueUserIds = [...new Set(entries.map((e) => e.userId))];
  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const member = await redis.hgetall(`member:${userId}`);
      if (member && member.name) {
        authorNames.set(userId, member.name as string);
      }
    })
  );

  const thisWeekEntries = entries.filter((e) => isSubmittedThisWeek(e.createdAt));
  const earlierEntries = entries.filter((e) => !isSubmittedThisWeek(e.createdAt));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Showcase Winners</h1>
          <span className="rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-extrabold px-3 py-1 uppercase tracking-wider">
            Week {week}, {year}
          </span>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Select a weekly community winner from submitted body shells.
        </p>
      </div>

      {/* Past winners */}
      {pastWinners.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>🏆</span> Crowned Past Winners
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pastWinners.map((winner) => (
              <div
                key={winner.shellId}
                className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 shadow-sm"
              >
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate max-w-[140px]">
                  {winner.shellId}
                </span>
                <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-md">
                  Week {winner.week}, {winner.year}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categorized Entries */}
      <section className="space-y-6">
        {/* Category 1: This Week's Submissions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
            <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>🔥</span> This Week&apos;s Submissions
            </h2>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
              {thisWeekEntries.length} {thisWeekEntries.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {thisWeekEntries.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">No submissions uploaded this week yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {thisWeekEntries.map((entry) => {
                const isCurrentWinner = currentWinnerId === entry.shellId;
                return (
                  <div
                    key={entry.shellId}
                    className={`flex items-center gap-4 rounded-xl p-4 border transition-all ${
                      isCurrentWinner
                        ? "bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.description || "Shell"}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {entry.description || "Untitled shell"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        by {authorNames.get(entry.userId) || "Unknown"} •{" "}
                        {formatDate(entry.createdAt)} • <span className="font-semibold text-amber-600 dark:text-amber-500">{entry.voteCount} votes</span>
                      </p>
                    </div>
                    <SelectWinnerButton
                      shellId={entry.shellId}
                      isCurrentWinner={isCurrentWinner}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category 2: Earlier Showcase Submissions */}
        {earlierEntries.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>📦</span> Earlier Showcase Submissions
              </h2>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
                {earlierEntries.length} {earlierEntries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            <div className="space-y-3">
              {earlierEntries.map((entry) => {
                const isCurrentWinner = currentWinnerId === entry.shellId;
                return (
                  <div
                    key={entry.shellId}
                    className={`flex items-center gap-4 rounded-xl p-4 border transition-all ${
                      isCurrentWinner
                        ? "bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.description || "Shell"}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {entry.description || "Untitled shell"}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        by {authorNames.get(entry.userId) || "Unknown"} •{" "}
                        {formatDate(entry.createdAt)} • <span className="font-semibold text-amber-600 dark:text-amber-500">{entry.voteCount} votes</span>
                      </p>
                    </div>
                    <SelectWinnerButton
                      shellId={entry.shellId}
                      isCurrentWinner={isCurrentWinner}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
