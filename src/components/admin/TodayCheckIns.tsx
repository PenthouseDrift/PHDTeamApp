"use client";

import { useState } from "react";
import type { CheckInEntry } from "@/actions/admin/checkins";
import { addNonMemberCheckIn } from "@/actions/admin/checkins";
import { useSession } from "next-auth/react";

interface TodayCheckInsProps {
  checkIns: CheckInEntry[];
}

export function TodayCheckIns({ checkIns }: TodayCheckInsProps) {
  const { data: session } = useSession();
  const [guestName, setGuestName] = useState("");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">
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
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <button
          type="submit"
          disabled={!guestName.trim() || adding}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {feedback && (
        <p className="text-sm text-green-700 mb-3">{feedback}</p>
      )}

      {checkIns.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">No one checked in yet today.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {checkIns.map((entry, i) => (
            <div
              key={`${entry.userId}-${i}`}
              className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-zinc-900">{entry.memberName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="capitalize">{entry.method}</span>
                <span>•</span>
                <span>{formatTime(entry.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
