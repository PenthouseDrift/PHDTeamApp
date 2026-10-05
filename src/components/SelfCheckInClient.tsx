"use client";

import { useState, useTransition } from "react";
import { performSelfCheckIn, performGuestSelfCheckIn } from "@/actions/self-checkin";
import { createWalletCheckout } from "@/actions/wallet";
import { createMembershipCheckout } from "@/actions/membership";
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

  async function handleBuyAndCheckIn(type: "day_pass" | "rental" | "membership") {
    setFeedback(null);
    startTransition(async () => {
      const baseUrl = window.location.origin;
      let res;
      if (type === "membership") {
        res = await createMembershipCheckout(userId, `${baseUrl}/track-checkin?autoCheckin=membership`);
      } else {
        const itemType = type === "day_pass" ? "daypass" : "rental";
        res = await createWalletCheckout(userId, itemType, 1, `${baseUrl}/track-checkin?autoCheckin=${type}`);
      }

      if (res.success && res.data?.url) {
        setFeedback({ type: "success", message: "Redirecting to SumUp Secure Payment..." });
        window.location.href = res.data.url;
      } else {
        setFeedback({ type: "error", message: !res.success ? res.error : "Failed to initialize payment checkout" });
      }
    });
  }

  function handleGuestCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;

    setFeedback(null);
    startTransition(async () => {
      // If user has no wallet passes, redirect to SumUp checkout first
      if (guestPassType === "day_pass" && dayPasses === 0) {
        const baseUrl = window.location.origin;
        const returnUrl = `${baseUrl}/track-checkin?guestName=${encodeURIComponent(guestName.trim())}&guestPassType=day_pass`;
        const res = await createWalletCheckout(userId, "daypass", 1, returnUrl, guestName.trim());
        if (res.success && res.data?.url) {
          setFeedback({ type: "success", message: "Redirecting to SumUp Secure Payment..." });
          window.location.href = res.data.url;
          return;
        } else {
          setFeedback({ type: "error", message: !res.success ? res.error : "Payment failed" });
          return;
        }
      } else if (guestPassType === "rental" && rentalHours === 0) {
        const baseUrl = window.location.origin;
        const returnUrl = `${baseUrl}/track-checkin?guestName=${encodeURIComponent(guestName.trim())}&guestPassType=rental`;
        const res = await createWalletCheckout(userId, "rental", 1, returnUrl, guestName.trim());
        if (res.success && res.data?.url) {
          setFeedback({ type: "success", message: "Redirecting to SumUp Secure Payment..." });
          window.location.href = res.data.url;
          return;
        } else {
          setFeedback({ type: "error", message: !res.success ? res.error : "Payment failed" });
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

  // Build the entry options and figure out which one to recommend. Priority:
  // free membership → an owned day pass → an owned rental hour → cheapest buy.
  type EntryOption = {
    key: string;
    owned: boolean;
    emoji: string;
    title: string;
    subtitle: string;
    accent: "green" | "amber" | "purple";
    onClick: () => void;
    /** Highlight this option in the secondary list as a value upsell. */
    upsell?: boolean;
  };

  const options: EntryOption[] = [];

  if (isMembershipActive) {
    options.push({
      key: "membership",
      owned: true,
      emoji: "🟢",
      title: "Check In Free with Membership",
      subtitle: membershipExpiresAt
        ? `Unlimited access · expires ${new Date(membershipExpiresAt).toLocaleDateString("en-GB")}`
        : "28-day unlimited membership active",
      accent: "green",
      onClick: () => handleCheckIn("membership"),
    });
  }
  if (dayPasses > 0) {
    options.push({
      key: "daypass-owned",
      owned: true,
      emoji: "🎫",
      title: "Redeem 1 Day Pass & Check In",
      subtitle: `You have ${dayPasses} day pass${dayPasses > 1 ? "es" : ""} in your wallet`,
      accent: "amber",
      onClick: () => handleCheckIn("day_pass"),
    });
  }
  if (rentalHours > 0) {
    options.push({
      key: "rental-owned",
      owned: true,
      emoji: "🏎️",
      title: "Start 1-Hr Car Rental & Check In",
      subtitle: `You have ${rentalHours} rental hour${rentalHours > 1 ? "s" : ""} in your wallet`,
      accent: "purple",
      onClick: () => handleCheckIn("rental"),
    });
  }
  // Paid options — only show the "buy" variant when the user doesn't already own it.
  if (!isMembershipActive) {
    options.push({
      key: "membership-buy",
      owned: false,
      emoji: "⭐",
      title: "Buy 28-Day Membership (£40) & Check In",
      subtitle: "Secure card payment · activates & checks you in immediately",
      accent: "amber",
      onClick: () => handleBuyAndCheckIn("membership"),
      upsell: true,
    });
  }
  if (dayPasses === 0) {
    options.push({
      key: "daypass-buy",
      owned: false,
      emoji: "💳",
      title: "Buy 1 Day Pass (£10) & Check In",
      subtitle: "Secure card payment · redeems & checks you in immediately",
      accent: "amber",
      onClick: () => handleBuyAndCheckIn("day_pass"),
    });
  }
  if (rentalHours === 0) {
    options.push({
      key: "rental-buy",
      owned: false,
      emoji: "🏎️",
      title: "Buy 1-Hr Car Rental (£10) & Check In",
      subtitle: "Starts a rental session + checks you in immediately",
      accent: "purple",
      onClick: () => handleBuyAndCheckIn("rental"),
    });
  }

  // The recommended option is the first owned one, else the first (cheapest buy).
  const primary = options[0];
  // Order the rest so the membership upsell sits at the top of the secondaries.
  const secondary = options
    .slice(1)
    .sort((a, b) => (b.upsell ? 1 : 0) - (a.upsell ? 1 : 0));

  const accentPrimary: Record<EntryOption["accent"], string> = {
    green: "bg-emerald-500 hover:bg-emerald-400 text-black",
    amber: "bg-amber-500 hover:bg-amber-400 text-black",
    purple: "bg-purple-500 hover:bg-purple-400 text-white",
  };

  const hasBalance = dayPasses > 0 || rentalHours > 0 || isMembershipActive;

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
        {hasBalance && (
          <p className="text-xs font-bold opacity-80">
            In your wallet:{" "}
            {[
              isMembershipActive ? "Active membership" : null,
              dayPasses > 0 ? `${dayPasses} day pass${dayPasses > 1 ? "es" : ""}` : null,
              rentalHours > 0 ? `${rentalHours} rental hr${rentalHours > 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
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
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Check in for today</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {primary?.owned
                ? "Your quickest way in is ready — just tap below."
                : "Choose how you'd like to check in for today's track session."}
            </p>
          </div>

          {/* Primary (recommended) option — big and bold */}
          {primary && (
            <button
              onClick={primary.onClick}
              disabled={isPending}
              className={`w-full text-left rounded-xl p-4 font-extrabold transition-all shadow-md flex items-center justify-between group disabled:opacity-50 ${accentPrimary[primary.accent]}`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{primary.emoji}</span>
                  <span className="text-base">{primary.title}</span>
                </div>
                <p className="text-xs font-medium opacity-90">{primary.subtitle}</p>
              </div>
              <span className="text-lg group-hover:translate-x-1 transition-transform">→</span>
            </button>
          )}

          {/* Secondary options — quieter, with a divider */}
          {secondary.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  or
                </span>
                <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
              </div>

              {secondary.map((opt) =>
                opt.upsell ? (
                  /* Membership upsell — highlighted even as a secondary option */
                  <button
                    key={opt.key}
                    onClick={opt.onClick}
                    disabled={isPending}
                    className="w-full text-left rounded-xl border border-amber-400 bg-gradient-to-r from-amber-50 to-amber-100/60 p-4 transition-colors hover:from-amber-100 hover:to-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:from-amber-500/10 dark:to-amber-500/5 dark:hover:from-amber-500/20 flex items-center justify-between group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base">{opt.emoji}</span>
                        <span className="text-sm font-extrabold text-amber-900 dark:text-amber-200">{opt.title}</span>
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black">
                          Best value
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300/90">
                        Unlimited track access for 28 days · {opt.subtitle}
                      </p>
                    </div>
                    <span className="text-base text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                ) : (
                  <button
                    key={opt.key}
                    onClick={opt.onClick}
                    disabled={isPending}
                    className="w-full text-left rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 flex items-center justify-between group"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{opt.emoji}</span>
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{opt.title}</span>
                        {opt.owned && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            In wallet
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{opt.subtitle}</p>
                    </div>
                    <span className="text-base text-zinc-400 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                )
              )}
            </div>
          )}
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
