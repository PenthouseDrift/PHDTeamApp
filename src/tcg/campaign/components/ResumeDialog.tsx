"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Shown when a member opens the Campaign and a cup is still going: carry on, or withdraw. Resume is focused first, and
 * Escape or a tap outside also resumes, so the way out that costs something is always a deliberate tap on Withdraw.
 */
export function ResumeDialog({
  roundName,
  roundsWon,
  totalRounds,
  note,
  prize,
  onResume,
  onWithdraw,
}: {
  roundName: string;
  roundsWon: number;
  totalRounds: number;
  /** Why the round starts again, when the last battle was cut off. */
  note?: string;
  /** What withdrawing would pay now, or null for a free test cup. */
  prize: number | null;
  onResume: () => void;
  onWithdraw: () => void;
}) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resumeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onResume();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [onResume]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onResume}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="campaign-resume-title"
        aria-describedby="campaign-resume-body"
        className="w-full max-w-md rounded-t-3xl border border-amber-400/50 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">Drift Campaign</p>
        <h4 id="campaign-resume-title" className="mt-0.5 text-lg font-black">
          You have a cup in progress
        </h4>
        <p id="campaign-resume-body" className="mt-2 text-sm leading-relaxed text-zinc-300">
          You have won {roundsWon} of {totalRounds} rounds and are up next in the {roundName}. Your cars and Crew are saved.
          {note ? ` ${note}` : ""}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={resumeRef}
            type="button"
            onClick={onResume}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-4 text-sm font-black uppercase tracking-wide text-black shadow transition hover:bg-amber-400"
          >
            ▶ Resume the cup
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 text-sm font-black uppercase tracking-wide text-rose-300 transition hover:bg-rose-900/50"
          >
            Withdraw{prize !== null && prize > 0 ? ` and keep 🪙 ${prize.toLocaleString()}` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
