"use client";

import React, { useState, useMemo } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import type { MemberCard } from "@/lib/card-roll";
import { canRepairCarWithMaintenanceCard } from "@/lib/mechanical-faults";
import { applyMaintenanceRepairAction } from "@/tcg/actions";
import { useToast } from "@/tcg/ui/Toast";
import { buzz } from "@/tcg/ui/feedback";

export interface PitGarageRepairModalProps {
  car: MemberCard;
  allCards: MemberCard[];
  onBack: () => void;
  onClose: () => void;
  onRepairSuccess: (updatedCar: MemberCard, usedKitId: string) => void;
}

/**
 * Pick a repair kit for a broken car. It fills whatever panel it is placed in (the card viewer): a header that stays at the
 * top (clear of the notch), a body that scrolls, and the Cancel / Apply buttons pinned to the bottom (clear of the home
 * indicator).
 */
export function PitGarageRepairModal({
  car,
  allCards,
  onBack,
  onClose,
  onRepairSuccess,
}: PitGarageRepairModalProps) {
  const toast = useToast();
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

  // The kit the player tapped. If it is gone (used up) or nothing was tapped yet, the best kit is shown as selected.
  const [pickedKitId, setPickedKitId] = useState<string | null>(null);
  const selectedKitId =
    pickedKitId && sortedKits.some((k) => k.id === pickedKitId)
      ? pickedKitId
      : (firstCompatible?.id ?? sortedKits[0]?.id ?? null);

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
        buzz(20);
        onRepairSuccess(res.data.car, selectedKit.id);
      } else {
        const message = res.error || "Failed to apply repair.";
        setError(message);
        toast(message, "error");
      }
    } catch {
      const message = "Network error occurred while applying repair.";
      setError(message);
      toast(message, "error");
    } finally {
      setRepairPending(false);
    }
  }

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 text-white motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      role="region"
      aria-labelledby="pit-repair-title"
    >
      {/* ── TOP HEADER ── */}
      <header className="gx-safe-t flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 pb-2.5 shadow-md sm:px-6 md:rounded-t-3xl">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="gx-tap flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-zinc-700/80 bg-zinc-800/90 px-3.5 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white"
            aria-label="Back to card"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>

          <div className="min-w-0">
            <h2 id="pit-repair-title" className="flex items-center gap-1.5 truncate text-sm font-black text-white">
              <span aria-hidden>🛠️</span>
              <span className="truncate">Pit Garage Repair</span>
            </h2>
            <p className="truncate text-xs font-semibold text-zinc-400">{car.name}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="gx-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800/90 text-sm font-black text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      {/* ── ACTIVE BREAKDOWN STATUS BANNER ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-rose-500/30 bg-gradient-to-r from-rose-950/80 via-zinc-900 to-rose-950/80 px-4 py-2 shadow-inner">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-lg" aria-hidden>
            ⚠️
          </span>
          <div className="min-w-0">
            <span className="block text-[11px] font-black uppercase leading-tight tracking-wider text-rose-400">
              Active Breakdown
            </span>
            <span className="block truncate text-xs font-black text-white">{car.fault?.name || "Mechanical Fault"}</span>
          </div>
        </div>

        <span className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-black text-rose-300">
          Sits out {car.fault?.battlesRemaining} battle(s)
        </span>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {/* Step Guide / Counter Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white">Choose a Repair Kit</h3>
            <p className="text-xs text-zinc-400">Tap a kit below to inspect its impact before consuming it</p>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-full border border-zinc-700 bg-zinc-800/90 px-2.5 py-0.5 font-bold text-zinc-300">
              {sortedKits.length} in Garage
            </span>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 font-black text-emerald-400">
              {sortedKits.filter((k) => canRepairCarWithMaintenanceCard(car, k)).length} Compatible
            </span>
          </div>
        </div>

        {/* ── FANNED OUT REPAIR CARDS SPREAD ── */}
        {sortedKits.length === 0 ? (
          <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 text-center sm:p-8">
            <div className="text-4xl" aria-hidden>
              🧰
            </div>
            <h4 className="text-base font-black text-white">No Repair Kits in your Pit Garage</h4>
            <p className="mx-auto max-w-sm text-xs leading-relaxed text-zinc-400">
              You don&apos;t have any Maintenance Consumable cards in your deck right now. Open packs
              from the Pack Store to collect repair kits, or let this chassis cool down naturally over{" "}
              <strong className="text-rose-400">{car.fault?.battlesRemaining}</strong> more battle(s).
            </p>
          </div>
        ) : (
          <div className="no-scrollbar relative snap-x overflow-x-auto px-4 pb-5 pt-8">
            <div className="mx-auto flex min-w-max items-end justify-start -space-x-5 sm:justify-center sm:-space-x-7">
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
                    onClick={() => setPickedKitId(kit.id)}
                    aria-pressed={isSelected}
                    style={{
                      transform: isSelected
                        ? "translateY(-16px) scale(1.05) rotate(0deg)"
                        : `translateY(${Math.abs(offset) * 2.5}px) rotate(${rotationDeg}deg)`,
                      transformOrigin: "50% 100%",
                    }}
                    className={`group relative flex w-36 shrink-0 cursor-pointer select-none snap-center flex-col items-center text-left transition-all duration-300 motion-reduce:transition-none sm:w-44 ${
                      isSelected
                        ? "z-30 rounded-2xl shadow-[0_0_28px_rgba(16,185,129,0.55)] ring-2 ring-emerald-400"
                        : kitCompatible
                          ? "z-10 rounded-2xl opacity-90 ring-1 ring-emerald-500/50 hover:opacity-100"
                          : "z-0 rounded-2xl opacity-60 ring-1 ring-zinc-800 grayscale-[40%] hover:opacity-80"
                    }`}
                    aria-label={`Select ${kit.name}${kitCompatible ? ", compatible" : ", incompatible"}`}
                  >
                    {/* Top Crown Badge */}
                    <div className="pointer-events-none absolute -top-3 left-1/2 z-40 max-w-full -translate-x-1/2 whitespace-nowrap">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 px-2.5 py-0.5 text-[11px] font-black uppercase text-black shadow-md shadow-emerald-500/40 ring-1 ring-emerald-200">
                          👑 Selected
                        </span>
                      ) : kitCompatible ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/80 bg-emerald-500/90 px-2 py-0.5 text-[11px] font-black uppercase text-white shadow-sm">
                          ✨ Compatible
                        </span>
                      ) : (
                        <span className="inline-flex max-w-[8.5rem] items-center gap-1 truncate rounded-full border border-zinc-700/80 bg-zinc-900/95 px-2 py-0.5 text-[11px] font-bold uppercase text-zinc-300 shadow-sm">
                          ✕ {kit.team || kit.targetFault || "Incompatible"}
                        </span>
                      )}
                    </div>

                    {/* Card artwork */}
                    <div className="pointer-events-none w-full">
                      <FullArtCard card={kit} className="drop-shadow-xl" />
                    </div>

                    {/* Bottom Cooldown Reduction Badge */}
                    <div className="mt-1.5 flex items-center justify-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                          isSelected
                            ? "bg-emerald-400 font-extrabold text-black shadow-sm"
                            : kitCompatible
                              ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                              : "border border-zinc-700/80 bg-zinc-800/90 text-zinc-400"
                        }`}
                      >
                        {(kit.repairBattles ?? 0) >= 5 ? "Instant Fix" : `-${kit.repairBattles} Battles`}
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
          <div className="mx-auto max-w-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
            {isCompatible ? (
              <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-zinc-900/90 p-4 shadow-xl shadow-emerald-950/30 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
                    <span aria-hidden>✨</span>
                    <span>Repair Preview</span>
                  </span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-black text-emerald-300">
                    {isFullyRepaired ? "FULL OVERHAUL" : `-${repairPower} BATTLES COOLDOWN`}
                  </span>
                </div>

                {/* Before -> Arrow -> After Transformation Layout */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                  {/* Current State */}
                  <div className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-950/20 p-2.5">
                    <span className="block text-[11px] font-black uppercase tracking-wider text-rose-400/90">
                      Current Fault
                    </span>
                    <p className="text-xs font-black leading-snug text-white">{car.fault?.name}</p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-rose-500 motion-safe:animate-pulse" />
                      <span className="text-xs font-black text-rose-300">
                        {currentRemaining} battle{currentRemaining === 1 ? "" : "s"} left
                      </span>
                    </div>
                  </div>

                  {/* Transformation Arrow */}
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-black text-emerald-400">
                      -{repairPower}
                    </span>
                    <span className="text-sm font-black text-emerald-400" aria-hidden>
                      ➔
                    </span>
                  </div>

                  {/* State After Repair */}
                  <div
                    className={`space-y-1 rounded-xl border p-2.5 ${
                      isFullyRepaired
                        ? "border-emerald-500/60 bg-emerald-950/30"
                        : "border-amber-500/40 bg-amber-950/20"
                    }`}
                  >
                    <span
                      className={`block text-[11px] font-black uppercase tracking-wider ${
                        isFullyRepaired ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      After Pit Repair
                    </span>
                    <p
                      className={`text-xs font-black leading-snug ${
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
                        className={`text-xs font-black ${isFullyRepaired ? "text-emerald-300" : "text-amber-300"}`}
                      >
                        {isFullyRepaired
                          ? "Ready to Drift"
                          : `${newRemaining} battle${newRemaining === 1 ? "" : "s"} left`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/50 px-3 py-2 text-xs text-zinc-300">
                  <span className="text-sm" aria-hidden>
                    📦
                  </span>
                  <p className="leading-tight">
                    Consumes <strong className="font-bold text-white">{selectedKit.name}</strong> from your garage upon confirmation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-950/25 p-4 text-center">
                <span className="block text-2xl" aria-hidden>
                  ⚠️
                </span>
                <h5 className="text-xs font-black uppercase tracking-wider text-rose-300">Incompatible Repair Kit</h5>
                <p className="mx-auto max-w-sm text-xs leading-relaxed text-zinc-300">
                  <strong className="text-white">{selectedKit.name}</strong> services{" "}
                  <strong className="text-rose-300">{selectedKit.team || selectedKit.targetFault}</strong>{" "}
                  faults, but this car has an{" "}
                  <strong className="text-rose-300">{car.fault?.name}</strong>.
                </p>
                <p className="text-xs text-zinc-400">
                  Please tap one of the compatible kits with the green glow above to proceed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div
            role="alert"
            className="mx-auto max-w-xl rounded-xl border border-rose-500/60 bg-rose-950/60 p-3 text-center text-xs font-bold text-rose-300"
          >
            {error}
          </div>
        )}
      </div>

      {/* ── STICKY BOTTOM CONFIRMATION ACTION BAR ── */}
      <footer className="gx-safe-b shrink-0 border-t border-zinc-800/80 bg-zinc-950/95 px-4 pt-3 shadow-2xl backdrop-blur-md md:rounded-b-3xl">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <button
            type="button"
            disabled={repairPending}
            onClick={onBack}
            className="gx-tap min-h-12 shrink-0 rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!selectedKit || !isCompatible || repairPending}
            onClick={handleConfirmRepair}
            className="gx-tap flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 px-3 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm"
          >
            {repairPending ? (
              <>
                <span
                  aria-hidden
                  className="gx-spinner inline-block h-4 w-4 rounded-full border-2 border-black border-t-transparent"
                />
                <span>Repairing…</span>
              </>
            ) : !selectedKit ? (
              <span>Select a Kit Above</span>
            ) : !isCompatible ? (
              <span>⚠️ Incompatible Kit</span>
            ) : (
              <>
                <span className="text-base" aria-hidden>
                  🛠️
                </span>
                <span className="truncate">
                  {isFullyRepaired ? "Confirm Full Overhaul" : `Apply Repair (-${repairPower} Battles)`}
                </span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
