"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  quickCheckIn,
  checkInWithDayPass,
  checkInWithRental,
} from "@/actions/admin/checkins";
import { activateMembershipInPerson } from "@/actions/membership";
import { getDeskProfile, undoCheckIn, type DeskProfile } from "@/actions/admin/checkin-desk";
import type { ActionResult } from "@/types";
import { BASE_PRICES } from "@/lib/activity-pricing";
import { formatTime, isStaffRole, money, type RosterMember } from "./desk-utils";
import { SheetFrame, PaymentToggle } from "./desk-ui";
import { WalkInSheet } from "./WalkInSheet";

/**
 * The staff check-in desk.
 *
 * One screen, search first: type a name, tap the person, tap one button. The
 * sheet that opens works out the right default for that person (membership,
 * then wallet day pass, then cash day pass) so the common case is search → tap
 * → tap. Everything else (car rental, other passes, new membership) is one
 * level down, and "paid now / pay later" is a single control instead of a
 * checkbox buried mid-list.
 */

interface Toast {
  message: string;
  /** Present when the check-in can be reversed cleanly (no cash, no rental timer). */
  undoUserId?: string;
}

interface CheckInDeskProps {
  roster: RosterMember[];
  /** userId → time of their latest check-in today (for "already here" markers). */
  checkedIn: Record<string, number>;
  /** Open this member straight away (e.g. arriving from the Members page). */
  initialMemberId?: string;
}

function initial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function Avatar({ m, size = 40 }: { m: RosterMember; size?: number }) {
  return m.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.image} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 font-black text-amber-600"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial(m.name)}
    </span>
  );
}

