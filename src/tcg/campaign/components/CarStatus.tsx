"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MemberCard } from "@/lib/card-roll";
import { INSTANT_REPAIR_BATTLES, INSTANT_REPAIR_COST } from "../config";
import { durabilityAfterService, isMaintenanceKit, outlookOf, serviceGainOf } from "../garage";

/**
 * How the campaign shows a car that will not last. A yellow caution tape runs across the card ("Needs repair"), and a
 * single Repair button under it opens a short list of the Maintenance kits that can be used.
 *
 *  - broken down: only kits of the matching kind work (the normal game's repair)
 *  - will break down before the cup is over: any kit tops its durability up to cover every battle ahead
 */

/** True when a car should wear the caution tape: it is broken, or will break before the battles ahead are over. */
export function needsRepair(car: MemberCard, ahead: number): boolean {
  const kind = outlookOf(car, ahead).kind;
  return kind === "broken" || kind === "short";
}

/** The tape. Put it inside a relatively positioned box around the card; it does not catch clicks. */
export function CautionTape() {
  const stripes = "repeating-linear-gradient(-45deg, #111 0 7px, #facc15 7px 14px)";
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]" aria-hidden>
      <div className="absolute left-1/2 top-1/2 w-[135%] -translate-x-1/2 -translate-y-1/2 -rotate-[14deg] shadow-lg">
        <div className="h-1.5" style={{ background: stripes }} />
        <div className="bg-yellow-400 py-1 text-center text-[13px] font-black uppercase tracking-[0.18em] text-black sm:text-sm">
          ⚠ Needs repair
        </div>
        <div className="h-1.5" style={{ background: stripes }} />
      </div>
    </div>
  );
}

/** The line under a card: how long it lasts, and the Repair button when it needs one. */
export function CarFooter({
  car,
  ahead,
  deck,
  disabled,
  working,
  pCredits,
  onRepair,
  onService,
  onBuy,
  onTopUp,
}: {
  car: MemberCard;
  /** Battles the cup could still need from this car. */
  ahead: number;
  /** The member's whole deck, to find Maintenance kits in. */
  deck: MemberCard[];
  disabled: boolean;
  working: boolean;
  /** The member's P-Credit balance, for the instant repair. */
  pCredits: number;
  onRepair: (kitId: string) => void;
  onService: (kitId: string) => void;
  /** Pay for an instant repair of this broken car. */
  onBuy: () => void;
  /** Go to the page where P-Credits are bought. Leave out to hide the link. */
  onTopUp?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const outlook = outlookOf(car, ahead);
  const broken = outlook.kind === "broken";
  const attention = broken || outlook.kind === "short";

  // Kits that can be used, one row per kind of kit with how many are owned.
  const rows = useMemo(() => {
    // A broken car cannot race until it is fully repaired, so only kits of its kind that finish the job are offered.
    const usable = deck.filter(isMaintenanceKit).filter((k) => {
      if (!broken) return true;
      if (!car.fault || k.targetFault !== car.fault.type) return false;
      return (k.repairBattles ?? 1) >= car.fault.battlesRemaining;
    });
    const byName = new Map<string, { kit: MemberCard; count: number }>();
    for (const kit of usable) {
      const key = `${kit.name}|${kit.repairBattles ?? 1}`;
      const seen = byName.get(key);
      if (seen) seen.count += 1;
      else byName.set(key, { kit, count: 1 });
    }
    // The kit that does the most comes first.
    return [...byName.values()].sort((a, b) => serviceGainOf(b.kit, ahead) - serviceGainOf(a.kit, ahead));
  }, [deck, broken, car.fault, ahead]);

  return (
    <div className="space-y-1.5 text-center">
      <p className={`text-[11px] font-bold ${attention ? "text-yellow-300" : "text-zinc-400"}`}>
        {outlook.left === null ? "Durability unknown" : broken ? `Broken${car.fault ? `: ${car.fault.name}` : ""}` : `🔧 ${outlook.left} of ${ahead} battles`}
      </p>
      {attention && (
        <button
          type="button"
          disabled={disabled || working}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-yellow-400 px-2 text-xs font-black uppercase tracking-wide text-black shadow transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {working ? "Working…" : "🔧 Repair"}
        </button>
      )}
      {open && (
        <KitDialog
          car={car}
          ahead={ahead}
          left={outlook.left ?? 0}
          broken={broken}
          rows={rows}
          pCredits={pCredits}
          onBuy={() => {
            setOpen(false);
            onBuy();
          }}
          onTopUp={
            onTopUp
              ? () => {
                  setOpen(false);
                  onTopUp();
                }
              : undefined
          }
          onClose={() => setOpen(false)}
          onPick={(kitId) => {
            setOpen(false);
            if (broken) onRepair(kitId);
            else onService(kitId);
          }}
        />
      )}
    </div>
  );
}

function KitDialog({
  car,
  ahead,
  left,
  broken,
  rows,
  pCredits,
  onBuy,
  onTopUp,
  onClose,
  onPick,
}: {
  car: MemberCard;
  ahead: number;
  /** Battles the car has left now. */
  left: number;

  broken: boolean;
  rows: Array<{ kit: MemberCard; count: number }>;
  pCredits: number;
  onBuy: () => void;
  onTopUp?: () => void;
  onClose: () => void;
  onPick: (kitId: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Repair ${car.name}`}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-yellow-400/50 bg-zinc-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Repair</p>
            <h4 className="text-base font-black">{car.name}</h4>
            <p className="mt-0.5 text-xs text-zinc-400">
              {broken
                ? `Broken down${car.fault ? ` (${car.fault.name})` : ""}. Only a matching kit that finishes the repair is shown.`
                : `It has ${left} of the ${ahead} battles ahead. Each kit adds the battles shown, up to ${ahead}.`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        {rows.length === 0 && broken ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
              You have no kit that fully repairs this fault. You can pay for an instant repair, or get a kit from the Pack Store.
            </p>
            <button
              type="button"
              disabled={pCredits < INSTANT_REPAIR_COST}
              onClick={onBuy}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-left transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-black">Instant repair</span>
                <span className="block text-[11px] text-zinc-400">
                  {pCredits < INSTANT_REPAIR_COST ? `You have 🪙 ${pCredits.toLocaleString()}, so you need more P-Credits.` : `Fully repairs the car now and sets its durability to ${INSTANT_REPAIR_BATTLES} battles.`}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-black text-black">🪙 {INSTANT_REPAIR_COST}</span>
            </button>
            {pCredits < INSTANT_REPAIR_COST && onTopUp && (
              <button
                type="button"
                onClick={onTopUp}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-amber-500 px-3 text-sm font-black uppercase tracking-wide text-black shadow transition hover:bg-amber-400"
              >
                + Top up P-Credits
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
            You have no Maintenance kits in your deck. Get one from the Pack Store.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map(({ kit, count }) => (
              <li key={`${kit.name}|${kit.repairBattles ?? 1}`}>
                <button
                  type="button"
                  onClick={() => onPick(kit.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-left transition hover:border-yellow-400/60 hover:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{kit.name}</span>
                    <span className="block text-[11px] text-zinc-400">
                      {broken
                        ? "Fully repairs the fault"
                        : `+${serviceGainOf(kit, ahead)} battle${serviceGainOf(kit, ahead) === 1 ? "" : "s"}: ${left} → ${durabilityAfterService(left, kit, ahead)} of ${ahead}`}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-black text-yellow-300">×{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}
