import { CAMPAIGN_ROUNDS, PRIZE_MULTIPLIERS, prizeFor } from "../config";

/**
 * What each round is worth on an entry of `fee`. Rounds already won are lit. A test entry (fee 0) pays nothing, so it
 * shows the ladder as a note instead of amounts.
 */
export function PrizeLadder({ fee, wins, test, compact = false }: { fee: number; wins: number; test?: boolean; compact?: boolean }) {
  if (compact) return <CompactLadder fee={fee} wins={wins} test={test} />;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
        {test ? "Test cup · no prize" : "Prize for rounds won"}
      </p>
      {test ? (
        <p className="mt-1 text-xs text-zinc-400">Free for testing. It pays no P-Credits however far you get.</p>
      ) : (
        <ol className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {CAMPAIGN_ROUNDS.map((r, i) => {
            const reached = wins >= r.round;
            return (
              <li
                key={r.round}
                aria-label={`${r.name}: ${prizeFor(fee, r.round)} P-Credits${reached ? ", won" : ""}`}
                className={`rounded-lg border px-2 py-1.5 text-center ${
                  reached ? "border-emerald-500/60 bg-emerald-500/15" : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <span className="block text-[10px] font-black uppercase text-zinc-400">{r.short}</span>
                <span className={`block text-sm font-black tabular-nums ${reached ? "text-emerald-300" : "text-white"}`}>
                  🪙 {prizeFor(fee, i + 1)}
                </span>
                <span className="block text-[9px] text-zinc-500">×{PRIZE_MULTIPLIERS[i + 1]}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** One scrolling row of six chips, for the cup screen where height matters. Rounds won are lit and ticked. */
function CompactLadder({ fee, wins, test }: { fee: number; wins: number; test?: boolean }) {
  if (test) return <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs font-bold text-zinc-400">Test cup: no prize.</p>;
  return (
    <ol className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Prize for each round won">
      {CAMPAIGN_ROUNDS.map((r) => {
        const reached = wins >= r.round;
        const next = wins + 1 === r.round;
        return (
          <li
            key={r.round}
            aria-label={`${r.name}: ${prizeFor(fee, r.round)} P-Credits${reached ? ", won" : ""}`}
            className={`min-w-[4.6rem] flex-1 snap-start rounded-xl border px-2 py-1.5 text-center ${
              reached ? "border-emerald-500/60 bg-emerald-500/15" : next ? "border-amber-400 bg-amber-500/15" : "border-zinc-800 bg-zinc-900"
            }`}
          >
            <span className="block text-[10px] font-black uppercase text-zinc-400">{reached ? "✓ " : ""}{r.short}</span>
            <span className={`block text-sm font-black tabular-nums ${reached ? "text-emerald-300" : "text-white"}`}>🪙 {prizeFor(fee, r.round).toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}
