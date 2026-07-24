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
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-3.5 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="Penthouse Drift" className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <span className="font-bold tracking-tight text-base block text-zinc-900 dark:text-zinc-100 leading-tight">
                Penthouse Drift
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block leading-none font-medium">
                RC Track & Community Platform
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/signin"
              className="rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-sm"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center max-w-5xl mx-auto overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[320px] bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-amber-600/10 blur-3xl -z-10 rounded-full pointer-events-none" />

        {/* Feature badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-8 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          ✨ New: Gemini AI Tuning Advisor is Live
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight leading-[1.1]">
          The Ultimate Platform for <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 bg-clip-text text-transparent">
            RC Drift Enthusiasts
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto leading-relaxed">
          Manage your drift garage, calculate gear ratios, generate AI-powered setup calibrations for track surfaces, showcase custom body shells, and check in instantly at the track.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signin"
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 text-base font-bold text-black shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400 transition-all transform hover:-translate-y-0.5"
          >
            Join the Community →
          </Link>
          <Link
            href="#features"
            className="w-full sm:w-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 px-6 py-3.5 text-base font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Explore Features
          </Link>
        </div>

        {/* Stats counter */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-zinc-200 dark:border-zinc-800/80 pt-10 text-center max-w-3xl mx-auto">
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-500">AI</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Tuning Advisor</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">QR</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Track Check-In</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">FDR</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Gear Ratio Engine</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-500">🏆</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Shell Showcase</p>
          </div>
        </div>
      </section>

      {/* ── AI Feature Spotlight ────────────────────────────────────────────── */}
      <section className="px-6 py-10 max-w-6xl mx-auto">
        <div className="relative rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-zinc-900/5 dark:to-zinc-900/40 p-8 sm:p-12 overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4 text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold px-3 py-1">
                🤖 POWERED BY GEMINI AI
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                AI Calibration Assistant & Surface Tuning
              </h2>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Struggling with grip on P-tile, concrete, or carpet? Select your car calibration, choose your track surface (including our custom <strong className="text-amber-600 dark:text-amber-400">PHD Track P-Tile</strong>), pick your target goals (More Grip, Better Handling, Exit Speed), and receive instant AI recommendations. Save advised setups directly to your garage with one click.
              </p>
              <div className="pt-2 flex flex-wrap gap-2 text-xs font-medium">
                {["🏆 PHD Track P-Tile", "🔥 More Grip", "🎯 Better Handling", "🔄 Cornering Speed", "🚀 Exit Speed"].map((tag) => (
                  <span key={tag} className="rounded-lg bg-white/80 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Tuning Recommendation</span>
                <span className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 font-bold px-2 py-0.5 rounded-full">HIGH IMPACT</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">Front Oil Weight</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">350cSt → <strong className="text-amber-500">250cSt</strong></span>
                </div>
                <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">Front Droop</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">4.0mm → <strong className="text-amber-500">7.5mm</strong></span>
                </div>
                <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-200">Gyro Gain</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">65% → <strong className="text-amber-500">78%</strong></span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic pt-1">
                "Softer front dampening and elevated droop increases front traction on PHD P-Tile surface for sharper corner entry."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Cards Grid ──────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-16 max-w-6xl mx-auto space-y-10">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Everything You Need for Track Day & Tuning
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            A complete suite of tools designed specifically for RC drift drivers and track members.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <FeatureCard
            icon="🎛️"
            title="AI Tuning Advisor"
            description="Generate track-specific calibration recommendations based on surface type (P-Tile, Carpet, Concrete) and your target driving style."
            badge="Gemini AI"
          />

          <FeatureCard
            icon="🏎️"
            title="My Cars Garage"
            description="Manage chassis profiles with multi-image galleries, active cover photo selection, and full calibration setup logs."
          />

          <FeatureCard
            icon="📱"
            title="Digital Member Passes"
            description="Purchase memberships or track passes, track expiration dates, and scan your personal QR code for instant check-in."
          />

          <FeatureCard
            icon="📐"
            title="Setup Calibrations"
            description="Log camber, toe, caster, ackermann, droop (up to 50mm), oil weight/brand, piston holes, shock length, O-rings, and expo settings."
          />

          <FeatureCard
            icon="⚙️"
            title="FDR & Gear Calculator"
            description="Calculate Final Drive Ratio (FDR), spur/pinion gear combinations, and internal ratios on the fly for optimal gearing."
          />

          <FeatureCard
            icon="🎨"
            title="Shell Showcase"
            description="Share custom body shell builds, vote on community favorites, and compete for top honors on the weekly winners leaderboard."
          />

          <FeatureCard
            icon="📰"
            title="Track Newsfeed"
            description="Stay connected with real-time track announcements, event schedules, community posts, and official updates."
          />

          <FeatureCard
            icon="💳"
            title="SumUp Pass Top-Ups"
            description="Seamlessly purchase day passes and track rentals with secure SumUp merchant integration and live pass balances."
          />
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 text-white p-10 sm:p-14 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to Dial In Your Drift Machine?
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Join the Penthouse Drift community today. Track your setups, optimize your gearing, and push your drift lines to the limit.
          </p>
          <div className="pt-2">
            <Link
              href="/auth/signin"
              className="inline-block rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 text-base font-bold text-black shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 transition-all transform hover:-translate-y-0.5"
            >
              Join the Community
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-6 py-8 border-t border-zinc-200 dark:border-zinc-800/80 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-col sm:flex-row items-center justify-between max-w-6xl mx-auto gap-4">
          <div className="flex items-center gap-2">
            <img src="/icons/icon-192.png" alt="Penthouse Drift" className="h-5 w-5" />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Penthouse Drift</span>
          </div>
          <p>© {new Date().getFullYear()} Penthouse Drift. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="relative rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 space-y-3 hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all duration-200 hover:shadow-lg dark:hover:shadow-amber-500/5 group flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-3xl block">{icon}</span>
          {badge && (
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2.5 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-500 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
