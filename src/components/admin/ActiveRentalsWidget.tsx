"use client";

import { useEffect, useState, useTransition } from "react";
import { startRentalTimer, completeRental, extendRentalSessionManual, adjustRentalTime, setRentalTime } from "@/actions/admin/rentals";
import type { RentalSession } from "@/types";

interface ActiveRentalsWidgetProps {
  initialRentals: RentalSession[];
}

export function ActiveRentalsWidget({ initialRentals }: ActiveRentalsWidgetProps) {
  const [rentals, setRentals] = useState<RentalSession[]>(initialRentals);
  const [now, setNow] = useState<number>(Date.now());
  const [isPending, startTransition] = useTransition();
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [newTimeMinutes, setNewTimeMinutes] = useState<string>("");

  // Sync initial props
  useEffect(() => {
    setRentals(initialRentals);
  }, [initialRentals]);

  // Tick timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (rentals.length === 0) {
    return null;
  }

  function handleStartNow(rentalId: string) {
    startTransition(async () => {
      const res = await startRentalTimer(rentalId);
      if (res.success) {
        setRentals((prev) =>
          prev.map((r) => (r.rentalId === rentalId ? res.data : r))
        );
      }
    });
  }

  function handleExtend(rentalId: string, method: "cash" | "wallet") {
    startTransition(async () => {
      const res = await extendRentalSessionManual(rentalId, method);
      if (res.success) {
        setRentals((prev) =>
          prev.map((r) => (r.rentalId === rentalId ? res.data : r))
        );
      }
    });
  }

  function handleComplete(rentalId: string) {
    startTransition(async () => {
      const res = await completeRental(rentalId);
      if (res.success) {
        setRentals((prev) => prev.filter((r) => r.rentalId !== rentalId));
      }
    });
  }

  function handleAdjustTime(rentalId: string, minutes: number) {
    startTransition(async () => {
      const res = await adjustRentalTime(rentalId, minutes);
      if (res.success) {
        setRentals((prev) =>
          prev.map((r) => (r.rentalId === rentalId ? res.data : r))
        );
      }
    });
  }

  function handleSetExactTime(rentalId: string) {
    const mins = Number(newTimeMinutes);
    if (isNaN(mins) || mins < 0) return;
    
    startTransition(async () => {
      const res = await setRentalTime(rentalId, mins);
      if (res.success) {
        setRentals((prev) =>
          prev.map((r) => (r.rentalId === rentalId ? res.data : r))
        );
        setEditingTimerId(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4 sm:p-5 space-y-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <h2 className="text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
            Active Car Rentals ({rentals.length})
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {rentals.map((rental) => {
          const isGrace = rental.status === "grace" && now < rental.graceEndsAt;
          const isExpiredGrace = rental.status === "grace" && now >= rental.graceEndsAt;

          // Compute remaining time
          let targetEnd = rental.sessionEndsAt;
          if (isGrace) {
            targetEnd = rental.graceEndsAt;
          } else if (isExpiredGrace || !targetEnd) {
            // Auto-transitioning to 60m session
            targetEnd = rental.graceEndsAt + 60 * 60 * 1000;
          }

          const diffMs = Math.max(0, targetEnd - now);
          const minutes = Math.floor(diffMs / 60000);
          const seconds = Math.floor((diffMs % 60000) / 1000);
          const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

          const isTimesUp = !isGrace && diffMs === 0;

          return (
            <div
              key={rental.rentalId}
              className={`rounded-xl border p-4 space-y-3 transition-all ${
                isTimesUp
                  ? "bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-800 animate-pulse shadow-md"
                  : isGrace
                  ? "bg-white dark:bg-zinc-900 border-amber-300 dark:border-amber-800 shadow-sm"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">{rental.memberName}</p>
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Car Rental Session</p>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-xs ${
                    isTimesUp
                      ? "bg-red-600 text-white"
                      : isGrace
                      ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                  }`}
                >
                  {isTimesUp ? "⏰ Time's Up!" : isGrace ? "15m Grace" : "Rental Active"}
                </span>
              </div>

              {/* Countdown Timer Display */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {isGrace ? "Grace Remaining:" : isTimesUp ? "Session Finished:" : "Time Remaining:"}
                </span>
                
                {editingTimerId === rental.rentalId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={newTimeMinutes}
                      onChange={(e) => setNewTimeMinutes(e.target.value)}
                      className="w-14 h-8 text-center bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-300 dark:border-zinc-700 font-mono font-black text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSetExactTime(rental.rentalId);
                        if (e.key === "Escape") setEditingTimerId(null);
                      }}
                    />
                    <span className="text-xs font-bold text-zinc-500 mr-1">min</span>
                    <button
                      onClick={() => handleSetExactTime(rental.rentalId)}
                      disabled={isPending}
                      className="h-8 px-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md text-xs font-black transition-colors"
                    >
                      Set
                    </button>
                    <button
                      onClick={() => setEditingTimerId(null)}
                      disabled={isPending}
                      className="h-8 px-2.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-black transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleAdjustTime(rental.rentalId, -5)} disabled={isPending || isTimesUp} className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50 font-bold text-xs shadow-xs active:scale-95">
                      -5
                    </button>
                    <button
                      onClick={() => {
                        setEditingTimerId(rental.rentalId);
                        setNewTimeMinutes(String(Math.ceil(diffMs / 60000)));
                      }}
                      disabled={isPending || isTimesUp}
                      className={`font-mono text-xl font-black tabular-nums hover:opacity-70 transition-opacity cursor-pointer ${
                        isTimesUp
                          ? "text-red-600 dark:text-red-400"
                          : isGrace
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                      title="Click to edit exact time"
                    >
                      {timeFormatted}
                    </button>
                    <button onClick={() => handleAdjustTime(rental.rentalId, 5)} disabled={isPending || isTimesUp} className="w-7 h-7 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50 font-bold text-xs shadow-xs active:scale-95">
                      +5
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {isGrace ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStartNow(rental.rentalId)}
                      disabled={isPending}
                      className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs py-2.5 px-3 shadow-xs transition-all disabled:opacity-50"
                    >
                      Start 1-Hr Session Now
                    </button>
                    <button
                      onClick={() => handleComplete(rental.rentalId)}
                      disabled={isPending}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-xs py-2.5 px-4 transition-colors disabled:opacity-50 shadow-xs"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleComplete(rental.rentalId)}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-black text-xs py-2.5 px-4 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Mark Session Complete
                  </button>
                )}

                {/* Session Extension Controls */}
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={() => handleExtend(rental.rentalId, "cash")}
                    disabled={isPending}
                    className="flex-1 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-bold text-[11px] py-2 px-2 transition-colors disabled:opacity-50 text-center shadow-xs"
                  >
                    💵 Extend +1 Hr (£10 Cash)
                  </button>
                  <button
                    onClick={() => handleExtend(rental.rentalId, "wallet")}
                    disabled={isPending}
                    className="flex-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-300 border border-amber-500/40 font-bold text-[11px] py-2 px-2 transition-colors disabled:opacity-50 text-center"
                  >
                    🎫 Extend +1 Hr (Wallet)
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
