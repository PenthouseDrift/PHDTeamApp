"use client";

import { useState, useTransition } from "react";
import { sendGlobalNotification, sendTestNotificationToAdmin } from "@/actions/notifications";

export function GlobalNotificationForm({ adminId }: { adminId: string }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/notifications");
  const [isPending, startTransition] = useTransition();
  const [isTesting, setIsTesting] = useState(false);
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

  async function handleTestLocalAlert() {
    if (!title.trim() || !message.trim()) {
      setError("Please fill out Notification Title and Message Body first to test your alert.");
      return;
    }

    setSuccess(null);
    setError(null);
    setIsTesting(true);

    try {
      // 1. Check browser Notification permissions
      if ("Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission();
      }

      // 2. Dispatch Web Push with current form inputs to admin's subscriptions
      const res = await sendTestNotificationToAdmin(
        {
          title: title.trim(),
          message: message.trim(),
          url: url.trim() || "/notifications",
        },
        adminId
      );

      if (res.success) {
        setSuccess(`🧪 Test alert "${title.trim()}" successfully pinged to your device!`);
      } else {
        setError(res.error ?? "Failed to send test alert");
      }
    } catch (err) {
      console.error("Local test alert error:", err);
      setError(err instanceof Error ? err.message : "Test alert failed");
    } finally {
      setIsTesting(false);
    }
  }

  const isFormValid = title.trim().length > 0 && message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-sm">
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
        <span>📢</span> Send Global Broadcast Notification
      </h2>

      {success && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-xs font-semibold text-green-700 dark:text-green-300 flex items-center justify-between">
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
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

      {/* Live Notification Banner Preview */}
      {isFormValid && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 p-3.5 space-y-1.5 shadow-xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <span>👁️</span> Notification Preview (Lock Screen / OS Banner)
          </p>
          <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{title.trim()}</span>
              <span className="text-[10px] text-zinc-400 font-mono">Just now</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">{message.trim()}</p>
            <p className="text-[10px] text-zinc-400 font-mono pt-1">Link: {url.trim() || "/notifications"}</p>
          </div>
        </div>
      )}

      {/* Dual Action Buttons */}
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleTestLocalAlert}
          disabled={isPending || isTesting || !isFormValid}
          className="rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-amber-500/15 dark:hover:bg-amber-500/15 border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span>🧪</span>
          <span>{isTesting ? "Pinging Your Device..." : "Test Alert on My Device First"}</span>
        </button>

        <button
          type="submit"
          disabled={isPending || isTesting || !isFormValid}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-bold text-black shadow-md hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          <span>📢</span>
          <span>{isPending ? "Broadcasting..." : "Broadcast to All Members"}</span>
        </button>
      </div>
    </form>
  );
}
