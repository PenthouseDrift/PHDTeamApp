"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHART_DAYS,
  CHART_MONTHS,
  CLUB_ACCOUNTS,
  accountLabel,
  formatAxisPence,
  formatPence,
  niceAxisMax,
  type ChartPeriod,
  type ChartScope,
  type ClubChartData,
} from "@/lib/club-accounts";

const H = 270;
const PAD = { left: 44, right: 6, top: 10, bottom: 36 };
const PLOT_H = H - PAD.top - PAD.bottom;
const IN_COLOUR = "#10b981";
const OUT_COLOUR = "#ef4444";

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-[11px] font-bold ${
    on
      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
  }`;

/**
 * Money in (green) and money out (red) over time: per day for the last 30 days, or per month for the last 12, for all
 * the accounts together or one account at a time. Tap, hover or tab to a column to read its figures.
 */
export default function ClubChart({ data }: { data: ClubChartData | null }) {
  const [period, setPeriod] = useState<ChartPeriod>("month");
  const [scope, setScope] = useState<ChartScope>("all");
  const [active, setActive] = useState<number | null>(null);
  // Drawn at the real width of the box (not scaled from a fixed size), so the text stays readable on a phone.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);
  const PLOT_W = W - PAD.left - PAD.right;

  if (!data) return null;
  const points = data[period][scope];
  const n = points.length;
  const axisMax = niceAxisMax(Math.max(0, ...points.map((p) => Math.max(p.inPence, p.outPence))));
  const totalIn = points.reduce((s, p) => s + p.inPence, 0);
  const totalOut = points.reduce((s, p) => s + p.outPence, 0);
  const empty = totalIn === 0 && totalOut === 0;
  const slot = PLOT_W / n;
  const barW = Math.min(20, Math.max(2, slot * 0.38));
  const y = (pence: number) => PAD.top + PLOT_H * (1 - pence / axisMax);
  const barH = (pence: number) => (pence > 0 ? Math.max(2, PLOT_H * (pence / axisMax)) : 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(axisMax * f));
  const showing = active !== null ? points[active] : null;

  const readout = (label: string, inPence: number, outPence: number) => (
    <p className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
      <strong className="font-black text-zinc-900 dark:text-zinc-100">{label}</strong>
      <span className="mx-2 font-bold text-emerald-600 dark:text-emerald-400">In {formatPence(inPence)}</span>
      <span className="mr-2 font-bold text-red-600 dark:text-red-400">Out {formatPence(outPence)}</span>
      <span className="font-bold">
        Net {inPence - outPence < 0 ? "−" : "+"}
        {formatPence(Math.abs(inPence - outPence))}
      </span>
    </p>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-black text-zinc-900 dark:text-zinc-100">Money in &amp; out</h3>
        <div role="group" aria-label="Chart period" className="flex gap-1.5">
          <button type="button" onClick={() => { setPeriod("day"); setActive(null); }} aria-pressed={period === "day"} className={chip(period === "day")}>
            Daily
          </button>
          <button type="button" onClick={() => { setPeriod("month"); setActive(null); }} aria-pressed={period === "month"} className={chip(period === "month")}>
            Monthly
          </button>
        </div>
      </div>

      <div role="group" aria-label="Chart account" className="flex flex-wrap gap-1.5">
        {(["all", ...CLUB_ACCOUNTS.map((a) => a.id)] as const).map((id) => (
          <button key={id} type="button" onClick={() => { setScope(id); setActive(null); }} aria-pressed={scope === id} className={chip(scope === id)}>
            {id === "all" ? "All accounts" : accountLabel(id)}
          </button>
        ))}
      </div>

      {showing
        ? readout(showing.title, showing.inPence, showing.outPence)
        : readout(period === "day" ? `Last ${CHART_DAYS} days` : `Last ${CHART_MONTHS} months`, totalIn, totalOut)}

      {/* The chart is drawn on top of a box of fixed height, so its own width can never push the card wider. */}
      <div ref={box} className="relative w-full" style={{ height: H }} onMouseLeave={() => setActive(null)}>
        <svg width={W} height={H} className="absolute left-0 top-0 block" role="img" aria-label={`Money in and out, ${period === "day" ? "per day" : "per month"}`}>
          {/* Gridlines and the pounds axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={11} className="fill-zinc-500 dark:fill-zinc-400">
                {formatAxisPence(t)}
              </text>
            </g>
          ))}

          {points.map((p, i) => {
            const cx = PAD.left + slot * (i + 0.5);
            const isActive = active === i;
            // Daily: a label every 5th day, ending on today. Monthly: every month, with the year under January and the first.
            const showLabel = period === "month" || (n - 1 - i) % 5 === 0;
            const year = period === "month" && (i === 0 || p.label === "Jan") ? p.key.slice(0, 4) : null;
            return (
              <g
                key={p.key}
                tabIndex={0}
                role="img"
                aria-label={`${p.title}: in ${formatPence(p.inPence)}, out ${formatPence(p.outPence)}`}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive((a) => (a === i ? null : i))}
                className="cursor-pointer outline-none"
              >
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={PLOT_H} fill={isActive ? "rgba(99,102,241,0.10)" : "transparent"} rx={4} />
                <rect x={cx - barW - 0.5} y={y(p.inPence)} width={barW} height={barH(p.inPence)} fill={IN_COLOUR} rx={2} />
                <rect x={cx + 0.5} y={y(p.outPence)} width={barW} height={barH(p.outPence)} fill={OUT_COLOUR} rx={2} />
                {showLabel && (
                  <text
                    x={period === "day" && i === n - 1 ? W - PAD.right : cx}
                    y={H - (year ? 20 : 14)}
                    textAnchor={period === "day" && i === n - 1 ? "end" : "middle"}
                    fontSize={11} className={isActive ? "fill-zinc-900 font-bold dark:fill-zinc-100" : "fill-zinc-500 dark:fill-zinc-400"}>
                    {p.label}
                  </text>
                )}
                {showLabel && year && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} className="fill-zinc-400 dark:fill-zinc-500">
                    {year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500">
            Nothing in or out {period === "day" ? "in the last 30 days" : "in the last 12 months"}
            {scope === "all" ? "" : ` for ${accountLabel(scope)}`}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: IN_COLOUR }} /> Money in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT_COLOUR }} /> Money out
        </span>
        <span className="font-normal">
          {scope === "all" ? "Moves between accounts aren't counted." : "Includes money moved to or from the other accounts."}
        </span>
      </div>

      {/* The same figures as text, for screen readers */}
      <table className="sr-only">
        <caption>
          Money in and out {period === "day" ? "per day" : "per month"}, {scope === "all" ? "all accounts" : accountLabel(scope)}
        </caption>
        <thead>
          <tr>
            <th scope="col">{period === "day" ? "Day" : "Month"}</th>
            <th scope="col">Money in</th>
            <th scope="col">Money out</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.title}</th>
              <td>{formatPence(p.inPence)}</td>
              <td>{formatPence(p.outPence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
