import Link from "next/link";
import { PullToRefresh } from "@/components/PullToRefresh";
import { auth } from "@/lib/auth";
import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns, getSelfCheckInStatus } from "@/actions/admin/checkins";
import { getActiveRentals } from "@/actions/admin/rentals";
import { getUpcomingEvents } from "@/actions/events";
import { Suspense } from "react";
import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";
import { getEventTiming } from "@/lib/event-utils";
import { getActiveShopOrders } from "@/actions/orders";
import { getReservedListings } from "@/actions/marketplace";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) return null;

  const isModerator = session.user.role === "moderator";

  return (
    <PullToRefresh>
      <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <Suspense fallback={<AdminDashboardSkeleton isModerator={isModerator} />}>
            <AdminDashboardData session={session} isModerator={isModerator} />
          </Suspense>
        </div>
      </div>
    </PullToRefresh>
  );
}

async function AdminDashboardData({ session, isModerator }: { session: any, isModerator: boolean }) {
  // Check weekend status & current week winner
  const day = new Date().getDay();
  const isSunday = day === 0;
  const isSaturday = day === 6;

  // Fetch overview metrics in parallel
  const [members, todayCheckins, events, currentWinnerInfo, selfCheckInActive, activeRentals, clickCollectOrders, reservedListings] = await Promise.all([
    getAllMembers(),
    getTodayCheckIns(),
    getUpcomingEvents(),
    getCurrentWeekWinnerInfo(),
    getSelfCheckInStatus(),
    getActiveRentals(),
    // Admin-only: pending Click & Collect orders awaiting collection. Returns []
    // for moderators (the action is admin-gated), so the card hides for them.
    getActiveShopOrders(),
    // Admin-only: marketplace items with units currently reserved (held for a
    // buyer). Also surfaced on the same Click & Collect page. [] for moderators.
    getReservedListings(),
  ]);

  const pendingOrderCount = clickCollectOrders.length;
  // Total units held across all reserved listings (for the summary card).
  const reservedUnitCount = reservedListings.reduce((sum, l) => sum + l.reservedCount, 0);

  const winnerChosenThisWeek = Boolean(currentWinnerInfo.shellId);
  const activeMemberships = members.filter((m) => m.membership?.status === "active").length;
  const memberCheckinsCount = todayCheckins.filter(
    (c) =>
      c.method === "qr" ||
      c.method === "manual" ||
      c.method === "membership" ||
      c.method === "membership_cash"
  ).length;
  const avatarUrl = (session.user as any).customAvatar || session.user.image || null;
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach((p) => { partMap[p.type] = p.value; });
  const localToday = `${partMap.year}-${partMap.month}-${partMap.day}`;

  const todaysEvents = events.filter((e) => e.date === localToday && e.status !== "cancelled");
  const hasEventToday = todaysEvents.length > 0;
  
  let allEventsFinished = false;
  if (hasEventToday) {
    allEventsFinished = todaysEvents.every(e => getEventTiming(e).state === "finished");
  }

  // Build Actions Needed
  const actionsNeeded: { title: string; desc: string; href: string; icon: string; urgent: boolean }[] = [];
  
  if (!isModerator && (isSunday || isSaturday) && !winnerChosenThisWeek) {
    actionsNeeded.push({
      title: "Weekly Winner Selection",
      desc: isSunday 
        ? "Select this week's community showcase winner from member submissions before the week resets."
        : "Voting is closed! You can now select this week's community showcase winner.",
      href: "/admin/showcase-winners",
      icon: "🏆",
      urgent: isSunday, // Critical on Sunday, Warning on Saturday
    });
  }

  const overdueRentals = activeRentals.filter(r => r.status === "active" && r.sessionEndsAt && Date.now() > r.sessionEndsAt);
  if (overdueRentals.length > 0) {
    actionsNeeded.push({
      title: "Overdue Rentals",
      desc: `There are ${overdueRentals.length} active rental sessions that have exceeded their time limit.`,
      href: "/admin/check-in",
      icon: "⏱️",
      urgent: true,
    });
  }

  return (
    <>
      {/* Header with Back Button */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-14 w-14 rounded-2xl object-cover ring-2 ring-amber-500/50 shadow-md shrink-0"
              />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-amber-500 flex items-center justify-center text-xl font-black text-black shadow-md shrink-0">
                {isModerator ? "MOD" : "AD"}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {isModerator ? "Moderator Command Center" : "Admin Command Center"}
                </h1>
                <span className="rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400 text-[10px] font-black px-2.5 py-0.5 uppercase tracking-wider">
                  {isModerator ? "Moderator" : "Admin"}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Penthouse Drift Official Track Management Portal
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-900 transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm shrink-0 self-start lg:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Back to Member Dashboard
          </Link>
        </div>

        {/* Click & Collect orders — quick view of what's awaiting collection. */}
        {!isModerator && (
          <Link
            href="/admin/click-collect"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center gap-4 min-w-0">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">
                🛍️
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Click &amp; Collect</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {pendingOrderCount === 0
                    ? "No orders awaiting collection"
                    : `${pendingOrderCount} order${pendingOrderCount === 1 ? "" : "s"} awaiting collection`}
                  {reservedUnitCount > 0 &&
                    ` · ${reservedUnitCount} item${reservedUnitCount === 1 ? "" : "s"} reserved`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pendingOrderCount > 0 && (
                <span
                  title={`${pendingOrderCount} order${pendingOrderCount === 1 ? "" : "s"} awaiting collection`}
                  className="flex h-8 min-w-8 items-center justify-center rounded-full bg-emerald-500 px-2 text-sm font-black text-black"
                >
                  {pendingOrderCount}
                </span>
              )}
              {reservedUnitCount > 0 && (
                <span
                  title={`${reservedUnitCount} item${reservedUnitCount === 1 ? "" : "s"} reserved`}
                  className="flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-sm font-black text-black"
                >
                  🔖 {reservedUnitCount}
                </span>
              )}
              <span className="text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform text-lg">→</span>
            </div>
          </Link>
        )}

        {/* Self Check-in status — automated from event open/close times */}
        {hasEventToday && (
          <div
            className={`rounded-2xl border p-4 flex items-start gap-3 ${
              selfCheckInActive
                ? "border-emerald-400/50 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-950/30"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
                selfCheckInActive
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-zinc-200/70 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {selfCheckInActive ? "🏁" : "🔒"}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Member Self Check-In
                </h3>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    selfCheckInActive
                      ? "bg-emerald-500 text-black"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {selfCheckInActive ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {selfCheckInActive
                  ? "An event is running now, so members can check themselves in. This opens and closes automatically with today's event times."
                  : allEventsFinished
                  ? "Today's events have finished — self check-in is closed until the next event opens."
                  : "Self check-in opens automatically when today's event reaches its open time."}
              </p>
            </div>
          </div>
        )}

        {/* Action Needed Section */}
        {actionsNeeded.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-red-500 animate-pulse">●</span> Action Required
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {actionsNeeded.map((action, idx) => (
                <Link
                  key={idx}
                  href={action.href}
                  className={`rounded-2xl border p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all active:scale-[0.99] ${
                    action.urgent
                      ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                      : "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{action.icon}</span>
                    <h3 className={`text-sm font-bold ${action.urgent ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                      {action.title}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                    {action.desc}
                  </p>
                  <div className={`mt-auto inline-flex items-center text-xs font-black self-start ${
                    action.urgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                  }`}>
                    Review Now →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* High Priority Sunday Winner Highlight Banner (Admin only) - Kept for legacy/fallback if not urgent, but we moved it to Actions */}
        {/* Fast Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/check-in?open=1"
            className="py-6 px-6 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black text-lg sm:text-xl flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-green-500/40"
          >
            <span className="text-3xl">✅</span> Check Customer In →
          </Link>
          <Link
            href="/marketplace"
            className="py-6 px-6 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-black text-lg sm:text-xl flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-teal-500/40"
          >
            <span className="text-3xl">🏷️</span> Mark Item as Sold →
          </Link>
        </div>

        {/* Live Track Metrics Bar */}
        <div className={`grid gap-4 ${isModerator ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
          <Link
            href="/admin/members"
            className="group rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm space-y-1 hover:border-amber-500/60 transition-all hover:shadow-md block overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider group-hover:text-amber-500 transition-colors truncate">
                Total Members
              </p>
              <span className="text-xs text-zinc-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0">→</span>
            </div>
            <p className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">{members.length}</p>
          </Link>

          {!isModerator && (
            <Link
              href="/admin/members"
              className="group rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm space-y-1 hover:border-green-500/60 transition-all hover:shadow-md block overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider truncate">
                  Active Memberships
                </p>
                <span className="text-xs text-zinc-400 group-hover:text-green-500 group-hover:translate-x-0.5 transition-all shrink-0">→</span>
              </div>
              <p className="text-3xl font-extrabold text-green-600 dark:text-green-400">{activeMemberships}</p>
            </Link>
          )}

          <Link
            href="/admin/members"
            className="group rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm space-y-2 hover:border-amber-500/60 transition-all hover:shadow-md block overflow-hidden"
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider truncate">
                Today&apos;s Check-Ins
              </p>
              <span className="text-xs text-zinc-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0">→</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-amber-500">{todayCheckins.length}</span>
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Total</span>
              </div>
              {!isModerator && (
                <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-lg shrink-0">
                  <span className="text-xs font-black text-green-700 dark:text-green-300">
                    {memberCheckinsCount}
                  </span>
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-bold ml-1 uppercase">
                    {memberCheckinsCount === 1 ? "Member" : "Members"}
                  </span>
                </div>
              )}
            </div>
          </Link>

          <Link
            href="/admin/events"
            className="group rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm space-y-1 hover:border-purple-500/60 transition-all hover:shadow-md block overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider truncate">
                Upcoming Events
              </p>
              <span className="text-xs text-zinc-400 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0">→</span>
            </div>
            <p className="text-3xl font-extrabold text-purple-600 dark:text-purple-400">{events.length}</p>
          </Link>
        </div>

    </>
  );
}

function AdminDashboardSkeleton({ isModerator }: { isModerator: boolean }) {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
            </div>
            <div className="h-3 w-64 bg-zinc-200 dark:bg-zinc-800 rounded mt-1" />
          </div>
        </div>
        <div className="h-9 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-xl shrink-0" />
      </div>

      {/* Click & Collect card skeleton */}
      {!isModerator && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm h-20" />
      )}

      {/* Live metrics bar skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(isModerator ? 3 : 4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm h-24" />
        ))}
      </div>
    </div>
  );
}
