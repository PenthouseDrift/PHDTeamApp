"use client";

import { useState, useTransition } from "react";
import { reportPost } from "@/actions/feed";

interface ReportPostModalProps {
  postId: string;
  postAuthorName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const REPORT_REASONS = [
  "Inappropriate content or language",
  "Spam, misleading, or self-promotion",
  "Harassment, bullying, or hate speech",
  "Offensive, explicit, or unsafe image",
  "Other reason",
];

export function ReportPostModal({
  postId,
  postAuthorName,
  onClose,
  onSuccess,
}: ReportPostModalProps) {
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [customNotes, setCustomNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fullReason =
      selectedReason === "Other reason" && customNotes.trim()
        ? `Other: ${customNotes.trim()}`
        : selectedReason;

    startTransition(async () => {
      const res = await reportPost(postId, fullReason);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Failed to submit report");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚩</span>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Report Post by {postAuthorName}
              </h3>
              <p className="text-[11px] text-zinc-500">
                Flag this content for review by track moderators.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Why are you reporting this post?
            </label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                    selectedReason === r
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 font-bold"
                      : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={selectedReason === r}
                    onChange={() => setSelectedReason(r)}
                    className="text-amber-500 focus:ring-amber-500"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedReason === "Other reason" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Additional Details (Optional)
              </label>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Explain the issue..."
                rows={3}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 text-xs font-black rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md disabled:opacity-50 transition-all"
            >
              {isPending ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
