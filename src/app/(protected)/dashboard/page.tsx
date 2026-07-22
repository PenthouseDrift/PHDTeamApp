import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getMembership } from "@/actions/membership";
import { getRemainingDays } from "@/lib/membership-utils";
import { getOrCreateQRCode } from "@/actions/qr";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QRToggleButton } from "./QRToggleButton";

export const dynamic = "force-dynamic";

const quickLinks = [
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
    title: "Calculator",
    href: "/calculator",
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
          d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z"
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
  const [result, customAvatar, qrResult, checkedInRaw] = await Promise.all([
    getMembership(session.user.id),
    redis.hget(`member:${session.user.id}`, "customAvatar") as Promise<string | null>,
    getOrCreateQRCode(session.user.id),
    redis.get(`checkin:dedup:${session.user.id}`),
  ]);

  const membership = result.success ? result.data : null;
  const isActive = membership?.status === "active";
  const avatarUrl = customAvatar || session.user.image || null;
  const initials = session.user.name
    ? session.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
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
              Welcome back, {session.user.name?.split(" ")[0] ?? "Member"}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Member Dashboard</p>
          </div>
        </div>

        {/* Membership Status - only show for non-admins */}
        {session.user.role !== "admin" && (
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Membership Status
          </h2>
          {membership && isActive ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status="active" size="lg" />
                <span className="text-zinc-700">
                  {remainingDays} {remainingDays === 1 ? "day" : "days"}{" "}
                  remaining
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status="expired" size="lg" />
                <span className="text-zinc-600 dark:text-zinc-300">
                  {membership
                    ? "Membership expired"
                    : "No active membership"}
                </span>
              </div>
              <Link
                href="/membership/purchase"
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
              >
                {membership ? "Renew Membership" : "Purchase Membership"}
              </Link>
            </div>
          )}
        </section>
        )}

        {/* Check-In Status */}
        {isCheckedInToday && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="text-sm font-semibold text-green-800">Checked In Today</p>
              <p className="text-xs text-green-600">You're on the track — enjoy your session!</p>
            </div>
          </div>
        )}

        {/* QR Code — always visible on mobile, toggle on desktop */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Check-In QR Code
            </h2>
            {qrResult.success && <QRToggleButton />}
          </div>
          <p className="text-sm text-zinc-500 mb-4">
            Show this to an admin to check in at the track.
          </p>
          {qrResult.success ? (
            <div className="flex justify-center md:hidden" id="qr-mobile">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <img
                  src={qrResult.data}
                  alt="Your QR Code"
                  width={220}
                  height={220}
                  className="h-auto w-full max-w-[220px]"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-600 text-center">Unable to load QR code. Visit your profile to retry.</p>
          )}
          {qrResult.success && (
            <div className="hidden" id="qr-desktop">
              <div className="flex justify-center">
                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                  <img
                    src={qrResult.data}
                    alt="Your QR Code"
                    width={220}
                    height={220}
                    className="h-auto w-full max-w-[220px]"
                  />
                </div>
              </div>
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
