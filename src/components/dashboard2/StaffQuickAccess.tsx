import Link from "next/link";

/**
 * Staff-only shortcuts for the /dashboard2 option (admin + moderator), ported
 * from the classic dashboard's "Quick Access" block:
 *  - the "Select weekly showcase winner" alert (weekends, until a winner is picked)
 *  - a "Check customer in" shortcut to the admin check-in desk
 * Rendered only when the effective (impersonation-aware) role is staff, so an
 * admin previewing the member experience never sees it.
 */
export function StaffQuickAccess({ winnerSelectionPending }: { winnerSelectionPending: boolean }) {
  return (
    <div className="space-y-3">
      {winnerSelectionPending && (
        <Link
          href="/admin/showcase-winners"
          className="group flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-orange-500/20 p-3.5 transition-all hover:border-amber-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base" aria-hidden>
              🏆
            </span>
            <div>
              <p className="text-xs font-extrabold text-amber-700 dark:text-amber-400">
                Action required: select the weekly showcase winner
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                No winner has been crowned for this week yet.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-black text-black transition-colors group-hover:bg-amber-400">
            Select →
          </span>
        </Link>
      )}

      <Link
        href="/admin/check-in"
        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-950/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Check customer in</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Search for a customer and check them in</p>
          </div>
        </div>
        <span className="text-lg text-zinc-400" aria-hidden>
          →
        </span>
      </Link>
    </div>
  );
}
