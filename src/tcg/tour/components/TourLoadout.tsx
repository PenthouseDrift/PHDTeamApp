"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MemberCard } from "@/lib/card-roll";
import { RARITY_RANK, rarityLabel } from "@/lib/card-roll";
import { getNormalizedCardStats } from "@/tcg/progression";
import { getTourEligibleCards, startTour } from "../actions";
import type { TourEligibleCards, TourLobbyView, TourRunView } from "../types";
import { heading, muted, panel, primaryBtn, secondaryBtn, TIER_TEXT } from "./tour-ui";

/**
 * Pick the cards to bring on a Tour: up to 4 cars, 4 crew cards and 3 repair kits. Empty car and crew slots are filled
 * with loaners. A repair kit is only used up if it is used during the Tour.
 */

function Tile({
  card,
  selected,
  disabled,
  onToggle,
  detail,
}: {
  card: MemberCard;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2.5 rounded-xl border-2 p-2 text-left transition-colors ${
        selected
          ? "border-amber-500 bg-amber-500/10"
          : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.imageUrl} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md bg-zinc-200 object-cover dark:bg-zinc-800" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{card.name}</span>
        <span className={`block text-[11px] font-bold ${TIER_TEXT[card.tier]}`}>{rarityLabel(card.tier)}</span>
        <span className="block truncate text-[10px] text-zinc-500 dark:text-zinc-400">{detail}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          selected ? "bg-amber-500 text-black" : "bg-zinc-200 text-transparent dark:bg-zinc-800"
        }`}
      >
        ✓
      </span>
    </button>
  );
}

const statLine = (c: MemberCard) => {
  const n = getNormalizedCardStats(c);
  return `D${n.drift} A${n.accel} G${n.grip} S${n.steer}`;
};

export function TourLoadout({
  lobby,
  onStarted,
  onBack,
}: {
  lobby: TourLobbyView;
  onStarted: (run: TourRunView) => void;
  onBack: () => void;
}) {
  const [eligible, setEligible] = useState<TourEligibleCards | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cars, setCars] = useState<string[]>([]);
  const [crew, setCrew] = useState<string[]>([]);
  const [kits, setKits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triedAuto = useRef(false);

  useEffect(() => {
    let live = true;
    getTourEligibleCards().then((res) => {
      if (!live) return;
      if (res.success) setEligible(res.data);
      else setLoadError(res.error);
    });
    return () => {
      live = false;
    };
  }, []);

  const crewSorted = useMemo(
    () => (eligible ? [...eligible.crew].sort((a, b) => RARITY_RANK[b.tier] - RARITY_RANK[a.tier] || a.name.localeCompare(b.name)) : []),
    [eligible]
  );
  const kitsSorted = useMemo(
    () => (eligible ? [...eligible.kits].sort((a, b) => RARITY_RANK[b.tier] - RARITY_RANK[a.tier]) : []),
    [eligible]
  );

  function autoPick(data: TourEligibleCards) {
    setCars(data.cars.slice(0, data.maxCars).map((c) => c.id));
    setCrew(crewSorted.slice(0, data.maxCrew).map((c) => c.id));
    // Kits are never auto-picked: bring them only if you want the option.
  }

  // Start with the best cards already chosen: most members just want to play.
  useEffect(() => {
    if (!eligible || triedAuto.current) return;
    triedAuto.current = true;
    const t = setTimeout(() => autoPick(eligible), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (list.length < max) set([...list, id]);
  };

  const free = lobby.freeRunsLeft > 0;
  const cost = free ? "Free run" : `${lobby.entryPrice} P-Credits`;
  const canAfford = free || lobby.pCredits >= lobby.entryPrice;
  const noRuns = !free && lobby.paidRunsLeft <= 0;

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startTour({ carIds: cars, crewIds: crew, kitIds: kits, actionKey: crypto.randomUUID() });
      if (res.success) onStarted(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className={heading}>Choose your cards</h2>
        <button type="button" className={secondaryBtn} onClick={onBack} disabled={pending}>
          Back
        </button>
      </div>

      {loadError && <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400">{loadError}</p>}
      {!eligible && !loadError && <p className={muted} role="status">Loading your cards…</p>}

      {eligible && (
        <>
          <div className={`${panel} flex flex-wrap items-center justify-between gap-2`}>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Empty car and crew slots are filled with loaner cards. <strong>A repair kit is used up (removed from your collection) only if you use it</strong> during the Tour.
            </p>
            <button type="button" className={secondaryBtn} onClick={() => autoPick(eligible)} disabled={pending}>
              Auto-pick best
            </button>
          </div>

          <section className={panel} aria-label="Cars">
            <h3 className={heading}>
              Cars <span className={muted}>({cars.length}/{eligible.maxCars})</span>
            </h3>
            {eligible.cars.length === 0 ? (
              <p className={muted}>You have no cars that can race right now. Loaner cars will be used.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {eligible.cars.map((c) => (
                  <Tile
                    key={c.id}
                    card={c}
                    selected={cars.includes(c.id)}
                    disabled={!cars.includes(c.id) && cars.length >= eligible.maxCars}
                    onToggle={() => toggle(cars, setCars, c.id, eligible.maxCars)}
                    detail={statLine(c)}
                  />
                ))}
              </div>
            )}
            {eligible.blocked.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {eligible.blocked.slice(0, 6).map(({ card, reason }) => (
                  <li key={card.id} className={muted}>
                    {card.name}: {reason}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel} aria-label="Crew">
            <h3 className={heading}>
              Crew <span className={muted}>({crew.length}/{eligible.maxCrew})</span>
            </h3>
            {crewSorted.length === 0 ? (
              <p className={muted}>You have no crew cards. Loaner crew will be used.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {crewSorted.map((c) => (
                  <Tile
                    key={c.id}
                    card={c}
                    selected={crew.includes(c.id)}
                    disabled={!crew.includes(c.id) && crew.length >= eligible.maxCrew}
                    onToggle={() => toggle(crew, setCrew, c.id, eligible.maxCrew)}
                    detail={c.ability}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={panel} aria-label="Repair kits">
            <h3 className={heading}>
              Repair kits <span className={muted}>({kits.length}/{eligible.maxKits})</span>
            </h3>
            {kitsSorted.length === 0 ? (
              <p className={muted}>You have no repair kits. You can still win without them.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {kitsSorted.map((c) => (
                  <Tile
                    key={c.id}
                    card={c}
                    selected={kits.includes(c.id)}
                    disabled={!kits.includes(c.id) && kits.length >= eligible.maxKits}
                    onToggle={() => toggle(kits, setKits, c.id, eligible.maxKits)}
                    detail="Restores a car's condition. Used up when used."
                  />
                ))}
              </div>
            )}
          </section>

          <div className={`${panel} space-y-2`}>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">
              Entry: <span className="text-amber-600 dark:text-amber-400">{cost}</span>
            </p>
            {!canAfford && !noRuns && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">You have {lobby.pCredits} P-Credits. A paid run costs {lobby.entryPrice}.</p>}
            {noRuns && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">No runs left today. Free runs come back tomorrow.</p>}
            {error && <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
            <button type="button" className={`${primaryBtn} w-full sm:w-auto`} onClick={start} disabled={pending || !canAfford || noRuns}>
              {pending ? "Starting…" : "Start the Tour"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
