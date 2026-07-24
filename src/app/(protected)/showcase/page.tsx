import Link from "next/link";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { getShowcaseEntries, getLeaderboard, hasUserVoted } from "@/actions/showcase";
import { getWeeklyWinners } from "@/actions/admin/showcase";
import { getCommentCount } from "@/actions/comments";
import { ShellCardWrapper } from "@/components/showcase/ShellCardWrapper";
import type { ShellEntry } from "@/types";

export const dynamic = "force-dynamic";

interface ShowcasePageProps {
  searchParams: Promise<{ view?: string }>;
}

async function getAuthorName(userId: string): Promise<string> {
  const member = await redis.hgetall(`member:${userId}`);
  if (member && member.name) {
    return member.name as string;
  }
  return "Unknown";
}

function isSubmittedThisWeek(timestamp: number): boolean {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= SEVEN_DAYS_MS;
}

export default async function ShowcasePage({ searchParams }: ShowcasePageProps) {
  const params = await searchParams;
  const view = params.view === "leaderboard" ? "leaderboard" : "gallery";

  const session = await auth();
  const userId = session?.user?.id ?? "";

  const entries: ShellEntry[] =
    view === "leaderboard"
      ? await getLeaderboard()
      : await getShowcaseEntries();

  // Fetch all supplementary data in parallel
  const uniqueUserIds = [...new Set(entries.map((e) => e.userId))];

  const [authorNamesArr, votesArr, winners, commentCountsArr] = await Promise.all([
    // Author names
    Promise.all(uniqueUserIds.map(async (uid) => {
      const name = await getAuthorName(uid);
      return [uid, name] as [string, string];
    })),
    // Votes
    userId
      ? Promise.all(entries.map(async (entry) => {
          const voted = await hasUserVoted(entry.shellId, userId);
          return [entry.shellId, voted] as [string, boolean];
        }))
      : Promise.resolve([] as [string, boolean][]),
    // Winners
    getWeeklyWinners(50),
    // Comment counts
    Promise.all(entries.map(async (entry) => {
      const count = await getCommentCount(entry.shellId);
      return [entry.shellId, count] as [string, number];
    })),
  ]);

  const authorNames = new Map(authorNamesArr);
  const votedMap = new Map(votesArr);
  const winnerMap = new Map<string, string>();
  for (const w of winners) {
    winnerMap.set(w.shellId, `Week ${w.week}, ${w.year}`);
  }
  const commentCountMap = new Map(commentCountsArr);

  // Categorize entries: This Week vs Earlier
  const thisWeekEntries = entries.filter((e) => isSubmittedThisWeek(e.createdAt));
  const earlierEntries = entries.filter((e) => !isSubmittedThisWeek(e.createdAt));

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Shell Showcase</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Check out custom shell designs from the community
            </p>
          </div>
          <Link
            href="/showcase/submit"
            className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
          >
            Submit Your Shell
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1">
          <Link
            href="/showcase?view=gallery"
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
              view === "gallery"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-bold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            Gallery
          </Link>
          <Link
            href="/showcase?view=leaderboard"
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
              view === "leaderboard"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-bold"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            Leaderboard 🏆
          </Link>
        </div>

        {/* Grid Display Categorized */}
        {entries.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center">
            <p className="text-zinc-500 dark:text-zinc-400">
              No shells submitted yet. Be the first!
            </p>
            <Link
              href="/showcase/submit"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
            >
              Submit a shell →
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Section 1: This Week's Entries */}
            {thisWeekEntries.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>🔥</span> This Week&apos;s Submissions
                  </h2>
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-0.5">
                    {thisWeekEntries.length} {thisWeekEntries.length === 1 ? "entry" : "entries"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {thisWeekEntries.map((entry) => (
                    <ShellCardWrapper
                      key={entry.shellId}
                      entry={entry}
                      authorName={authorNames.get(entry.userId) || "Unknown"}
                      userId={userId}
                      hasVoted={votedMap.get(entry.shellId) || false}
                      isWinner={winnerMap.has(entry.shellId)}
                      winnerLabel={winnerMap.get(entry.shellId) || null}
                      commentCount={commentCountMap.get(entry.shellId) || 0}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 2: Earlier Showcase Submissions */}
            {earlierEntries.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>📦</span> Earlier Showcase Submissions
                  </h2>
                  <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-medium px-2.5 py-0.5">
                    {earlierEntries.length} {earlierEntries.length === 1 ? "entry" : "entries"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {earlierEntries.map((entry) => (
                    <ShellCardWrapper
                      key={entry.shellId}
                      entry={entry}
                      authorName={authorNames.get(entry.userId) || "Unknown"}
                      userId={userId}
                      hasVoted={votedMap.get(entry.shellId) || false}
                      isWinner={winnerMap.has(entry.shellId)}
                      winnerLabel={winnerMap.get(entry.shellId) || null}
                      commentCount={commentCountMap.get(entry.shellId) || 0}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
