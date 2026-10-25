"use client";

import Link from "next/link";
import { useCheckoutFlow } from "./useCheckoutFlow";

/**
 * Membership on Home, in one of three states:
 *   - never had one -> a short pitch with the price and a one-tap "Join"
 *   - active        -> a bar showing how much of the period is left, with an
 *                      early "Renew" when it's running low
 *   - expired       -> an empty (red) bar and a plain "Renew" button
 * Buying uses the shared checkout flow, which returns to Home to verify the
 * payment and ask the member to check in.
 */

interface MembershipCardProps {
  userId: string;
  state: "none" | "active" | "expired";
  /** Whole days left (active only). */
  daysLeft: number;
  /** 0-100, share of the current period remaining (active only). */
  percentLeft: number;
  /** Formatted on the server, e.g. "14 Nov". */
  startedLabel: string | null;
  endsLabel: string | null;
  /** Per-member prices as numbers, already after any discount. */
  membershipPrice: number;
  daypassPrice: number;
  membershipDays: number;
  /**
   * Render the ACTIVE state without its own card chrome so it can sit inside
   * another card (the check-in panel) as one combined block.
   */
  embedded?: boolean;
}

const gbp = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function MembershipCard({
  userId,
  state,
  daysLeft,
  percentLeft,
  startedLabel,
  endsLabel,
  membershipPrice,
  daypassPrice,
  membershipDays,
  embedded = false,
}: MembershipCardProps) {
  const { start, busy, error, overlay } = useCheckoutFlow(userId);
  const paying = busy === "membership";

  const buy = (
    <button
      type="button"
      onClick={() => start("membership")}
      disabled={busy !== null}
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-base font-black text-black shadow-md transition-colors hover:bg-amber-400 active:scale-[0.99] disabled:opacity-60"
    >
      {paying
        ? "Starting payment…"
        : state === "none"
        ? `Join now · ${gbp(membershipPrice)}`
        : `Renew now · ${gbp(membershipPrice)}`}
    </button>
  );

  const errorBox = error && (
    <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {error}
    </div>
  );

  // ── Active: how long is left ─────────────────────────────────────────────
  if (state === "active") {
    const low = daysLeft <= 7;
    const critical = daysLeft <= 3;
    const fill = critical ? "bg-red-500" : low ? "bg-amber-500" : "bg-emerald-500";
    const tone = critical
      ? "text-red-600 dark:text-red-400"
      : low
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";

    const Wrapper = embedded ? "div" : "section";
    return (
      <Wrapper
        className={
          embedded
            ? "space-y-3.5 border-t border-black/10 pt-4 dark:border-white/10"
            : "space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        }
      >
        {overlay}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Membership</p>
            <h2 className={`text-2xl font-black ${tone}`}>
              {daysLeft === 0 ? "Last day today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </h2>
          </div>
          {endsLabel && (
            <p className="pb-1 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Ends <span className="font-bold text-zinc-700 dark:text-zinc-200">{endsLabel}</span>
            </p>
          )}
        </div>

        <div>
          <div
            role="progressbar"
            aria-label="Membership time remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentLeft}
            aria-valuetext={`${daysLeft} days left`}
            className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          >
            <div className={`h-full rounded-full transition-[width] ${fill}`} style={{ width: `${Math.max(percentLeft, 3)}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            <span>{startedLabel ? `Started ${startedLabel}` : ""}</span>
            <span>{membershipDays} day period</span>
          </div>
        </div>

        {errorBox}

        {low ? (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {critical ? "Almost out of time." : "Running low."} Renew now and the extra {membershipDays} days are added on top of
              what you have left.
            </p>
            {buy}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => start("membership")}
            disabled={busy !== null}
            className="w-full text-center text-xs font-bold text-zinc-500 hover:text-amber-600 hover:underline disabled:opacity-60 dark:text-zinc-400 dark:hover:text-amber-400"
          >
            {paying ? "Starting payment…" : `Extend early · +${membershipDays} days for ${gbp(membershipPrice)}`}
          </button>
        )}
      </Wrapper>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (state === "expired") {
    return (
      <section className="space-y-4 rounded-2xl border border-red-300/70 bg-white p-5 shadow-sm dark:border-red-500/30 dark:bg-zinc-900">
        {overlay}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-red-500">Membership expired</p>
          <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">Renew to get back on track</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {endsLabel ? `Your membership ended on ${endsLabel}. ` : ""}Renew for {membershipDays} more days of unlimited track access.
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Membership time remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-valuetext="Expired"
          className="h-3 w-full overflow-hidden rounded-full bg-red-100 dark:bg-red-500/20"
        />
        {errorBox}
        {buy}
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Only visiting once?{" "}
          <Link href="/dashboard2/passes" className="font-bold text-amber-600 hover:underline dark:text-amber-400">
            Buy a day pass · {gbp(daypassPrice)}
          </Link>
        </p>
      </section>
    );
  }

  // ── Never had one: the pitch ─────────────────────────────────────────────
  const visitsToBreakEven = daypassPrice > 0 ? Math.max(2, Math.ceil(membershipPrice / daypassPrice)) : null;
  const benefits = [
    `Unlimited track access for ${membershipDays} days`,
    "Check in free at every event, with no passes to remember",
    visitsToBreakEven ? `Pays for itself in ${visitsToBreakEven} visits compared with day passes` : null,
  ].filter((b): b is string => Boolean(b));

  return (
    <section className="space-y-4 overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm dark:border-amber-500/40 dark:from-amber-500/10 dark:to-orange-500/5">
      {overlay}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Membership</p>
          <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">Become a member</h2>
        </div>
        <p className="shrink-0 text-right leading-none">
          <span className="block text-2xl font-black text-amber-700 dark:text-amber-400">{gbp(membershipPrice)}</span>
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">for {membershipDays} days</span>
        </p>
      </div>

      <ul className="space-y-2">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {b}
          </li>
        ))}
      </ul>

      {errorBox}
      {buy}

      <p className="text-center text-xs text-zinc-600 dark:text-zinc-400">
        Just visiting?{" "}
        <Link href="/dashboard2/passes" className="font-bold text-amber-700 hover:underline dark:text-amber-400">
          Buy a day pass · {gbp(daypassPrice)}
        </Link>
      </p>
    </section>
  );
}
