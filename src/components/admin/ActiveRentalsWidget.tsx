"use client";

import { useEffect, useState, useTransition } from "react";
import { startRentalTimer, completeRental } from "@/actions/admin/rentals";
import type { RentalSession } from "@/types";

interface ActiveRentalsWidgetProps {
  initialRentals: RentalSession[];
}

export function ActiveRentalsWidget({ initialRentals }: ActiveRentalsWidgetProps) {
  const [rentals, setRentals] = useState<RentalSession[]>(initialRentals);
  const [now, setNow] = useState<number>(Date.now());
  const [isPending, startTransition] = useTransition();

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

  function handleComplete(rentalId: string) {
    startTransition(async () => {
      const res = await completeRental(rentalId);
      if (res.success) {
        setRentals((prev) => prev.filter((r) => r.rentalId !== rentalId));
      }
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider">
            Active Car Rentals ({rentals.length})
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className={`rounded-lg border p-3.5 space-y-2.5 transition-all ${
                isTimesUp
                  ? "bg-red-500/20 border-red-500 animate-pulse shadow-lg"
                  : isGrace
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-zinc-900 border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-zinc-100">{rental.memberName}</p>
                  <p className="text-xs text-zinc-400">Car Rental Session</p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    isTimesUp
                      ? "bg-red-600 text-white"
                      : isGrace
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-green-500/20 text-green-400 border border-green-500/30"
                  }`}
                >
                  {isTimesUp ? "⏰ Time's Up!" : isGrace ? "15m Grace" : "Rental Active"}
                </span>
              </div>

              {/* Countdown Timer Display */}
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-xs text-zinc-400">
                  {isGrace ? "Grace Remaining:" : isTimesUp ? "Session Finished:" : "Time Remaining:"}
                </span>
                <span
                  className={`font-mono text-xl font-extrabold ${
                    isTimesUp
                      ? "text-red-400"
                      : isGrace
                      ? "text-amber-400"
                      : "text-green-400"
                  }`}
                >
                  {timeFormatted}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                {isGrace && (
                  <button
                    onClick={() => handleStartNow(rental.rentalId)}
                    disabled={isPending}
                    className="flex-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    Start 1-Hr Session Now
                  </button>
                )}
                <button
                  onClick={() => handleComplete(rental.rentalId)}
                  disabled={isPending}
                  className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  Complete & Clear
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
