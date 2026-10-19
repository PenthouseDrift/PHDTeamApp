"use client";

import { useMemo, useState, useTransition } from "react";
import { formatGBP } from "@/lib/activity-pricing";
import {
  createConcession,
  updateConcession,
  deleteConcession,
} from "@/actions/admin/concessions";
import {
  computeMetrics,
  type ConcessionRow,
  type ConcessionOverview,
  type ConcessionCategory,
  type ConcessionInput,
} from "@/lib/concessions";

const CATEGORY_LABEL: Record<ConcessionCategory, string> = {
  drink: "🥤 Drink",
  snack: "🍫 Snack",
  other: "📦 Other",
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "drink",
  caseCost: "",
  unitsPerCase: "",
  sellPrice: "",
};

interface FormState {
  name: string;
  category: ConcessionCategory;
  caseCost: string;
  unitsPerCase: string;
  sellPrice: string;
}

function toInput(form: FormState): ConcessionInput {
  return {
    name: form.name.trim(),
    category: form.category,
    caseCost: Number(form.caseCost) || 0,
    unitsPerCase: Number(form.unitsPerCase) || 0,
    sellPrice: Number(form.sellPrice) || 0,
  };
}

function marginTone(pct: number): string {
  if (pct <= 0) return "text-red-600 dark:text-red-400";
  if (pct < 30) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export default function ConcessionsClient({ initial }: { initial: ConcessionOverview }) {
  const [overview, setOverview] = useState<ConcessionOverview>(initial);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live preview of the margins for whatever is currently typed in the form.
  const preview = useMemo(() => {
    const input = toInput(form);
    return computeMetrics({
      id: "preview",
      name: input.name,
      category: input.category,
      caseCost: input.caseCost,
      unitsPerCase: Math.max(1, input.unitsPerCase),
      sellPrice: input.sellPrice,
      createdAt: 0,
      updatedAt: 0,
    });
  }, [form]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  }

  function startEdit(row: ConcessionRow) {
    setEditingId(row.id);
    setError(null);
    setForm({
      name: row.name,
      category: row.category,
      caseCost: String(row.caseCost),
      unitsPerCase: String(row.unitsPerCase),
      sellPrice: String(row.sellPrice),
    });
  }

  async function refreshOverview() {
    // Re-fetch via a server action to keep totals authoritative after a write.
    const { getConcessions } = await import("@/actions/admin/concessions");
    const next = await getConcessions();
    setOverview(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!(Number(form.unitsPerCase) >= 1)) {
      setError("Units per case must be at least 1");
      return;
    }
    // (units sold removed — this is a pricing reference, not a sales ledger)
    const input = toInput(form);
    startTransition(async () => {
      const result = editingId
        ? await updateConcession(editingId, input)
        : await createConcession(input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refreshOverview();
      resetForm();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteConcession(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (editingId === id) resetForm();
      await refreshOverview();
    });
  }

  const { items, totals } = overview;

  return (
    <div className="space-y-8">
      {/* Overview summary — figures for one case of every item */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Items" value={String(totals.itemCount)} />
        <SummaryCard label="Case cost (all items)" value={formatGBP(totals.totalCaseCost)} accent="text-indigo-600 dark:text-indigo-400" />
        <SummaryCard
          label={`Case profit · ${totals.marginPct}%`}
          value={formatGBP(totals.totalCaseProfit)}
          accent="text-emerald-600 dark:text-emerald-400"
          emphasize
        />
      </div>

      {/* Add / edit form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
            {editingId ? "Edit item" : "Add item"}
          </h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <label className="col-span-2 sm:col-span-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 space-y-1">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Red Bull 250ml"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 space-y-1">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ConcessionCategory }))}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              <option value="drink">Drink</option>
              <option value="snack">Snack</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 space-y-1">
            <span>Case cost (£)</span>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={form.caseCost}
              onChange={(e) => setForm((f) => ({ ...f, caseCost: e.target.value }))}
              placeholder="22.39"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 space-y-1">
            <span>Units / case</span>
            <input
              type="number" min="1" step="1" inputMode="numeric"
              value={form.unitsPerCase}
              onChange={(e) => setForm((f) => ({ ...f, unitsPerCase: e.target.value }))}
              placeholder="24"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 space-y-1">
            <span>Sell / unit (£)</span>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={form.sellPrice}
              onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))}
              placeholder="2.20"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>

        {/* Live derived preview — mirrors the per-case breakdown */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Preview:</span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Cost/unit <strong className="text-zinc-900 dark:text-zinc-100">{formatGBP(preview.costPerUnit)}</strong>
          </span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Profit/unit <strong className={marginTone(preview.profitPerUnit)}>{formatGBP(preview.profitPerUnit)}</strong>
          </span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Margin <strong className={marginTone(preview.marginPct)}>{preview.marginPct}%</strong>
          </span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Case profit <strong className={marginTone(preview.caseProfit)}>{formatGBP(preview.caseProfit)}</strong>
          </span>
        </div>

        {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black text-black disabled:opacity-60"
        >
          {pending ? "Saving…" : editingId ? "Save changes" : "Add item"}
        </button>
      </form>

      {/* Items table */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
          <p className="text-4xl mb-3">🧃</p>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No items yet</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Add drinks and snacks above to track their margins.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Item</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Case</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Cost/unit</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Sell</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Profit/unit</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Margin</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Case profit</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{row.name}</span>
                      <span className="block text-[10px] text-zinc-400 dark:text-zinc-500">{CATEGORY_LABEL[row.category]}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {formatGBP(row.caseCost)}
                      <span className="block text-[10px] text-zinc-400 dark:text-zinc-500">×{row.unitsPerCase}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{formatGBP(row.metrics.costPerUnit)}</td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">{formatGBP(row.sellPrice)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${marginTone(row.metrics.profitPerUnit)}`}>
                      {formatGBP(row.metrics.profitPerUnit)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${marginTone(row.metrics.marginPct)}`}>
                      {row.metrics.marginPct}%
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                      {formatGBP(row.metrics.caseProfit)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(row)}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={pending}
                        className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = "text-zinc-900 dark:text-zinc-100",
  emphasize = false,
}: {
  label: string;
  value: string;
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-zinc-900 px-4 py-4 ${
        emphasize ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1.5 font-black tracking-tight ${emphasize ? "text-2xl" : "text-xl"} ${accent}`}>{value}</p>
    </div>
  );
}
