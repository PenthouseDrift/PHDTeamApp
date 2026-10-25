"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setAutoCheckInPreferences } from "@/actions/profile";

/**
 * First-run, full-screen question: "check me in automatically when I buy a day
 * pass / rental hour?". Shown only for the options the member hasn't answered
 * yet (their saved value is still unset), and each option is saved on its own.
 * It can be postponed ("Ask me later") and will simply ask again next visit;
 * the answers can be changed any time in Profile.
 */

type Choice = boolean | null;

const OPTIONS = [
  {
    key: "dayPass" as const,
    title: "Day passes",
    detail: "Buy a day pass while a track event is open and we check you in with it straight away.",
  },
  {
    key: "rental" as const,
    title: "Rental hours",
    detail: "Buy a rental hour while a track event is open and we check you in and start your car rental.",
  },
];

// True on the client after hydration, false on the server, so the portal never causes a mismatch.
const subscribe = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

export function AutoCheckInPrompt({ askDayPass, askRental }: { askDayPass: boolean; askRental: boolean }) {
  const router = useRouter();
  const isClient = useIsClient();
  const [dismissed, setDismissed] = useState(false);
  const [dayPass, setDayPass] = useState<Choice>(null);
  const [rental, setRental] = useState<Choice>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const open = isClient && !dismissed && !saved && (askDayPass || askRental);

  // Lock page scroll behind the overlay.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const rows = OPTIONS.filter((o) => (o.key === "dayPass" ? askDayPass : askRental));
  const values: Record<"dayPass" | "rental", Choice> = { dayPass, rental };
  const setters = { dayPass: setDayPass, rental: setRental };
  const complete = rows.every((r) => values[r.key] !== null);

  function save() {
    setError(null);
    const payload: { dayPass?: boolean; rental?: boolean } = {};
    if (askDayPass && dayPass !== null) payload.dayPass = dayPass;
    if (askRental && rental !== null) payload.rental = rental;
    startTransition(async () => {
      const res = await setAutoCheckInPreferences(payload);
      if (res.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const seg = (active: boolean, tone: "yes" | "no") =>
    `min-h-14 flex-1 rounded-xl border-2 px-3 text-sm font-black transition-colors ${
      active
        ? tone === "yes"
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-zinc-700 bg-zinc-700 text-white dark:border-zinc-300 dark:bg-zinc-300 dark:text-zinc-900"
        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
    }`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-checkin-title"
      className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-zinc-50 dark:bg-zinc-950"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </span>
          <h1 id="auto-checkin-title" className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
            Skip the check-in tap
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            With <strong className="text-zinc-900 dark:text-zinc-100">auto check-in</strong>, buying a pass at the track checks you
            in automatically. No extra step after you pay: you go straight from checkout to the track.
          </p>
        </div>

        <div className="space-y-4">
          {rows.map((row) => {
            const value = values[row.key];
            const set = setters[row.key];
            return (
              <fieldset key={row.key} className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <legend className="sr-only">{row.title}</legend>
                <div>
                  <p className="text-base font-black text-zinc-900 dark:text-zinc-100">{row.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{row.detail}</p>
                </div>
                <div className="flex gap-2" role="radiogroup" aria-label={`Auto check-in for ${row.title.toLowerCase()}`}>
                  <button type="button" role="radio" aria-checked={value === true} onClick={() => set(true)} className={seg(value === true, "yes")}>
                    Yes, check me in
                  </button>
                  <button type="button" role="radio" aria-checked={value === false} onClick={() => set(false)} className={seg(value === false, "no")}>
                    No, I&apos;ll do it
                  </button>
                </div>
              </fieldset>
            );
          })}
        </div>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          It only happens while a track event is open and you aren&apos;t already checked in. Otherwise your pass waits in your wallet.
          You can change this any time in your Profile.
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={save}
            disabled={!complete || pending}
            className="min-h-14 w-full rounded-2xl bg-amber-500 text-base font-black text-black shadow-md transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {pending ? "Saving…" : complete ? "Save my choices" : rows.length > 1 ? "Choose an option for each" : "Choose an option"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={pending}
            className="min-h-11 w-full rounded-xl text-sm font-bold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Ask me later
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
