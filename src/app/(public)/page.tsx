import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-zinc-950 px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight">
          Penthouse Drift
        </h1>
        <p className="text-lg sm:text-xl text-zinc-400 max-w-md mx-auto">
          The ultimate RC drift community platform. Track your builds, showcase
          your rides, and connect with fellow drifters.
        </p>
        <Link
          href="/auth/signin"
          className="inline-flex items-center justify-center rounded-full bg-white text-zinc-900 font-semibold px-8 py-3 text-lg transition-colors hover:bg-zinc-200"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
