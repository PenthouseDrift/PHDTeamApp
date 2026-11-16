"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addClubEntry, addClubTransfer, deleteClubEntry } from "@/actions/admin/club-accounts";
import ClubChart from "./ClubChart";
import {
  CLUB_ACCOUNTS,
  MAX_NOTE_LENGTH,
  accountIcon,
  accountLabel,
  entryDirection,
  formatDay,
  formatPence,
  type ClubAccountId,
  type ClubChartData,
  type ClubLedger,
  type ClubLedgerEntry,
} from "@/lib/club-accounts";

type Mode = "entry" | "transfer" | null;

const input =
  "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100";
const labelCls = "block space-y-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400";
const INITIAL_ROWS = 12;

/**
 * The club's accounts: what is in the SumUp bank, the cash tin and the kitty, with a ledger to add money in or out,
 * move money between accounts, and see every entry. The figures come from the server; every change refreshes them.
 */
export default function ClubAccountsClient({ ledger, chart, today }: { ledger: ClubLedger; chart: ClubChartData | null; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClubAccountId | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Money in / out
  const [account, setAccount] = useState<ClubAccountId>("cash");
  const [direction, setDirection] = useState<"in" | "out">("in");
  // Move money
  const [from, setFrom] = useState<ClubAccountId>("cash");
  const [to, setTo] = useState<ClubAccountId>("kitty");
  // Shared by both forms
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  const total = CLUB_ACCOUNTS.reduce((sum, a) => sum + ledger.balances[a.id], 0);
  const visible = ledger.entries.filter((e) => filter === "all" || e.account === filter);
  const rows = showAll ? visible : visible.slice(0, INITIAL_ROWS);

  function open(next: Mode) {
    setMode((m) => (m === next ? null : next));
    setError(null);
  }

  function reset() {
    setAmount("");
    setNote("");
    setDate(today);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        mode === "transfer"
          ? await addClubTransfer({ from, to, amount, date, note })
          : await addClubEntry({ account, direction, amount, date, note });
      if (!result.success) {
        setError(result.error);
        return;
      }
      reset();
      setMode(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteClubEntry(id);
      setConfirmId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="club-accounts-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="club-accounts-heading" className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
            Club accounts
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Where the club&apos;s money is: SumUp bank, cash and the kitty.</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total</p>
          <p className={`text-2xl font-black tracking-tight ${total < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatPence(total)}
          </p>
        </div>
      </div>

      {/* One card per account. Tap one to see only its entries. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CLUB_ACCOUNTS.map((a) => {
          const balance = ledger.balances[a.id];
          const active = filter === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setFilter((f) => (f === a.id ? "all" : a.id))}
              aria-pressed={active}
              className={`rounded-2xl border bg-white px-4 py-4 text-left transition-colors dark:bg-zinc-900 ${
                active ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <span aria-hidden className="text-base">{a.icon}</span>
                {a.label}
              </span>
              <span className={`mt-1.5 block text-2xl font-black tracking-tight ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>
                {formatPence(balance)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => open("entry")}
          aria-expanded={mode === "entry"}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black hover:bg-emerald-400"
        >
          + Add money in / out
        </button>
        <button
          type="button"
          onClick={() => open("transfer")}
          aria-expanded={mode === "transfer"}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-black text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          ⇄ Move between accounts
        </button>
      </div>

      {mode && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">{mode === "transfer" ? "Move money between accounts" : "Add an entry"}</h3>

          {mode === "entry" ? (
            <>
              <fieldset className="space-y-1">
                <legend className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Money</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["in", "out"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      aria-pressed={direction === d}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-black ${
                        direction === d
                          ? d === "in"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300"
                          : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {d === "in" ? "＋ Money in" : "－ Money out"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <AccountPicker label="Account" value={account} onChange={setAccount} />
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AccountPicker label="From" value={from} onChange={setFrom} />
              <AccountPicker label="To" value={to} onChange={setTo} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className={labelCls}>
              <span>Amount (£)</span>
              <input
                type="number" min="0.01" step="0.01" inputMode="decimal" required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={input}
              />
            </label>
            <label className={labelCls}>
              <span>Date</span>
              <input type="date" required value={date} max={`${Number(today.slice(0, 4)) + 1}-12-31`} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className={`${labelCls} col-span-2`}>
              <span>{mode === "transfer" ? "Note (optional)" : "What was it for?"}</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                required={mode === "entry"}
                placeholder={mode === "transfer" ? "e.g. Banked the cash" : "e.g. Track hire, new cones, door takings"}
                className={input}
              />
            </label>
          </div>

          <p role="alert" aria-live="assertive" className="min-h-4 text-xs font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black text-black disabled:opacity-60">
              {pending ? "Saving…" : mode === "transfer" ? "Move money" : "Save entry"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                reset();
              }}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Money in and out over time */}
      <ClubChart data={chart} />

      {/* The ledger */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="mr-auto text-sm font-black text-zinc-900 dark:text-zinc-100">Entries</h3>
          {(["all", ...CLUB_ACCOUNTS.map((a) => a.id)] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                filter === id
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {id === "all" ? "All" : accountLabel(id)}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="mb-2 text-3xl">🐷</p>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{ledger.entries.length === 0 ? "No entries yet" : "No entries for this account"}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {ledger.entries.length === 0 ? "Start with what each account holds now: add it as money in, noted as “Opening balance”." : "Choose All to see every entry."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                confirming={confirmId === entry.id}
                busy={pending}
                onAskDelete={() => setConfirmId(entry.id)}
                onCancelDelete={() => setConfirmId(null)}
                onDelete={() => remove(entry.id)}
              />
            ))}
          </ul>
        )}

        {(visible.length > INITIAL_ROWS || ledger.totalEntries > ledger.entries.length) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 text-xs dark:border-zinc-800">
            {visible.length > INITIAL_ROWS ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="font-bold text-indigo-600 hover:underline dark:text-indigo-400">
                {showAll ? "Show fewer" : `Show all ${visible.length} loaded`}
              </button>
            ) : (
              <span />
            )}
            {ledger.totalEntries > ledger.entries.length && (
              <span className="text-zinc-500 dark:text-zinc-400">
                Showing the latest {ledger.entries.length} of {ledger.totalEntries} entries. Balances include all of them.
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AccountPicker({ label, value, onChange }: { label: string; value: ClubAccountId; onChange: (id: ClubAccountId) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {CLUB_ACCOUNTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            aria-pressed={value === a.id}
            className={`rounded-lg border px-2 py-2.5 text-xs font-bold ${
              value === a.id
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            <span aria-hidden className="mr-1">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function EntryRow({
  entry,
  confirming,
  busy,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  entry: ClubLedgerEntry;
  confirming: boolean;
  busy: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const positive = entryDirection(entry.kind) === 1;
  const isTransfer = entry.kind === "transfer_in" || entry.kind === "transfer_out";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-bold text-zinc-900 dark:text-zinc-100">{entry.note || "(no note)"}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{formatDay(entry.date)}</span>
          <span aria-hidden>·</span>
          <span>
            {accountIcon(entry.account)} {accountLabel(entry.account)}
          </span>
          {isTransfer && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">transfer</span>
          )}
          {entry.createdByName && (
            <>
              <span aria-hidden>·</span>
              <span>by {entry.createdByName}</span>
            </>
          )}
        </p>
      </div>
      <span className={`text-base font-black tabular-nums ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {positive ? "+" : "−"}
        {formatPence(entry.amountPence)}
      </span>
      {confirming ? (
        <span className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-zinc-600 dark:text-zinc-300">{isTransfer ? "Delete both sides?" : "Delete?"}</span>
          <button type="button" onClick={onDelete} disabled={busy} className="font-black text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
            Yes
          </button>
          <button type="button" onClick={onCancelDelete} className="font-bold text-zinc-500 hover:underline">
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onAskDelete}
          aria-label={`Delete entry: ${entry.note}`}
          className="text-xs font-bold text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
        >
          Delete
        </button>
      )}
    </li>
  );
}
