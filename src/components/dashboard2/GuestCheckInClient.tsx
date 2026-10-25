"use client";

import { useState, useTransition } from "react";
import { performGuestSelfCheckIn } from "@/actions/self-checkin";
import { createWalletCheckout } from "@/actions/wallet";

/**
 * Guest / buddy check-in for the /dashboard2 option.
 *
 * Same rules as the classic /track-checkin guest flow:
 *  - owned pass/rental hour  -> performGuestSelfCheckIn (consumes 1 wallet unit)
 *  - nothing owned           -> createWalletCheckout with the guest's name, then
 *                               the /dashboard2/guest return handler verifies the
 *                               payment and checks the guest in automatically.
 * The check-in window gate is enforced by the page (form disabled when closed).
 */

interface Props {
  userId: string;
  selfCheckInActive: boolean;
  dayPasses: number;
  rentalHours: number;
  dayPassPrice: string;
  rentalPrice: string;
  /** Prefill after a guest pass was just bought, so check-in is one tap. */
  initialGuestName?: string;
  initialPassType?: "day_pass" | "rental";
}

type PassType = "day_pass" | "rental";
type Feedback = { type: "success" | "error"; message: string } | null;

export function GuestCheckInClient({
  userId,
  selfCheckInActive,
  dayPasses: initialDayPasses,
  rentalHours: initialRentalHours,
  dayPassPrice,
  rentalPrice,
  initialGuestName,
  initialPassType,
}: Props) {
  const [dayPasses, setDayPasses] = useState(initialDayPasses);
  const [rentalHours, setRentalHours] = useState(initialRentalHours);
  const [guestName, setGuestName] = useState(initialGuestName ?? "");
  const [passType, setPassType] = useState<PassType>(initialPassType ?? "day_pass");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const owned = passType === "day_pass" ? dayPasses > 0 : rentalHours > 0;
  const label = passType === "day_pass" ? "day pass" : "rental hour";
  const price = passType === "day_pass" ? dayPassPrice : rentalPrice;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) {
      setFeedback({ type: "error", message: "Enter your guest's name." });
      return;
    }
    setFeedback(null);

    startTransition(async () => {
      if (owned) {
        const res = await performGuestSelfCheckIn(userId, name, passType);
        if (res.success) {
          setFeedback({ type: "success", message: res.data.message });
          setGuestName("");
          if (passType === "day_pass") setDayPasses((p) => Math.max(0, p - 1));
          else setRentalHours((h) => Math.max(0, h - 1));
        } else {
          setFeedback({ type: "error", message: res.error });
        }
        return;
      }

      // Nothing owned: buy one for the guest, then come back and check them in.
      const returnUrl = `${window.location.origin}/dashboard2/guest?guestName=${encodeURIComponent(
        name
      )}&guestPassType=${passType}`;
      const res = await createWalletCheckout(
        userId,
        passType === "day_pass" ? "daypass" : "rental",
        1,
        returnUrl,
        name
      );
      if (res.success && res.data?.url) {
        setFeedback({ type: "success", message: "Taking you to secure payment…" });
        window.location.href = res.data.url;
      } else {
        setFeedback({ type: "error", message: !res.success ? res.error : "Couldn't start checkout" });
      }
    });
  }

  const optionClass = (active: boolean) =>
    `flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
      active
        ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
        : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
    }`;

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {!selfCheckInActive && (
        <div className="rounded-xl bg-zinc-50 px-3.5 py-3 text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          Guest check-in opens during a live track event. Come back when check-in is open.
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="guestName" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Guest full name
        </label>
        <input
          id="guestName"
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value.slice(0, 60))}
          placeholder="e.g. Alex Smith"
          maxLength={60}
          required
          disabled={!selfCheckInActive || isPending}
          className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm font-semibold text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      <fieldset className="space-y-1.5" disabled={!selfCheckInActive || isPending}>
        <legend className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Pass type</legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPassType("day_pass")}
            className={optionClass(passType === "day_pass")}
          >
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Day pass</span>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {dayPasses > 0 ? `${dayPasses} in your wallet` : `Buy for ${dayPassPrice}`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPassType("rental")}
            className={optionClass(passType === "rental")}
          >
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Rental hour</span>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {rentalHours > 0 ? `${rentalHours} in your wallet` : `Buy for ${rentalPrice}`}
            </span>
          </button>
        </div>
      </fieldset>

      {feedback && (
        <div
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!selfCheckInActive || isPending}
        className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {owned ? `Check in guest with a ${label}` : `Buy a ${label} (${price}) & check in guest`}
      </button>
    </form>
  );
}
