import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getWallet } from "@/actions/wallet";
import { getRemainingDays } from "@/lib/membership-utils";
import { getOrCreateQRCode } from "@/actions/qr";
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
  const [result, walletRes, memberData, qrResult, checkedInRaw] = await Promise.all([
    getMembership(session.user.id),
    getWallet(session.user.id),
    redis.hgetall(`member:${session.user.id}`),
    getOrCreateQRCode(session.user.id),
    redis.get(`checkin:dedup:${session.user.id}`),
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
  const isCheckedInToday = !!checkedInRaw;

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

        {/* Check-In Status */}
        {isCheckedInToday && (
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">Checked In Today</p>
              <p className="text-xs text-green-600 dark:text-green-400">You're on the track — enjoy your session!</p>
            </div>
          </div>
        )}

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
