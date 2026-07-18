import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  // If already logged in, go straight to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <img src="/logo.png" alt="Penthouse Drift" className="h-10 w-auto" />
        <Link
          href="/auth/signin"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <section className="px-6 py-20 sm:py-32 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl sm:text-7xl font-bold text-zinc-900 tracking-tight">
          Penthouse Drift
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto">
          The home of RC drifting. Track your builds, share calibration setups,
          showcase your shells, and check in at the track — all in one place.
        </p>
        <div className="mt-10">
          <Link
            href="/auth/signin"
            className="rounded-full bg-amber-500 px-8 py-3 text-lg font-semibold text-black transition-colors hover:bg-amber-400"
          >
            Join the Community
          </Link>
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
        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-8 text-center">
          <h2 className="text-xl font-bold text-zinc-900">Newsfeed</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Coming soon — stay tuned for live updates from the track.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-zinc-200 text-center">
        <p className="text-sm text-zinc-400">
          © {new Date().getFullYear()} Penthouse Drift. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-6 space-y-3">
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm text-zinc-600 leading-relaxed">{description}</p>
    </div>
  );
}
