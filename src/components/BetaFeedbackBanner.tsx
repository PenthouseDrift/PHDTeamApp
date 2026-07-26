"use client";

import { useState, useEffect } from "react";
import { FeedbackModal } from "./FeedbackModal";

export function BetaFeedbackBanner() {
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem("phd_beta_banner_dismissed");
    if (isDismissed === "true") {
      setDismissed(true);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem("phd_beta_banner_dismissed", "true");
  }

  if (dismissed) {
    return (
      <>
        <div className="mx-3 sm:mx-4 mt-2 mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="Open Beta Feedback Form"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-purple-500/20 hover:from-amber-500/30 hover:to-purple-500/30 border border-amber-500/40 text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 transition-all shadow-2xs hover:scale-105 active:scale-95"
          >
            <span className="text-xs">🧪</span>
            <span>Beta Feedback</span>
          </button>
        </div>

        <FeedbackModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="mx-3 sm:mx-4 mt-2.5 sm:mt-3 mb-1 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-purple-500/15 border border-amber-500/30 px-3.5 py-2.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">🧪</span>
          <p className="truncate text-xs">
            We&apos;re still in <strong className="text-amber-600 dark:text-amber-400 font-extrabold">Beta</strong> — leave us feedback!
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-extrabold text-[10px] sm:text-xs uppercase tracking-wider hover:bg-amber-400 transition-all shadow-xs shrink-0"
          >
            Leave Feedback
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            title="Dismiss banner"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs px-1"
          >
            ✕
          </button>
        </div>
      </div>

      <FeedbackModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
