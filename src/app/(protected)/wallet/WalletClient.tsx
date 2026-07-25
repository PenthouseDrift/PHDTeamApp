"use client";

import { useState } from "react";
import Image from "next/image";
import type { Wallet, Membership } from "@/types";
import { createWalletCheckout } from "@/actions/wallet";

interface WalletClientProps {
  userId: string;
  userName: string;
  userRole?: "admin" | "moderator" | "member";
  wallet: Wallet;
  membership: Membership | null;
  membershipQrUrl: string;
  dayPassQrUrl: string;
  rentalQrUrl: string;
  onPurchaseItem?: (itemType: "daypass" | "rental", quantity: number) => Promise<void>;
  onTestAddBalance?: (itemType: "daypass" | "rental", quantity: number) => Promise<void>;
}

export function WalletClient({
  userId,
  wallet,
  membership,
  membershipQrUrl,
  dayPassQrUrl,
  rentalQrUrl,
  userRole,
  onPurchaseItem,
  onTestAddBalance,
}: WalletClientProps) {
  const [dayPassQty, setDayPassQty] = useState(1);
  const [rentalQty, setRentalQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMembershipActive = membership?.status === "active";

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


  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>Penthouse Drift Wallet</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage your track membership, Day Passes, Car Rental Hours & Passes
          </p>
        </div>

        {/* Membership Banner — members only */}
        {userRole !== "admin" && userRole !== "moderator" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              28-Day Membership Status
            </p>
            <p className={`text-base font-black ${isMembershipActive ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
              {isMembershipActive ? "Active Track Member" : "No Active Membership"}
            </p>
          </div>
          {!isMembershipActive && (
            <a
              href="/membership/purchase"
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors text-center shadow-sm"
            >
              Get Membership (£40)
            </a>
          )}
        </div>
        )}

        {/* Your Track Pass QR Code Section */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 text-center shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Your Member Account QR Code</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Show this single QR code to staff at the track to check in, redeem day passes, or start car rentals</p>
          </div>

          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white border border-zinc-200 dark:border-zinc-700 w-fit mx-auto shadow-md">
            <Image
              src={membershipQrUrl}
              alt="Member Account Check-In QR Code"
              width={220}
              height={220}
              className="rounded-lg"
            />
            <p className="mt-2 text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-700">
              ID: {userId}
            </p>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
            Staff can scan this code to verify your 28-day membership, redeem your Day Passes, start Car Rentals, or check in a friend.
          </p>
        </div>

        {/* Balances Summary Cards (Side-by-Side on Mobile) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Day Passes Balance */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-2 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
              <svg className="w-16 h-16 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Day Passes</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white">{wallet.dayPasses}</span>
              <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">{wallet.dayPasses === 1 ? "pass" : "passes"}</span>
            </div>
            <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">Valid for 1 full track day</p>
          </div>

          {/* Rental Hours Balance */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-2 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
              <svg className="w-16 h-16 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider">Rental Hours</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white">{wallet.rentalHours}</span>
              <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">{wallet.rentalHours === 1 ? "hour" : "hours"}</span>
            </div>
            <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">15m grace + 1hr track rental</p>
          </div>
        </div>

        {/* Purchase Items Section (Side-by-Side on Mobile) */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Buy Passes & Rentals</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Day Pass Purchase Card */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">Day Pass</h3>
                  <span className="text-xs sm:text-base font-bold text-amber-600 dark:text-amber-500">£10.00</span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  Full track day access.
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
                  Buy ({dayPassQty}) - £{(dayPassQty * 10).toFixed(0)}
                </button>
              </div>
            </div>

            {/* Car Rental Hour Purchase Card */}
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">Car Rental</h3>
                  <span className="text-xs sm:text-base font-bold text-amber-600 dark:text-amber-500">£10.00 / hr</span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  15m grace + 1hr rental.
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
                  Buy ({rentalQty}) - £{(rentalQty * 10).toFixed(0)}
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
