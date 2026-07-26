import Link from "next/link";
import { redirect } from "next/navigation";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
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

function getStartOfCurrentWeekTimestamp(): number {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff); // Roll back to Monday
  d.setHours(0, 0, 0, 0); // Start of Monday (00:00:00)
  return d.getTime();
}

function isSubmittedThisWeek(timestamp: number): boolean {
  return timestamp >= getStartOfCurrentWeekTimestamp();
}

export default async function AdminShowcaseWinnersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin/members");
  }
  const entries = await getShowcaseEntries();
  const { year, week } = await getCurrentWeek();
  const currentWinnerKey = `shells:winner:${year}:${week}`;
  const currentWinnerId = await redis.get(currentWinnerKey);
  const pastWinners = await getWeeklyWinners();

  // Map past winners by shell ID
  const pastWinnerMap = new Map<string, { week: number; year: number; selectedByName?: string }>();
  for (const w of pastWinners) {
    pastWinnerMap.set(w.shellId, { week: w.week, year: w.year, selectedByName: w.selectedByName });
  }

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
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-amber-500 transition-colors mb-1"
        >
          ← Back to Admin Dashboard
        </Link>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastWinners.map((winner) => (
              <div
                key={`${winner.shellId}-${winner.week}`}
                className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 p-3.5 shadow-sm hover:shadow-md transition-shadow"
              >
                {winner.imageUrl ? (
                  <img
                    src={winner.imageUrl}
                    alt={winner.description || "Winner shell"}
                    className="h-16 w-16 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-700/80 shadow-xs"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                    🏆
                  </div>
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full space-y-1">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {winner.userName || "PHD Member"}
                      </p>
                      <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md shrink-0">
                        W{winner.week}, {winner.year}
                      </span>
                    </div>
                    {winner.description && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {winner.description}
                      </p>
                    )}
                  </div>
                  {winner.selectedByName && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Selected by {winner.selectedByName}
                    </span>
                  )}
                </div>
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
                const pastWinnerInfo = pastWinnerMap.get(entry.shellId);

                return (
                  <div
                    key={entry.shellId}
                    className={`flex items-center gap-4 rounded-xl p-4 border transition-all ${
                      isCurrentWinner
                        ? "bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30"
                        : pastWinnerInfo
                        ? "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 dark:border-amber-800/40"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.description || "Shell"}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {entry.description || "Untitled shell"}
                        </p>
                        {pastWinnerInfo && (
                          <span className="rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 uppercase tracking-wider">
                            🏆 Winner Week {pastWinnerInfo.week}, {pastWinnerInfo.year}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        by {authorNames.get(entry.userId) || "Unknown"} •{" "}
                        {formatDate(entry.createdAt)} • <span className="font-semibold text-amber-600 dark:text-amber-500">{entry.voteCount} votes</span>
                      </p>
                    </div>
                    {pastWinnerInfo ? (
                      <span className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        🏆 Past Winner (W{pastWinnerInfo.week})
                      </span>
                    ) : (
                      <SelectWinnerButton
                        shellId={entry.shellId}
                        isCurrentWinner={isCurrentWinner}
                      />
                    )}
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
                const pastWinnerInfo = pastWinnerMap.get(entry.shellId);

                return (
                  <div
                    key={entry.shellId}
                    className={`flex items-center gap-4 rounded-xl p-4 border transition-all ${
                      isCurrentWinner
                        ? "bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30"
                        : pastWinnerInfo
                        ? "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 dark:border-amber-800/40"
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.description || "Shell"}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {entry.description || "Untitled shell"}
                        </p>
                        {pastWinnerInfo && (
                          <span className="rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 uppercase tracking-wider">
                            🏆 Winner Week {pastWinnerInfo.week}, {pastWinnerInfo.year}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        by {authorNames.get(entry.userId) || "Unknown"} •{" "}
                        {formatDate(entry.createdAt)} • <span className="font-semibold text-amber-600 dark:text-amber-500">{entry.voteCount} votes</span>
                      </p>
                    </div>
                    {pastWinnerInfo ? (
                      <span className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        🏆 Past Winner (W{pastWinnerInfo.week})
                      </span>
                    ) : (
                      <span className="rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                        Past Entry
                      </span>
                    )}
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
