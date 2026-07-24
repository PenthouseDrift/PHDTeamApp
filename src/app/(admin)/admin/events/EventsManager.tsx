"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  createEvent,
  cancelEvent,
  uncancelEvent,
  deleteEvent,
  saveExistingEventAsTemplate,
  deleteEventTemplate,
  saveEventTemplate,
  type TrackEvent,
  type EventTemplate,
} from "@/actions/events";
import ImageUploader from "@/components/ui/ImageUploader";

interface EventsManagerProps {
  events: TrackEvent[];
  templates: EventTemplate[];
}

export function EventsManager({ events, templates }: EventsManagerProps) {
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [showTemplatesSection, setShowTemplatesSection] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saveAsTemplateChecked, setSaveAsTemplateChecked] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function applyTemplate(tpl: EventTemplate) {
    setTitle(tpl.title);
    setDescription(tpl.description);
    setTime(tpl.time || "18:00");
    setImageUrl(tpl.imageUrl || "");
    setShowForm(true);
    setFeedback(`Loaded template "${tpl.title}"`);
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;

    startTransition(async () => {
      const result = await createEvent({ title, description, date, time, imageUrl: imageUrl || undefined }, session.user.id);
      if (result.success) {
        if (saveAsTemplateChecked) {
          await saveEventTemplate(
            { title, description, time, imageUrl: imageUrl || undefined },
            session.user.id
          );
        }

        setTitle("");
        setDescription("");
        setDate("");
        setTime("");
        setImageUrl("");
        setSaveAsTemplateChecked(false);
        setShowForm(false);
        setFeedback("Event created!");
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  function handleSaveEventAsTemplate(eventId: string, eventTitle: string) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const res = await saveExistingEventAsTemplate(eventId, session.user.id);
      if (res.success) {
        setFeedback(`Saved "${eventTitle}" as reusable template!`);
        setTimeout(() => setFeedback(null), 3500);
      }
    });
  }

  function handleDeleteTemplate(templateId: string) {
    startTransition(async () => {
      await deleteEventTemplate(templateId);
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
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-2.5 text-xs font-semibold text-green-700 dark:text-green-300">
          {feedback}
        </div>
      )}

      {/* Action Bar & Quick Template Dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!showForm ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition-colors shadow-sm"
            >
              + Create New Event
            </button>

            {templates.length > 0 && (
              <button
                onClick={() => setShowTemplatesSection(!showTemplatesSection)}
                className="rounded-xl bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                📋 {showTemplatesSection ? "Hide Saved Templates" : `Saved Templates (${templates.length})`}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Close Form
          </button>
        )}
      </div>

      {/* Saved Templates Quick Select Grid */}
      {(showTemplatesSection || (showForm && templates.length > 0)) && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <span>📋</span> Reusable Saved Event Templates
            </h3>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Click template to populate event form</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((tpl) => (
              <div
                key={tpl.templateId}
                className="group relative rounded-xl bg-white dark:bg-zinc-900 border border-amber-500/30 p-3.5 flex flex-col justify-between space-y-2 hover:border-amber-500 transition-all shadow-sm"
              >
                <div className="space-y-2">
                  {tpl.imageUrl && (
                    <img
                      src={tpl.imageUrl}
                      alt={tpl.title}
                      className="h-24 w-full rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-800 mb-1"
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-500">{tpl.time}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.templateId)}
                      title="Delete template"
                      className="text-[10px] text-zinc-400 hover:text-red-500 font-semibold"
                    >
                      ✕ Delete
                    </button>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{tpl.title}</h4>
                  {tpl.description && (
                    <p className="text-[11px] text-zinc-500 line-clamp-2">{tpl.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="w-full py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-extrabold hover:bg-amber-500/30 transition-colors text-center mt-1"
                >
                  ⚡ Use This Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Event Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>📅</span> Create Track Event
            </h2>

            {/* Template Selector dropdown */}
            {templates.length > 0 && (
              <select
                onChange={(e) => {
                  const selectedTpl = templates.find((t) => t.templateId === e.target.value);
                  if (selectedTpl) applyTemplate(selectedTpl);
                  e.target.value = "";
                }}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 focus:outline-none"
              >
                <option value="">📋 Load Template...</option>
                {templates.map((t) => (
                  <option key={t.templateId} value={t.templateId}>
                    {t.title} ({t.time})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Event Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunday Track Battle & Tuning Session"
              required
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter event details, schedule, track rules, or requirements..."
              rows={3}
              className="w-full resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Start Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Event Image (Optional)
            </label>
            <ImageUploader
              maxFiles={1}
              maxSizeMB={5}
              initialUrls={imageUrl ? [imageUrl] : []}
              onUploadComplete={(urls) => setImageUrl(urls[0] || "")}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="save-template-check"
              type="checkbox"
              checked={saveAsTemplateChecked}
              onChange={(e) => setSaveAsTemplateChecked(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-500"
            />
            <label htmlFor="save-template-check" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              💾 Save this event configuration as a reusable template for future events
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-md"
            >
              {isPending ? "Creating Event..." : "Publish Event"}
            </button>
          </div>
        </form>
      )}

      {/* Events List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Scheduled & Recent Events</h2>

        {events.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming events scheduled.</p>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.eventId}
              className={`rounded-2xl border p-5 shadow-sm transition-all ${
                event.status === "cancelled"
                  ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 min-w-0">
                  {event.imageUrl && (
                    <img src={event.imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0 ring-1 ring-zinc-200 dark:ring-zinc-700" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-500">{event.date} • {event.time}</span>
                      {event.status === "cancelled" && (
                        <span className="rounded bg-red-500/20 text-red-600 dark:text-red-400 px-2 py-0.5 text-[10px] font-black uppercase">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{event.title}</h3>
                    {event.description && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">{event.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                  {/* Save as Template Button */}
                  <button
                    type="button"
                    onClick={() => handleSaveEventAsTemplate(event.eventId, event.title)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                  >
                    💾 Save as Template
                  </button>

                  {event.status === "upcoming" ? (
                    <button
                      onClick={() => handleCancel(event.eventId)}
                      disabled={isPending}
                      className="text-xs font-semibold px-2.5 py-1.5 text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUncancel(event.eventId)}
                      disabled={isPending}
                      className="text-xs font-semibold px-2.5 py-1.5 text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(event.eventId)}
                    disabled={isPending}
                    className="text-xs font-semibold px-2.5 py-1.5 text-zinc-400 hover:text-red-600 disabled:opacity-50"
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
