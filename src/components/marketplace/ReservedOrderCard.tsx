"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelReservation, type ReservationView } from "@/actions/marketplace-reservations";

/**
 * A reservation shown in the member's orders. It disappears from here once it's
 * paid for, at which point the real order appears in the list below it.
 */
export function ReservedOrderCard({ reservation: r }: { reservation: ReservationView }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelReservation(r.id);
      if (res.success) router.refresh();
      else {
        setError(res.error);
        setConfirming(false);
      }
    });
  }

  const date = new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const total = r.unitPrice != null ? r.unitPrice * r.quantity : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm dark:border-emerald-600/40 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-600/30 dark:bg-emerald-500/10">
        <div>
          <p className="mb-0.5 text-xs font-semibold text-zinc-500">Reserved</p>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{date}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
          🔖 Reserved for you
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {r.quantity}x
            </span>
            {r.variantName ? `${r.title} — ${r.variantName}` : r.title}
          </p>
          {total != null && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              £{total.toFixed(2)} to pay · you&apos;ll get your order here once it&apos;s paid
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/marketplace/${r.listingId}`}
            className="inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-4 text-sm font-black text-black transition-colors hover:bg-amber-400"
          >
            {r.canPay === false ? "View item" : "Pay now"}
          </Link>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="min-h-10 rounded-xl bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50"
              >
                {pending ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-10 rounded-xl px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Cancel reservation
            </button>
          )}
        </div>
      </div>
      {r.canPay === false && (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          This one can&apos;t be paid for online. Speak to a member of staff at the track.
        </p>
      )}
    </div>
  );
}
