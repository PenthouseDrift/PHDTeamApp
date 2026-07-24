"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function AITuningBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isHidden = localStorage.getItem("phd_hide_ai_tuning_banner");
      if (isHidden === "true") {
        setDismissed(true);
      }
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("phd_hide_ai_tuning_banner", "true");
    }
  }

  if (dismissed) return null;

  return (
    <div className="relative rounded-2xl bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-purple-950/30 border border-purple-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss AI Tuning prompt"
        className="absolute top-2.5 right-2.5 p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-purple-500/20 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-center gap-3 pr-6 sm:pr-0">
        <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 shrink-0">
          <TuningIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            Need AI Tuning Setup Recommendations?
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Use our Gemini AI Tuning Advisor to tailor suspension, gearing & electronics for PHD P-Tile track dynamics.
          </p>
        </div>
      </div>

      <Link
        href="/tuning-advisor"
        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 px-4 py-2 text-xs font-bold text-black transition-colors shrink-0 shadow-sm"
      >
        Launch Tuning Advisor →
      </Link>
    </div>
  );
}

function TuningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}
