import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getWallet } from "@/actions/wallet";
import { parseDiscounts, priceFor, formatGBP } from "@/lib/pricing";
import { getRemainingDays } from "@/lib/membership-utils";
import { getUpcomingEvents, getBulkEventRSVPs } from "@/actions/events";
import { isUserCheckedInToday } from "@/actions/admin/checkins";
import { getEventTiming } from "@/lib/event-utils";
import { QuickRSVPButton } from "@/components/QuickRSVPButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QRPopover } from "@/components/QRPopover";
import { SelfCheckInCTA } from "@/components/SelfCheckInCTA";
import { getSelfCheckInStatus } from "@/actions/admin/checkins";

import { getCurrentWeekWinnerInfo } from "@/actions/admin/showcase";

export const dynamic = "force-dynamic";

const quickLinks = [
  {
    title: "Wallet & Passes",
    href: "/wallet",
    icon: (
      <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9" />
      </svg>
    ),
  },
  {
    title: "My Cars & Garage",
    href: "/cars",
    icon: (
      <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25m-2.25 0h-2.25m0 0V6.375c0-.621-.504-1.125-1.125-1.125H4.875c-.621 0-1.125.504-1.125 1.125v3.5m7.5 0h7.5" />
      </svg>
    ),
  },
  {
    title: "Shell Showcase",
    href: "/showcase",
    icon: (
      <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
      </svg>
    ),
  },
  {
    title: "Newsfeed",
    href: "/newsfeed",
    icon: (
      <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5" />
      </svg>
    ),
  },
  {
    title: "AI Tuning Advisor",
    href: "/tuning-advisor",
    icon: (
      <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
  },
  {
    title: "FDR Calculator",
    href: "/calculator",
    icon: (
      <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" />
      </svg>
    ),
  },
  {
    title: "My Profile",
    href: "/profile",
    icon: (
      <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  {
    title: "Track Membership",
    href: "/membership/purchase",
    icon: (
      <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
      </svg>
    ),
  },
];

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const isAdminOrMod = session.user.role === "admin" || session.user.role === "moderator";

  // Fetch all dashboard data in parallel
  const [result, walletRes, memberData, upcomingEvents, isCheckedInToday, winnerInfo, selfCheckInActive] = await Promise.all([
    getMembership(session.user.id),
    getWallet(session.user.id),
    redis.hgetall(`member:${session.user.id}`),
    getUpcomingEvents(),
    isUserCheckedInToday(session.user.id),
    isAdminOrMod ? getCurrentWeekWinnerInfo() : Promise.resolve(null),
    getSelfCheckInStatus(),
  ]);

  const bulkRsvps = await getBulkEventRSVPs(upcomingEvents.map(e => e.eventId), session.user.id);
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const winnerSelectionPending = isAdminOrMod && isWeekend && Boolean(winnerInfo && !winnerInfo.shellId);
  const membership = result.success ? result.data : null;
  const wallet = walletRes.success ? walletRes.data : { dayPasses: 0, rentalHours: 0 };
  const isActive = membership?.status === "active";

  const discounts = parseDiscounts(memberData);
  const membershipPrice = priceFor("membership", discounts.membership);
  const dayPassPrice = priceFor("daypass", discounts.daypass);
  const rentalPrice = priceFor("rental", discounts.rental);

  const customAvatar = (memberData?.customAvatar as string) || null;
  const nickname = (memberData?.nickname as string) || "";
  const avatarUrl = customAvatar || session.user.image || null;
  const displayName = nickname.trim() || session.user.name?.split(" ")[0] || "Member";
  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  const remainingDays = membership && isActive ? getRemainingDays(membership) : 0;
  // Active but expires later today (getRemainingDays floors to 0 within the
  // final 24h). Treat this as the "last day" so we prompt an early renewal
  // instead of showing a confusing "0 days remaining".
  const isLastDay = Boolean(membership && isActive && remainingDays === 0);

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Unified Hero Section: Welcome + Membership Status + Daily Track Check-In */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-sm space-y-5">
          {/* Top Row: User Avatar & Welcome Text */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={56}
                  height={56}
                  priority
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700 shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {initials}
                </div>
              )}
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                  Welcome, {displayName}
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2">
                  Member Dashboard
                  {(session.user.role === "admin" || session.user.role === "moderator") && (
                    <span className="inline-block sm:hidden text-purple-500">({session.user.role})</span>
                  )}
                </p>
              </div>
            </div>
            
            {/* Admin/Mod Badge Top Right (Desktop Only) */}
            <div className="shrink-0 hidden sm:block">
              {session.user.role === "admin" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  Admin Access
                </span>
              ) : session.user.role === "moderator" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Mod Access
                </span>
              ) : null}
            </div>
          </div>

          {/* Account Balances Container */}
          <div className="flex flex-col gap-3 sm:gap-4">
            
            {/* 1. Membership Status (Full Width) */}
            {isAdminOrMod ? (
              <div className="w-full rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 sm:p-5 border border-amber-300 dark:border-orange-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-[11px] font-black text-amber-900/80 uppercase tracking-widest mb-1">
                    Penthouse Drift Staff
                  </p>
                  <h3 className="text-lg sm:text-xl font-black text-black leading-tight">
                    Full Track Access
                  </h3>
                  <p className="text-xs font-semibold text-amber-900 mt-1">
                    You have unlimited track access.
                  </p>
                </div>
                
                <Link
                  href="/admin"
                  className="relative z-10 shrink-0 w-full sm:w-auto px-6 py-2.5 sm:py-3 rounded-xl text-sm font-black text-center transition-all active:scale-[0.98] bg-black text-white hover:bg-zinc-800 shadow-lg shadow-black/20"
                >
                  Admin Command Center
                </Link>
              </div>
            ) : (
              <div className="w-full rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 sm:p-5 border border-amber-300 dark:border-orange-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-[11px] font-black text-amber-900/80 uppercase tracking-widest mb-1">
                    {isLastDay ? "Membership Ends Today" : membership && isActive ? "Penthouse Drift Member" : membership ? "Membership Expired" : "Unlock Full Access"}
                  </p>

                  {membership && isActive ? (
                    <>
                      <h3 className="text-lg sm:text-xl font-black text-black leading-tight">
                        {isLastDay ? "Last Day of Membership" : "Active"}
                      </h3>
                      <p className="text-xs font-semibold text-amber-900 mt-1">
                        {isLastDay
                          ? "Today is the final day of your unlimited track access. Renew now to keep it going."
                          : `${remainingDays} ${remainingDays === 1 ? "day" : "days"} of unlimited track access remaining.`}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg sm:text-xl font-black text-black leading-tight">
                        {membership ? "Renew Your Membership" : "Become a Member"}
                      </h3>
                      <p className="text-xs font-semibold text-amber-900 mt-1 max-w-sm">
                        Get unlimited track access for a full 28 days.
                      </p>
                    </>
                  )}
                </div>
                
                <Link
                  href="/membership/purchase"
                  className="relative z-10 shrink-0 w-full sm:w-auto px-6 py-2.5 sm:py-3 rounded-xl text-sm font-black text-center transition-all active:scale-[0.98] bg-black text-white hover:bg-zinc-800 shadow-lg shadow-black/20"
                >
                  {membership && isActive && !isLastDay ? (
                    "Manage Membership"
                  ) : (
                    <>
                      {membership ? "Renew Now" : "Buy Membership"} (
                      {membershipPrice.hasDiscount && (
                        <span className="line-through opacity-60 mr-1">{formatGBP(membershipPrice.original)}</span>
                      )}
                      {formatGBP(membershipPrice.final)})
                    </>
                  )}
                </Link>
              </div>
            )}

            {/* Passes & Rentals Grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* 2. Day Passes */}
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 p-3 sm:p-4 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-3">
                <div>
                  <p className="text-[10px] sm:text-[11px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Day Passes</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-none">{wallet.dayPasses}</span>
                  </div>
                </div>
                <Link
                  href="/wallet"
                  className={`w-full flex items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    wallet.dayPasses > 0 
                      ? "bg-zinc-200/50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  }`}
                >
                  {wallet.dayPasses > 0 ? (
                    "Use Pass"
                  ) : (
                    <>
                      + Buy (
                      {dayPassPrice.hasDiscount && (
                        <span className="line-through opacity-60 mr-1">{formatGBP(dayPassPrice.original)}</span>
                      )}
                      {formatGBP(dayPassPrice.final)})
                    </>
                  )}
                </Link>
              </div>

              {/* 3. Rental Hours */}
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 p-3 sm:p-4 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-3">
                <div>
                  <p className="text-[10px] sm:text-[11px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Rental Hours</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white leading-none">{wallet.rentalHours}</span>
                  </div>
                </div>
                <Link
                  href="/wallet"
                  className={`w-full flex items-center justify-center py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    wallet.rentalHours > 0 
                      ? "bg-zinc-200/50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  }`}
                >
                  {wallet.rentalHours > 0 ? (
                    "Use Hours"
                  ) : (
                    <>
                      + Buy (
                      {rentalPrice.hasDiscount && (
                        <span className="line-through opacity-60 mr-1">{formatGBP(rentalPrice.original)}</span>
                      )}
                      {formatGBP(rentalPrice.final)})
                    </>
                  )}
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom Integrated Section: Daily Track Check-In Banner */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
            {isCheckedInToday ? (
              <div className="rounded-xl bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-green-500/10 border border-green-500/30 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <p className="text-xs font-bold text-green-900 dark:text-green-200">
                    Checked In Today <span className="font-normal text-green-700 dark:text-green-400 hidden sm:inline">— Your track check-in is active. Have a great session!</span>
                  </p>
                </div>
                <span className="rounded-full bg-green-500/20 border border-green-500/30 px-2.5 py-0.5 text-[10px] font-black text-green-700 dark:text-green-300 uppercase tracking-wider shrink-0 hidden sm:inline-block">
                  Verified On Track
                </span>
              </div>
            ) : selfCheckInActive ? (
              <SelfCheckInCTA />
            ) : (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Daily Track Check-In: <span className="font-normal text-zinc-500 dark:text-zinc-400 hidden sm:inline">Not checked in yet today</span>
                  </p>
                </div>
                <QRPopover userId={session.user.id} variant="button" buttonText="Show QR code" />
              </div>
            )}
          </div>
        </section>

        {/* Staff Quick Links — admin & moderator only (Top of Dashboard) */}
        {isAdminOrMod && (
          <div className="space-y-3">
            {winnerSelectionPending && (
              <Link
                href="/admin/showcase-winners"
                prefetch={true}
                className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-orange-500/20 border border-amber-500/40 p-3.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:border-amber-500 transition-all shadow-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base animate-bounce">🏆</span>
                  <div>
                    <p className="font-extrabold text-amber-700 dark:text-amber-400">
                      Action Required: Select Weekly Showcase Winner
                    </p>
                    <p className="text-[11px] font-normal text-zinc-600 dark:text-zinc-300 mt-0.5">
                      No weekly showcase winner has been crowned for this week yet.
                    </p>
                  </div>
                </div>
                <span className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-black text-black group-hover:bg-amber-400 transition-colors shrink-0 shadow-xs">
                  Select Winner →
                </span>
              </Link>
            )}

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {session.user.role === "moderator" ? "Mod Quick Access" : "Admin Quick Access"}
                </p>
                {winnerSelectionPending && (
                  <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
                    🏆 Selection Required
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Dashboard */}
                <Link
                  href="/admin"
                  prefetch={true}
                  className="relative flex flex-col items-center gap-2 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-200 dark:hover:border-amber-800 transition-colors group"
                >
                  {winnerSelectionPending && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 text-[8px] font-black text-black items-center justify-center shadow-xs">!</span>
                    </span>
                  )}
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/60 transition-colors">
                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors text-center">
                    {session.user.role === "moderator" ? "Mod Dashboard" : "Admin Dashboard"}
                  </span>
                </Link>

                {/* QR Scanner */}
                <Link
                  href="/admin/check-in"
                  prefetch={true}
                  className="flex flex-col items-center gap-2 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-200 dark:hover:border-green-800 transition-colors group"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/60 group-hover:bg-green-200 dark:group-hover:bg-green-900/60 transition-colors">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors text-center">
                    QR Scanner
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Track Events Section (Top Carousel) */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Upcoming Track Events
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Official drift sessions &amp; track days
                </p>
              </div>
            </div>
            <Link
              href="/newsfeed"
              className="text-xs font-bold text-amber-600 dark:text-amber-500 hover:underline flex items-center gap-1"
            >
              <span>Newsfeed</span> →
            </Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 text-center space-y-1 border border-dashed border-zinc-200 dark:border-zinc-700">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No upcoming events scheduled</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Check back soon for new track sessions!</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory -mx-1 px-1">
              {upcomingEvents.map((event) => {
                const timing = getEventTiming(event);
                return (
                  <div
                    key={event.eventId}
                    className={`shrink-0 w-60 sm:w-64 snap-start rounded-xl border overflow-hidden flex flex-col justify-between hover:border-amber-500/50 transition-all group ${
                      timing.state === "happening_now"
                        ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-emerald-400 dark:border-emerald-500 ring-1 ring-emerald-400/40"
                        : timing.state === "today"
                        ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-amber-400 dark:border-amber-500"
                        : timing.state === "finished"
                        ? "bg-zinc-100/80 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 opacity-75"
                        : "bg-zinc-50/60 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <div>
                      {event.imageUrl ? (
                        <div className="relative h-24 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                          <Image
                            src={event.imageUrl}
                            alt={event.title}
                            fill
                            sizes="(max-width: 640px) 240px, 256px"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2">
                            <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-xs flex items-center gap-1 ${timing.badgeBg} ${timing.badgeText}`}>
                              {timing.dotColor && (
                                <span className={`w-1.5 h-1.5 rounded-full ${timing.dotColor} ${timing.animateDot ? "animate-pulse" : ""}`} />
                              )}
                              {timing.label}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 pb-0 flex items-center justify-between gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${timing.badgeBg} ${timing.badgeText}`}>
                            {timing.dotColor && (
                              <span className={`w-1.5 h-1.5 rounded-full ${timing.dotColor} ${timing.animateDot ? "animate-pulse" : ""}`} />
                            )}
                            {timing.label}
                          </span>
                          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                            {event.openTime && event.closeTime ? `${event.openTime} - ${event.closeTime}` : event.time}
                          </span>
                        </div>
                      )}

                      <div className="p-3 space-y-1">
                        {event.imageUrl && (
                          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            {event.openTime && event.closeTime ? `${event.openTime} - ${event.closeTime}` : event.time}
                          </p>
                        )}
                        <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-amber-500 transition-colors">
                          {event.title}
                        </h3>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-snug">
                          {event.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-3 pb-3 pt-0 flex items-center justify-between">
                      <QuickRSVPButton eventId={event.eventId} initialRsvpData={bulkRsvps[event.eventId]} />
                      <Link
                        href="/newsfeed"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-500"
                      >
                        <span>Details</span> →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>




        {/* Quick Links */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={true}
                className="flex flex-col items-center gap-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-5 text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white shadow-xs group"
              >
                {link.icon}
                <span className="text-sm font-medium text-center">{link.title}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
