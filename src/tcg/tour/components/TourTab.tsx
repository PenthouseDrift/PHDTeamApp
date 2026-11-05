"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { dismissTourNotes, getActiveTour, getTourLobby, setTourPrefs } from "../actions";
import type { TourLobbyView, TourRunView } from "../types";
import { TourLoadout } from "./TourLoadout";
import { TourRun } from "./TourRun";
import { heading, muted, panel, pill, primaryBtn, secondaryBtn } from "./tour-ui";

/**
 * Tandem Tour: the lobby and the switch between lobby, picking cards and playing a Tour.
 * Opened from the "Tour" tab of the card game.
 */

const STEPS = [
  { icon: "🔧", title: "Bring cards, then pit", text: "Pick up to 4 cars, 4 crew and 3 repair kits (empty slots get loaners; a kit is only used up if you use it). Between Rounds take one random upgrade and repair worn cars. A car that races loses condition, so rotate your cars." },
  { icon: "📱", title: "You set the drift angle", text: "Each Round you drift three corners. The car follows the line by itself. Tilt your phone (or drag a finger, or use the arrow keys) to hang the tail out: more angle scores more, but past your tyres' limit they burst or you hit the wall. Worn tyres have a lower limit. How well you drive changes your score." },
  { icon: "🎭", title: "Read the other driver", text: "Before you drive, secretly pick Attack, Hold or Gamble. Attack beats Hold, Hold beats Gamble, Gamble beats Attack. Most opponents are real members' saved teams, driving as well as they really did." },
  { icon: "🏆", title: "Win Rounds for prizes", text: "Lose all your strikes and the Tour ends. The more Rounds you win, the bigger the prize." },
];

