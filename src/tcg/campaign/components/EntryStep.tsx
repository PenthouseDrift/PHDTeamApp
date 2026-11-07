"use client";

import { CAMPAIGN_ROUNDS, ENTRY_FEES, REROLLS_PER_CUP, prizeFor } from "../config";
import type { EntryChoice } from "../types";

/**
 * Step one of entering the cup, before any cars are picked: choose the entry and see what each round pays. The prize is
 * paid for the rounds won, however the cup ends. The button that pays lives in the action dock at the bottom of the
 * screen (see CampaignTab), so this screen is only the choice and the prizes.
 */

const card = "rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5 text-zinc-100 sm:p-5";

export function EntryStep({
  entry,
  onEntry,
  pCredits,
  allowTest = false,
}: {
  entry: EntryChoice;
  onEntry: (choice: EntryChoice) => void;
  pCredits: number;
  /** The free test cup, for admins only. */
  allowTest?: boolean;
}) {
  const options: EntryChoice[] = allowTest ? ["test", ...ENTRY_FEES] : [...ENTRY_FEES];
  const fee = entry === "test" ? 0 : Number(entry);
  const top = fee > 0 ? prizeFor(fee, CAMPAIGN_ROUNDS.length) : 0;

  return (
    <div className="space-y-3">
      <section className={card} aria-labelledby="entry-heading">
        <h3 id="entry-heading" className="text-sm font-black uppercase tracking-wide text-zinc-300">
          How do you want to enter?
        </h3>
        <div role="radiogroup" aria-labelledby="entry-heading" className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {options.map((choice) => {
            const on = entry === choice;
            const cantAfford = choice !== "test" && pCredits < Number(choice);
            return (
              <button
                key={String(choice)}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={cantAfford}
                onClick={() => onEntry(choice)}
                className={`flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 text-center transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "border-amber-400 bg-amber-500/20 shadow-[0_0_18px_rgba(245,158,11,0.25)]" : "border-zinc-700 bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                <span className="text-xl font-black tabular-nums">{choice === "test" ? "Test" : `🪙 ${choice}`}</span>
                <span className="mt-0.5 text-[11px] font-bold leading-tight text-zinc-400">
                  {choice === "test" ? "Free · no prize" : cantAfford ? "Not enough P-Credits" : `Win up to 🪙 ${prizeFor(Number(choice), CAMPAIGN_ROUNDS.length).toLocaleString()}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={card} aria-labelledby="prizes-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="prizes-heading" className="text-sm font-black uppercase tracking-wide text-zinc-300">
            What each round pays
          </h3>
          {fee > 0 && <span className="text-xs font-bold text-amber-300">Entry 🪙 {fee}</span>}
        </div>
        {fee === 0 ? (
          <p className="mt-2 rounded-xl bg-zinc-950/60 p-3 text-sm text-zinc-300">A test cup is free and pays nothing, however far you get. Pick a fee to see the prizes.</p>
        ) : (
          <ol className="mt-2.5 space-y-1.5">
            {CAMPAIGN_ROUNDS.map((r) => {
              const prize = prizeFor(fee, r.round);
              const profit = prize - fee;
              const width = Math.max(10, Math.round(Math.sqrt(prize / top) * 100));
              return (
                <li key={r.round} className="relative flex min-h-11 items-center justify-between gap-3 overflow-hidden rounded-xl bg-zinc-950/60 px-3">
                  <span aria-hidden className="absolute inset-y-0 left-0 bg-amber-500/15" style={{ width: `${width}%` }} />
                  <span className="relative min-w-0 truncate text-sm font-bold">
                    <span className="mr-2 text-xs font-black text-zinc-500">{r.round}</span>
                    {r.name}
                  </span>
                  <span className="relative shrink-0 text-right">
                    <span className="block text-base font-black tabular-nums text-white">🪙 {prize.toLocaleString()}</span>
                    <span className={`block text-[10px] font-bold leading-none ${profit > 0 ? "text-emerald-400" : profit === 0 ? "text-zinc-400" : "text-rose-400"}`}>
                      {profit > 0 ? `+${profit.toLocaleString()} profit` : profit === 0 ? "break even" : `${profit.toLocaleString()}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
          You are paid for the rounds you win, however the cup ends: win, lose or withdraw. The entry is taken when you continue. You then pick 3 of 6
          cars (re-roll up to {REROLLS_PER_CUP} times), and can start the cup or withdraw. Withdrawing before it starts loses the entry.
        </p>
      </section>

      <details className={`${card} group`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-black uppercase tracking-wide text-zinc-300 [&::-webkit-details-marker]:hidden">
          Compare all entries
          <span aria-hidden className="text-lg transition group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <table className="mt-2 w-full border-separate border-spacing-y-1 text-sm">
          <caption className="sr-only">Prize in P-Credits for each round won, by entry fee</caption>
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              <th scope="col" className="px-1 py-1 text-left">
                Round won
              </th>
              {ENTRY_FEES.map((f) => (
                <th key={f} scope="col" className={`rounded-t-lg px-1 py-1 text-center ${fee === f ? "bg-amber-500 text-black" : ""}`}>
                  🪙 {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAMPAIGN_ROUNDS.map((r) => (
              <tr key={r.round} className="bg-zinc-950/60">
                <th scope="row" className="rounded-l-lg px-1 py-1.5 text-left text-xs font-bold text-zinc-200">
                  <span className="sm:hidden">{r.short}</span>
                  <span className="hidden sm:inline">
                    {r.round}. {r.name}
                  </span>
                </th>
                {ENTRY_FEES.map((f, i) => (
                  <td
                    key={f}
                    className={`px-1 py-1.5 text-center text-xs font-black tabular-nums sm:text-sm ${i === ENTRY_FEES.length - 1 ? "rounded-r-lg" : ""} ${
                      fee === f ? "bg-amber-500/15 text-amber-200" : "text-white"
                    }`}
                  >
                    {prizeFor(f, r.round).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
