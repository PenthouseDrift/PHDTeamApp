"use client";

import { useState, useTransition } from "react";
import { performSelfCheckIn, performGuestSelfCheckIn } from "@/actions/self-checkin";
import { addDayPasses, addRentalHours } from "@/actions/wallet";
import Link from "next/link";

interface SelfCheckInClientProps {
  userId: string;
  userName: string;
  isMembershipActive: boolean;
  membershipExpiresAt: number | null;
  dayPasses: number;
  rentalHours: number;
  alreadyCheckedIn: boolean;
}

export function SelfCheckInClient({
  userId,
  userName,
  isMembershipActive,
  membershipExpiresAt,
  dayPasses: initialDayPasses,
  rentalHours: initialRentalHours,
  alreadyCheckedIn: initialCheckedIn,
}: SelfCheckInClientProps) {
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(initialCheckedIn);
  const [dayPasses, setDayPasses] = useState(initialDayPasses);
  const [rentalHours, setRentalHours] = useState(initialRentalHours);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Guest Check-In State
  const [guestName, setGuestName] = useState("");
  const [guestPassType, setGuestPassType] = useState<"day_pass" | "rental">("day_pass");

  function handleCheckIn(method: "membership" | "day_pass" | "rental") {
    setFeedback(null);
    startTransition(async () => {
      const res = await performSelfCheckIn(userId, method);
      if (res.success) {
        setFeedback({ type: "success", message: res.data.message });
        setAlreadyCheckedIn(true);
        if (method === "day_pass") setDayPasses((p) => Math.max(0, p - 1));
        if (method === "rental") setRentalHours((h) => Math.max(0, h - 1));
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  async function handleBuyAndCheckIn(type: "day_pass" | "rental") {
    setFeedback(null);
    startTransition(async () => {
      // 1. Top up wallet pass
      const topUpRes = type === "day_pass" ? await addDayPasses(userId, 1) : await addRentalHours(userId, 1);
      if (!topUpRes.success) {
        setFeedback({ type: "error", message: topUpRes.error });
        return;
      }

      // 2. Perform self check-in with new pass
      const checkInRes = await performSelfCheckIn(userId, type);
      if (checkInRes.success) {
        setFeedback({ type: "success", message: `Pass Purchased! ${checkInRes.data.message}` });
        setAlreadyCheckedIn(true);
      } else {
        setFeedback({ type: "error", message: checkInRes.error });
      }
    });
  }

  function handleGuestCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;

    setFeedback(null);
    startTransition(async () => {
      // If user has no wallet passes, top up first
      if (guestPassType === "day_pass" && dayPasses === 0) {
        const topUp = await addDayPasses(userId, 1);
        if (!topUp.success) {
          setFeedback({ type: "error", message: topUp.error });
          return;
        }
      } else if (guestPassType === "rental" && rentalHours === 0) {
        const topUp = await addRentalHours(userId, 1);
        if (!topUp.success) {
          setFeedback({ type: "error", message: topUp.error });
          return;
        }
      }

      const res = await performGuestSelfCheckIn(userId, guestName.trim(), guestPassType);
      if (res.success) {
        setFeedback({ type: "success", message: res.data.message });
        setGuestName("");
        if (guestPassType === "day_pass") setDayPasses((p) => Math.max(0, p - 1));
        if (guestPassType === "rental") setRentalHours((h) => Math.max(0, h - 1));
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-black shadow-lg space-y-2">
        <span className="text-xs font-black uppercase tracking-wider bg-black/10 px-2.5 py-1 rounded-md">
          Track Arrival
        </span>
        <h1 className="text-2xl sm:text-3xl font-black">Self Track Check-In</h1>
        <p className="text-sm font-semibold opacity-90">
          Welcome to Penthouse Drift, <span className="underline decoration-black/40 font-extrabold">{userName}</span>!
        </p>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-xl p-4 text-sm font-bold border shadow-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-800 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-950/50 border-red-300 text-red-800 dark:text-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Self Check-In Options (User Not Checked In) */}
      {!alreadyCheckedIn ? (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Select Your Entry Option</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Choose how you&apos;d like to check in for today&apos;s track session:
            </p>
          </div>

          <div className="space-y-3">
            {/* 1. Active 28-Day Membership */}
            {isMembershipActive ? (
              <button
                onClick={() => handleCheckIn("membership")}
                disabled={isPending}
                className="w-full text-left rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black p-4 font-extrabold transition-all shadow-md flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🟢</span>
                    <span className="text-base">Check In Free with Membership</span>
                  </div>
                  <p className="text-xs opacity-90 font-medium">
                    28-Day Unlimited Membership Active
                    {membershipExpiresAt && (
                      <span className="ml-1">
                        (Expires {new Date(membershipExpiresAt).toLocaleDateString("en-GB")})
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>
            ) : (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4 opacity-75 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-zinc-400">⚪</span>
                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                      28-Day Membership Inactive
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">No active 28-day track membership on file</p>
                </div>
                <Link
                  href="/wallet"
                  className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Join (£40)
                </Link>
              </div>
            )}

            {/* 2. Wallet Day Pass */}
            {dayPasses > 0 ? (
              <button
                onClick={() => handleCheckIn("day_pass")}
                disabled={isPending}
                className="w-full text-left rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-900 dark:text-amber-200 p-4 font-bold transition-all shadow-xs flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎫</span>
                    <span className="text-base font-extrabold">Redeem 1 Day Pass &amp; Check In</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    You have <span className="font-extrabold">{dayPasses}</span> Day Pass{dayPasses > 1 ? "es" : ""} in your wallet
                  </p>
                </div>
                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>
            ) : (
              <button
                onClick={() => handleBuyAndCheckIn("day_pass")}
                disabled={isPending}
                className="w-full text-left rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 p-4 font-bold transition-all shadow-sm flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💳</span>
                    <span className="text-base font-extrabold">Buy 1 Day Pass (£10) &amp; Check In</span>
                  </div>
                  <p className="text-xs opacity-80">Instant card payment • Redeems &amp; checks you in immediately</p>
                </div>
                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>
            )}

            {/* 3. Wallet Car Rental Session */}
            {rentalHours > 0 ? (
              <button
                onClick={() => handleCheckIn("rental")}
                disabled={isPending}
                className="w-full text-left rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-900 dark:text-purple-200 p-4 font-bold transition-all shadow-xs flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏎️</span>
                    <span className="text-base font-extrabold">Start 1-Hr Car Rental &amp; Check In</span>
                  </div>
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    You have <span className="font-extrabold">{rentalHours}</span> Car Rental Hour{rentalHours > 1 ? "s" : ""} in your wallet
                  </p>
                </div>
                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>
            ) : (
              <button
                onClick={() => handleBuyAndCheckIn("rental")}
                disabled={isPending}
                className="w-full text-left rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 p-4 font-bold transition-all shadow-sm flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏎️</span>
                    <span className="text-base font-extrabold">Buy 1-Hr Car Rental (£10) &amp; Check In</span>
                  </div>
                  <p className="text-xs opacity-80">Instant car rental session start + track check-in</p>
                </div>
                <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* User Already Checked In Today Banner */
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 p-6 space-y-4 shadow-sm text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-black text-2xl font-black flex items-center justify-center mx-auto shadow-md">
            ✓
          </div>
          <div>
            <h2 className="text-xl font-black text-emerald-900 dark:text-emerald-100">
              You are Checked In Today!
            </h2>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
              Your arrival has been recorded. Have an awesome session at Penthouse Drift!
            </p>
          </div>
        </div>
      )}

      {/* Guest Check-In Section */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
            Check In a Guest / Buddy
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Checking in someone else coming to the track with you? Use your pass balance or purchase a pass for them:
          </p>
        </div>

        <form onSubmit={handleGuestCheckIn} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Guest Full Name
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Alex Smith"
              required
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGuestPassType("day_pass")}
              className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                guestPassType === "day_pass"
                  ? "bg-amber-500 text-black border-amber-400 shadow-sm"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="font-extrabold text-sm">🎫 Day Pass</div>
              <div className="text-[11px] opacity-80">
                {dayPasses > 0 ? `${dayPasses} in wallet` : "Buy (£10)"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGuestPassType("rental")}
              className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                guestPassType === "rental"
                  ? "bg-purple-500 text-white border-purple-400 shadow-sm"
                  : "bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="font-extrabold text-sm">🏎️ Car Rental</div>
              <div className="text-[11px] opacity-80">
                {rentalHours > 0 ? `${rentalHours} hrs in wallet` : "Buy (£10)"}
              </div>
            </button>
          </div>

          <button
            type="submit"
            disabled={!guestName.trim() || isPending}
            className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-3.5 text-sm font-extrabold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? "Processing Guest Check-In..." : `Check In ${guestName.trim() || "Guest"}`}
          </button>
        </form>
      </div>
    </div>
  );
}
