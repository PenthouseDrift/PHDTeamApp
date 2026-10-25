"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { performSelfCheckIn } from "@/actions/self-checkin";
import { submitSelfCheckIn } from "@/actions/admin/checkins";
import { QRPopover } from "@/components/QRPopover";
import { useCheckoutFlow, type Product } from "./useCheckoutFlow";

/**
 * The check-in panel on Home. It always answers one question: "what do I tap
 * to get on track?"
 *
 *   checked in         -> confirmation (+ guest check-in)
 *   check-in closed    -> what you own, and a way to top up ahead of time
 *   open + owns entry  -> ONE big primary button (membership > day pass > rental)
 *   open + owns nothing-> clear buy options; paying returns here with a
 *                         "Payment received - check in now" prompt (we never
 *                         silently use a pass for them)
 * Uses the real server actions and rules: performSelfCheckIn (one check-in per
 * day, passes/hours are consumed, membership is free) and submitSelfCheckIn for
 * staff. The open/closed window is decided by the page (getSelfCheckInStatus).
 */

type CheckInMethod = "membership" | "day_pass" | "rental";
type Feedback = { type: "success" | "error"; message: string } | null;

interface Props {
  userId: string;
  userName: string;
  isStaff: boolean;
  selfCheckInActive: boolean;
  alreadyCheckedIn: boolean;
  isMembershipActive: boolean;
  membershipDaysLeft: number;
  dayPasses: number;
  rentalHours: number;
  /** Already-formatted per-member prices. */
  prices: { daypass: string; rental: string; membership: string };
  /** Set when the member has just returned from paying for something. */
  justPaid: Product | null;
  /** Shown at the bottom of the card (the membership time-left bar, for members). */
  footer?: React.ReactNode;
  /** The pass they just bought was used to check them in automatically. */
  autoCheckedIn?: boolean;
}

const JUST_PAID_TO_METHOD: Record<Product, CheckInMethod> = {
  membership: "membership",
  daypass: "day_pass",
  rental: "rental",
};

const JUST_PAID_LABEL: Record<Product, string> = {
  membership: "membership",
  daypass: "day pass",
  rental: "rental hour",
};

