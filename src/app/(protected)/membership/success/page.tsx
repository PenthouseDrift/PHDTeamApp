import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMembership } from "@/actions/membership";

export const dynamic = "force-dynamic";

export default async function MembershipSuccessPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const result = await getMembership(session.user.id);
  const membership = result.success ? result.data : null;
  const isActive = membership?.status === "active";

  const expiryDate = membership
    ? new Date(membership.expiresAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg space-y-6">
        {isActive ? (
          <div className="rounded-xl bg-white p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <svg
                className="h-8 w-8 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">
              Payment Successful!
            </h1>
            <p className="text-zinc-600">
              Your membership is now active. Enjoy the track!
            </p>
            <div className="rounded-lg bg-zinc-100 p-4">
              <p className="text-sm text-zinc-500">Membership valid until</p>
              <p className="text-lg font-semibold text-amber-400">
                {expiryDate}
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <svg
                className="h-8 w-8 text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">
              Payment Processing
            </h1>
            <p className="text-zinc-600">
              Your payment is being processed. Your membership will be
              activated shortly.
            </p>
            <p className="text-sm text-zinc-500">
              This usually takes a few seconds. Refresh the page to check.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/membership/success"
                className="inline-flex items-center justify-center rounded-lg bg-zinc-700 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-600"
              >
                Refresh
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
