"use client";

import { useMemo, useState, useTransition } from "react";
import type { CheckInEntry } from "@/actions/admin/checkins";
import { removeCheckIn, updateCheckInMethod, updateCheckInName, markCheckInPaid } from "@/actions/admin/checkins";
import { EDITABLE_METHODS, formatTime, methodInfo, money } from "./desk-utils";

type Filter = "all" | "unpaid" | "rentals";
type EditableMethod = Parameters<typeof updateCheckInMethod>[1];

/**
 * Today's check-ins, newest first. The two jobs staff actually have here are
 * "who still owes us money" and "undo a mistake", so Unpaid has its own filter
 * and a one-tap Mark paid, while editing the type / renaming a guest / removing
 * sits behind a row's Edit button instead of cluttering every line.
 */
export function DeskTodayList({ checkIns }: { checkIns: CheckInEntry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep each entry's ORIGINAL list index: the edit actions address the list by index.
  const rows = useMemo(
    () => checkIns.map((entry, index) => ({ entry, index })).reverse(),
    [checkIns]
  );

  const perUser = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { entry } of rows) counts[entry.userId] = (counts[entry.userId] || 0) + 1;
    return counts;
  }, [rows]);

  const unpaidCount = rows.filter((r) => r.entry.unpaid).length;
  const rentalCount = rows.filter((r) => r.entry.method.includes("rental")).length;

  const q = search.trim().toLowerCase();
  const visible = rows.filter(({ entry }) => {
    if (filter === "unpaid" && !entry.unpaid) return false;
    if (filter === "rentals" && !entry.method.includes("rental")) return false;
    if (q && !entry.memberName.toLowerCase().includes(q)) return false;
    return true;
  });

  function flash(text: string, error = false) {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 4000);
  }

  function markPaid(index: number) {
    startTransition(async () => {
      const res = await markCheckInPaid(index);
      if (res.success) flash(`Marked paid · ${money(res.data.amount)}`);
      else flash(res.error, true);
    });
  }

  function remove(index: number) {
    startTransition(async () => {
      const res = await removeCheckIn(index);
      setConfirmRemove(null);
      setOpenIndex(null);
      if (res.success) flash("Check-in removed");
      else flash(res.error, true);
    });
  }

  function changeMethod(index: number, method: string) {
    startTransition(async () => {
      const res = await updateCheckInMethod(index, method as EditableMethod);
      if (res.success) flash(`Changed to ${methodInfo(method).label}`);
      else flash(res.error, true);
    });
  }

  function saveName(index: number, value: string) {
    const name = value.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await updateCheckInName(index, name);
      if (res.success) {
        setRenaming(null);
        flash("Name updated");
      } else flash(res.error, true);
    });
  }

  const chip = (active: boolean) =>
    `min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-bold transition-colors ${
      active
        ? "border-amber-500 bg-amber-500 text-black"
        : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <section aria-label="Checked in today" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100">
          Checked in today
          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            {checkIns.length}
          </span>
        </h2>
      </div>

      {checkIns.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter">
            <button type="button" className={chip(filter === "all")} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              Everyone
            </button>
            <button type="button" className={chip(filter === "unpaid")} aria-pressed={filter === "unpaid"} onClick={() => setFilter("unpaid")}>
              Unpaid{unpaidCount > 0 ? ` (${unpaidCount})` : ""}
            </button>
            <button type="button" className={chip(filter === "rentals")} aria-pressed={filter === "rentals"} onClick={() => setFilter("rentals")}>
              Rentals{rentalCount > 0 ? ` (${rentalCount})` : ""}
            </button>
          </div>
          {checkIns.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find someone in this list"
              aria-label="Find someone in today's list"
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          )}
        </div>
      )}

      <div aria-live="polite">
        {message && (
          <p
            className={`mb-3 rounded-xl border p-2.5 text-sm font-bold ${
              message.error
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {checkIns.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No one has checked in yet today.</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {filter === "unpaid" ? "Nobody owes anything. Nice." : "Nothing matches."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ entry, index }) => {
            const info = methodInfo(entry.method);
            const isGuest = entry.userId.startsWith("guest_");
            const times = perUser[entry.userId] || 1;
            const open = openIndex === index;
            return (
              <li key={`${entry.userId}-${entry.timestamp}-${index}`} className="rounded-xl border border-zinc-200 dark:border-zinc-700/70">
                <div className="flex items-center gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      <span className="truncate">{entry.memberName}</span>
                      {times > 1 && (
                        <span title={`${times} entries today`} className="shrink-0 rounded-md bg-amber-500 px-1.5 py-0.5 text-[11px] font-black text-black">
                          ×{times}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${info.tone}`}>{info.label}</span>
                      <span>{formatTime(entry.timestamp)}</span>
                      {entry.unpaid && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[11px] font-black uppercase text-white">Unpaid</span>}
                    </p>
                  </div>

                  {entry.unpaid && (
                    <button
                      type="button"
                      onClick={() => markPaid(index)}
                      disabled={pending}
                      className="min-h-11 shrink-0 rounded-xl bg-emerald-600 px-3.5 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Mark paid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenIndex(open ? null : index);
                      setConfirmRemove(null);
                      setRenaming(null);
                    }}
                    aria-expanded={open}
                    aria-label={`Edit ${entry.memberName}'s check-in`}
                    className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {open ? "Done" : "Edit"}
                  </button>
                </div>

                {open && (
                  <div className="space-y-3 border-t border-zinc-100 p-3 dark:border-zinc-800">
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Check-in type
                      <select
                        value={EDITABLE_METHODS.some((m) => m.value === entry.method) ? entry.method : ""}
                        onChange={(e) => e.target.value && changeMethod(index, e.target.value)}
                        disabled={pending}
                        className="mt-1 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        {!EDITABLE_METHODS.some((m) => m.value === entry.method) && <option value="">{info.label}</option>}
                        {EDITABLE_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {isGuest &&
                      (renaming?.index === index ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={renaming.value}
                            maxLength={60}
                            onChange={(e) => setRenaming({ index, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveName(index, renaming.value);
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            aria-label="Guest name"
                            className="h-11 min-w-0 flex-1 rounded-xl border border-amber-500 bg-white px-3 text-sm font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          />
                          <button
                            type="button"
                            onClick={() => saveName(index, renaming.value)}
                            disabled={pending || !renaming.value.trim()}
                            className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRenaming({ index, value: entry.memberName })}
                          className="min-h-11 w-full rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Rename guest
                        </button>
                      ))}

                    {confirmRemove === index ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                        <p className="text-sm font-bold text-red-800 dark:text-red-300">Remove {entry.memberName} from today?</p>
                        <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
                          Wallet passes aren&apos;t refunded and any payment stays in the activity log.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setConfirmRemove(null)} className="min-h-11 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                            Keep
                          </button>
                          <button type="button" onClick={() => remove(index)} disabled={pending} className="min-h-11 flex-1 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-50">
                            {pending ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(index)}
                        className="min-h-11 w-full rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remove check-in
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