export function CheckInPanel({
  userId,
  userName,
  isStaff,
  selfCheckInActive,
  alreadyCheckedIn,
  isMembershipActive,
  membershipDaysLeft,
  dayPasses: initialDayPasses,
  rentalHours: initialRentalHours,
  prices,
  justPaid,
  footer,
  autoCheckedIn = false,
}: Props) {
  const router = useRouter();
  const [checkedIn, setCheckedIn] = useState(alreadyCheckedIn);
  const [dayPasses, setDayPasses] = useState(initialDayPasses);
  const [rentalHours, setRentalHours] = useState(initialRentalHours);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const { start, busy, error: payError, overlay } = useCheckoutFlow(userId);

  function checkIn(method: CheckInMethod) {
    setFeedback(null);
    startTransition(async () => {
      const res = await performSelfCheckIn(userId, method);
      if (res.success) {
        setCheckedIn(true);
        if (method === "day_pass") setDayPasses((n) => Math.max(0, n - 1));
        if (method === "rental") setRentalHours((n) => Math.max(0, n - 1));
        setFeedback({ type: "success", message: res.data.message });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  function staffCheckIn() {
    setFeedback(null);
    startTransition(async () => {
      const res = await submitSelfCheckIn(userId, userName);
      if (res.success) {
        setCheckedIn(true);
        setFeedback({ type: "success", message: "Checked in — enjoy the session." });
        router.refresh();
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  const card = "space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
  const feedbackBox = feedback && (
    <div
      role={feedback.type === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${
        feedback.type === "success"
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      {feedback.message}
    </div>
  );

  const header = (subtitle: string) => (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Track check-in</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      <QRPopover userId={userId} variant="icon" />
    </div>
  );

  // ── Checked in ───────────────────────────────────────────────────────────
  if (checkedIn) {
    return (
      <section className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-black text-emerald-900 dark:text-emerald-200">You&apos;re checked in</h2>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300/80">
                {feedback?.type === "success"
                  ? feedback.message
                  : autoCheckedIn
                  ? "Payment received, and your new pass checked you in automatically. Have a great session."
                  : "Have a great session on track today."}
              </p>
            </div>
          </div>
          <QRPopover userId={userId} variant="icon" />
        </div>
        <Link
          href="/dashboard2/guest"
          className="block rounded-lg border border-emerald-300/70 bg-white/60 py-2 text-center text-xs font-bold text-emerald-800 transition-colors hover:bg-white dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
        >
          Check in a guest
        </Link>
        {footer}
      </section>
    );
  }

  // ── Staff ────────────────────────────────────────────────────────────────
  if (isStaff) {
    return (
      <section className={card}>
        {header(selfCheckInActive ? "Check-in is open" : "Check-in opens during track events")}
        {feedbackBox}
        {selfCheckInActive ? (
          <button
            type="button"
            disabled={isPending}
            onClick={staffCheckIn}
            className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-5 text-lg font-black text-white shadow-md transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {isPending ? "Checking in…" : "Check in"}
          </button>
        ) : (
          <p className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
            Staff have unlimited access. Check-in opens automatically during a live track event.
          </p>
        )}
      </section>
    );
  }

  // What the member can check in with right now, best option first.
  const owned: CheckInMethod[] = [];
  if (isMembershipActive) owned.push("membership");
  if (dayPasses > 0) owned.push("day_pass");
  if (rentalHours > 0) owned.push("rental");

  const preferred = justPaid ? JUST_PAID_TO_METHOD[justPaid] : null;
  const primary: CheckInMethod | null = preferred && owned.includes(preferred) ? preferred : owned[0] ?? null;
  const secondary = owned.filter((m) => m !== primary);

  const paidBanner = justPaid && (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-500/40 dark:bg-emerald-950/40">
      <span className="mt-0.5 text-lg" aria-hidden>
        ✅
      </span>
      <div>
        <p className="text-sm font-black text-emerald-900 dark:text-emerald-200">Payment received</p>
        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
          {selfCheckInActive
            ? `Your ${JUST_PAID_LABEL[justPaid]} is ready. Check in now to get on track.`
            : `Your ${JUST_PAID_LABEL[justPaid]} is in your wallet. Check in here when today's event opens.`}
        </p>
      </div>
    </div>
  );

  const methodButton = (method: CheckInMethod, big: boolean) => {
    const cfg = {
      membership: {
        title: "Check in free",
        sub: `Membership · ${membershipDaysLeft > 0 ? `${membershipDaysLeft} day${membershipDaysLeft === 1 ? "" : "s"} left` : "last day"}`,
        big: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
        small: "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
      },
      day_pass: {
        title: "Check in with a day pass",
        sub: `${dayPasses} in your wallet`,
        big: "bg-gradient-to-br from-amber-400 to-orange-500 text-black",
        small: "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
      },
      rental: {
        title: "Check in with a rental hour",
        sub: `${rentalHours} in your wallet`,
        big: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
        small: "border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300",
      },
    }[method];

    return big ? (
      <button
        key={method}
        type="button"
        disabled={isPending}
        onClick={() => checkIn(method)}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-5 text-left shadow-md transition-transform active:scale-[0.99] disabled:opacity-50 ${cfg.big}`}
      >
        <span>
          <span className="block text-xl font-black leading-tight">{isPending ? "Checking in…" : cfg.title}</span>
          <span className="block text-xs font-semibold opacity-90">{cfg.sub}</span>
        </span>
        <span className="text-2xl" aria-hidden>
          →
        </span>
      </button>
    ) : (
      <button
        key={method}
        type="button"
        disabled={isPending}
        onClick={() => checkIn(method)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${cfg.small}`}
      >
        <span>{cfg.title}</span>
        <span className="text-[11px] font-semibold opacity-80">{cfg.sub}</span>
      </button>
    );
  };

  // ── Check-in closed ──────────────────────────────────────────────────────
  if (!selfCheckInActive) {
    return (
      <section className={card}>
        {header("Check-in opens during track events")}
        {paidBanner}
        <div className="flex flex-wrap items-center gap-2">
          {isMembershipActive && !footer && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              Membership · {membershipDaysLeft} day{membershipDaysLeft === 1 ? "" : "s"} left
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {dayPasses} day pass{dayPasses === 1 ? "" : "es"}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {rentalHours} rental hr{rentalHours === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You can check yourself in here once a track event opens, or show your QR code to an admin at the gate.
        </p>
        <Link href="/dashboard2/passes" className="block text-center text-xs font-bold text-amber-600 hover:underline dark:text-amber-400">
          Get passes ahead of time →
        </Link>
        {footer}
      </section>
    );
  }

  // ── Open: member owns something -> one clear primary action ─────────────
  if (primary) {
    return (
      <section className={card}>
        {header("Check-in is open")}
        {paidBanner}
        {feedbackBox}
        {methodButton(primary, true)}
        {secondary.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Or use</p>
            {secondary.map((m) => methodButton(m, false))}
          </div>
        )}
        <div className="flex items-center justify-center gap-4 pt-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          <Link href="/dashboard2/guest" className="hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
            Check in a guest
          </Link>
          <span aria-hidden>·</span>
          <Link href="/dashboard2/passes" className="hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
            Buy more passes
          </Link>
        </div>
        {footer}
      </section>
    );
  }

  // ── Open: nothing owned -> clear purchase options ───────────────────────
  const buyOption = (product: Product, title: string, sub: string, price: string, highlight = false) => (
    <button
      key={product}
      type="button"
      disabled={busy !== null}
      onClick={() => start(product, 1)}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:opacity-50 ${
        highlight
          ? "border-amber-400 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      }`}
    >
      <span>
        <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">{busy === product ? "Starting payment…" : title}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>
      </span>
      <span className="shrink-0 text-base font-black text-amber-600 dark:text-amber-400">{price}</span>
    </button>
  );

  return (
    <section className={card}>
      {header("Check-in is open")}
      {overlay}
      {paidBanner}
      <div>
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">You don&apos;t have a pass or membership yet</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pick one to get on track. After you pay we&apos;ll bring you straight back here to check in.
        </p>
      </div>
      {(payError || feedback) && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {payError ?? feedback?.message}
        </div>
      )}
      <div className="space-y-2">
        {buyOption("daypass", "Day pass", "Full track access for today", prices.daypass, true)}
        {buyOption("rental", "Rental hour", "Rent a track car by the hour", prices.rental)}
      </div>
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Coming regularly? Membership is further down this page.
      </p>
      <Link href="/dashboard2/guest" className="block text-center text-[11px] font-semibold text-zinc-500 hover:underline dark:text-zinc-400">
        Check in a guest instead
      </Link>
    </section>
  );
}
