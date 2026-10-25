import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUpcomingEvents, getBulkEventRSVPs } from "@/actions/events";
import { EventCard } from "@/components/dashboard2/EventCards";

export const dynamic = "force-dynamic";

/**
 * Full events page for the /dashboard2 option. Shows every upcoming track
 * event with the real RSVP control. Part of the new-dashboard experiment; the
 * classic dashboard has no equivalent page.
 */
export default async function Dashboard2EventsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const events = await getUpcomingEvents();
  const rsvps = await getBulkEventRSVPs(
    events.map((e) => e.eventId),
    session.user.id
  );

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href="/dashboard2"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span>←</span> Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Track events</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Official drift sessions &amp; track days. Tap RSVP to let us know you&apos;re coming.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No upcoming events scheduled
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Check back soon for new track sessions.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.eventId} event={event} rsvp={rsvps[event.eventId]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
