import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMembership, getRemainingDays } from "@/actions/membership";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
          d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm2.25-4.5h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm2.25-4.5h.008v.008H12.75v-.008Zm0 2.25h.008v.008H12.75v-.008Zm2.25-4.5h.008v.008H15v-.008Zm0 2.25h.008v.008H15v-.008ZM3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
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

  const result = await getMembership(session.user.id);
  const membership = result.success ? result.data : null;
  const isActive = membership?.status === "active";
  const remainingDays = membership && isActive ? getRemainingDays(membership) : 0;

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          {session.user.image && (
            <img
              src={session.user.image}
              alt=""
              className="h-14 w-14 rounded-full ring-2 ring-zinc-700"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {session.user.name?.split(" ")[0] ?? "Member"}
            </h1>
            <p className="text-sm text-zinc-400">Member Dashboard</p>
          </div>
        </div>

        {/* Membership Status */}
        <section className="rounded-xl bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Membership Status
          </h2>
          {membership && isActive ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status="active" size="lg" />
                <span className="text-zinc-300">
                  {remainingDays} {remainingDays === 1 ? "day" : "days"}{" "}
                  remaining
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status="expired" size="lg" />
                <span className="text-zinc-400">
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

        {/* QR Code Section */}
        <section className="rounded-xl bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            QR Code
          </h2>
          <p className="text-sm text-zinc-400">
            Use your QR code to check in at the track.
          </p>
          <Link
            href="/profile"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-amber-400 transition-colors hover:text-amber-300"
          >
            View your QR code
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
        </section>

        {/* Quick Links */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-2 rounded-xl bg-zinc-900 p-5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
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
