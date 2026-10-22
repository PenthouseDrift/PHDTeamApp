"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatGBP } from "@/lib/pricing";
import {
  setFacilitatedSalePaid,
  settleOwnerPayouts,
  deleteFacilitatedSale,
} from "@/actions/phd-facilitated";
import type {
  FacilitatedPayoutReport,
  FacilitatedTotals,
  OwnerPayoutGroup,
} from "@/lib/phd-facilitated";

interface Props {
  report: FacilitatedPayoutReport;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Cell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "indigo";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-600 dark:text-amber-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
  };
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-0.5 text-sm sm:text-base font-black ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

function TotalsBar({ totals }: { totals: FacilitatedTotals }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 sm:p-4 sm:grid-cols-4">
      <Cell label="Units sold" value={String(totals.unitCount)} />
      <Cell label="Total sales" value={formatGBP(totals.totalSell)} />
      <Cell label="Owed to owners" value={formatGBP(totals.totalOwnerPayout)} tone="indigo" />
      <Cell label="Club keeps" value={formatGBP(totals.totalClubCut)} tone="amber" />
    </div>
  );
}

export function FacilitatedPayoutReportClient({ report }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const togglePaid = (saleId: string, paid: boolean) => {
    setBusyId(saleId);
    startTransition(async () => {
      await setFacilitatedSalePaid(saleId, paid);
      setBusyId(null);
      router.refresh();
    });
  };

  const settleOwner = (ownerId: string, ownerName: string, outstanding: number) => {
    if (outstanding <= 0) return;
    if (
      !window.confirm(
        `Mark all outstanding payouts to ${ownerName} (${formatGBP(outstanding)}) as paid?`
      )
    ) {
      return;
    }
    setBusyId(`owner:${ownerId}`);
    startTransition(async () => {
      await settleOwnerPayouts(ownerId);
      setBusyId(null);
      router.refresh();
    });
  };

  const removeSale = (saleId: string, title: string) => {
    if (!window.confirm(`Delete the payout record for "${title}"? This can't be undone.`)) {
      return;
    }
    setBusyId(saleId);
    startTransition(async () => {
      await deleteFacilitatedSale(saleId);
      setBusyId(null);
      router.refresh();
    });
  };

  if (report.owners.length === 0) {
    return (
      <div className="space-y-6">
        <TotalsBar totals={report.overall} />
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No facilitated sales yet. When a &ldquo;Facilitated by PHD&rdquo; item sells, it shows
          up here grouped by the owner we owe.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Headline settlement figures */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Outstanding to owners
          </p>
          <p className="mt-0.5 text-2xl font-black text-indigo-700 dark:text-indigo-300">
            {formatGBP(report.outstandingToOwners)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Already paid out
          </p>
          <p className="mt-0.5 text-2xl font-black text-zinc-900 dark:text-zinc-100">
            {formatGBP(report.paidToOwners)}
          </p>
        </div>
      </div>

      <TotalsBar totals={report.overall} />

      {/* One card per owner */}
      {report.owners.map((owner: OwnerPayoutGroup) => (
        <div
          key={owner.ownerId}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{owner.ownerName}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {owner.totals.unitCount} unit{owner.totals.unitCount === 1 ? "" : "s"} sold
                {owner.outstanding > 0 ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatGBP(owner.outstanding)} outstanding
                    </span>
                  </>
                ) : null}
                {owner.paid > 0 && <> · {formatGBP(owner.paid)} paid</>}
              </p>
            </div>
            {owner.outstanding > 0 ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => settleOwner(owner.ownerId, owner.ownerName, owner.outstanding)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-400 active:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === `owner:${owner.ownerId}` ? "Settling…" : "Mark owner paid"}
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                ✓ All paid
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {owner.rows.map((row) => (
              <div
                key={row.saleId}
                className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 ${
                  row.paid ? "opacity-60" : ""
                }`}
              >
                {/* Product + sale meta */}
                <div className="min-w-0 flex-1 basis-48">
                  <p
                    className={`truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${
                      row.paid ? "line-through" : ""
                    }`}
                  >
                    {row.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Sold {formatDate(row.soldAt)} · Sale {formatGBP(row.sellPrice)} · Club{" "}
                    {formatGBP(row.clubCut)}
                  </p>
                </div>

                {/* Controls cluster — kept together with consistent spacing */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Owed owner
                    </p>
                    <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                      {formatGBP(row.ownerPayout)}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={row.paid}
                      disabled={isPending}
                      onChange={(e) => togglePaid(row.saleId, e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-500 dark:border-zinc-600"
                    />
                    {busyId === row.saleId ? "…" : row.paid ? "Paid" : "Mark paid"}
                  </label>
                  <button
                    type="button"
                    aria-label="Delete payout record"
                    disabled={isPending}
                    onClick={() => removeSale(row.saleId, row.title)}
                    className="rounded-md px-2 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
