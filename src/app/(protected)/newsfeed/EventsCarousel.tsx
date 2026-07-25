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

  function isToday(date: string): boolean {
    const today = new Date();
    const d = new Date(date + "T00:00:00");
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          Upcoming Events
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {events.map((event) => {
            const today = isToday(event.date);
            const cancelled = event.status === "cancelled";
            return (
              <button
                key={event.eventId}
                onClick={() => setSelectedEvent(event)}
                className={`shrink-0 w-52 rounded-xl text-left border transition-all hover:shadow-md overflow-hidden ${
                  cancelled
                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : today
                    ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/40 dark:ring-amber-500/30 shadow-md shadow-amber-100 dark:shadow-amber-900/20"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {/* Happening Today banner */}
                {today && !cancelled && (
                  <div className="flex items-center gap-1.5 bg-amber-500 px-3 py-1.5">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span className="text-[10px] font-black text-black uppercase tracking-widest">
                      Happening Today
                    </span>
                  </div>
                )}

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
                  <p className={`text-xs font-medium ${today ? "text-amber-700 dark:text-amber-400 font-bold" : "text-amber-600 dark:text-amber-400"}`}>
                    {formatDate(event.date)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                    {event.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{event.time}</p>
                  {cancelled && (
                    <span className="mt-2 inline-block rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400 uppercase">
                      Cancelled
                    </span>
                  )}
                </div>
              </button>
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
            {/* Today banner in modal */}
            {isToday(selectedEvent.date) && selectedEvent.status !== "cancelled" && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-3 py-2 flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">This event is happening today!</span>
              </div>
            )}
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
                className="w-full rounded-lg object-cover"
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
