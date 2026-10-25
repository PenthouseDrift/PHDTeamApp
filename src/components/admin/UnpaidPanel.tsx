"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markUnpaidAsPaid, waiveUnpaid, type UnpaidGroup } from "@/actions/admin/unpaid";
import { methodInfo, money } from "@/components/admin/desk/desk-utils";
import { ShellIcon } from "@/components/new-shell/shell-icons";

const dateFmt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" };
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-GB", dateFmt);

const VISIBLE_GROUPS = 5;

/**
 * Everyone who checked in without paying, across every event. Once they've been
 * asked and have paid, staff mark it paid here (or in the Activity Log) and it
 * starts counting as revenue. A balance that won't be collected can be waived,
 * which clears it WITHOUT counting any revenue. Hidden when nobody owes anything.
 */
export function UnpaidPanel({ groups }: { groups: UnpaidGroup[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Which row is showing the "write this off?" confirmation.
  const [confirmWaive, setConfirmWaive] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (groups.length === 0) return null;

  const totalOwed = groups.reduce((s, g) => s + g.totalOwed, 0);
  const visible = showAll ? groups : groups.slice(0, VISIBLE_GROUPS);

  async function settle(ids: string[], key: string, label: string, mode: "paid" | "waived") {
    setBusy(key);
    setMessage(null);
    setConfirmWaive(null);
    let paid = 0;
    for (const id of ids) {
      const res = mode === "paid" ? await markUnpaidAsPaid(id) : await waiveUnpaid(id);
      if (!res.success) {
        setBusy(null);
        setMessage({ text: res.error, error: true });
        router.refresh();
        return;
      }
      paid += res.data.amount;
    }
    setBusy(null);
    setMessage({ text: mode === "paid" ? `${label} marked paid · ${money(paid)}` : `${label} waived` });
    router.refresh();
  }

  const pay = (ids: string[], key: string, label: string) => settle(ids, key, label, "paid");
  const waive = (ids: string[], key: string, label: string) => settle(ids, key, label, "waived");

  return (
    <section
      aria-label="Unpaid check-ins"
      className="overflow-hidden rounded-2xl border border-red-300/70 bg-white shadow-sm dark:border-red-500/30 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-red-100 bg-red-50/70 px-4 py-3.5 dark:border-red-500/20 dark:bg-red-500/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-400">
          <ShellIcon name="cash" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Unpaid check-ins</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {groups.length} {groups.length === 1 ? "person" : "people"} · any event
          </p>
        </div>
        <p className="shrink-0 text-right" aria-label={`${money(totalOwed)} outstanding`}>
          <span className="block text-xl font-black leading-none text-red-600 dark:text-red-400">{money(totalOwed)}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-red-500/80">owed</span>
        </p>
      </div>

      <div className="space-y-2 p-3">
        <div aria-live="polite">
          {message && (
            <p
              className={`rounded-lg border p-2.5 text-sm font-bold ${
                message.error
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>

        <ul className="space-y-2">
          {visible.map((g) => {
            const open = openId === g.memberId;
            const multiple = g.items.length > 1;
            const first = g.items[0];
            const info = methodInfo(first.method ?? "");
            const waiting = confirmWaive === g.memberId;
            return (
              <li key={g.memberId} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                {/* Who and how much */}
                <div className="flex items-center gap-3 p-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-black text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    aria-hidden
                  >
                    {g.memberName.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      <span className="truncate">{g.memberName}</span>
                      {g.isGuest && (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          Guest
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {multiple ? (
                        <span>
                          {g.items.length} check-ins · since {fmtDate(g.oldest)}
                        </span>
                      ) : (
                        <>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${info.tone}`}>{info.label}</span>
                          <span>{fmtDate(first.timestamp)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-black text-zinc-900 dark:text-zinc-100">{money(g.totalOwed)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-zinc-100 p-2.5 dark:border-zinc-800">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => pay(g.items.map((i) => i.id), g.memberId, g.memberName)}
                    className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-3 text-sm font-black text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === g.memberId ? "Saving…" : multiple ? "Mark all paid" : "Mark paid"}
                  </button>
                  {multiple && (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : g.memberId)}
                      aria-expanded={open}
                      className="min-h-11 rounded-lg border border-zinc-200 px-3.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {open ? "Hide" : "Details"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirmWaive(waiting ? null : g.memberId)}
                    aria-expanded={waiting}
                    className="min-h-11 rounded-lg px-3.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    Waive
                  </button>
                </div>

                {waiting && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 p-3 dark:border-amber-700/40 dark:bg-amber-950/30">
                    <p className="min-w-0 flex-1 basis-48 text-xs font-semibold text-amber-900 dark:text-amber-200">
                      Write off {money(g.totalOwed)} for {g.memberName}? It won&apos;t count as revenue.
                    </p>
                    <button
                      type="button"
                      onClick={() => waive(g.items.map((i) => i.id), g.memberId, g.memberName)}
                      className="min-h-10 rounded-lg bg-amber-600 px-4 text-xs font-black text-white hover:bg-amber-500"
                    >
                      Yes, waive
                    </button>
                    <button type="button" onClick={() => setConfirmWaive(null)} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      Keep it
                    </button>
                  </div>
                )}

                {/* Each check-in, when someone owes for more than one */}
                {multiple && open && (
                  <ul className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/60 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40">
                    {g.items.map((item) => {
                      const itemInfo = methodInfo(item.method ?? "");
                      return (
                        <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-xs">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-200">{fmtDate(item.timestamp)}</span>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${itemInfo.tone}`}>{itemInfo.label}</span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{money(item.owed)}</span>
                          <span className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => pay([item.id], item.id, `${g.memberName}, ${fmtDate(item.timestamp)}`)}
                              className="min-h-9 rounded-lg border border-emerald-600 px-3 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            >
                              {busy === item.id ? "Saving…" : "Mark paid"}
                            </button>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => {
                                if (window.confirm(`Waive ${money(item.owed)} for ${fmtDate(item.timestamp)}? It won't count as revenue.`)) {
                                  waive([item.id], item.id, `${g.memberName}, ${fmtDate(item.timestamp)}`);
                                }
                              }}
                              className="min-h-9 rounded-lg px-2.5 font-semibold text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              Waive
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {groups.length > VISIBLE_GROUPS && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-11 w-full rounded-lg text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {showAll ? "Show fewer" : `Show all ${groups.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
