import Link from "next/link";
import { auth } from "@/lib/auth";
import { getAllMembers } from "@/actions/admin/members";
import { getTodayCheckIns } from "@/actions/admin/checkins";
import { getUpcomingEvents } from "@/actions/events";
import { getCurrentWeek } from "@/actions/admin/showcase";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) return null;

  const isModerator = session.user.role === "moderator";

  // Check Sunday status & current week winner
  const isSunday = new Date().getDay() === 0;
  const { year, week } = await getCurrentWeek();

  // Fetch overview metrics in parallel
  const [members, todayCheckins, events, customAvatar, currentWinnerId] = await Promise.all([
    getAllMembers(),
    getTodayCheckIns(),
    getUpcomingEvents(),
    redis.hget(`member:${session.user.id}`, "customAvatar") as Promise<string | null>,
    redis.get(`shells:winner:${year}:${week}`),
  ]);

  const winnerChosenThisWeek = Boolean(currentWinnerId);
  const activeMemberships = members.filter((m) => m.membership?.status === "active").length;
  const memberCheckinsCount = todayCheckins.filter(
    (c) => c.method === "qr" || c.method === "manual" || c.method === "membership_cash"
  ).length;
  const avatarUrl = customAvatar || session.user.image || null;

  const allQuickTiles = [
    {
      title: "QR Scanner",
      description: "Scan member QR codes for daily track check-in",
      href: "/admin/check-in",
      icon: "📱",
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400",
      adminOnly: false,
    },
    {
      title: "Member Management",
      description: "View, search, and check in track members",
      href: "/admin/members",
      icon: "👥",
      color: "from-blue-500/20 to-cyan-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400",
      adminOnly: false,
    },
    {
      title: "Track Events",
      description: "View and manage upcoming track events",
      href: "/admin/events",
      icon: "📅",
      color: "from-emerald-500/20 to-green-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
      adminOnly: false,
    },
    {
      title: "Check-In History",
      description: "Review complete track check-in logs & dates",
      href: "/admin/history",
      icon: "📜",
      color: "from-indigo-500/20 to-blue-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400",
      adminOnly: false,
    },
    {
      title: "Global Notifications",
      description: "Broadcast in-app and push notifications to all users",
      href: "/admin/notifications",
      icon: "📢",
      color: "from-purple-500/20 to-pink-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400",
      adminOnly: true,
    },
    {
      title: "Weekly Shell Winners",
      description: winnerChosenThisWeek
        ? `Winner selected for Week ${week}, ${year}`
        : isSunday
        ? "🚨 TODAY IS SUNDAY: Select weekly winner now!"
        : "Pick and crown weekly shell showcase winners",
      href: "/admin/showcase-winners",
      icon: "🏆",
      highlight: isSunday && !winnerChosenThisWeek,
      color: isSunday && !winnerChosenThisWeek
        ? "from-amber-500/40 to-yellow-500/30 border-amber-500 text-amber-500"
        : "from-yellow-500/20 to-amber-500/10 border-yellow-500/40 text-yellow-600 dark:text-yellow-400",
      adminOnly: true,
    },
    {
      title: "Facebook Sync",
      description: "Manage track social media integrations",
      href: "/admin/facebook",
      icon: "📲",
      color: "from-sky-500/20 to-blue-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400",
      adminOnly: true,
    },
  ];

  const quickTiles = allQuickTiles.filter((t) => !isModerator || !t.adminOnly);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-6xl space-y-8">
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

        {/* High Priority Sunday Winner Highlight Banner (Admin only) */}
        {!isModerator && isSunday && (
          <div
            className={`rounded-2xl border p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg transition-all ${
              winnerChosenThisWeek
                ? "bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-teal-500/10 border-emerald-500/40"
                : "bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-orange-500/20 border-amber-500/60 ring-2 ring-amber-500/30 animate-pulse"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl shrink-0">🏆</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md text-[10px] font-black px-2 py-0.5 uppercase tracking-wider ${
                      winnerChosenThisWeek
                        ? "bg-emerald-500 text-black"
                        : "bg-amber-500 text-black"
                    }`}
                  >
                    {winnerChosenThisWeek ? "WINNER SELECTED" : "SUNDAY ACTION REQUIRED"}
                  </span>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Weekly Shell Winner Selection (Week {week}, {year})
                  </h2>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                  {winnerChosenThisWeek
                    ? "Great job! A weekly shell showcase winner has already been crowned for this week."
                    : "Today is Sunday! Choose this week's community shell showcase winner from member submissions."}
                </p>
              </div>
            </div>

            <Link
              href="/admin/showcase-winners"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-black text-black transition-all shadow-md shrink-0"
            >
              🏆 {winnerChosenThisWeek ? "View Winner Details" : "Select Winner Now →"}
            </Link>
          </div>
        )}

        {/* Fast Check-In Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/check-in"
            className="py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-base flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-amber-400/40"
          >
            <span className="text-2xl">📱</span> QR Code Check-In →
          </Link>
          <Link
            href="/admin/members"
            className="py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-base flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-blue-500/40"
          >
            <span className="text-2xl">👤</span> User Check-In →
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
            href="/admin/check-in"
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

        {/* Quick Action Tiles Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Quick Navigation Tiles</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{quickTiles.length} Controls</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickTiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className={`group relative rounded-2xl bg-white dark:bg-zinc-900 border p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-lg space-y-4 ${
                  tile.highlight
                    ? "border-amber-500 ring-2 ring-amber-500/40 shadow-amber-500/10 animate-pulse"
                    : "border-zinc-200/90 dark:border-zinc-800 hover:border-amber-500/60 dark:hover:border-amber-500/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl block">{tile.icon}</span>
                    {tile.highlight && (
                      <span className="rounded-full bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 uppercase tracking-wider animate-bounce">
                        SUNDAY: PICK WINNER
                      </span>
                    )}
                    <span className="text-xs font-bold text-zinc-400 group-hover:text-amber-500 transition-colors">→</span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-500 transition-colors">
                    {tile.title}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {tile.description}
                  </p>
                </div>
                <div className={`rounded-lg bg-gradient-to-r ${tile.color} border px-3 py-1 text-[10px] font-bold uppercase tracking-wider self-start`}>
                  Open {tile.title}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
