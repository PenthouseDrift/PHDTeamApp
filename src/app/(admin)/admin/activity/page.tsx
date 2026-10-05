import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  const sections = [
    {
      title: "Activity Log",
      description: "Every member purchase and track check-in, searchable in real-time",
      href: "/admin/activity/log",
      icon: "📋",
      color: "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Revenue",
      description: "Monthly online and in-person takings, with per-day breakdowns",
      href: "/admin/activity/revenue",
      icon: "💰",
      color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Check-In History",
      description: "See who attended the track on previous days",
      href: "/admin/history",
      icon: "🗓️",
      color: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>←</span> Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Reports</h1>
        </div>

        {/* Section cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-amber-500/50 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl ${s.color}`}>
                {s.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-base font-bold text-zinc-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-500">
                  {s.title}
                </h2>
                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {s.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
