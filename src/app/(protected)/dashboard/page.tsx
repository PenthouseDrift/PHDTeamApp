import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getWallet } from "@/actions/wallet";
import { getRemainingDays } from "@/lib/membership-utils";
import { getOrCreateQRCode } from "@/actions/qr";
import { isUserCheckedInToday } from "@/actions/admin/checkins";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

const quickLinks = [
  {
    title: "Wallet & Passes",
    href: "/wallet",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9" />
      </svg>
    ),
  },
  {
    title: "My Cars",
    href: "/cars",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25m-2.25 0h-2.25m0 0V6.375c0-.621-.504-1.125-1.125-1.125H4.875c-.621 0-1.125.504-1.125 1.125v3.5m7.5 0h7.5"
        />
      </svg>
    ),
  },
  {
    title: "Showcase",
    href: "/showcase",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
        />
      </svg>
    ),
  },
  {
    title: "Newsfeed",
    href: "/newsfeed",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5"
        />
      </svg>
    ),
  },
];

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  // Fetch all dashboard data in parallel
  const [result, walletRes, memberData, qrResult, isCheckedInToday] = await Promise.all([
    getMembership(session.user.id),
    getWallet(session.user.id),
    redis.hgetall(`member:${session.user.id}`),
    getOrCreateQRCode(session.user.id),
    isUserCheckedInToday(session.user.id),
  ]);

  const membership = result.success ? result.data : null;
  const wallet = walletRes.success ? walletRes.data : { dayPasses: 0, rentalHours: 0 };
  const isActive = membership?.status === "active";
  const customAvatar = (memberData?.customAvatar as string) || null;
  const nickname = (memberData?.nickname as string) || "";
  const avatarUrl = customAvatar || session.user.image || null;
  const displayName = nickname.trim() || session.user.name?.split(" ")[0] || "Member";
  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  const remainingDays = membership && isActive ? getRemainingDays(membership) : 0;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-200"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-amber-500 flex items-center justify-center text-xl font-bold text-white">
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Welcome back, {displayName}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Member Dashboard</p>
          </div>
        </div>

        {/* Staff Quick Links — admin & moderator only */}
        {(session.user.role === "admin" || session.user.role === "moderator") && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {session.user.role === "moderator" ? "Mod Quick Access" : "Admin Quick Access"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Dashboard */}
              <Link
                href="/admin"
                className="flex flex-col items-center gap-2 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-200 dark:hover:border-amber-800 transition-colors group"
              >
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
        )}

        {/* Daily Track Check-In Status Banner (Regular Members only) */}
        {session.user.role !== "admin" && session.user.role !== "moderator" && (
          isCheckedInToday ? (
            <div className="rounded-xl bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-green-500/10 border border-green-500/30 p-4 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
                <div>
                  <p className="text-sm font-bold text-green-900 dark:text-green-200">
                    Checked In Today
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Your track check-in is active for today. Have a great session!
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-block rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1 text-xs font-black text-green-700 dark:text-green-300 uppercase tracking-wider">
                Verified On Track
              </span>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Daily Track Check-In
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Not checked in yet today. Show your QR code below to an admin at the track.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Combined Membership Status & Check-In QR Section (Top of Dashboard) */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 shadow-sm">
          {/* Membership Status Header & Badge */}
          <div>
            <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Membership Status
            </h2>
            {session.user.role === "admin" ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  Admin Access (Unlimited Track Access)
                </span>
              </div>
            ) : session.user.role === "moderator" ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Moderator Access (Unlimited Track Access)
                </span>
              </div>
            ) : membership && isActive ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status="active" size="lg" />
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                    {remainingDays} {remainingDays === 1 ? "day" : "days"} remaining
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status="expired" size="lg" />
                  <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                    {membership ? "Membership expired" : "No active 28-day membership"}
                  </span>
                </div>
                <Link
                  href="/membership/purchase"
                  className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-amber-400"
                >
                  {membership ? "Renew Membership" : "Purchase Membership (£40)"}
                </Link>
              </div>
            )}
          </div>

          {/* Divider & Check-In QR Code */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5 space-y-4 text-center sm:text-left">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Membership Check-In QR
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Show this to an admin to check in at the track with your 28-day membership. To access Day Pass or Car Rental QR codes, open your <Link href="/wallet" className="text-amber-600 dark:text-amber-500 font-semibold underline">Wallet</Link>.
              </p>
            </div>

            {qrResult.success ? (
              <div className="flex justify-center pt-1">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white p-4 shadow-md text-center">
                  <img
                    src={qrResult.data}
                    alt="Membership Check-In QR Code"
                    width={220}
                    height={220}
                    className="h-auto w-full max-w-[220px] mx-auto"
                  />
                  <p className="mt-2 text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 inline-block">
                    Member ID: {session.user.id}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-red-600 text-center">Unable to load QR code. Visit your profile to retry.</p>
            )}
          </div>
        </section>

        {/* Penthouse Drift Wallet & Pass Balances Card */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-amber-600 dark:text-amber-500 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Penthouse Drift Wallet
            </h2>
            <Link
              href="/wallet"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors"
            >
              Open Wallet & QR Passes →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 p-4 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-2">
              <div>
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Day Passes</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white">{wallet.dayPasses}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{wallet.dayPasses === 1 ? "Pass" : "Passes"}</span>
                </div>
              </div>
              {wallet.dayPasses <= 0 ? (
                <Link
                  href="/wallet"
                  className="w-full text-center py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                >
                  + Buy Day Pass (£10)
                </Link>
              ) : (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Valid for 1 full track day</p>
              )}
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 p-4 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-2">
              <div>
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Car Rental Hours</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white">{wallet.rentalHours}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{wallet.rentalHours === 1 ? "Hour" : "Hours"}</span>
                </div>
              </div>
              {wallet.rentalHours <= 0 ? (
                <Link
                  href="/wallet"
                  className="w-full text-center py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                >
                  + Buy Rental Hour (£10)
                </Link>
              ) : (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">15m grace + 1hr rental</p>
              )}
            </div>
          </div>
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
                className="flex flex-col items-center gap-2 rounded-xl bg-white p-5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                {link.icon}
                <span className="text-sm font-medium">{link.title}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
