import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRecentActivity } from "@/actions/admin/activity";
import ActivityTableClient from "./ActivityTableClient";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }

  // Fetch the latest 2000 activities using the heavily cached action
  const recentActivity = await getRecentActivity();

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl font-black shadow-sm shrink-0">
              📋
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                Global Activity Log
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Track all member purchases and track check-ins in real-time
              </p>
            </div>
          </div>
        </div>

        {/* Client Table with Search & Pagination */}
        <ActivityTableClient initialData={recentActivity} />

      </div>
    </div>
  );
}