function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="tour-tutorial-title">
      <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl">
        <p className={muted}>
          How it works · {step + 1}/{STEPS.length}
        </p>
        <div className="text-4xl" aria-hidden>{s.icon}</div>
        <h2 id="tour-tutorial-title" className="text-lg font-black text-zinc-900 dark:text-zinc-100">{s.title}</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-200">{s.text}</p>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Skip
          </button>
          <button type="button" className={primaryBtn} onClick={() => (last ? onClose() : setStep(step + 1))} autoFocus>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TourTab({
  onBalances,
  onKitsUsed,
}: {
  /** The wallet changed (an entry price, a prize), so the game header can show the new balances. */
  onBalances: (balances: { pCredits: number; packCredits: number }) => void;
  /** Repair kit cards that were used up, so the deck can drop them. */
  onKitsUsed: (cardIds: string[]) => void;
}) {
  const [mode, setMode] = useState<"loading" | "lobby" | "loadout" | "run">("loading");
  const [lobby, setLobby] = useState<TourLobbyView | null>(null);
  const [run, setRun] = useState<TourRunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPrizes, setShowPrizes] = useState(false);
  const [pending, startTransition] = useTransition();
  const reportedKits = useRef<Set<string>>(new Set());

  const refreshLobby = useCallback(async () => {
    const res = await getTourLobby();
    if (res.success) {
      setLobby(res.data);
      onBalances({ pCredits: res.data.pCredits, packCredits: res.data.packCredits });
      return res.data;
    }
    setError(res.error);
    return null;
  }, [onBalances]);

  // First load: the lobby, and a Tour left in progress if there is one.
  useEffect(() => {
    let live = true;
    (async () => {
      const [l, active] = await Promise.all([getTourLobby(), getActiveTour()]);
      if (!live) return;
      if (l.success) {
        setLobby(l.data);
        onBalances({ pCredits: l.data.pCredits, packCredits: l.data.packCredits });
        if (!l.data.tutorialSeen && l.data.canPlay) setShowTutorial(true);
      } else setError(l.error);
      if (active.success && active.data) {
        setRun(active.data);
        setMode("run");
      } else setMode("lobby");
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeRun(next: TourRunView) {
    // Tell the deck about repair kits that were used up, once each.
    const fresh = next.usedKitIds.filter((id) => !reportedKits.current.has(id));
    if (fresh.length > 0) {
      fresh.forEach((id) => reportedKits.current.add(id));
      onKitsUsed(fresh);
    }
    setRun(next);
    if (next.status === "ended") void refreshLobby();
  }

  function closeTutorial() {
    setShowTutorial(false);
    startTransition(async () => {
      await setTourPrefs({ tutorialSeen: true });
    });
  }

  if (mode === "loading") return <p className={muted} role="status">Loading Tandem Tour…</p>;

  if (mode === "run" && run) {
    return (
      <TourRun
        run={run}
        onChange={changeRun}
        onExit={() => {
          setRun(null);
          setMode("lobby");
          void refreshLobby();
        }}
      />
    );
  }

  if (mode === "loadout" && lobby) {
    return (
      <TourLoadout
        lobby={lobby}
        onBack={() => setMode("lobby")}
        onStarted={(started) => {
          reportedKits.current = new Set();
          setRun(started);
          setMode("run");
          void refreshLobby();
        }}
      />
    );
  }

  if (!lobby) {
    return (
      <div className={panel} role="alert">
        <p className="text-sm font-bold text-red-600 dark:text-red-400">{error ?? "Tandem Tour couldn't load. Please try again."}</p>
      </div>
    );
  }

  const free = lobby.freeRunsLeft > 0;
  return (
    <div className="space-y-4">
      {showTutorial && <Tutorial onClose={closeTutorial} />}

      <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" aria-hidden />
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">New game mode</p>
        <h2 className="text-2xl font-black">Tandem Tour</h2>
        <p className="mt-1 max-w-xl text-sm text-zinc-300">
          A full run of up to {lobby.maxRounds} Rounds. Draft upgrades, manage your cars, then drive each Round yourself: tilt your phone to set the drift angle and hold it just under your tyres&apos; limit. Good driving can beat a better car.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-black">
          <span className="rounded-full bg-white/10 px-2.5 py-1">📈 Rating {lobby.rating}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">🔥 Streak {lobby.streak}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">🏆 Best {lobby.bestWins} wins</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">🏁 {lobby.tours} Tours</span>
          {lobby.drives > 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-1">
              🎯 Driving {Math.round(lobby.averageAccuracy * 100)}% avg · {Math.round(lobby.bestAccuracy * 100)}% best
            </span>
          )}
        </div>
      </section>

      {lobby.reason && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-bold text-amber-800 dark:text-amber-200">
          {lobby.reason}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {lobby.notes.length > 0 && (
        <section className={`${panel} space-y-1.5`} aria-label="News">
          <div className="flex items-center justify-between">
            <h3 className={heading}>While you were away</h3>
            <button
              type="button"
              className="text-xs font-bold text-zinc-500 underline"
              onClick={() =>
                startTransition(async () => {
                  await dismissTourNotes();
                  setLobby({ ...lobby, notes: [] });
                })
              }
            >
              Clear
            </button>
          </div>
          <ul className="space-y-0.5">
            {lobby.notes.slice(0, 6).map((n, i) => (
              <li key={i} className="text-xs text-zinc-700 dark:text-zinc-200">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${panel} space-y-3`}>
        {lobby.hasActiveRun ? (
          <>
            <h3 className={heading}>You have a Tour in progress</h3>
            <button
              type="button"
              className={primaryBtn}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await getActiveTour();
                  if (res.success && res.data) {
                    setRun(res.data);
                    setMode("run");
                  } else {
                    setError(res.success ? "That Tour has finished." : res.error);
                    void refreshLobby();
                  }
                })
              }
            >
              Resume the Tour
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={pill}>{free ? `🎟️ ${lobby.freeRunsLeft >= 99 ? "Free for admins" : `${lobby.freeRunsLeft} free run${lobby.freeRunsLeft === 1 ? "" : "s"} today`}` : `🪙 ${lobby.entryPrice} P-Credits per run`}</span>
              {!free && <span className={pill}>{lobby.paidRunsLeft} paid run{lobby.paidRunsLeft === 1 ? "" : "s"} left today</span>}
              <span className={pill}>🪙 You have {lobby.pCredits}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} disabled={!lobby.canPlay} onClick={() => setMode("loadout")}>
                Start a Tour
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setShowTutorial(true)}>
                How it works
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setShowPrizes((v) => !v)} aria-expanded={showPrizes}>
                Prizes
              </button>
            </div>
          </>
        )}

        {showPrizes && (
          <div className="overflow-x-auto" aria-label="Prize table">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500 dark:text-zinc-400">
                  <th className="py-1 pr-3 font-bold">Rounds won</th>
                  <th className="py-1 pr-3 font-bold">P-Credits</th>
                  <th className="py-1 font-bold">Pack credits</th>
                </tr>
              </thead>
              <tbody>
                {lobby.prizes.map((p) => (
                  <tr key={p.wins} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3 font-black text-zinc-900 dark:text-zinc-100">{p.wins}</td>
                    <td className="py-1 pr-3">{p.pCredits}</td>
                    <td className="py-1">{p.packCredits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lobby.streakRewards.length > 0 && (
              <p className={`${muted} mt-2`}>
                Daily streak bonus:{" "}
                {lobby.streakRewards
                  .map((r) => `${r.days} days = ${[r.pCredits ? `${r.pCredits} P-Credits` : "", r.packCredits ? `${r.packCredits} pack credit` : ""].filter(Boolean).join(" + ")}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </section>

      <section className={`${panel} space-y-2`} aria-label="Settings and fair play">
        <h3 className={heading}>Fair play</h3>
        <p className={muted}>
          Prizes are in-game P-Credits and pack credits only. They have no cash value and cannot be withdrawn. Every prize is set by how many Rounds you win, never by chance.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={lobby.optOut}
              onChange={(e) => {
                const optOut = e.target.checked;
                setLobby({ ...lobby, optOut });
                startTransition(async () => {
                  await setTourPrefs({ optOut });
                });
              }}
            />
            Don&apos;t let other members face my team
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200">
            My daily limit on paid runs
            <input
              type="number"
              min={0}
              max={50}
              inputMode="numeric"
              className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              defaultValue={lobby.dailyLimit}
              onBlur={(e) => {
                const dailyLimit = Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0)));
                startTransition(async () => {
                  await setTourPrefs({ dailyLimit });
                  await refreshLobby();
                });
              }}
            />
            <span className={muted}>(0 = no personal limit)</span>
          </label>
        </div>
        {lobby.spentToday > 0 && <p className={muted}>You&apos;ve spent {lobby.spentToday} P-Credits on Tours today.</p>}
      </section>
    </div>
  );
}
