"use client";

import { useState, useTransition } from "react";
import { refreshActivityLog, deleteActivity } from "@/actions/admin/activity";
import type { ActivityEntry } from "@/lib/activity";

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

  function handleRefresh() {
    startTransition(async () => {
      await refreshActivityLog();
      setCurrentPage(1);
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to permanently delete this activity record?")) return;
    setDeletingId(id);
    const res = await deleteActivity(id);
    setDeletingId(null);
    if (!res.success) {
      alert(res.error || "Failed to delete record");
    } else {
      handleRefresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">🔍</span>
          <input
            type="text"
            placeholder="Search by name, ID, or description..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to page 1 on search
            }}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <span className={isPending ? "animate-spin" : ""}>🔄</span>
          {isPending ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {filteredData.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-4xl block mb-3 opacity-50">📭</span>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">No Activity Found</h3>
            <p className="text-xs font-medium text-zinc-500">
              {searchQuery ? "Try adjusting your search terms." : "No global activity has been recorded yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400 w-12">Type</th>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400">Date & Time</th>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400">Member</th>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400">Activity Details</th>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right">Amount</th>
                  <th className="px-5 py-4 font-semibold text-zinc-500 dark:text-zinc-400 text-right w-12">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {paginatedData.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`transition-colors ${
                      item.isDev 
                        ? "bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20" 
                        : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20"
                    }`}
                  >
                    <td className="px-5 py-4 text-center">
                      {item.type === "purchase" ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm border ${
                          item.isDev 
                            ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:border-amber-500/30"
                            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:border-emerald-500/30 border-emerald-200"
                        }`} title={item.isDev ? "Dev Purchase" : "Purchase"}>
                          {item.isDev ? "🧪" : "💳"}
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-sm shadow-sm border border-blue-200 dark:border-blue-500/30" title="Check-in">
                          ✅
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {new Date(item.timestamp).toLocaleString(undefined, {
                        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </td>
                    <td className="px-5 py-4 font-bold text-zinc-900 dark:text-zinc-100">
                      {item.memberName}
                      <span className="block text-[10px] text-zinc-400 font-normal mt-0.5 font-mono">
                        {item.memberId}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-700 dark:text-zinc-300 text-sm">
                      {item.isDev && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 mr-2">
                          TEST
                        </span>
                      )}
                      {item.description}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-base">
                      {item.type === "purchase" && item.amount !== undefined
                        ? item.isDev 
                          ? <span className="text-zinc-400 font-medium text-sm">Simulated</span>
                          : new Intl.NumberFormat("en-GB", { style: "currency", currency: item.currency || "GBP" }).format(item.amount)
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete Record"
                      >
                        {deletingId === item.id ? "⏳" : "🗑️"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-500">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
