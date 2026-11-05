"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markReservationPaid } from "@/actions/marketplace-reservations";
import { formatGbp } from "@/lib/reserved-display";

/**
 * "Mark as paid" for one reserved item. Two taps (the second confirms the amount) so a stray tap
 * can't record a sale. On success the reservation leaves this list and the order appears under
 * "ready to collect".
 */
export function MarkReservationPaidButton({
  reservationId,
  amount,
  holderName,
}: {
  reservationId: string;
  /** What the member pays for this reservation, for the confirmation. */
  amount: number;
  holderName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pay() {
    setError(null);
    startTransition(async () => {
      const res = await markReservationPaid(reservationId);
      if (res.success) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="min-h-9 shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
      >
        Mark as paid
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1" role="group" aria-label={`Confirm ${holderName} has paid`}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={pay}
          disabled={pending}
          className="min-h-9 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
        >
          {pending ? "Saving…" : amount > 0 ? `Confirm ${formatGbp(amount)} paid` : "Confirm paid"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="min-h-9 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-xs text-right text-[11px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
