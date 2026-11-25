"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ActionResult } from "@/types";
import type { OpenGiftResult } from "@/tcg/battle-pass/actions";
import { rewardLabel, type BattlePassRewardKind } from "@/tcg/battle-pass/config";
import { Sparks } from "@/tcg/components/ReceivedCardsReveal";
import { buzz } from "@/tcg/ui/feedback";

type Phase = "box" | "opening" | "reveal" | "error";

const noSubscription = () => () => {};
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

const GLOW: Record<BattlePassRewardKind, string> = { pcredits: "#ffd75e", packcredits: "#7df9ff" };
const MYSTERY_GLOW = "#a78bfa";

/**
 * Opening a Battle Pass gift. The gift box drops in and waits. Tapping it opens it (the same animation as a card gift): the lid
 * flies off and the reward comes out in a burst of sparks. The gift is only opened on the server when the member taps, so
 * closing this without tapping leaves it waiting. A secret gift is a purple mystery box with a bigger moment when it opens.
 */
export function BattlePassGiftReveal({
  tierXp,
  secret,
  remaining,
  onOpen,
  onClose,
  onNext,
}: {
  /** The XP this gift was unlocked at, for the heading. */
  tierXp: number;
  secret: boolean;
  /** Other gifts still waiting after this one. */
  remaining: number;
  /** Opens the gift on the server. Called once, when the box is tapped. */
  onOpen: () => Promise<ActionResult<OpenGiftResult>>;
  onClose: () => void;
  /** Move straight on to the next waiting gift. */
  onNext: () => void;
}) {
  const mounted = useSyncExternalStore(noSubscription, () => true, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const [phase, setPhase] = useState<Phase>("box");
  const [reward, setReward] = useState<{ kind: BattlePassRewardKind; amount: number } | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  const glow = reward ? GLOW[reward.kind] : secret ? MYSTERY_GLOW : GLOW.pcredits;
  const big = secret;

  function open() {
    if (started.current || phase !== "box") return;
    started.current = true;
    setPhase("opening");
    buzz(25);
    const pause = new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : 800));
    Promise.all([onOpen(), pause])
      .then(([res]) => {
        if (res.success) {
          setReward(res.data.reward);
          setPhase("reveal");
          buzz(secret ? 45 : 25);
        } else {
          setError(res.error);
          setPhase("error");
        }
      })
      .catch(() => {
        setError("Could not open that gift. Please try again.");
        setPhase("error");
      });
  }

  useEffect(() => {
    primary.current?.focus();
  }, [phase]);

  // The page behind stays still while this is on screen.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  // Escape closes it, except while the gift is being paid.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "opening") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mounted) return null;

  const btn = "gx-tap inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-black uppercase tracking-wide transition-colors";
  const boxOpen = phase !== "box";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={secret ? "Mystery Battle Pass gift" : "Battle Pass gift"}
      className="rc-backdrop gx-safe-t gx-safe-b fixed inset-0 z-[10050] flex flex-col items-center justify-center overflow-hidden px-4 text-white"
      style={{ "--rc-glow": glow, "--rc-glow-size": big ? 1.35 : 1.1 } as CSSProperties}
    >
      <div aria-hidden className="rc-rays" />
      <p className="sr-only" aria-live="polite">
        {phase === "reveal" && reward ? `You got ${rewardLabel(reward)}.` : phase === "error" ? error : ""}
      </p>

      {(phase === "box" || phase === "error") && (
        <button
          type="button"
          onClick={onClose}
          className="gx-tap absolute right-3 top-3 z-20 rounded-full border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          {phase === "box" ? "Not now" : "Close"}
        </button>
      )}

      {(phase === "box" || phase === "opening") && (
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="rc-text text-center" style={{ animationDelay: "0.4s" }}>
            <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: glow }}>
              {secret ? "Mystery gift" : "Battle Pass gift"}
            </p>
            <h2 className="mt-1 text-2xl font-black sm:text-3xl">{secret ? "A special one!" : "You unlocked a gift!"}</h2>
            <p className="mt-1.5 text-sm text-zinc-300">Unlocked at {tierXp.toLocaleString("en-GB")} XP</p>
          </div>

          <button
            ref={primary}
            type="button"
            onClick={open}
            disabled={phase === "opening"}
            aria-label="Open the gift"
            className="relative rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/70"
          >
            <div className="rc-gift" data-open={boxOpen} data-wobble={!boxOpen} style={secret ? { filter: "hue-rotate(205deg) saturate(1.25)" } : undefined}>
              <div className="rc-box">
                <div className="rc-body" />
                <div className="rc-lid">
                  <div className="rc-bow" />
                </div>
              </div>
              {boxOpen && <Sparks count={big ? 26 : 18} reach={big ? 210 : 170} />}
            </div>
          </button>

          <p className="rc-text text-sm font-bold" style={{ animationDelay: "1.1s", color: glow }}>
            {phase === "box" ? "Tap the gift to open it" : "Opening…"}
          </p>
        </div>
      )}

      {phase === "reveal" && reward && (
        <div className="relative z-10 flex w-full flex-col items-center gap-5">
          <div className="rc-card-stage block w-[min(60vw,15rem)]">
            <span aria-hidden className="rc-card-glow" />
            <span className="rc-card rc-float block">
              <span
                className="flex aspect-[63/88] w-full flex-col items-center justify-center gap-3 rounded-3xl border-4 text-center shadow-2xl"
                style={{
                  borderColor: glow,
                  background:
                    reward.kind === "pcredits"
                      ? "linear-gradient(160deg, #3b2a05, #7a5a10 55%, #c9971b)"
                      : "linear-gradient(160deg, #052a33, #0b5a6b 55%, #1493ad)",
                }}
              >
                <span aria-hidden className="text-6xl drop-shadow-lg">
                  {reward.kind === "pcredits" ? "🪙" : "🎟️"}
                </span>
                <span className="text-5xl font-black tabular-nums drop-shadow">+{reward.amount.toLocaleString("en-GB")}</span>
              </span>
            </span>
            <Sparks count={big ? 28 : 18} reach={big ? 220 : 170} />
          </div>

          <div className="rc-text text-center" style={{ animationDelay: "0.55s" }}>
            <p className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: glow }}>
              {secret ? "Mystery gift opened" : "Gift opened"}
            </p>
            <p className="mt-0.5 text-xl font-black">{rewardLabel(reward)}</p>
            <p className="mt-1 text-sm text-zinc-300">Added to your balance.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {remaining > 0 && (
              <button type="button" onClick={onClose} className={`${btn} border border-zinc-600 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800`}>
                Done
              </button>
            )}
            <button
              ref={primary}
              type="button"
              onClick={remaining > 0 ? onNext : onClose}
              className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}
            >
              {remaining > 0 ? `Open next gift (${remaining} left)` : "Done"}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-3xl" aria-hidden>
            ⚠️
          </p>
          <p role="alert" className="text-base font-bold">
            {error}
          </p>
          <button ref={primary} type="button" onClick={onClose} className={`${btn} bg-amber-500 text-black hover:bg-amber-400`}>
            Close
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
