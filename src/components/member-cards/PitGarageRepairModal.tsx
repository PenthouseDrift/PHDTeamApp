"use client";

import React, { useState, useMemo, useEffect } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { MemberCard } from "@/lib/card-roll";
import { isCarBroken, canRepairCarWithMaintenanceCard } from "@/lib/mechanical-faults";
import { applyMaintenanceRepairAction } from "@/tcg/actions";

export interface PitGarageRepairModalProps {
  car: MemberCard;
  allCards: MemberCard[];
  onBack: () => void;
  onClose: () => void;
  onRepairSuccess: (updatedCar: MemberCard, usedKitId: string) => void;
}

export function PitGarageRepairModal({
  car,
  allCards,
  onBack,
  onClose,
  onRepairSuccess,
}: PitGarageRepairModalProps) {
  const [repairPending, setRepairPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collect all maintenance repair cards owned by user
  const repairKits = useMemo(() => {
    return allCards.filter((c) => c.cardType === "maintenance");
  }, [allCards]);

  // Sort kits so matching/compatible ones appear first, then highest repair power
  const sortedKits = useMemo(() => {
    return [...repairKits].sort((a, b) => {
      const aMatch = canRepairCarWithMaintenanceCard(car, a) ? 1 : 0;
      const bMatch = canRepairCarWithMaintenanceCard(car, b) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return (b.repairBattles ?? 1) - (a.repairBattles ?? 1);
    });
  }, [repairKits, car]);

  // Initial selection: first compatible kit, or first kit in garage
  const firstCompatible = useMemo(() => {
    return sortedKits.find((k) => canRepairCarWithMaintenanceCard(car, k));
  }, [sortedKits, car]);

  const [selectedKitId, setSelectedKitId] = useState<string | null>(
    firstCompatible?.id ?? (sortedKits[0]?.id ?? null)
  );

  // Sync selected kit when sortedKits or firstCompatible changes
  useEffect(() => {
    if (firstCompatible) {
      setSelectedKitId(firstCompatible.id);
    } else if (sortedKits.length > 0 && !selectedKitId) {
      setSelectedKitId(sortedKits[0].id);
    }
  }, [firstCompatible, sortedKits]);

  const selectedKit = sortedKits.find((k) => k.id === selectedKitId) ?? null;
  const isCompatible = selectedKit ? canRepairCarWithMaintenanceCard(car, selectedKit) : false;

  const currentRemaining = car.fault?.battlesRemaining ?? 0;
  const repairPower = selectedKit?.repairBattles ?? 0;
  const newRemaining = Math.max(0, currentRemaining - repairPower);
  const isFullyRepaired = isCompatible && newRemaining === 0;

  async function handleConfirmRepair() {
    if (!selectedKit || !isCompatible || repairPending) return;
    setRepairPending(true);
    setError(null);
    try {
      const res = await applyMaintenanceRepairAction({
        carCardId: car.id,
        maintenanceCardId: selectedKit.id,
      });
      if (res.success) {
        onRepairSuccess(res.data.car, selectedKit.id);
      } else {
        setError(res.error || "Failed to apply repair.");
      }
    } catch {
      setError("Network error occurred while applying repair.");
    } finally {
      setRepairPending(false);
    }
  }

  return (
    <div
      className="relative flex flex-col w-full h-full min-h-[100dvh] sm:min-h-0 sm:max-h-[92dvh] bg-zinc-950 text-white animate-in fade-in duration-200 overflow-hidden"
      role="region"
      aria-labelledby="pit-repair-title"
    >
      {/* ── TOP HEADER (MOBILE OPTIMIZED) ── */}
      <header className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/95 px-4 sm:px-6 py-2.5 shrink-0 shadow-md sm:rounded-t-3xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-xl border border-zinc-700/80 bg-zinc-800/90 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors shrink-0"
            aria-label="Back to card"
          >
            <span>←</span>
            <span>Back</span>
          </button>

          <div className="min-w-0">
            <h2 id="pit-repair-title" className="text-sm font-black text-white truncate flex items-center gap-1.5">
              <span>🛠️</span>
              <span>Pit Garage Repair</span>
            </h2>
            <p className="text-[10px] font-semibold text-zinc-400 truncate">
              {car.name}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/90 text-xs font-black text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      {/* ── ACTIVE BREAKDOWN STATUS BANNER ── */}
      <div className="bg-gradient-to-r from-rose-950/80 via-zinc-900 to-rose-950/80 border-b border-rose-500/30 px-4 py-2 shrink-0 flex items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg shrink-0">⚠️</span>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 block leading-tight">
              Active Breakdown
            </span>
            <span className="text-xs font-black text-white truncate block">
              {car.fault?.name || "Mechanical Fault"}
            </span>
          </div>
        </div>

        <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[10px] font-black text-rose-300 shrink-0">
          Sits out {car.fault?.battlesRemaining} battle(s)
        </span>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Step Guide / Counter Header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Choose a Repair Kit
            </h3>
            <p className="text-[11px] text-zinc-400">
              Tap a kit below to inspect its impact before consuming it
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-0.5 font-bold text-zinc-400">
              {sortedKits.length} in Garage
            </span>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-black text-emerald-400">
              {sortedKits.filter((k) => canRepairCarWithMaintenanceCard(car, k)).length} Compatible
            </span>
          </div>
        </div>

        {/* ── FANNED OUT REPAIR CARDS SPREAD ── */}
        {sortedKits.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 text-center space-y-3">
            <div className="text-4xl">🧰</div>
            <h4 className="text-base font-black text-white">No Repair Kits in your Pit Garage</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              You don&apos;t have any Maintenance Consumable cards in your deck right now. Open packs
              from the Pack Store to collect repair kits, or let this chassis cool down naturally over{" "}
              <strong className="text-rose-400">{car.fault?.battlesRemaining}</strong> more battle(s).
            </p>
          </div>
        ) : (
          <div className="relative pt-8 pb-5 px-4 overflow-x-auto scrollbar-none">
            <div className="flex items-end justify-start sm:justify-center -space-x-5 sm:-space-x-7 min-w-max mx-auto">
              {sortedKits.map((kit, spreadIdx) => {
                const kitCompatible = canRepairCarWithMaintenanceCard(car, kit);
                const isSelected = selectedKitId === kit.id;
                const total = sortedKits.length;

                // Fan rotation calculations
                const mid = (total - 1) / 2;
                const offset = spreadIdx - mid;
                const rotationDeg = Math.min(6, Math.max(-6, Math.round(offset * 2.2)));

                return (
                  <button
                    key={kit.id}
                    type="button"
                    onClick={() => setSelectedKitId(kit.id)}
                    style={{
                      transform: isSelected
                        ? "translateY(-16px) scale(1.05) rotate(0deg)"
                        : `translateY(${Math.abs(offset) * 2.5}px) rotate(${rotationDeg}deg)`,
                      transformOrigin: "50% 100%",
                    }}
                    className={`group relative flex flex-col items-center transition-all duration-300 select-none text-left shrink-0 cursor-pointer ${
                      isSelected
                        ? "z-30 ring-2 ring-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.55)] rounded-2xl"
                        : kitCompatible
                          ? "z-10 ring-1 ring-emerald-500/50 opacity-90 hover:opacity-100 hover:scale-102 rounded-2xl"
                          : "z-0 ring-1 ring-zinc-800 opacity-40 grayscale-[40%] hover:opacity-70 rounded-2xl"
                    } w-36 sm:w-44`}
                    aria-label={`Select ${kit.name}`}
                  >
                    {/* Top Crown Badge */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap pointer-events-none">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 px-2.5 py-0.5 text-[9px] font-black uppercase text-black shadow-md shadow-emerald-500/40 ring-1 ring-emerald-200">
                          👑 Selected
                        </span>
                      ) : kitCompatible ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 border border-emerald-300/80 px-2 py-0.5 text-[8px] font-black uppercase text-white shadow-sm">
                          ✨ Compatible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900/95 border border-zinc-700/80 px-2 py-0.5 text-[8px] font-bold uppercase text-zinc-400 shadow-sm">
                          ✕ {kit.team || kit.targetFault || "Incompatible"}
                        </span>
                      )}
                    </div>

                    {/* Card artwork */}
                    <div className="w-full pointer-events-none">
                      <FullArtCard card={kit} className="drop-shadow-xl" />
                    </div>

                    {/* Bottom Cooldown Reduction Badge */}
                    <div className="mt-1.5 flex items-center justify-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          isSelected
                            ? "bg-emerald-400 text-black font-extrabold shadow-sm"
                            : kitCompatible
                              ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                              : "bg-zinc-800/90 border border-zinc-700/80 text-zinc-500"
                        }`}
                      >
                        {(kit.repairBattles ?? 0) >= 5
                          ? "Instant Fix"
                          : `-${kit.repairBattles} Battles`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LIVE PREVIEW OF UPDATED REPAIR STATE ── */}
        {selectedKit && (
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            {isCompatible ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-zinc-900/90 p-4 space-y-3 shadow-xl shadow-emerald-950/30 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>✨</span>
                    <span>Repair Preview</span>
                  </span>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                    {isFullyRepaired ? "FULL OVERHAUL" : `-${repairPower} BATTLES COOLDOWN`}
                  </span>
                </div>

                {/* Before -> Arrow -> After Transformation Layout */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                  {/* Current State */}
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-2.5 space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-rose-400/90 block">
                      Current Fault
                    </span>
                    <p className="font-black text-white text-xs leading-snug">
                      {car.fault?.name}
                    </p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-[11px] font-black text-rose-300">
                        {currentRemaining} battle{currentRemaining === 1 ? "" : "s"} left
                      </span>
                    </div>
                  </div>

                  {/* Transformation Arrow */}
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-black text-emerald-400">
                      -{repairPower}
                    </span>
                    <span className="text-sm font-black text-emerald-400">➔</span>
                  </div>

                  {/* State After Repair */}
                  <div
                    className={`rounded-xl border p-2.5 space-y-1 ${
                      isFullyRepaired
                        ? "border-emerald-500/60 bg-emerald-950/30"
                        : "border-amber-500/40 bg-amber-950/20"
                    }`}
                  >
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider block ${
                        isFullyRepaired ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      After Pit Repair
                    </span>
                    <p
                      className={`font-black text-xs leading-snug ${
                        isFullyRepaired ? "text-emerald-300" : "text-amber-200"
                      }`}
                    >
                      {isFullyRepaired ? "Fully Repaired!" : "Cooldown Reduced"}
                    </p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          isFullyRepaired ? "bg-emerald-400" : "bg-amber-400"
                        }`}
                      />
                      <span
                        className={`text-[11px] font-black ${
                          isFullyRepaired ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {isFullyRepaired
                          ? "Ready to Race"
                          : `${newRemaining} battle${newRemaining === 1 ? "" : "s"} left`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-black/50 border border-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
                  <span className="text-sm">📦</span>
                  <p className="leading-tight">
                    Consumes <strong className="text-white font-bold">{selectedKit.name}</strong> from your garage upon confirmation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/25 p-4 text-center space-y-2">
                <span className="text-2xl block">⚠️</span>
                <h5 className="font-black text-xs uppercase tracking-wider text-rose-300">
                  Incompatible Repair Kit
                </h5>
                <p className="text-xs text-zinc-300 max-w-sm mx-auto leading-relaxed">
                  <strong className="text-white">{selectedKit.name}</strong> services{" "}
                  <strong className="text-rose-300">{selectedKit.team || selectedKit.targetFault}</strong>{" "}
                  faults, but this car has an{" "}
                  <strong className="text-rose-300">{car.fault?.name}</strong>.
                </p>
                <p className="text-[11px] text-zinc-400">
                  Please tap one of the compatible kits with the green glow above to proceed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div className="max-w-xl mx-auto rounded-xl border border-rose-500/60 bg-rose-950/60 p-3 text-center text-xs font-bold text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* ── STICKY BOTTOM CONFIRMATION ACTION BAR ── */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950/95 px-4 py-3 shrink-0 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-b-3xl">
        <div className="flex items-center gap-2.5 max-w-xl mx-auto">
          <button
            type="button"
            disabled={repairPending}
            onClick={onBack}
            className="h-12 px-4 rounded-xl border border-zinc-700/80 bg-zinc-900 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedKit || !isCompatible || repairPending}
            onClick={handleConfirmRepair}
            className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 px-4 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/25 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {repairPending ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                <span>Repairing...</span>
              </>
            ) : !selectedKit ? (
              <span>Select a Kit Above</span>
            ) : !isCompatible ? (
              <span>⚠️ Incompatible Kit</span>
            ) : (
              <>
                <span className="text-base">🛠️</span>
                <span className="truncate">
                  {isFullyRepaired ? "Confirm Full Overhaul" : `Apply Repair (-${repairPower} Battles)`}
                </span>
                <span className="text-base">→</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
