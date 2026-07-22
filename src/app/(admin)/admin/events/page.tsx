import { getUpcomingEvents } from "@/actions/events";
import { EventsManager } from "./EventsManager";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const events = await getUpcomingEvents();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Events Management</h1>
        <p className="text-sm text-zinc-500 mt-1">Create and manage upcoming track events.</p>
      </div>
      <EventsManager events={events} />
    </div>
  );
}
