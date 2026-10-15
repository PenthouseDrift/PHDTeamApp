"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatGBP } from "@/lib/pricing";
import { setAsboRcSalePaid, deleteAsboRcSale } from "@/actions/asbo-rc";
import { setListingQuantity } from "@/actions/marketplace";
import type { AsboRcReport, AsboRcReportItem, AsboRcTotals } from "@/lib/asbo-rc";

interface AsboRcReportClientProps {
  report: AsboRcReport;
  /**
   * Read-only mode for the ASBO-RC partner's own view: hides the settlement
   * checkbox/column (only Penthouse Drift admins mark items as paid). Sold
   * items that have been settled are still shown struck through.
   */
  readOnly?: boolean;
}

type Tab = "stock" | "sold";

function TotalsBar({
  totals,
  label,
  readOnly = false,
}: {
  totals: AsboRcTotals;
  label: string;
  readOnly?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 sm:p-4 ${
        readOnly ? "sm:grid-cols-2" : "sm:grid-cols-5"
      }`}
    >
      <Cell label={label} value={`${totals.itemCount} (${totals.unitCount} units)`} />
      {/* Product value figures (Total RRP, Avg unit RRP) + Penthouse's cut are
          internal — hidden from the ASBO-RC partner view. They only see what
          they're owed. */}
      {!readOnly && <Cell label="Total RRP" value={formatGBP(totals.totalRrp)} />}
      {!readOnly && <Cell label="Penthouse 7%" value={formatGBP(totals.penthouseCut)} tone="amber" />}
      <Cell label="To ASBO-RC" value={formatGBP(totals.owedToAsboRc)} tone="teal" />
      {!readOnly && (
        <Cell label="Avg unit RRP" value={formatGBP(totals.unitCount ? totals.totalRrp / totals.unitCount : 0)} />
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "teal";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-600 dark:text-amber-400",
    teal: "text-teal-600 dark:text-teal-400",
  };
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm sm:text-base font-black ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

export function AsboRcReportClient({ report, readOnly = false }: AsboRcReportClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stock");
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  // The settlement controls (Paid checkbox + delete) only appear on the sold
  // tab for admins (never in the ASBO-RC partner's read-only view).
  const showManageColumn = tab === "sold" && !readOnly;

  const handleTogglePaid = (item: AsboRcReportItem) => {
    if (!item.saleId) return;
    setBusyId(item.rowKey);
    startTransition(async () => {
      const res = await setAsboRcSalePaid(item.saleId!, !item.paid);
      setBusyId(null);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const handleSetQuantity = (item: AsboRcReportItem, nextTotalQuantity: number) => {
    const soldCount = item.soldCount ?? 0;
    // Total quantity can never go below what's already sold.
    const clamped = Math.max(soldCount, Math.max(1, Math.floor(nextTotalQuantity)));
    if (clamped === (item.totalQuantity ?? 0)) return;
    setBusyId(item.rowKey);
    startTransition(async () => {
      const res = await setListingQuantity(item.listingId, clamped);
      setBusyId(null);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const handleDeleteSale = (item: AsboRcReportItem) => {
    if (!item.saleId) return;
    if (
      !confirm(
        `Delete this sale of "${item.title}"? This removes it from the settlement ledger permanently (use only to correct a mistake). It does not change the listing's stock.`
      )
    ) {
      return;
    }
    setBusyId(item.rowKey);
    startTransition(async () => {
      const res = await deleteAsboRcSale(item.saleId!);
      setBusyId(null);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  };

  const items = tab === "stock" ? report.inStock : report.sold;
  const totals = tab === "stock" ? report.inStockTotals : report.soldTotals;

  // Column span of the data columns after the Product cell — used for date
  // section rows. Read-only (ASBO): Qty, RRP, To ASBO-RC = 3 (Total RRP and
  // Penthouse 7% hidden). Admin: Qty, RRP, Total RRP, Penthouse 7%, To ASBO = 5.
  const dataColSpan = readOnly ? 3 : 5;

  // Group sold rows into date sections (newest day first). Each group carries a
  // subtotal of units + money owed for that day.
  const soldGroups = (() => {
    if (tab !== "sold") return [];
    const byDay = new Map<string, { label: string; sortKey: number; rows: AsboRcReportItem[] }>();
    for (const row of items) {
      const ts = row.soldAt ?? row.createdAt ?? 0;
      const d = new Date(ts);
      // Group key by calendar day (local time).
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const key = String(dayStart);
      if (!byDay.has(key)) {
        byDay.set(key, {
          label: ts
            ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
            : "Date unknown",
          sortKey: dayStart,
          rows: [],
        });
      }
      byDay.get(key)!.rows.push(row);
    }
    return [...byDay.values()]
      .sort((a, b) => b.sortKey - a.sortKey) // newest day first
      .map((g) => ({
        ...g,
        unitCount: g.rows.length,
        owed: g.rows.reduce((s, r) => s + r.owedToAsboRc, 0),
      }));
  })();

  const renderRow = (item: AsboRcReportItem) => {
    const struck = tab === "sold" && item.paid;
    return (
      <tr
        key={item.rowKey}
        className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
          struck ? "opacity-60" : ""
        }`}
      >
        {showManageColumn && (
          <td className="px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.paid}
                disabled={isPending && busyId === item.rowKey}
                onChange={() => handleTogglePaid(item)}
                title={item.paid ? "Mark as unpaid" : "Mark as paid to ASBO-RC"}
                className="h-5 w-5 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-zinc-600 cursor-pointer disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleDeleteSale(item)}
                disabled={isPending && busyId === item.rowKey}
                title="Delete this sale record (correct a mistake)"
                aria-label="Delete sale record"
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          </td>
        )}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2.5">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image}
                alt={item.title}
                className="h-9 w-9 rounded-md object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
              />
            ) : (
              <div className="h-9 w-9 rounded-md bg-zinc-100 dark:bg-zinc-800 shrink-0" />
            )}
            <span
              className={`font-medium text-zinc-900 dark:text-zinc-100 ${
                struck ? "line-through" : ""
              }`}
            >
              {item.title}
              {struck && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300 no-underline">
                  Sent to ASBO-RC
                </span>
              )}
            </span>
          </div>
        </td>
        <td className={`px-3 py-3 text-right tabular-nums ${struck ? "line-through" : ""}`}>
          {tab === "stock" && !readOnly ? (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                aria-label="Decrease total quantity"
                onClick={() => handleSetQuantity(item, (item.totalQuantity ?? 1) - 1)}
                disabled={
                  (isPending && busyId === item.rowKey) ||
                  (item.totalQuantity ?? 1) <= Math.max(1, item.soldCount ?? 0)
                }
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center font-bold" title={`${item.quantity} available of ${item.totalQuantity} total (${item.soldCount ?? 0} sold)`}>
                {item.quantity}
                {(item.soldCount ?? 0) > 0 && (
                  <span className="font-normal text-zinc-400 dark:text-zinc-500">/{item.totalQuantity}</span>
                )}
              </span>
              <button
                type="button"
                aria-label="Increase total quantity"
                onClick={() => handleSetQuantity(item, (item.totalQuantity ?? 0) + 1)}
                disabled={isPending && busyId === item.rowKey}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                +
              </button>
            </div>
          ) : (
            item.quantity
          )}
        </td>
        <td className={`px-3 py-3 text-right tabular-nums ${struck ? "line-through" : ""}`}>
          {formatGBP(item.rrp)}
        </td>
        {/* Total value column is internal — hidden from the ASBO partner view. */}
        {!readOnly && (
          <td className={`px-3 py-3 text-right tabular-nums font-semibold ${struck ? "line-through" : ""}`}>
            {formatGBP(item.totalRrp)}
          </td>
        )}
        {!readOnly && (
          <td className={`px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 ${struck ? "line-through" : ""}`}>
            {formatGBP(item.penthouseCut)}
          </td>
        )}
        <td className={`px-3 py-3 text-right tabular-nums font-bold text-teal-600 dark:text-teal-400 ${struck ? "line-through" : ""}`}>
          {formatGBP(item.owedToAsboRc)}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      {/* Overall headline totals */}
      <div className={`grid grid-cols-2 gap-2.5 ${readOnly ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <Headline
          label="Products"
          value={String(report.overall.itemCount)}
          sub={(() => {
            // Admin sees the consignment VALUE alongside each count; the ASBO
            // read-only view stays counts-only (no product value figures).
            const stockPart = readOnly
              ? `${report.inStockTotals.unitCount} in stock`
              : `${report.inStockTotals.unitCount} in stock (${formatGBP(report.inStockTotals.totalRrp)})`;
            if (report.draftTotals.unitCount <= 0) return stockPart;
            const draftPart = readOnly
              ? `${report.draftTotals.unitCount} in draft`
              : `${report.draftTotals.unitCount} in draft (${formatGBP(report.draftTotals.totalRrp)})`;
            return `${stockPart} · ${draftPart}`;
          })()}
        />
        {/* Owed to ASBO (93% of consignment) — shown to both ASBO and admin. */}
        <Headline label="Owed to ASBO-RC (all)" value={formatGBP(report.overall.owedToAsboRc)} tone="teal" />
        {/* Penthouse's take + uplift are internal — admin only. */}
        {!readOnly && (
          <Headline
            label="Penthouse margin (all)"
            value={formatGBP(report.overall.penthouseCut)}
            sub={
              [
                report.overall.totalUplift > 0
                  ? `incl. ${formatGBP(report.overall.totalUplift)} uplift`
                  : null,
                // Estimated margin if all current draft stock sold (admin view).
                report.draftTotals.penthouseCut > 0
                  ? `+ ${formatGBP(report.draftTotals.penthouseCut)} est. in draft`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            tone="amber"
          />
        )}
      </div>

      {/* Admin-only: total customer sell value vs consignment basis. */}
      {!readOnly && report.overall.totalUplift > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <Headline label="Sell value (all)" value={formatGBP(report.overall.totalSell)} />
          <Headline
            label="Uplift kept (all)"
            value={formatGBP(report.overall.totalUplift)}
            tone="emerald"
          />
        </div>
      )}

      {/* Settlement progress for sold items */}
      <div className="grid grid-cols-2 gap-2.5">
        <Headline label="Outstanding to ASBO-RC" value={formatGBP(report.outstandingToAsboRc)} tone="red" />
        <Headline label="Paid to ASBO-RC" value={formatGBP(report.paidToAsboRc)} tone="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
          Products &amp; Stock ({report.inStock.length})
        </TabButton>
        <TabButton active={tab === "sold"} onClick={() => setTab("sold")}>
          Sold / Settlement ({report.sold.length})
        </TabButton>
      </div>

      <TotalsBar totals={totals} label={tab === "stock" ? "In stock" : "Sold"} readOnly={readOnly} />

      {/* Table */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {tab === "stock"
            ? "No ASBO-RC items in stock. Mark a marketplace item \u201cSold by ASBO-RC\u201d to add it here."
            : "No ASBO-RC items sold yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-600 dark:text-zinc-400">
              <tr>
                {showManageColumn && <th className="px-3 py-3 font-medium w-20">Paid</th>}
                <th className="px-3 py-3 font-medium">Product</th>
                <th className="px-3 py-3 font-medium text-right">{tab === "stock" ? "Stock" : "Qty"}</th>
                <th className="px-3 py-3 font-medium text-right">RRP</th>
                {!readOnly && <th className="px-3 py-3 font-medium text-right">Total RRP</th>}
                {!readOnly && <th className="px-3 py-3 font-medium text-right">Penthouse 7%</th>}
                <th className="px-3 py-3 font-medium text-right">To ASBO-RC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {tab === "stock"
                ? items.map((item) => renderRow(item))
                : soldGroups.map((group) => (
                    <Fragment key={`grp-${group.sortKey}`}>
                      {/* Date section header */}
                      <tr className="bg-zinc-100/80 dark:bg-zinc-800/70">
                        {showManageColumn && <td className="px-3 py-2" />}
                        <td
                          colSpan={1}
                          className="px-3 py-2 text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
                        >
                          📅 Sold {group.label}
                        </td>
                        <td
                          colSpan={dataColSpan - 1}
                          className="px-3 py-2 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                        >
                          {group.unitCount} unit{group.unitCount === 1 ? "" : "s"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-black tabular-nums text-teal-600 dark:text-teal-400">
                          {formatGBP(group.owed)}
                        </td>
                      </tr>
                      {group.rows.map((item) => renderRow(item))}
                    </Fragment>
                  ))}
            </tbody>
            <tfoot className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 font-black">
              <tr>
                {showManageColumn && <td className="px-3 py-3" />}
                <td className="px-3 py-3 text-zinc-900 dark:text-zinc-100">Totals</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.unitCount}</td>
                <td className="px-3 py-3" />
                {!readOnly && (
                  <td className="px-3 py-3 text-right tabular-nums">{formatGBP(totals.totalRrp)}</td>
                )}
                {!readOnly && (
                  <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {formatGBP(totals.penthouseCut)}
                  </td>
                )}
                <td className="px-3 py-3 text-right tabular-nums text-teal-600 dark:text-teal-400">
                  {formatGBP(totals.owedToAsboRc)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "sold" && report.sold.length > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {readOnly
            ? "Each row is one sold unit. Rows struck through have been paid to ASBO-RC by Penthouse Drift; the rest are still outstanding. These stay on record even when more stock comes in."
            : "Each row is one sold unit \u2014 tick it once you\u2019ve manually sent ASBO-RC their share. These records are permanent and survive restocking; use the \ud83d\uddd1 delete only to correct a mistaken sale (it does not change listing stock)."}
        </p>
      )}

      {tab === "stock" && !readOnly && report.inStock.length > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Use the −/+ buttons to adjust a product&apos;s total stock (e.g. when ASBO-RC sends more).
          The change applies everywhere instantly — marketplace, website, and dashboard. The number
          shown is what&apos;s currently available; already-sold units aren&apos;t affected.
        </p>
      )}
    </div>
  );
}

function Headline({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "amber" | "teal" | "emerald" | "red";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-600 dark:text-amber-400",
    teal: "text-teal-600 dark:text-teal-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 sm:p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-lg sm:text-xl font-black leading-none ${toneClasses[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
        active
          ? "border-teal-500 text-teal-600 dark:text-teal-400"
          : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}
