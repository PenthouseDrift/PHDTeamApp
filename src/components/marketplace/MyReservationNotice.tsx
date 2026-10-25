"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelReservation, type ReservationView } from "@/actions/marketplace-reservations";

/**
 * Shown ONLY to the member an item is reserved for. They can cancel their own
 * reservation; creating or restoring one is an admin job.
 */
export function MyReservationNotice({ reservations }: { reservations: ReservationView[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (reservations.length === 0) return null;

  function cancel(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await cancelReservation(id);
      setConfirmId(null);
      if (res.success) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-600/40 dark:bg-emerald-500/10">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="text-xl">🔖</span>
        <div>
          <p className="text-sm font-black text-emerald-900 dark:text-emerald-200">You&apos;ve reserved this item</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
            It&apos;s being held for you and nobody else can buy it. Pay below to complete your order.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {reservations.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50">
            <span className="min-w-0 font-semibold text-zinc-900 dark:text-zinc-100">
              {r.quantity} × {r.variantName ?? r.title}
            </span>
            {confirmId === r.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  disabled={pending}
                  className="min-h-10 rounded-lg bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {pending ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Keep it
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(r.id)}
                className="min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Cancel reservation
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="text-[11px] text-emerald-800/70 dark:text-emerald-200/60">
        If you cancel, it goes back on sale. To reserve it again you&apos;ll need to contact an admin.
      </p>
    </div>
  );
}
