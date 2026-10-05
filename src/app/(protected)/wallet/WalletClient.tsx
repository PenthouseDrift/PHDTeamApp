"use client";

import { useState } from "react";
import type { Wallet, Membership } from "@/types";
import type { PriceBreakdown } from "@/lib/pricing";
import { createWalletCheckout } from "@/actions/wallet";
import { QRPopover } from "@/components/QRPopover";

interface WalletPricing {
  membership: PriceBreakdown;
  daypass: PriceBreakdown;
  rental: PriceBreakdown;
}

interface WalletClientProps {
  userId: string;
  userName: string;
  userRole?: "admin" | "moderator" | "member";
  wallet: Wallet;
  membership: Membership | null;
  pricing: WalletPricing;
  onPurchaseItem?: (itemType: "daypass" | "rental", quantity: number) => Promise<void>;
  onTestAddBalance?: (itemType: "daypass" | "rental", quantity: number) => Promise<void>;
}

function money(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function WalletClient({
  userId,
  wallet,
  membership,
  userRole,
  pricing,
  onPurchaseItem,
  onTestAddBalance,
}: WalletClientProps) {
  const [dayPassQty, setDayPassQty] = useState(1);
  const [rentalQty, setRentalQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMembershipActive = membership?.status === "active";
  // Whole days left; floors to 0 within the final 24h.
  const remainingDays =
    membership && isMembershipActive
      ? Math.max(0, Math.floor((membership.expiresAt - Date.now()) / 86_400_000))
      : 0;
  // Active but expiring later today → prompt an early renewal.
  const isLastDay = isMembershipActive && remainingDays === 0;

  async function handleBuy(itemType: "daypass" | "rental", qty: number) {
    setIsSubmitting(true);
    try {
      const res = await createWalletCheckout(userId, itemType, qty);
      if (res.success) {
        window.location.href = res.data.url;
      } else {
        alert(res.error || "Payment checkout failed");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Payment checkout error");
    } finally {
      setIsSubmitting(false);
    }
  }


  const isStaff = userRole === "admin" || userRole === "moderator";
  // Progress through the 28-day membership window (for the days-left bar).
  const membershipProgressPct = isMembershipActive
    ? Math.max(4, Math.min(100, Math.round((remainingDays / 28) * 100)))
    : 0;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Wallet</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Your membership, passes and rental hours in one place
          </p>
        </div>

        {/* ===== ZONE 1 — Account status (membership + balances + QR) ===== */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
          {/* Membership — members only */}
          {!isStaff && (
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Membership
                  </p>
                  {/* Status pill */}
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold ${
                      isMembershipActive
                        ? isLastDay
                          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                          : "border-green-300 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-400"
                        : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${isMembershipActive && !isLastDay ? "bg-green-500" : "bg-amber-500"}`} />
                    {isLastDay ? "Last day of membership" : isMembershipActive ? "Active member" : "No membership"}
                  </span>
                  {!isMembershipActive && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Join for unlimited track access for 28 days.
                    </p>
                  )}
                </div>

                {(!isMembershipActive || isLastDay) && (
                  <a
                    href="/membership/purchase"
                    className="w-full shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-center text-xs font-extrabold text-black shadow-sm transition-colors hover:bg-amber-400 sm:w-auto"
                  >
                    {pricing.membership.hasDiscount ? (
                      <>{isLastDay ? "Renew" : "Get Membership"} (<span className="line-through opacity-70">{money(pricing.membership.original)}</span> {money(pricing.membership.final)})</>
                    ) : (
                      <>{isLastDay ? "Renew Membership" : "Get Membership"} ({money(pricing.membership.final)})</>
                    )}
                  </a>
                )}
              </div>

              {/* Days-left progress bar (active members) */}
              {isMembershipActive && (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Unlimited track access</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      {isLastDay ? "Ends today" : `${remainingDays} of 28 days left`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${isLastDay ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${membershipProgressPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Balances + QR */}
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Day Passes */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                  Day Passes
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white sm:text-4xl">{wallet.dayPasses}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{wallet.dayPasses === 1 ? "pass" : "passes"}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Valid for 1 full track day</p>
              </div>

              {/* Rental Hours — separated with a left divider on wider screens */}
              <div className="sm:border-l sm:border-zinc-100 sm:pl-4 dark:sm:border-zinc-800">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                  Rental Hours
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white sm:text-4xl">{wallet.rentalHours}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{wallet.rentalHours === 1 ? "hour" : "hours"}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">15m grace + 1hr rental</p>
              </div>
            </div>

            {/* QR — full width under the balances */}
            <div className="mt-4 flex flex-col items-center gap-1 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <QRPopover userId={userId} variant="button" buttonText="Show QR code" />
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Scan at the gate to check in, redeem passes or start a rental
              </p>
            </div>
          </div>
        </div>

        {/* ===== ZONE 2 — Top up ===== */}
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Top up</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Buy day passes or rental hours — redeem them with your QR code at the track.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Day Pass Purchase Card */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">Day Pass</h3>
                  <span className="flex items-baseline gap-1.5">
                    {pricing.daypass.hasDiscount && (
                      <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 line-through">{money(pricing.daypass.original)}</span>
                    )}
                    <span className="text-xs sm:text-base font-bold text-amber-600 dark:text-amber-500">{money(pricing.daypass.final)}</span>
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  {pricing.daypass.hasDiscount ? `Full track day access · ${money(pricing.daypass.discount)} off` : "Full track day access."}
                </p>
              </div>

              <div className="space-y-2 sm:space-y-3 pt-1">
                <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-950 px-2 sm:px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Qty</span>
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <button
                      onClick={() => setDayPassQty(Math.max(1, dayPassQty - 1))}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white w-3 sm:w-4 text-center">{dayPassQty}</span>
                    <button
                      onClick={() => setDayPassQty(Math.min(10, dayPassQty + 1))}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleBuy("daypass", dayPassQty)}
                  disabled={isSubmitting}
                  className="w-full py-2 sm:py-2.5 rounded-lg bg-amber-500 text-black text-[11px] sm:text-xs font-extrabold hover:bg-amber-400 transition-colors disabled:opacity-50 text-center"
                >
                  Buy ({dayPassQty}) - {money(dayPassQty * pricing.daypass.final)}
                </button>
              </div>
            </div>

            {/* Car Rental Hour Purchase Card */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">Car Rental</h3>
                  <span className="flex items-baseline gap-1.5">
                    {pricing.rental.hasDiscount && (
                      <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 line-through">{money(pricing.rental.original)}</span>
                    )}
                    <span className="text-xs sm:text-base font-bold text-amber-600 dark:text-amber-500">{money(pricing.rental.final)} / hr</span>
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  {pricing.rental.hasDiscount ? `15m grace + 1hr rental · ${money(pricing.rental.discount)} off` : "15m grace + 1hr rental."}
                </p>
              </div>

              <div className="space-y-2 sm:space-y-3 pt-1">
                <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-950 px-2 sm:px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Hrs</span>
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <button
                      onClick={() => setRentalQty(Math.max(1, rentalQty - 1))}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white w-3 sm:w-4 text-center">{rentalQty}</span>
                    <button
                      onClick={() => setRentalQty(Math.min(10, rentalQty + 1))}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleBuy("rental", rentalQty)}
                  disabled={isSubmitting}
                  className="w-full py-2 sm:py-2.5 rounded-lg bg-amber-500 text-black text-[11px] sm:text-xs font-extrabold hover:bg-amber-400 transition-colors disabled:opacity-50 text-center"
                >
                  Buy ({rentalQty}) - {money(rentalQty * pricing.rental.final)}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Developer Test Mode Simulation (Local Dev Only) */}
        {onTestAddBalance && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 dark:bg-blue-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Developer Test Mode (Local Testing)
              </h3>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Instantly simulate adding Day Passes or Rental Hours to your wallet without paying via SumUp.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => onTestAddBalance("daypass", 1)}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
              >
                + Add 1 Day Pass (Test)
              </button>
              <button
                onClick={() => onTestAddBalance("rental", 1)}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
              >
                + Add 1 Rental Hour (Test)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
