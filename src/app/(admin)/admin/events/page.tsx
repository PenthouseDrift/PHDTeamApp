import { getUpcomingEvents, getEventTemplates } from "@/actions/events";
import { EventsManager } from "./EventsManager";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const [events, templates] = await Promise.all([
    getUpcomingEvents(),
    getEventTemplates(),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Events Management</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Create, manage, and save reusable event templates for track announcements.
        </p>
      </div>
      <EventsManager events={events} templates={templates} />
    </div>
  );
}
