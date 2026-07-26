"use client";

import { useState } from "react";
import { submitFeedback } from "@/actions/feedback";
import ImageUploader from "@/components/ui/ImageUploader";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<"General Feedback" | "Bug Report" | "Feature Request">("General Feedback");
  const [comment, setComment] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!comment.trim()) {
      setError("Please describe your feedback or issue.");
      return;
    }

    setSubmitting(true);
    const result = await submitFeedback({
      category,
      comment: comment.trim(),
      images,
    });

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setComment("");
        setImages([]);
        onClose();
      }, 1800);
    } else {
      setError(result.error);
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg my-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧪</span>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Beta Feedback
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Help us improve Penthouse Drift!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <span className="text-4xl">🎉</span>
            <h4 className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              Thank You for Your Feedback!
            </h4>
            <p className="text-xs text-zinc-500">
              Our team has received your message and will review it shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs font-semibold text-red-600 dark:text-red-400">
                ⚠️ {error}
              </div>
            )}

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Feedback Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["General Feedback", "Bug Report", "Feature Request"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                      category === cat
                        ? "bg-amber-500 text-black border-amber-400 font-black shadow-xs"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-amber-500/40"
                    }`}
                  >
                    {cat === "General Feedback" ? "💬 General" : cat === "Bug Report" ? "🐛 Bug" : "💡 Idea"}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Your Feedback / Description
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe what you like, encountered a bug, or have an idea to make the app better..."
                rows={4}
                maxLength={1000}
                required
                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Image attachment */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Attach Screenshots <span className="text-zinc-400 font-normal">(Optional, max 3)</span>
              </label>
              <ImageUploader
                label="Feedback Attachment"
                maxFiles={3}
                onUploadComplete={setImages}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-xs font-black uppercase tracking-wider hover:bg-amber-400 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
