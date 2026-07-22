"use client";

import { useState } from "react";
import type { TrackEvent } from "@/actions/events";

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

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          Upcoming Events
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {events.map((event) => (
            <button
              key={event.eventId}
              onClick={() => setSelectedEvent(event)}
              className={`shrink-0 w-52 rounded-xl text-left border transition-shadow hover:shadow-md overflow-hidden ${
                event.status === "cancelled"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              {event.imageUrl && (
                <div className="w-full h-28 overflow-hidden">
                  <img
                    src={event.imageUrl}
                    alt={event.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-3">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {formatDate(event.date)}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                  {event.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{event.time}</p>
                {event.status === "cancelled" && (
                  <span className="mt-2 inline-block rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400 uppercase">
                    Cancelled
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedEvent.status === "cancelled" && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-center">
                <span className="text-sm font-bold text-red-700 dark:text-red-400">EVENT CANCELLED</span>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {formatDate(selectedEvent.date)} • {selectedEvent.time}
              </p>
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
                className="w-full rounded-lg object-cover max-h-64"
              />
            )}
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
