"use client";

import { useState, useTransition } from "react";
import { sendGlobalNotification } from "@/actions/notifications";

export function GlobalNotificationForm({ adminId }: { adminId: string }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/notifications");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSuccess(null);
    setError(null);

    startTransition(async () => {
      const res = await sendGlobalNotification(
        { title: title.trim(), message: message.trim(), url: url.trim() },
        adminId
      );

      if (res.success) {
        setSuccess(`Successfully broadcast notification to ${res.data.count} members!`);
        setTitle("");
        setMessage("");
        setUrl("/notifications");
      } else {
        setError(res.error ?? "Failed to send global notification");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <span>📢</span> Send Global Broadcast Notification
      </h2>

      {success && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-xs font-semibold text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Notification Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 🏁 Track Event Today! or ⚠️ Track Maintenance Update"
          required
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Message Body
        </label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter the broadcast message to deliver to all track members..."
          required
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Target Click URL (Optional)
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/newsfeed or /showcase or /wallet"
          className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !title.trim() || !message.trim()}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-bold text-black shadow-md hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
      >
        {isPending ? "Broadcasting to Members..." : "📢 Trigger Global Notification to All Members"}
      </button>
    </form>
  );
}
