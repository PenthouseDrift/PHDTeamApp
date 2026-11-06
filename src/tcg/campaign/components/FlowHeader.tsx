import type { ReactNode } from "react";

const STEPS = ["Entry", "Cars", "Cup"];

/**
 * The campaign's slim top bar: title, one line saying what to do now, the member's balance, and (while entering) a
 * three-step tracker. It is one row on a phone so the content gets the screen.
 */
export function FlowHeader({
  subtitle,
  balance,
  step,
  right,
}: {
  subtitle: string;
  balance: number;
  /** 0 = entry, 1 = cars, 2 = the cup. Leave out to hide the tracker. */
  step?: 0 | 1 | 2;
  right?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <header className="flex items-center gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-zinc-100">
        <span aria-hidden className="text-2xl leading-none">
          🏆
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black leading-tight">Drift Campaign</h2>
          <p className="truncate text-[11px] font-medium text-zinc-400">{subtitle}</p>
        </div>
        {right}
        <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-black tabular-nums text-amber-300">
          🪙 {balance.toLocaleString()}
        </span>
      </header>
      {step !== undefined && (
        <ol className="grid grid-cols-3 gap-1.5 px-0.5" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="space-y-1">
              <span className={`block h-1.5 rounded-full ${i < step ? "bg-emerald-500" : i === step ? "bg-amber-400" : "bg-zinc-700"}`} />
              <span className={`block text-center text-[10px] font-black uppercase tracking-wider ${i === step ? "text-amber-300" : "text-zinc-500"}`}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
