"use client";

import { useState } from "react";
import Link from "next/link";
import { formatGBP } from "@/lib/activity-pricing";
import type { PriceBreakdown } from "@/lib/pricing";
import { useCheckoutFlow } from "./useCheckoutFlow";

/**
 * Passes: membership + day passes + rental hours in one place (replaces the
 * separate Wallet and Membership pages in the new experience). Every purchase
 * returns to Home (/dashboard2), which verifies the payment and then asks the
 * member to check in — so the "I paid but forgot to check in" gap is closed.
 */

interface PassesClientProps {
  userId: string;
  isStaff: boolean;
  isDev: boolean;
  membership: {
    active: boolean;
    remainingDays: number;
    isLastDay: boolean;
    /** Formatted on the server, e.g. "14 Nov 2026". */
    expiresLabel: string | null;
  };
  wallet: { dayPasses: number; rentalHours: number };
  pricing: { membership: PriceBreakdown; daypass: PriceBreakdown; rental: PriceBreakdown };
  membershipDays: number;
}

function Price({ price, perUnit }: { price: PriceBreakdown; perUnit?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      {price.hasDiscount && (
        <span className="text-xs font-semibold text-zinc-400 line-through">{formatGBP(price.original)}</span>
      )}
      <span className="text-lg font-black text-amber-600 dark:text-amber-400">{formatGBP(price.final)}</span>
      {perUnit && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{perUnit}</span>}
    </span>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-lg font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`${label} quantity`}>
      <button type="button" className={btn} aria-label={`Fewer ${label}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="w-8 text-center text-sm font-black tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
      <button type="button" className={btn} aria-label={`More ${label}`} disabled={value >= 10} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function PassesClient({
  userId,
  isStaff,
  isDev,
  membership,
  wallet,
  pricing,
  membershipDays,
}: PassesClientProps) {
  const [dayPassQty, setDayPassQty] = useState(1);
  const [rentalQty, setRentalQty] = useState(1);
  const { start, busy, error, overlay } = useCheckoutFlow(userId);

  // Staff already have unlimited access; only allow buying a membership in dev
  // (same rule as the classic membership page).
  const membershipBlocked = isStaff && !isDev;

  const card = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
  const primaryBtn =
    "w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {overlay}

      {/* Membership status */}
      {isStaff ? (
        <section className="rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 p-5 text-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest opacity-80">Staff</p>
          <h2 className="mt-1 text-xl font-black">Permanent track access</h2>
          <p className="mt-1 text-sm opacity-90">No membership or passes needed to check in.</p>
        </section>
      ) : membership.active ? (
        <section className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest opacity-80">Membership active</p>
          <h2 className="mt-1 text-2xl font-black">
            {membership.isLastDay
              ? "Last day today"
              : `${membership.remainingDays} ${membership.remainingDays === 1 ? "day" : "days"} left`}
          </h2>
          <p className="mt-1 text-sm opacity-90">
            Unlimited track access{membership.expiresLabel ? ` until ${membership.expiresLabel}` : ""}.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-black shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest opacity-80">No active membership</p>
          <h2 className="mt-1 text-xl font-black">Join for unlimited track access</h2>
          <p className="mt-1 text-sm font-medium opacity-90">
            {membershipDays} days of track access. Or just buy a pass for the days you visit.
          </p>
        </section>
      )}

      {/* Wallet balances */}
      <section className="grid grid-cols-2 gap-3" aria-label="Your wallet">
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">Day passes</p>
          <p className="mt-1 text-3xl font-black text-zinc-900 dark:text-white">{wallet.dayPasses}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">1 pass = 1 track day</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">Rental hours</p>
          <p className="mt-1 text-3xl font-black text-zinc-900 dark:text-white">{wallet.rentalHours}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Rent a car by the hour</p>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <h2 className="px-1 pt-1 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Get more</h2>

      {/* Membership */}
      <section className={`${card} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">{membershipDays}-day membership</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {membership.active && !isStaff
                ? `Adds ${membershipDays} more days to your current membership.`
                : `Unlimited track access for ${membershipDays} days.`}
            </p>
          </div>
          <Price price={pricing.membership} />
        </div>
        {pricing.membership.hasDiscount && (
          <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-700 dark:text-green-400">
            🎉 Your {formatGBP(pricing.membership.discount)} member discount is applied.
          </p>
        )}
        <button type="button" className={primaryBtn} disabled={busy !== null || membershipBlocked} onClick={() => start("membership")}>
          {membershipBlocked
            ? "Not needed for staff"
            : busy === "membership"
            ? "Starting payment…"
            : membership.active
            ? `Extend by ${membershipDays} days`
            : "Join now"}
        </button>
      </section>

      {/* Day passes */}
      <section className={`${card} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Day pass</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Full track access for one day.</p>
          </div>
          <Price price={pricing.daypass} perUnit="each" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Stepper value={dayPassQty} onChange={setDayPassQty} label="day passes" />
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {formatGBP(Math.round(pricing.daypass.final * dayPassQty * 100) / 100)}
          </span>
        </div>
        <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => start("daypass", dayPassQty)}>
          {busy === "daypass" ? "Starting payment…" : `Buy ${dayPassQty} day pass${dayPassQty === 1 ? "" : "es"}`}
        </button>
      </section>

      {/* Rental hours */}
      <section className={`${card} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Rental hour</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Rent a track car by the hour.</p>
          </div>
          <Price price={pricing.rental} perUnit="each" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Stepper value={rentalQty} onChange={setRentalQty} label="rental hours" />
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {formatGBP(Math.round(pricing.rental.final * rentalQty * 100) / 100)}
          </span>
        </div>
        <button type="button" className={primaryBtn} disabled={busy !== null} onClick={() => start("rental", rentalQty)}>
          {busy === "rental" ? "Starting payment…" : `Buy ${rentalQty} rental hour${rentalQty === 1 ? "" : "s"}`}
        </button>
      </section>

      <p className="px-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Bringing a friend?{" "}
        <Link href="/dashboard2/guest" className="font-semibold text-amber-600 hover:underline dark:text-amber-400">
          Check in a guest
        </Link>
      </p>
    </div>
  );
}