export function CheckInDesk({ roster, checkedIn, initialMemberId }: CheckInDeskProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RosterMember | null>(
    () => (initialMemberId ? roster.find((m) => m.id === initialMemberId) ?? null : null)
  );
  const [walkIn, setWalkIn] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, startUndo] = useTransition();

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const hits = roster.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.nickname ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    );
    const rank = (m: RosterMember) =>
      m.name.toLowerCase().startsWith(q) || (m.nickname ?? "").toLowerCase().startsWith(q) ? 0 : 1;
    return hits.sort((a, b) => rank(a) - rank(b)).slice(0, 10);
  }, [roster, q]);

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  function finished(t: Toast) {
    setSelected(null);
    setWalkIn(null);
    setQuery("");
    setToast(t);
    // Drop ?member= so a refresh doesn't reopen the sheet.
    if (initialMemberId) router.replace("/admin/check-in", { scroll: false });
    router.refresh();
    // Ready for the next person.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function undo() {
    const id = toast?.undoUserId;
    if (!id) return;
    startUndo(async () => {
      const res = await undoCheckIn(id);
      setToast({ message: res.success ? "Check-in undone" : res.error });
      if (res.success) router.refresh();
    });
  }

  return (
    <>
      <section aria-label="Find a customer" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label htmlFor="desk-search" className="mb-2 block text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Who&apos;s checking in?
        </label>
        <div className="relative">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            id="desk-search"
            ref={inputRef}
            autoFocus
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) setSelected(results[0]);
            }}
            placeholder="Name, nickname or email"
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white pl-11 pr-4 text-base text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {q ? (
          <ul className="mt-3 space-y-1.5" aria-label="Search results">
            {results.map((m) => {
              const here = checkedIn[m.id];
              const staff = isStaffRole(m.role);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/60"
                  >
                    <Avatar m={m} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{m.name}</span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {m.nickname ? `“${m.nickname}” · ` : ""}
                        {m.email}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {staff ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                          {m.role === "admin" ? "Admin" : "Mod"}
                        </span>
                      ) : null}
                      {here && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Here {formatTime(here)}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No one called “{query.trim()}” has an account.
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Start typing to find them. Press Enter to open the top match.
          </p>
        )}

        <button
          type="button"
          onClick={() => setWalkIn(query.trim())}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-amber-950/20"
        >
          <span aria-hidden>＋</span>
          {q && results.length === 0 ? `Check in “${query.trim()}” as a walk-in` : "Walk-in with no account"}
        </button>
      </section>

      {selected && (
        <MemberSheet
          key={selected.id}
          member={selected}
          hereAt={checkedIn[selected.id]}
          onClose={() => setSelected(null)}
          onDone={finished}
        />
      )}
      {walkIn !== null && <WalkInSheet initialName={walkIn} onClose={() => setWalkIn(null)} onDone={finished} />}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl md:inset-x-auto md:bottom-6 md:right-6 md:max-w-sm dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="min-w-0 font-semibold">
            <span aria-hidden className="mr-1.5 text-emerald-400 dark:text-emerald-600">✓</span>
            {toast.message}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {toast.undoUserId && (
              <button
                type="button"
                onClick={undo}
                disabled={undoing}
                className="min-h-9 rounded-lg px-3 text-sm font-black text-amber-300 hover:bg-white/10 disabled:opacity-50 dark:text-amber-700 dark:hover:bg-black/10"
              >
                {undoing ? "…" : "Undo"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="min-h-9 rounded-lg px-2 text-zinc-400 hover:bg-white/10 dark:text-zinc-500 dark:hover:bg-black/10"
            >
              ✕
            </button>
          </span>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type OptionKey = "membership" | "walletPass" | "cashPass" | "walletRental" | "cashRental" | "newMembership";

function MemberSheet({
  member,
  hereAt,
  onClose,
  onDone,
}: {
  member: RosterMember;
  hereAt: number | undefined;
  onClose: () => void;
  onDone: (t: Toast) => void;
}) {
  const [profile, setProfile] = useState<DeskProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payLater, setPayLater] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live wallet / membership / prices for this one person (the roster is cached).
  useEffect(() => {
    let cancelled = false;
    getDeskProfile(member.id).then((res) => {
      if (cancelled) return;
      if (res.success) setProfile(res.data);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const free = profile ? profile.isStaff || profile.membershipActive : false;
  const passes = profile?.dayPasses ?? 0;
  const hours = profile?.rentalHours ?? 0;
  const primary: OptionKey = free ? "membership" : passes > 0 ? "walletPass" : "cashPass";
  const rentalKey: OptionKey = hours > 0 ? "walletRental" : "cashRental";

  function run(key: OptionKey) {
    setError(null);
    const { id, name } = member;
    startTransition(async () => {
      let res: ActionResult<unknown>;
      let label: string;
      let undoable = false;
      switch (key) {
        case "membership":
          res = await quickCheckIn(id, name, "", "membership");
          label = profile?.isStaff ? "staff access" : "membership";
          undoable = true;
          break;
        case "walletPass":
          res = await checkInWithDayPass(id, name, "", false);
          label = "day pass from wallet";
          undoable = true;
          break;
        case "cashPass":
          res = await checkInWithDayPass(id, name, "", true, payLater);
          label = payLater ? "day pass, pay later" : "day pass, paid";
          break;
        case "walletRental":
          res = await checkInWithRental(id, name, "", false);
          label = "car rental from wallet";
          break;
        case "cashRental":
          res = await checkInWithRental(id, name, "", true, payLater);
          label = payLater ? "car rental, pay later" : "car rental, paid";
          break;
        case "newMembership":
          res = await activateMembershipInPerson(id, name, "");
          label = "new 28-day membership";
          break;
      }
      if (res.success) onDone({ message: `${name} · ${label}`, undoUserId: undoable ? id : undefined });
      else setError(res.error);
    });
  }

  const price = (k: "membership" | "daypass" | "rental") => (profile ? money(profile.prices[k]) : "");
  const discounted = (k: "membership" | "daypass" | "rental") => (profile ? profile.prices[k] < BASE_PRICES[k] : false);

  // Cash options are on screen when the default is cash, rental is cash, or More is open.
  const showPay = primary === "cashPass" || rentalKey === "cashRental" || moreOpen;

  const primaryCopy: Record<"membership" | "walletPass" | "cashPass", { title: string; sub: string; tone: string }> = {
    membership: {
      title: "Check in",
      sub: profile?.isStaff ? "Staff access · free" : "Membership · free",
      tone: "bg-emerald-600 hover:bg-emerald-500 text-white",
    },
    walletPass: {
      title: "Check in with day pass",
      sub: `Uses 1 of ${passes} in their wallet`,
      tone: "bg-emerald-600 hover:bg-emerald-500 text-white",
    },
    cashPass: {
      title: `Day pass · ${price("daypass")}`,
      sub: payLater ? "Check in now, collect payment later" : "Payment collected now",
      tone: "bg-amber-500 hover:bg-amber-400 text-black",
    },
  };
  const pc = primaryCopy[primary as "membership" | "walletPass" | "cashPass"];

  const optionRow = (key: OptionKey, title: string, sub: string) => (
    <button
      key={key}
      type="button"
      disabled={pending || !profile}
      onClick={() => run(key)}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>
      </span>
      <span aria-hidden className="text-zinc-400">→</span>
    </button>
  );

  const payNote = payLater ? "Pay later" : "Paid now";

  return (
    <SheetFrame title={member.name} subtitle={member.nickname ? `“${member.nickname}”` : member.email} onClose={onClose}>
      {hereAt && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          Already checked in today at {formatTime(hereAt)}. Only continue if you&apos;re adding a car rental or another pass.
        </p>
      )}

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {loadError}
        </p>
      )}

      {/* At-a-glance status */}
      <div className="flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Member status">
        {profile ? (
          <>
            {profile.isStaff ? (
              <span className="rounded-full bg-purple-100 px-2.5 py-1 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">Staff · free access</span>
            ) : profile.membershipActive ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                Member until {new Date(profile.membershipExpiresAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {profile.membershipExpiresAt ? "Membership expired" : "No membership"}
              </span>
            )}
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {passes} day pass{passes === 1 ? "" : "es"}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
              {hours} rental hr{hours === 1 ? "" : "s"}
            </span>
          </>
        ) : !loadError ? (
          <span className="h-6 w-56 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        ) : null}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* The one-tap default */}
      <button
        type="button"
        disabled={pending || !profile}
        onClick={() => run(primary)}
        className={`flex min-h-16 w-full flex-col items-center justify-center rounded-2xl px-4 py-3 text-center shadow-md transition-colors disabled:opacity-50 ${profile ? pc.tone : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"}`}
      >
        <span className="text-lg font-black">{pending ? "Checking in…" : profile ? pc.title : "Loading…"}</span>
        {profile && !pending && <span className="text-xs font-semibold opacity-80">{pc.sub}</span>}
      </button>

      {showPay && (
        <PaymentToggle payLater={payLater} onChange={setPayLater} disabled={pending} />
      )}

      {/* Car rental is common enough to stay visible. */}
      {profile &&
        optionRow(
          rentalKey,
          rentalKey === "walletRental" ? "Add a car rental" : `Add a car rental · ${price("rental")}`,
          rentalKey === "walletRental" ? `Uses 1 of ${hours} rental hours in their wallet` : discounted("rental") ? `Member discount applied · ${payNote}` : payNote
        )}

      {profile && (
        <details onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)} className="group rounded-xl">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-sm font-bold text-zinc-600 dark:text-zinc-300">
            More ways to check in
            <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-2 space-y-2">
            {primary !== "walletPass" && passes > 0 && optionRow("walletPass", "Use a wallet day pass", `${passes} in their wallet`)}
            {primary !== "cashPass" && optionRow("cashPass", `Day pass · ${price("daypass")}`, discounted("daypass") ? `Member discount applied · ${payNote}` : payNote)}
            {rentalKey === "walletRental" && optionRow("cashRental", `Car rental · ${price("rental")}`, payNote)}
            {!free &&
              optionRow(
                "newMembership",
                `28-day membership · ${price("membership")}`,
                "Activates the membership and checks them in · always collected now"
              )}
          </div>
        </details>
      )}
    </SheetFrame>
  );
}
