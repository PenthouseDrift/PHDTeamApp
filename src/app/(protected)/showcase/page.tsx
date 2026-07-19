import Link from "next/link";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { getShowcaseEntries, getLeaderboard, hasUserVoted } from "@/actions/showcase";
import { getWeeklyWinners } from "@/actions/admin/showcase";
import { VoteButton } from "@/components/showcase/VoteButton";
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ShellCard({
  entry,
  authorName,
  userId,
  hasVoted,
  isWinner,
  winnerLabel,
}: {
  entry: ShellEntry;
  authorName: string;
  userId: string;
  hasVoted: boolean;
  isWinner: boolean;
  winnerLabel: string | null;
}) {
  const isOwnEntry = entry.userId === userId;

  return (
    <div className="group relative overflow-hidden rounded-xl bg-white border border-zinc-200 shadow-sm transition-shadow hover:shadow-md">
      {isWinner && (
        <div className="absolute top-2 left-2 z-10 rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-black">
          🏆 {winnerLabel}
        </div>
      )}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={entry.imageUrl}
          alt={entry.description || "Shell design"}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      </div>
      <div className="space-y-2 p-4">
        {entry.description && (
          <p className="line-clamp-2 text-sm text-zinc-600">
            {entry.description}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="truncate max-w-[120px]">{authorName}</span>
          <span>{formatDate(entry.createdAt)}</span>
        </div>
        <VoteButton
          shellId={entry.shellId}
          userId={userId}
          initialVoted={hasVoted}
          initialCount={entry.voteCount}
          isOwnEntry={isOwnEntry}
        />
      </div>
    </div>
  );
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

  // Fetch author names for all entries
  const authorNames = new Map<string, string>();
  const uniqueUserIds = [...new Set(entries.map((e) => e.userId))];
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      const name = await getAuthorName(uid);
      authorNames.set(uid, name);
    })
  );

  // Check which entries the current user has voted on
  const votedMap = new Map<string, boolean>();
  if (userId) {
    await Promise.all(
      entries.map(async (entry) => {
        const voted = await hasUserVoted(entry.shellId, userId);
        votedMap.set(entry.shellId, voted);
      })
    );
  }

  // Fetch weekly winners for badge display
  const winners = await getWeeklyWinners(50);
  const winnerMap = new Map<string, string>();
  for (const w of winners) {
    winnerMap.set(w.shellId, `Week ${w.week}, ${w.year}`);
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Shell Showcase</h1>
            <p className="text-sm text-zinc-500">
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
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          <Link
            href="/showcase?view=gallery"
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
              view === "gallery"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Gallery
          </Link>
          <Link
            href="/showcase?view=leaderboard"
            className={`flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
              view === "leaderboard"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Leaderboard
          </Link>
        </div>

        {/* Grid */}
        {entries.length === 0 ? (
          <div className="rounded-xl bg-white border border-zinc-200 p-12 text-center">
            <p className="text-zinc-500">
              No shells submitted yet. Be the first!
            </p>
            <Link
              href="/showcase/submit"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-500"
            >
              Submit a shell
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {entries.map((entry) => (
              <ShellCard
                key={entry.shellId}
                entry={entry}
                authorName={authorNames.get(entry.userId) || "Unknown"}
                userId={userId}
                hasVoted={votedMap.get(entry.shellId) || false}
                isWinner={winnerMap.has(entry.shellId)}
                winnerLabel={winnerMap.get(entry.shellId) || null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
