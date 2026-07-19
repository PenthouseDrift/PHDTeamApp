"use client";

import { useState, useTransition } from "react";
import type { CheckInEntry } from "@/actions/admin/checkins";
import { addNonMemberCheckIn, removeCheckIn } from "@/actions/admin/checkins";
import { useSession } from "next-auth/react";

interface TodayCheckInsProps {
  checkIns: CheckInEntry[];
}

export function TodayCheckIns({ checkIns }: TodayCheckInsProps) {
  const { data: session } = useSession();
  const [guestName, setGuestName] = useState("");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !session?.user?.id) return;

    setAdding(true);
    setFeedback(null);

    const result = await addNonMemberCheckIn(guestName.trim(), session.user.id);
    if (result.success) {
      setFeedback(`${guestName.trim()} added to today's check-ins`);
      setGuestName("");
    } else {
      setFeedback(result.error);
    }
    setAdding(false);
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleRemove(index: number) {
    startTransition(async () => {
      const result = await removeCheckIn(index);
      if (result.success) {
        setFeedback("Check-in removed");
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(result.error);
      }
      setConfirmRemoveIndex(null);
    });
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Checked In Today
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5">
            {checkIns.length}
          </span>
        </h2>
      </div>

      {/* Add non-member / guest */}
      <form onSubmit={handleAddGuest} className="flex gap-2 mb-4">
        <input
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Add person manually (name)..."
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <button
          type="submit"
          disabled={!guestName.trim() || adding}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {feedback && (
        <p className="text-sm text-green-700 dark:text-green-400 mb-3">{feedback}</p>
      )}

      {checkIns.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">No one checked in yet today.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {checkIns.map((entry, i) => (
            <div
              key={`${entry.userId}-${i}`}
              className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.memberName}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="capitalize">{entry.method}</span>
                  <span>•</span>
                  <span>{formatTime(entry.timestamp)}</span>
                </div>
                <button
                  onClick={() => setConfirmRemoveIndex(i)}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                  aria-label={`Remove ${entry.memberName}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two-step removal confirmation */}
      {confirmRemoveIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmRemoveIndex(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Remove Check-In</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Remove <strong>{checkIns[confirmRemoveIndex]?.memberName}</strong> from today's list?
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3">
              This will remove them from today's check-in record. They can be checked in again if needed.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveIndex(null)}
                className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemoveIndex)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Removing..." : "Yes, Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
