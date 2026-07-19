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

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Showcase Winners</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Week {week}, {year} — Select a weekly winner from submitted shells
        </p>
      </div>

      {/* Past winners */}
      {pastWinners.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Past Winners</h2>
          <div className="space-y-2">
            {pastWinners.map((winner) => (
              <div
                key={winner.shellId}
                className="flex items-center justify-between rounded-lg bg-white px-4 py-3"
              >
                <span className="text-sm text-zinc-600 truncate">
                  {winner.shellId}
                </span>
                <span className="text-xs text-amber-400">
                  🏆 Week {winner.week}, {winner.year}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All entries */}
      <h2 className="text-lg font-semibold text-zinc-900 mb-3">All Entries</h2>
      {entries.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No shell entries to display.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isCurrentWinner = currentWinnerId === entry.shellId;
            return (
              <div
                key={entry.shellId}
                className={`flex items-center gap-4 rounded-lg p-4 ${
                  isCurrentWinner
                    ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                    : "bg-white"
                }`}
              >
                <img
                  src={entry.imageUrl}
                  alt={entry.description || "Shell"}
                  className="h-16 w-16 rounded-md object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {entry.description || "Untitled shell"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    by {authorNames.get(entry.userId) || "Unknown"} •{" "}
                    {formatDate(entry.createdAt)} • {entry.voteCount} vote
                    {entry.voteCount !== 1 ? "s" : ""}
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
  );
}
