"use client";

import { useState, useTransition } from "react";
import { buzz } from "@/tcg/ui/feedback";
import { claimXpGiftsAction } from "@/tcg/xp-gift-actions";
import { xpGiftState, type XpGiftView } from "@/tcg/xp-gifts";

/**
 * The free XP gift on Home: a slim progress bar to the next gift, which turns into a Collect button when gifts are waiting.
 * `xp` is the driver's live Drift XP, so the bar moves as they play. Nothing shows while the gifts are off.
 */
export function XpGiftCard({
  view,
  xp,
  onClaimed,
}: {
  view: XpGiftView | null;
  xp: number;
  onClaimed: (view: XpGiftView, pCredits: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (!view) return null;
  const state = xpGiftState(view, xp, view.paidTo);
  if (!state.on) return null;

  function collect() {
    setMessage(null);
    startTransition(async () => {
      const res = await claimXpGiftsAction();
      if (res.success) {
        buzz();
        setMessage({ text: `+${res.data.amount.toLocaleString("en-GB")} P-Credits added` });
        onClaimed(res.data.view, res.data.pCredits);
      } else {
        setMessage({ text: res.error, error: true });
      }
    });
  }

  const ready = state.owed > 0;
  const pct = Math.round(state.progress * 100);

  return (
    <section
      aria-label="Free XP gift"
      className={`rounded-2xl border p-3 sm:p-4 ${ready ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-800 bg-zinc-900/80"}`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className={`text-2xl ${ready ? "animate-pulse motion-reduce:animate-none" : ""}`}>
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">
            {ready
              ? `${state.owed > 1 ? `${state.owed} free gifts` : "Free gift"} ready: ${state.amount.toLocaleString("en-GB")} P-Credits`
              : `Free gift: ${view.pCredits.toLocaleString("en-GB")} P-Credits`}
          </p>
          <p className="text-xs font-bold text-zinc-400">
            {ready ? `Next one in ${state.toNext.toLocaleString("en-GB")} XP` : `${state.toNext.toLocaleString("en-GB")} XP to go`}. A gift every{" "}
            {view.everyXp.toLocaleString("en-GB")} XP.
          </p>
        </div>
        {ready && (
          <button
            type="button"
            onClick={collect}
            disabled={pending}
            className="gx-tap inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-black uppercase tracking-wide text-black transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? "…" : "Collect"}
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Progress to the next free gift"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-800"
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-xs font-black ${message.error ? "text-rose-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
