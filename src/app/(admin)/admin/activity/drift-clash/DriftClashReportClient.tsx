"use client";

import { Fragment, useState } from "react";
import { formatGBP } from "@/lib/activity-pricing";
import type { DriftClashReport, TourEconomy } from "@/lib/drift-clash-report";

const card = "rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900";
const th = "px-4 sm:px-6 py-4 font-semibold text-zinc-500 dark:text-zinc-400";
const td = "px-4 sm:px-6 py-4";
const nf = new Intl.NumberFormat("en-GB");

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Stat({ label, value, sub, tone = "plain" }: { label: string; value: string; sub?: string; tone?: "plain" | "money" }) {
  return (
    <div className={`${card} p-5 ${tone === "money" ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10" : ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 font-black tracking-tight ${tone === "money" ? "text-3xl text-emerald-600 dark:text-emerald-400" : "text-2xl text-zinc-900 dark:text-zinc-100"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className={`${card} px-6 py-14 text-center`}>
      <p className="mb-3 text-4xl">📊</p>
      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{text}</p>
    </div>
  );
}

const netTone = (n: number) => (n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf.format(Math.abs(n))}`;

export default function DriftClashReportClient({ report }: { report: DriftClashReport }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([currentMonthKey()]));
  const toggle = (m: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const { sales, months, bundles, tour } = report;
  const monthSum = months.reduce((s, m) => s + m.revenue, 0);

  return (
    <div className="space-y-10">
      {/* ── Total ── */}
      <section className="space-y-4" aria-label="Total">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Total taken" value={formatGBP(sales.revenue)} sub={report.firstSale ? `${report.firstSale} to ${report.lastSale}` : "No sales yet"} tone="money" />
          <Stat label="Purchases" value={nf.format(sales.purchases)} sub={`${nf.format(sales.buyers)} different member${sales.buyers === 1 ? "" : "s"}`} />
          <Stat label="P-Credits sold" value={nf.format(sales.pCredits)} sub="Using today's bundle sizes" />
          <Stat label="Average purchase" value={formatGBP(sales.averagePurchase)} sub="Total taken ÷ purchases" />
        </div>

        {bundles.length > 0 && (
          <div className={`${card} overflow-hidden`}>
            <div className="border-b border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100 sm:px-6">By bundle, all time</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left dark:bg-zinc-950/40">
                  <tr>
                    <th className={th}>Bundle</th>
                    <th className={`${th} text-right`}>Sold</th>
                    <th className={`${th} hidden text-right sm:table-cell`}>P-Credits</th>
                    <th className={`${th} text-right`}>Taken</th>
                    <th className={`${th} hidden text-right sm:table-cell`}>Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {bundles.map((b) => (
                    <tr key={b.name}>
                      <td className={`${td} font-semibold text-zinc-900 dark:text-zinc-100`}>{b.name}</td>
                      <td className={`${td} text-right text-zinc-600 dark:text-zinc-300`}>{nf.format(b.purchases)}</td>
                      <td className={`${td} hidden text-right text-zinc-600 dark:text-zinc-300 sm:table-cell`}>{nf.format(b.pCredits)}</td>
                      <td className={`${td} text-right font-bold text-emerald-600 dark:text-emerald-400`}>{formatGBP(b.revenue)}</td>
                      <td className={`${td} hidden text-right text-xs text-zinc-500 dark:text-zinc-400 sm:table-cell`}>
                        {sales.revenue > 0 ? `${Math.round((b.revenue / sales.revenue) * 100)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Month by month ── */}
      <section className="space-y-3" aria-label="Month by month">
        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Month by month</h2>
        {months.length === 0 ? (
          <Empty title="No P-Credit sales recorded yet" text="Bundle purchases from the Drift Clash store will appear here." />
        ) : (
          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-950/40">
                  <tr>
                    <th className={th}>Month</th>
                    <th className={`${th} text-right`}>Purchases</th>
                    <th className={`${th} hidden text-right sm:table-cell`}>P-Credits</th>
                    <th className={`${th} hidden text-right md:table-cell`}>Members</th>
                    <th className={`${th} text-right`}>Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {months.map((m) => {
                    const isOpen = open.has(m.month);
                    return (
                      <Fragment key={m.month}>
                        <tr onClick={() => toggle(m.month)} className="cursor-pointer transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20" aria-expanded={isOpen}>
                          <td className={`${td} font-bold text-zinc-900 dark:text-zinc-100`}>
                            <span className="inline-flex items-center gap-2">
                              <span className={`text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                                ▶
                              </span>
                              {m.label}
                            </span>
                          </td>
                          <td className={`${td} text-right font-medium text-indigo-600 dark:text-indigo-400`}>{nf.format(m.purchases)}</td>
                          <td className={`${td} hidden text-right text-zinc-600 dark:text-zinc-300 sm:table-cell`}>{nf.format(m.pCredits)}</td>
                          <td className={`${td} hidden text-right text-xs text-zinc-500 dark:text-zinc-400 md:table-cell`}>{nf.format(m.buyers)}</td>
                          <td className={`${td} text-right text-base font-black text-emerald-600 dark:text-emerald-400`}>{formatGBP(m.revenue)}</td>
                        </tr>
                        {isOpen && (
                          <>
                            {m.bundles.map((b) => (
                              <tr key={`${m.month}-${b.name}`} className="bg-zinc-50/60 text-xs dark:bg-zinc-950/30">
                                <td className="px-4 py-2.5 pl-10 font-semibold text-zinc-700 dark:text-zinc-300 sm:px-6 sm:pl-14">{b.name}</td>
                                <td className="px-4 py-2.5 text-right text-indigo-600/90 dark:text-indigo-400/90 sm:px-6">{nf.format(b.purchases)}</td>
                                <td className="hidden px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400 sm:table-cell sm:px-6">{nf.format(b.pCredits)}</td>
                                <td className="hidden md:table-cell" />
                                <td className="px-4 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 sm:px-6">{formatGBP(b.revenue)}</td>
                              </tr>
                            ))}
                            {m.days.map((d) => (
                              <tr key={`${m.month}-${d.day}`} className="text-xs">
                                <td className="px-4 py-2 pl-14 text-zinc-500 dark:text-zinc-400 sm:px-6 sm:pl-20">{d.label}</td>
                                <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400 sm:px-6">{nf.format(d.purchases)}</td>
                                <td className="hidden px-4 py-2 text-right text-zinc-400 dark:text-zinc-500 sm:table-cell sm:px-6">{nf.format(d.pCredits)}</td>
                                <td className="hidden md:table-cell" />
                                <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-300 sm:px-6">{formatGBP(d.revenue)}</td>
                              </tr>
                            ))}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/40">
                  <tr>
                    <td className={`${td} font-black text-zinc-900 dark:text-zinc-100`}>Total, {months.length} month{months.length === 1 ? "" : "s"}</td>
                    <td className={`${td} text-right font-bold text-indigo-600 dark:text-indigo-400`}>{nf.format(months.reduce((s, m) => s + m.purchases, 0))}</td>
                    <td className={`${td} hidden text-right font-bold text-zinc-600 dark:text-zinc-300 sm:table-cell`}>{nf.format(months.reduce((s, m) => s + m.pCredits, 0))}</td>
                    <td className="hidden md:table-cell" />
                    <td className={`${td} text-right text-base font-black text-emerald-600 dark:text-emerald-400`}>{formatGBP(monthSum)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Tandem Tour ── */}
      <section className="space-y-3" aria-label="Tandem Tour">
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Tandem Tour (P-Credits)</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Entry and reroll fees taken in, prizes paid out. P-Credits, not pounds, so it is not part of the total above.</p>
        </div>
        {tour.months.length === 0 ? (
          <Empty title="No Tandem Tour activity yet" text="Tours started, fees and prizes will appear here once members play." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Fees taken in" value={`${nf.format(tour.totals.pIn)} P`} sub={`${nf.format(tour.totals.paid)} paid · ${nf.format(tour.totals.free)} free runs`} />
              <Stat label="Prizes paid out" value={`${nf.format(tour.totals.pOut)} P`} sub={`${nf.format(tour.totals.packCredits)} pack credits`} />
              <Stat label="Net" value={`${signed(tour.totals.net)} P`} sub={tour.totals.net >= 0 ? "P-Credits taken out of circulation" : "More paid out than taken in"} />
              <Stat label="Tours" value={nf.format(tour.totals.started)} sub={`${nf.format(tour.totals.completed)} finished`} />
            </div>
            <TourTable months={tour.months} totals={tour.totals} />
          </>
        )}
      </section>
    </div>
  );
}

function TourTable({ months, totals }: { months: DriftClashReport["tour"]["months"]; totals: TourEconomy }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-950/40">
            <tr>
              <th className={th}>Month</th>
              <th className={`${th} text-right`}>Tours</th>
              <th className={`${th} hidden text-right sm:table-cell`}>Paid</th>
              <th className={`${th} text-right`}>Fees in</th>
              <th className={`${th} text-right`}>Prizes out</th>
              <th className={`${th} text-right`}>Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {months.map((m) => (
              <tr key={m.month}>
                <td className={`${td} font-bold text-zinc-900 dark:text-zinc-100`}>{m.label}</td>
                <td className={`${td} text-right text-zinc-600 dark:text-zinc-300`}>{nf.format(m.started)}</td>
                <td className={`${td} hidden text-right text-zinc-500 dark:text-zinc-400 sm:table-cell`}>{nf.format(m.paid)}</td>
                <td className={`${td} text-right text-indigo-600 dark:text-indigo-400`}>{nf.format(m.pIn)}</td>
                <td className={`${td} text-right text-amber-600 dark:text-amber-400`}>{nf.format(m.pOut)}</td>
                <td className={`${td} text-right font-black ${netTone(m.net)}`}>{signed(m.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/40">
            <tr>
              <td className={`${td} font-black text-zinc-900 dark:text-zinc-100`}>Total</td>
              <td className={`${td} text-right font-bold text-zinc-600 dark:text-zinc-300`}>{nf.format(totals.started)}</td>
              <td className={`${td} hidden text-right font-bold text-zinc-500 dark:text-zinc-400 sm:table-cell`}>{nf.format(totals.paid)}</td>
              <td className={`${td} text-right font-bold text-indigo-600 dark:text-indigo-400`}>{nf.format(totals.pIn)}</td>
              <td className={`${td} text-right font-bold text-amber-600 dark:text-amber-400`}>{nf.format(totals.pOut)}</td>
              <td className={`${td} text-right font-black ${netTone(totals.net)}`}>{signed(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
