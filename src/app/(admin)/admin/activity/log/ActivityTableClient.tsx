"use client";

import { useState, useTransition } from "react";
import { refreshActivityLog, deleteActivity } from "@/actions/admin/activity";
import { markUnpaidAsPaid, waiveUnpaid } from "@/actions/admin/unpaid";
import type { ActivityEntry } from "@/lib/activity";
import { resolveActivityAmount } from "@/lib/activity-pricing";

const FULL_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

function TypeIcon({ item }: { item: ActivityEntry }) {
  if (item.type === "purchase") {
    return (
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm shadow-sm ${
          item.isDev
            ? "border-amber-200 bg-amber-100 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/20"
            : "border-emerald-200 bg-emerald-100 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/20"
        }`}
        title={item.isDev ? "Dev Purchase" : "Purchase"}
      >
        {item.isDev ? "🧪" : "💳"}
      </div>
    );
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm text-blue-600 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400"
      title="Check-in"
    >
      ✅
    </div>
  );
}

function Amount({ item }: { item: ActivityEntry }) {
  if (item.isDev) return <span className="text-sm font-medium text-zinc-400">Simulated</span>;
  if (item.waived) return <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Waived</span>;
  if (item.unpaid) return <span className="text-xs font-black uppercase tracking-wide text-red-500">Unpaid</span>;
  const resolved = resolveActivityAmount(item);
  return (
    <>
      {resolved !== null
        ? new Intl.NumberFormat("en-GB", { style: "currency", currency: item.currency || "GBP" }).format(resolved)
        : "—"}
    </>
  );
}

function TestBadge() {
  return (
    <span className="mr-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
      TEST
    </span>
  );
}

export default function ActivityTableClient({ initialData }: { initialData: ActivityEntry[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const itemsPerPage = 20;

  // Filter data
  const filteredData = initialData.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.memberName?.toLowerCase().includes(q) ||
      item.memberId?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    );
  });

  // Paginate data
  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Manual override: they've now paid (counts as revenue), or the balance is
  // written off (waived: cleared, no revenue).
  async function settle(item: ActivityEntry, mode: "paid" | "waived") {
    if (mode === "waived" && !window.confirm("Waive this balance? It will be cleared without counting as revenue.")) return;
    setPayingId(item.id);
    const res = mode === "paid" ? await markUnpaidAsPaid(item.id) : await waiveUnpaid(item.id);
    setPayingId(null);
    if (!res.success) alert(res.error);
    else handleRefresh();
  }

  function handleRefresh() {
    startTransition(async () => {
      await refreshActivityLog();
      setCurrentPage(1);
    });
  }

  async function confirmAndDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);

    const res = await deleteActivity(id);
    setDeletingId(null);
    if (!res.success) {
      alert(res.error || "Failed to delete record");
    } else {
      handleRefresh();
    }
  }

  const paidButton = (item: ActivityEntry) =>
    item.unpaid && !item.isDev ? (
      <span className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => settle(item, "paid")}
          disabled={payingId === item.id}
          className="min-h-9 whitespace-nowrap rounded-lg bg-emerald-600 px-3 text-xs font-black text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {payingId === item.id ? "Saving…" : "Mark paid"}
        </button>
        <button
          type="button"
          onClick={() => settle(item, "waived")}
          disabled={payingId === item.id}
          className="min-h-9 rounded-lg px-2.5 text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Waive
        </button>
      </span>
    ) : null;

  const deleteButton = (item: ActivityEntry) => (
    <button
      type="button"
      onClick={() => setConfirmDeleteId(item.id)}
      disabled={deletingId === item.id}
      aria-label={`Delete record for ${item.memberName}`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10"
      title="Delete Record"
    >
      {deletingId === item.id ? "⏳" : "🗑️"}
    </button>
  );

  return (
    // @container lets the list switch between cards and a table based on the
    // space this section actually gets (the sidebar eats width on tablets), not
    // on the viewport.
    <div className="@container space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="relative w-full @xl:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            aria-label="Search activity"
            placeholder="Search by name, ID, or description..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to page 1 on search
            }}
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 @xl:w-auto"
        >
          <span className={isPending ? "animate-spin" : ""}>🔄</span>
          {isPending ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 @3xl:rounded-2xl">
        {filteredData.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mb-3 block text-4xl opacity-50">📭</span>
            <h3 className="mb-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">No Activity Found</h3>
            <p className="text-xs font-medium text-zinc-500">
              {searchQuery ? "Try adjusting your search terms." : "No global activity has been recorded yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Cards: phones and narrow tablets */}
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 @3xl:hidden">
              {paginatedData.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 p-3 ${item.isDev ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
                >
                  <TypeIcon item={item} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.memberName}</p>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                          <Amount item={item} />
                        </p>
                        {paidButton(item)}
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium text-zinc-400">
                      {new Date(item.timestamp).toLocaleString(undefined, SHORT_DATE)}
                      <span className="font-mono"> · {item.memberId.substring(0, 8)}…</span>
                    </p>
                    <p className="mt-1.5 break-words text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                      {item.isDev && <TestBadge />}
                      {item.description}
                    </p>
                  </div>
                  {deleteButton(item)}
                </li>
              ))}
            </ul>

            {/* Table: wide enough for five columns */}
            <div className="hidden @3xl:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  <tr className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <th scope="col" className="w-14 px-4 py-3 font-semibold"><span className="sr-only">Type</span></th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Date &amp; Time</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Member</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Activity Details</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th scope="col" className="w-14 px-4 py-3"><span className="sr-only">Delete</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {paginatedData.map((item) => (
                    <tr
                      key={item.id}
                      className={`align-top transition-colors ${
                        item.isDev
                          ? "bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
                          : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <TypeIcon item={item} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {new Date(item.timestamp).toLocaleString(undefined, FULL_DATE)}
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <div className="truncate font-bold text-zinc-900 dark:text-zinc-100">{item.memberName}</div>
                        <span className="mt-0.5 hidden font-mono text-[10px] font-normal text-zinc-400 @5xl:block">
                          {item.memberId.substring(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                        {item.isDev && <TestBadge />}
                        <span className="break-words leading-snug">{item.description}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-black text-emerald-600 dark:text-emerald-400">
                        <Amount item={item} />
                        <div>{paidButton(item)}</div>
                      </td>
                      <td className="px-2 py-2 text-right">{deleteButton(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-3 @xl:flex-row @xl:justify-between">
          <p className="text-center text-xs font-medium text-zinc-500">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of{" "}
            {filteredData.length} entries
          </p>
          <div className="flex w-full items-center justify-between gap-2 @xl:w-auto @xl:justify-end">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="min-h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-semibold transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="min-h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-semibold transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete record"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:bg-zinc-900">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-100 text-2xl text-red-600 shadow-inner dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400">
                ⚠️
              </div>
              <h3 className="mb-2 text-xl font-black text-zinc-900 dark:text-zinc-100">Delete Record?</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Are you absolutely sure you want to permanently delete this activity record? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAndDelete}
                className="min-h-11 flex-1 rounded-xl bg-red-500 px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-600 active:scale-[0.98]"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
