import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-dvh bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-lg font-bold text-white">Penthouse Drift</span>
        {isLoggedIn ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Sign In
          </Link>
        )}
      </header>

      {/* Hero */}
      <section className="px-6 py-20 sm:py-32 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl sm:text-7xl font-bold text-white tracking-tight">
          Penthouse Drift
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto">
          The home of RC drifting. Track your builds, share calibration setups,
          showcase your shells, and check in at the track — all in one place.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-amber-500 px-8 py-3 text-lg font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Enter the Track
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-full bg-amber-500 px-8 py-3 text-lg font-semibold text-black transition-colors hover:bg-amber-400"
            >
              Join the Community
            </Link>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            title="Membership & QR Check-In"
            description="Purchase your track membership and check in instantly with your personal QR code."
          />
          <FeatureCard
            title="Car Profiles & Calibrations"
            description="Track all your RC drift cars with photos, calibration setups, and gear ratios."
          />
          <FeatureCard
            title="Shell Showcase"
            description="Show off your custom shell designs, vote on community builds, and win weekly awards."
          />
        </div>
      </section>

      {/* Newsfeed Coming Soon */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <h2 className="text-xl font-bold text-white">Newsfeed</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Coming soon — stay tuned for live updates from the track.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-zinc-800 text-center">
        <p className="text-sm text-zinc-500">
          © {new Date().getFullYear()} Penthouse Drift. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 p-6 space-y-3">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
