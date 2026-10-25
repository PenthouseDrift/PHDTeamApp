import Link from "next/link";
import Image from "next/image";
import type { TrackEvent, EventRSVPData } from "@/actions/events";
import { getEventTiming } from "@/lib/event-utils";
import { QuickRSVPButton } from "@/components/QuickRSVPButton";

/**
 * Event UI for the /dashboard2 option. Reuses the real timing logic
 * (getEventTiming) and the real RSVP control (QuickRSVPButton) so behaviour
 * matches the classic dashboard — only the presentation is new:
 *  - EventCard: large card (used for the featured "next event" + the full page)
 *  - EventRow: compact one-line row for the rest of the list
 *  - EventsSection: the dashboard home block (next event + a short list)
 */

function eventDateParts(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { day: "", month: "", weekday: "" };
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  return {
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }),
    weekday: fmt({ weekday: "short" }),
  };
}

function eventTimeLabel(event: TrackEvent): string {
  return event.openTime && event.closeTime ? `${event.openTime} - ${event.closeTime}` : event.time;
}

/** The first event that is still relevant (live, today or in the future). */
export function pickNextEvent(events: TrackEvent[]): TrackEvent | null {
  return (
    events.find((e) => {
      const state = getEventTiming(e).state;
      return state === "happening_now" || state === "today" || state === "upcoming";
    }) ?? null
  );
}

function TimingBadge({ event }: { event: TrackEvent }) {
  const timing = getEventTiming(event);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${timing.badgeBg} ${timing.badgeText}`}
    >
      {timing.dotColor && (
        <span className={`h-1.5 w-1.5 rounded-full ${timing.dotColor} ${timing.animateDot ? "animate-pulse" : ""}`} />
      )}
      {timing.label}
    </span>
  );
}

export function EventCard({ event, rsvp }: { event: TrackEvent; rsvp?: EventRSVPData }) {
  const timing = getEventTiming(event);
  const { weekday, day, month } = eventDateParts(event.date);
  const canRsvp = timing.state !== "finished" && timing.state !== "cancelled";
  const timeLabel = eventTimeLabel(event);

  const frame =
    timing.state === "happening_now"
      ? "border-emerald-400 ring-1 ring-emerald-400/40 dark:border-emerald-500"
      : timing.state === "today"
      ? "border-amber-400 dark:border-amber-500"
      : "border-zinc-200 dark:border-zinc-800";

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900 ${frame} ${
        timing.state === "finished" || timing.state === "cancelled" ? "opacity-75" : ""
      }`}
    >
      {event.imageUrl && (
        <div className="relative h-36 w-full bg-zinc-100 dark:bg-zinc-800">
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <TimingBadge event={event} />
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {weekday} {day} {month}
          </span>
        </div>
        <h3 className="text-base font-black leading-tight text-zinc-900 dark:text-zinc-100">{event.title}</h3>
        {timeLabel && (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{timeLabel}</p>
        )}
        {event.description && (
          <p className="line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
            {event.description}
          </p>
        )}
        {canRsvp && (
          <div className="pt-1">
            <QuickRSVPButton eventId={event.eventId} initialRsvpData={rsvp} />
          </div>
        )}
      </div>
    </article>
  );
}

export function EventRow({ event, rsvp }: { event: TrackEvent; rsvp?: EventRSVPData }) {
  const timing = getEventTiming(event);
  const { day, month } = eventDateParts(event.date);
  const canRsvp = timing.state !== "finished" && timing.state !== "cancelled";
  const timeLabel = eventTimeLabel(event);

  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 ${
        timing.state === "finished" || timing.state === "cancelled" ? "opacity-60" : ""
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
        <span className="text-sm font-black leading-none text-zinc-900 dark:text-zinc-100">{day}</span>
        <span className="text-[9px] font-bold uppercase text-zinc-500 dark:text-zinc-400">{month}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{event.title}</p>
        <p className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {timeLabel && <span>{timeLabel}</span>}
          {(timing.state === "cancelled" || timing.state === "happening_now" || timing.state === "today") && (
            <TimingBadge event={event} />
          )}
        </p>
      </div>
      {canRsvp && <QuickRSVPButton eventId={event.eventId} initialRsvpData={rsvp} />}
    </li>
  );
}

/** Dashboard home block: the next event up front, then a short compact list. */
export function EventsSection({
  events,
  rsvps,
  maxListed = 3,
}: {
  events: TrackEvent[];
  rsvps: Record<string, EventRSVPData>;
  maxListed?: number;
}) {
  const featured = pickNextEvent(events);
  const rest = events.filter((e) => e.eventId !== featured?.eventId);
  const listed = rest.slice(0, maxListed);
  const hiddenCount = rest.length - listed.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Track events
        </h2>
        {events.length > 0 && (
          <Link
            href="/dashboard2/events"
            className="text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400"
          >
            View all →
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No upcoming events scheduled</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Check back soon for new track sessions.
          </p>
        </div>
      ) : (
        <>
          {featured && <EventCard event={featured} rsvp={rsvps[featured.eventId]} />}
          {listed.length > 0 && (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {listed.map((e) => (
                <EventRow key={e.eventId} event={e} rsvp={rsvps[e.eventId]} />
              ))}
              {hiddenCount > 0 && (
                <li className="px-3 py-2 text-center">
                  <Link
                    href="/dashboard2/events"
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    +{hiddenCount} more
                  </Link>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
