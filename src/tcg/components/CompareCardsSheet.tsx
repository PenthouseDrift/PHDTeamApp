"use client";

import { FullArtCard } from "@/components/cards/FullArtCard";
import { cardKind, getCardTotalPower, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { isCarBroken } from "@/lib/mechanical-faults";
import { getQuickSellPrice } from "@/tcg/config";
import { BottomSheet, sheetSecondary } from "@/tcg/ui/BottomSheet";

const num = (value: string | undefined) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : 0;
};

interface Row {
  label: string;
  /** The number used to find the best card in this row, or null for a card this row doesn't apply to. */
  value: (c: MemberCard) => number | null;
  /** What is shown. */
  show: (c: MemberCard) => string;
}

const isCar = (c: MemberCard) => cardKind(c) === "car";

const ROWS: Row[] = [
  { label: "Total power", value: (c) => (isCar(c) ? getCardTotalPower(c) : null), show: (c) => (isCar(c) ? `${getCardTotalPower(c)} / 100` : "—") },
  { label: "Drift", value: (c) => (isCar(c) ? num(c.stats?.drift) : null), show: (c) => (isCar(c) ? String(num(c.stats?.drift)) : "—") },
  { label: "Accel", value: (c) => (isCar(c) ? num(c.stats?.accel) : null), show: (c) => (isCar(c) ? String(num(c.stats?.accel)) : "—") },
  { label: "Grip", value: (c) => (isCar(c) ? num(c.stats?.grip) : null), show: (c) => (isCar(c) ? String(num(c.stats?.grip)) : "—") },
  { label: "Steer", value: (c) => (isCar(c) ? num(c.stats?.steer) : null), show: (c) => (isCar(c) ? String(num(c.stats?.steer)) : "—") },
  {
    label: "Durability",
    value: (c) => (isCar(c) ? (isCarBroken(c) ? 0 : typeof c.battlesRemaining === "number" ? c.battlesRemaining : null) : null),
    show: (c) => (!isCar(c) ? "—" : isCarBroken(c) ? "Broken" : typeof c.battlesRemaining === "number" ? `${c.battlesRemaining} / ${c.maxBattles ?? c.battlesRemaining}` : "—"),
  },
  { label: "Quick sell", value: (c) => getQuickSellPrice(c), show: (c) => `+${getQuickSellPrice(c)} P` },
];

/**
 * Side by side: the cards you picked, with their stats in rows and the best one in each row highlighted. Only cars have
 * driving stats, so a crew or repair card shows a dash there. Scrolls sideways when the cards don't fit.
 */
export function CompareCardsSheet({ cards, onClose }: { cards: MemberCard[]; onClose: () => void }) {
  const hasUtility = cards.some((c) => !isCar(c));
  return (
    <BottomSheet
      size="full"
      fullHeight
      title="Compare cards"
      subtitle={`${cards.length} cards · the best in each row is highlighted`}
      onClose={onClose}
      footer={
        <div className="pb-2">
          <button type="button" onClick={onClose} className={`${sheetSecondary} w-full`}>
            Back
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Comparison of the selected cards</caption>
            <thead>
              <tr>
                <td className="sticky left-0 z-10 bg-zinc-950" />
                {cards.map((c) => (
                  <th key={c.id} scope="col" className="w-36 min-w-[8.5rem] px-1.5 pb-3 align-top font-normal">
                    <div className="mx-auto w-28">
                      <FullArtCard card={c} className="drop-shadow-lg" />
                    </div>
                    <p className="mt-2 truncate text-center text-xs font-black text-zinc-100">{c.name}</p>
                    <p className="text-center text-[11px] font-bold text-zinc-400">{rarityLabel(c.tier)}</p>
                    {c.listedPrice ? <p className="text-center text-[11px] font-bold text-amber-400">Listed · {c.listedPrice.toLocaleString()} P</p> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = cards.map(row.value);
                const real = values.filter((v): v is number => v !== null);
                const best = real.length >= 2 ? Math.max(...real) : null;
                // If every card ties, none is "best".
                const allTie = real.length >= 2 && real.every((v) => v === real[0]);
                return (
                  <tr key={row.label}>
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-t border-zinc-800 bg-zinc-950 py-2.5 pr-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-400">
                      {row.label}
                    </th>
                    {cards.map((c, i) => {
                      const isBest = best !== null && !allTie && values[i] === best;
                      return (
                        <td key={c.id} className="border-t border-zinc-800 px-1.5 py-2.5 text-center">
                          <span
                            className={`inline-block min-w-[3.5rem] rounded-lg px-2 py-1 font-black tabular-nums ${
                              isBest ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50" : "text-zinc-200"
                            }`}
                          >
                            {row.show(c)}
                            {isBest && <span className="sr-only"> (best)</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasUtility && <p className="text-xs text-zinc-400">Crew and repair cards have no driving stats, so they only show what they would sell for.</p>}
      </div>
    </BottomSheet>
  );
}
