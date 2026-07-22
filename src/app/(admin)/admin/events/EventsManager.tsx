"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { createEvent, cancelEvent, uncancelEvent, deleteEvent, type TrackEvent } from "@/actions/events";
import ImageUploader from "@/components/ui/ImageUploader";

interface EventsManagerProps {
  events: TrackEvent[];
}

export function EventsManager({ events }: EventsManagerProps) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;

    startTransition(async () => {
      const result = await createEvent({ title, description, date, time, imageUrl: imageUrl || undefined }, session.user.id);
      if (result.success) {
        setTitle("");
        setDescription("");
        setDate("");
        setTime("");
        setImageUrl("");
        setShowForm(false);
        setFeedback("Event created!");
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  function handleCancel(eventId: string) {
    startTransition(async () => { await cancelEvent(eventId); });
  }

  function handleUncancel(eventId: string) {
    startTransition(async () => { await uncancelEvent(eventId); });
  }

  function handleDelete(eventId: string) {
    startTransition(async () => { await deleteEvent(eventId); });
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          {feedback}
        </div>
      )}

      {/* Create button */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
        >
          + Create Event
        </button>
      ) : (
        <form onSubmit={handleCreate} className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={new Date().toISOString().split("T")[0]}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Event Image (optional)
            </label>
            <ImageUploader
              maxFiles={1}
              maxSizeMB={5}
              onUploadComplete={(urls) => setImageUrl(urls[0] || "")}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {isPending ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      )}

      {/* Events list */}
      <div className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">No upcoming events.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.eventId}
              className={`rounded-xl border p-4 ${
                event.status === "cancelled"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0">
                  {event.imageUrl && (
                    <img src={event.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-600">{event.date} • {event.time}</p>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{event.title}</h3>
                    {event.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{event.description}</p>
                  )}
                  {event.status === "cancelled" && (
                    <span className="inline-block mt-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 uppercase">
                      Cancelled
                    </span>
                  )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {event.status === "upcoming" ? (
                    <button
                      onClick={() => handleCancel(event.eventId)}
                      disabled={isPending}
                      className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUncancel(event.eventId)}
                      disabled={isPending}
                      className="text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(event.eventId)}
                    disabled={isPending}
                    className="text-xs font-medium text-zinc-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
