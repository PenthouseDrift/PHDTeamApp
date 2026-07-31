import Link from "next/link";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Suspense } from "react";
import { getUpcomingEvents, getEventTemplates } from "@/actions/events";
import { EventsManager } from "./EventsManager";

export const dynamic = "force-dynamic";

export default function AdminEventsPage() {
  return (
    <PullToRefresh>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-amber-500 transition-colors mb-1"
        >
          ← Back to Admin Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Events Management</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Create, manage, and save reusable event templates for track announcements.
        </p>
      </div>
      <Suspense fallback={<EventsSkeleton />}>
        <EventsData />
      </Suspense>
      </div>
    </PullToRefresh>
  );
}

async function EventsData() {
  const [events, templates] = await Promise.all([
    getUpcomingEvents(),
    getEventTemplates(),
  ]);

  return <EventsManager events={events} templates={templates} />;
}

function EventsSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-4">
      <div className="flex justify-end">
        <div className="h-10 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <div className="h-20 w-20 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <div className="flex-1 space-y-3 py-1">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                  <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </div>
                <div className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg shrink-0" />
              </div>
              <div className="h-3 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
