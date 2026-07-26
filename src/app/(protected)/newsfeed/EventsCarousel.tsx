"use client";

import { useState } from "react";
import type { TrackEvent } from "@/actions/events";
import { getEventTiming } from "@/lib/event-utils";
import { EventRSVPSection } from "@/components/EventRSVPSection";
import { QuickRSVPButton } from "@/components/QuickRSVPButton";

interface EventsCarouselProps {
  events: TrackEvent[];
}

export function EventsCarousel({ events }: EventsCarouselProps) {
  const [selectedEvent, setSelectedEvent] = useState<TrackEvent | null>(null);

  function formatDate(date: string): string {
    return new Date(date + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function fmt12(time: string): string {
    if (!time) return "";
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function formatTimes(event: TrackEvent): string {
    if (event.openTime) {
      return event.closeTime
        ? `${fmt12(event.openTime)} – ${fmt12(event.closeTime)}`
        : `Opens: ${fmt12(event.openTime)}`;
    }
    return event.time ? fmt12(event.time) : "";
  }

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          Upcoming &amp; Track Events
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {events.map((event) => {
            const timing = getEventTiming(event);
            const timesText = formatTimes(event);

            return (
              <div
                key={event.eventId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedEvent(event)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedEvent(event);
                  }
                }}
                className={`shrink-0 w-52 rounded-xl text-left border transition-all hover:shadow-md overflow-hidden cursor-pointer ${
                  timing.state === "cancelled"
                    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 opacity-80"
                    : timing.state === "happening_now"
                    ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-400/40 dark:ring-emerald-500/30 shadow-md"
                    : timing.state === "today"
                    ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/40 dark:ring-amber-500/30 shadow-md"
                    : timing.state === "finished"
                    ? "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-75"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {/* Event Timing Banner */}
                {timing.state !== "upcoming" && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 ${timing.badgeBg}`}>
                    {timing.dotColor && (
                      <span className="flex h-2 w-2 relative">
                        {timing.animateDot && (
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${timing.dotColor} opacity-75`} />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${timing.dotColor}`} />
                      </span>
                    )}
                    <span className={`text-[10px] ${timing.badgeText} uppercase tracking-widest`}>
                      {timing.label}
                    </span>
                  </div>
                )}

                {event.imageUrl && (
                  <div className="w-full h-28 overflow-hidden relative">
                    <img
                      src={event.imageUrl}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {formatDate(event.date)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                      {event.title}
                    </p>
                    {timesText && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{timesText}</p>
                    )}
                  </div>
                  <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <QuickRSVPButton eventId={event.eventId} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSelectedEvent(null)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md" />
          <div
            className="relative w-full max-w-md my-auto max-h-[85dvh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const timing = getEventTiming(selectedEvent);
              return (
                <div className={`rounded-xl px-3.5 py-2.5 flex items-center gap-2 ${timing.badgeBg}`}>
                  {timing.dotColor && (
                    <span className="flex h-2.5 w-2.5 relative">
                      {timing.animateDot && (
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${timing.dotColor} opacity-75`} />
                      )}
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${timing.dotColor}`} />
                    </span>
                  )}
                  <span className={`text-xs uppercase tracking-wider ${timing.badgeText}`}>
                    {timing.label === "Happening Now"
                      ? "🔴 EVENT IS HAPPENING NOW AT THE TRACK!"
                      : timing.label === "Happening Today"
                      ? "📅 EVENT IS HAPPENING TODAY!"
                      : timing.label === "Finished" || timing.label === "Finished Today"
                      ? "🏁 EVENT HAS FINISHED"
                      : timing.label}
                  </span>
                </div>
              );
            })()}

            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {formatDate(selectedEvent.date)}
              </p>
              {formatTimes(selectedEvent) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{formatTimes(selectedEvent)}</p>
              )}
              <h3 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {selectedEvent.title}
              </h3>
            </div>
            {selectedEvent.description && (
              <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                {selectedEvent.description}
              </p>
            )}
            {selectedEvent.imageUrl && (
              <img
                src={selectedEvent.imageUrl}
                alt={selectedEvent.title}
                className="w-full rounded-lg object-cover"
              />
            )}

            {/* Event RSVP & Attendees */}
            <EventRSVPSection eventId={selectedEvent.eventId} />

            <button
              onClick={() => setSelectedEvent(null)}
              className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
