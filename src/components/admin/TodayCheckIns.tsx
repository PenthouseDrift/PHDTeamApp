"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { CheckInEntry } from "@/actions/admin/checkins";
import { addNonMemberCheckIn, removeCheckIn, updateCheckInMethod, updateCheckInName } from "@/actions/admin/checkins";
import { extendMemberRentalByUserId } from "@/actions/admin/rentals";
import { useSession } from "next-auth/react";

interface TodayCheckInsProps {
  checkIns: CheckInEntry[];
}

export function TodayCheckIns({ checkIns }: TodayCheckInsProps) {
  const { data: session } = useSession();
  const [guestName, setGuestName] = useState("");
  const [passType, setPassType] = useState<"manual" | "day_pass" | "rental">("manual");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [extendingIndex, setExtendingIndex] = useState<number | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isPending, startTransition] = useTransition();

  // Count check-in frequency for each user (to show x2, x3 badges)
  const userCheckInCounts = checkIns.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.userId] = (acc[entry.userId] || 0) + 1;
    return acc;
  }, {});

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !session?.user?.id) return;

    setAdding(true);
    setFeedback(null);

    const result = await addNonMemberCheckIn(guestName.trim(), session.user.id, passType);
    if (result.success) {
      setFeedback(`${guestName.trim()} checked in (${formatMethodBadge(passType)})`);
      setGuestName("");
    } else {
      setFeedback(result.error);
    }
    setAdding(false);
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleRemove(index: number) {
    startTransition(async () => {
      const result = await removeCheckIn(index);
      if (result.success) {
        setFeedback("Check-in removed");
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(result.error);
      }
      setConfirmRemoveIndex(null);
    });
  }

  function handleUpdateMethod(
    index: number,
    newMethod: "manual" | "day_pass" | "day_pass_wallet" | "day_pass_cash" | "rental" | "rental_wallet" | "rental_cash" | "membership_cash" | "qr"
  ) {
    startTransition(async () => {
      const result = await updateCheckInMethod(index, newMethod);
      if (result.success) {
        setFeedback(`Check-in type updated to ${formatMethodBadge(newMethod)}`);
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(result.error);
      }
      setEditingIndex(null);
    });
  }

  function handleExtendRental(userId: string, memberName: string, method: "cash" | "wallet") {
    startTransition(async () => {
      const res = await extendMemberRentalByUserId(userId, memberName, method);
      if (res.success) {
        setFeedback(`Rental extended +1 Hr for ${memberName}! 🏎️`);
        setExtendingIndex(null);
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback(res.error);
      }
    });
  }

  function startRename(index: number, currentName: string) {
    setRenamingIndex(index);
    setRenameValue(currentName);
  }

  function handleRename(index: number) {
    const name = renameValue.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await updateCheckInName(index, name);
      if (result.success) {
        setFeedback(`Name updated to ${name}`);
        setRenamingIndex(null);
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(result.error);
      }
    });
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMethodBadge(method: string): string {
    switch (method) {
      case "day_pass_wallet":
      case "day_pass":
        return "📱 Day Pass (Wallet)";
      case "day_pass_cash":
        return "💵 Day Pass (£10 Cash)";
      case "rental_wallet":
      case "rental":
        return "📱 Car Rental (Wallet)";
      case "rental_cash":
        return "💵 Car Rental (£10 Cash)";
      case "membership_cash":
        return "💵 Membership (£40 Cash)";
      case "qr":
        return "📱 QR - Membership Track Access";
      default:
        return "🟢 Membership Track Access";
    }
  }

  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Checked In Today
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-xs font-bold px-2 py-0.5">
            {checkIns.length}
          </span>
        </h2>
      </div>

      {/* Add non-member / guest */}
      <form onSubmit={handleAddGuest} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Add person manually (name)..."
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <select
          value={passType}
          onChange={(e) => setPassType(e.target.value as "manual" | "day_pass" | "rental")}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:border-amber-500 focus:outline-none"
        >
          <option value="manual">🟢 Membership Track Access</option>
          <option value="day_pass">💵 Day Pass (£10 Cash)</option>
          <option value="rental">💵 Car Rental (£10 Cash)</option>
        </select>
        <button
          type="submit"
          disabled={!guestName.trim() || adding}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {feedback && (
        <p className="text-sm font-bold text-green-700 dark:text-green-400 mb-3 bg-green-50 dark:bg-green-950/40 p-2.5 rounded-lg border border-green-200 dark:border-green-800">
          {feedback}
        </p>
      )}

      {checkIns.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">No one checked in yet today.</p>
      ) : (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {checkIns.map((entry, i) => {
            const isMembershipEntry =
              entry.method === "qr" ||
              entry.method === "manual" ||
              entry.method === "membership_cash";

            const count = userCheckInCounts[entry.userId] || 1;

            // Manually-added guests (people without an account) have a synthetic
            // userId prefixed with "guest_" — only these can be renamed.
            const isGuest = typeof entry.userId === "string" && entry.userId.startsWith("guest_");

            return (
              <div
                key={`${entry.userId}-${i}`}
                className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-3 sm:px-4 sm:py-2.5 gap-2 sm:gap-3 shadow-sm ${
                  isMembershipEntry
                    ? "bg-green-50/70 dark:bg-green-950/40 border-green-200/70 dark:border-green-800/40"
                    : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/60"
                }`}
              >
                {/* Left: Status Dot + Name + Multiplier Badge (x2, x3) + Timestamp */}
                <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMembershipEntry && (
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" title="Active Membership" />
                    )}

                    {renamingIndex === i ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(i);
                            if (e.key === "Escape") setRenamingIndex(null);
                          }}
                          autoFocus
                          maxLength={60}
                          className="rounded-lg border border-amber-500 bg-white dark:bg-zinc-800 text-sm font-bold text-zinc-900 dark:text-zinc-100 py-1 px-2 focus:outline-none shadow-sm w-40"
                        />
                        <button
                          onClick={() => handleRename(i)}
                          disabled={isPending || !renameValue.trim()}
                          className="text-[11px] font-extrabold text-white bg-green-600 hover:bg-green-700 rounded-md px-2 py-1 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setRenamingIndex(null)}
                          disabled={isPending}
                          className="text-zinc-400 hover:text-zinc-600 text-[11px] px-1 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {entry.memberName}
                        </span>
                        {isGuest && (
                          <button
                            type="button"
                            onClick={() => startRename(i, entry.memberName)}
                            title="Edit guest name"
                            aria-label={`Edit name for ${entry.memberName}`}
                            className="text-[10px] text-zinc-400 hover:text-amber-500 transition-colors shrink-0 p-0.5"
                          >
                            ✏️
                          </button>
                        )}
                      </span>
                    )}

                    {/* Multiplier Badge (x2, x3, etc.) */}
                    {count > 1 && (
                      <span
                        title={`${count} entries/rentals today`}
                        className="rounded-md bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.5 shadow-xs shrink-0"
                      >
                        x{count}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0 sm:hidden">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>

                {/* Right: Method Badge + Rental Extension + Timestamp + Remove */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-green-200/50 dark:border-green-800/30">
                  {/* Extension Popover Controls (Car Rentals only) */}
                  {entry.method.includes("rental") && (
                    extendingIndex === i ? (
                      <div className="flex items-center gap-1 bg-amber-100 dark:bg-amber-950 p-1 rounded-lg border border-amber-300 dark:border-amber-700 animate-fadeIn">
                        <span className="text-[10px] font-bold text-amber-900 dark:text-amber-300 px-1">Extend +1h:</span>
                        <button
                          onClick={() => handleExtendRental(entry.userId, entry.memberName, "cash")}
                          disabled={isPending}
                          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-extrabold px-2 py-1 rounded-md hover:bg-zinc-800"
                        >
                          💵 £10 Cash
                        </button>
                        <button
                          onClick={() => handleExtendRental(entry.userId, entry.memberName, "wallet")}
                          disabled={isPending}
                          className="bg-amber-500 text-black text-[10px] font-extrabold px-2 py-1 rounded-md hover:bg-amber-400"
                        >
                          🎫 Pass
                        </button>
                        <button
                          onClick={() => setExtendingIndex(null)}
                          className="text-zinc-400 hover:text-zinc-600 text-[11px] px-1 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setExtendingIndex(i)}
                        title="Extend car rental for this member"
                        className="text-[11px] font-black text-amber-900 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-lg px-2 py-1 transition-colors flex items-center gap-1 shadow-xs"
                      >
                        <span>🏎️</span>
                        <span>+1 Hr</span>
                      </button>
                    )
                  )}

                  {editingIndex === i ? (
                    <select
                      value={entry.method}
                      onChange={(e) =>
                        handleUpdateMethod(
                          i,
                          e.target.value as "manual" | "day_pass_wallet" | "day_pass_cash" | "rental_wallet" | "rental_cash" | "membership_cash" | "qr"
                        )
                      }
                      onBlur={() => setEditingIndex(null)}
                      autoFocus
                      className="rounded-lg border border-amber-500 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-zinc-100 py-1 px-2 focus:outline-none shadow-sm max-w-full"
                    >
                      <option value="manual">🟢 Membership Track Access</option>
                      <option value="qr">📱 QR - Membership Track Access</option>
                      <option value="day_pass_wallet">📱 Day Pass (Wallet)</option>
                      <option value="day_pass_cash">💵 Day Pass (£10 Cash)</option>
                      <option value="rental_wallet">📱 Car Rental (Wallet)</option>
                      <option value="rental_cash">💵 Car Rental (£10 Cash)</option>
                      <option value="membership_cash">💵 Membership (£40 Cash)</option>
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingIndex(i)}
                      title="Click to edit check-in type"
                      className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 bg-white dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1.5 shrink-0 max-w-full overflow-hidden shadow-xs"
                    >
                      <span className="truncate">{formatMethodBadge(entry.method)}</span>
                      <span className="text-[10px] text-zinc-400 shrink-0">✏️</span>
                    </button>
                  )}

                  <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline-block shrink-0">
                    • {formatTime(entry.timestamp)}
                  </span>

                  <button
                    onClick={() => setConfirmRemoveIndex(i)}
                    className="text-zinc-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                    aria-label={`Remove ${entry.memberName}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmRemoveIndex !== null && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmRemoveIndex(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Remove Check-In</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Are you sure you want to remove <strong>{checkIns[confirmRemoveIndex]?.memberName}</strong>'s check-in?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveIndex(null)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemoveIndex)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
