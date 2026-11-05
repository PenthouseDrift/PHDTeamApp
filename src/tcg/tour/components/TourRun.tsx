"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { MemberCard } from "@/lib/card-roll";
import type { ActionResult } from "@/types";
import { rarityLabel } from "@/lib/card-roll";
import { DriveScreen } from "./DriveScreen";
import { beginTourRound, continueTour, consumeTourRepairKit, pickTourUpgrade, rerollTourOffers, startTourDrive, submitTourDrive } from "../actions";
import { STANCE_ICON, STANCE_LABEL, STANCE_TEXT } from "../stance";
import { describeUpgrade } from "../upgrades";
import { STANCES, type BattleLog, type Stance, type TourRunView } from "../types";
import { CATEGORY_LABEL, conditionColour, heading, muted, panel, pill, primaryBtn, RARITY_STYLE, secondaryBtn, TIER_TEXT } from "./tour-ui";

/**
 * The Tour itself: the Pit Phase, Round setup (car and stance), the Round result and the Tour summary.
 * The server decides everything; this screen only sends choices and shows what comes back.
 * (The drive itself is played live on the DriveScreen, seen from behind the car.)
 */

type Apply = (promise: Promise<ActionResult<TourRunView>>) => void;

function ConditionBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1.5" title={`Condition ${value}%`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden>
        <span className={`block h-full ${conditionColour(value)}`} style={{ width: `${value}%` }} />
      </span>
      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{value}%</span>
    </span>
  );
}

function Hud({ run }: { run: TourRunView }) {
  return (
    <div className={`${panel} flex flex-wrap items-center justify-between gap-2`} role="status" aria-label="Tour progress">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={pill}>
          Round {Math.min(run.round, run.maxRounds)}/{run.maxRounds}
        </span>
        <span className={pill}>🏆 {run.wins} win{run.wins === 1 ? "" : "s"}</span>
      </div>
      <span className="flex items-center gap-1" aria-label={`${run.strikes} of ${run.maxStrikes} strikes left`}>
        {Array.from({ length: run.maxStrikes }, (_, i) => (
          <span key={i} aria-hidden className={`text-lg ${i < run.strikes ? "" : "opacity-25 grayscale"}`}>
            ❤️
          </span>
        ))}
      </span>
    </div>
  );
}

function HeldUpgrades({ run }: { run: TourRunView }) {
  if (run.upgrades.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Upgrades you hold">
      {run.upgrades.map((u) => (
        <li key={u.id} className={pill} title={u.def ? describeUpgrade({ ...u.def, values: { ...u.def.values, amount: u.amount ?? u.def.values.amount } }) : ""}>
          <span aria-hidden>{u.def?.icon ?? "✨"}</span>
          {u.def?.name ?? u.id}
          {u.roundsLeft !== undefined && <span className="opacity-70">· {u.roundsLeft}R</span>}
          {u.usesLeft !== undefined && <span className="opacity-70">· {u.usesLeft}x</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Pit Phase ───────────────────────────────────────────────────────────────

function PitPhase({ run, apply, busy }: { run: TourRunView; apply: Apply; busy: boolean }) {
  const [kitCar, setKitCar] = useState<string>("");
  const [confirmKit, setConfirmKit] = useState<string | null>(null);
  const worn = run.loadout.cars.filter((c) => (run.condition[c.id] ?? 100) < 100);
  const kitsLeft = run.loadout.kits.filter((k) => !run.usedKitIds.includes(k.id));
  const chosenCar = kitCar || worn[0]?.id || "";

  return (
    <div className="space-y-4">
      {run.offers && (
        <section className={`${panel} space-y-3`} aria-label="Choose an upgrade">
          <div>
            <h3 className={heading}>Pit Phase: take one upgrade</h3>
            <p className={muted}>Upgrades last for this Tour only. Pick the one that fits your cars.</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {run.offers.map(({ def }) => (
              <li key={def.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(pickTourUpgrade({ runId: run.id, upgradeId: def.id }))}
                  className={`flex h-full w-full flex-col gap-1 rounded-xl border-2 bg-zinc-50 p-3 text-left transition-colors hover:bg-amber-500/10 disabled:opacity-50 dark:bg-zinc-950 ${RARITY_STYLE[def.rarity]}`}
                >
                  <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <span>{CATEGORY_LABEL[def.category]}</span>
                    <span>{def.rarity}</span>
                  </span>
                  <span className="text-2xl" aria-hidden>{def.icon}</span>
                  <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{def.name}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{describeUpgrade(def)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {run.rerollPrice >= 0 && (
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => apply(rerollTourOffers({ runId: run.id }))}>
                🔄 Reroll {run.rerollPrice === 0 ? "(free)" : `(${run.rerollPrice} P-Credits)`}
              </button>
            )}
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => apply(pickTourUpgrade({ runId: run.id, upgradeId: null }))}>
              Skip
            </button>
          </div>
        </section>
      )}

      <section className={`${panel} space-y-2`} aria-label="Your cars">
        <h3 className={heading}>Your garage</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {run.loadout.cars.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{c.name}</span>
                <span className={`text-[11px] font-bold ${TIER_TEXT[c.tier]}`}>{rarityLabel(c.tier)}</span>
              </span>
              <ConditionBar value={run.condition[c.id] ?? 100} />
            </li>
          ))}
        </ul>
        <HeldUpgrades run={run} />
      </section>

      {run.loadout.kits.length > 0 && (
        <section className={`${panel} space-y-2`} aria-label="Repair kits">
          <h3 className={heading}>Repair kits</h3>
          <p className={muted}>Totally optional. A kit is only used up if you choose to use it, and then it <strong>is removed from your collection</strong>. Unused kits stay in your collection after the Tour.</p>
          {kitsLeft.length === 0 ? (
            <p className={muted}>All your repair kits have been used.</p>
          ) : worn.length === 0 ? (
            <p className={muted}>Every car is in perfect condition.</p>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-200">
                Repair which car?
                <select
                  className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={chosenCar}
                  onChange={(e) => setKitCar(e.target.value)}
                >
                  {worn.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({run.condition[c.id] ?? 100}%)
                    </option>
                  ))}
                </select>
              </label>
              <ul className="flex flex-wrap gap-2">
                {kitsLeft.map((k) =>
                  confirmKit === k.id ? (
                    <li key={k.id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className={primaryBtn}
                        disabled={busy || !chosenCar}
                        onClick={() => {
                          setConfirmKit(null);
                          apply(consumeTourRepairKit({ runId: run.id, kitId: k.id, carId: chosenCar }));
                        }}
                      >
                        Use it up
                      </button>
                      <button type="button" className={secondaryBtn} onClick={() => setConfirmKit(null)}>
                        Cancel
                      </button>
                    </li>
                  ) : (
                    <li key={k.id}>
                      <button type="button" className={secondaryBtn} disabled={busy || !chosenCar} onClick={() => setConfirmKit(k.id)}>
                        🛠️ {k.name} ({rarityLabel(k.tier)})
                      </button>
                    </li>
                  )
                )}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || Boolean(run.offers)}
          onClick={() => apply(beginTourRound({ runId: run.id }))}
        >
          {run.offers ? "Choose an upgrade first" : `Race Round ${run.round} →`}
        </button>
      </div>
    </div>
  );
}

// ── Round setup ─────────────────────────────────────────────────────────────

function RoundSetup({ run, apply, busy }: { run: TourRunView; apply: Apply; busy: boolean }) {
  const best = [...run.loadout.cars].sort((a, b) => (run.condition[b.id] ?? 100) - (run.condition[a.id] ?? 100))[0];
  const [carId, setCarId] = useState<string>(best?.id ?? "");
  const [stance, setStance] = useState<Stance | null>(null);
  const [left, setLeft] = useState<number>(run.decisionTimerSeconds);
  const opp = run.opponent;
  const submitted = useRef(false);

  function go(car: string, s: Stance) {
    if (submitted.current) return;
    submitted.current = true;
    apply(startTourDrive({ runId: run.id, carId: car, stance: s }));
  }

  // Optional decision timer: when it runs out the freshest car races on Hold.
  useEffect(() => {
    if (run.decisionTimerSeconds <= 0) return;
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [run.decisionTimerSeconds]);
  useEffect(() => {
    if (run.decisionTimerSeconds > 0 && left <= 0) go(carId || best?.id || "", stance ?? "hold");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  if (!opp) return null;
  const last = run.stanceHistory[run.stanceHistory.length - 1];

  return (
    <div className="space-y-4">
      <section className={`${panel} space-y-2`} aria-label="Your opponent">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={heading}>
            Round {run.round}: {opp.name}
          </h3>
          <span className={pill}>{opp.kind === "ghost" ? "👻 Real driver's team" : "🤖 Open entry"} · rating {opp.rating}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={opp.carImageUrl} alt="" className="h-20 w-14 rounded-md bg-zinc-200 object-cover dark:bg-zinc-800" />
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{opp.carName}</p>
            <p className={`text-xs font-bold ${TIER_TEXT[opp.carTier]}`}>{rarityLabel(opp.carTier)}</p>
            {opp.carStats && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Drift {opp.carStats.drift} · Accel {opp.carStats.accel} · Grip {opp.carStats.grip} · Steer {opp.carStats.steer}
              </p>
            )}
            {opp.notStance && (
              <p className="text-xs font-bold text-sky-600 dark:text-sky-400">
                Paddock whisper: they will NOT use {STANCE_LABEL[opp.notStance]}.
              </p>
            )}
          </div>
        </div>
        {run.decisionTimerSeconds > 0 && (
          <p className="text-xs font-black text-rose-600 dark:text-rose-400" role="timer" aria-live="off">
            ⏱️ {Math.max(0, left)}s left to choose
          </p>
        )}
      </section>

      <section className={`${panel} space-y-2`} aria-label="Choose your car">
        <h3 className={heading}>Choose your car</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {run.loadout.cars.map((c: MemberCard) => {
            const cond = run.condition[c.id] ?? 100;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={carId === c.id}
                  onClick={() => setCarId(c.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                    carId === c.id ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{c.name}</span>
                    <span className={`text-[11px] font-bold ${TIER_TEXT[c.tier]}`}>{rarityLabel(c.tier)}</span>
                  </span>
                  <ConditionBar value={cond} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className={muted}>A worn car scores less. The car you race loses condition after the Round; cars you rest do not.</p>
      </section>

      <section className={`${panel} space-y-2`} aria-label="Choose your stance">
        <h3 className={heading}>Pick a stance (secret until the race)</h3>
        <p className={muted}>
          ⚔️ Attack beats 🛡️ Hold, 🛡️ Hold beats 🎲 Gamble, 🎲 Gamble beats ⚔️ Attack. The winner of the triangle gets bonus points on every corner.
          {last ? ` Last Round you chose ${STANCE_LABEL[last]}.` : ""}
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {STANCES.map((s) => (
            <li key={s}>
              <button
                type="button"
                aria-pressed={stance === s}
                onClick={() => setStance(s)}
                className={`flex h-full w-full flex-col gap-1 rounded-xl border-2 p-3 text-left transition-colors ${
                  stance === s ? "border-amber-500 bg-amber-500/10" : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                }`}
              >
                <span className="text-2xl" aria-hidden>{STANCE_ICON[s]}</span>
                <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{STANCE_LABEL[s]}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-300">{STANCE_TEXT[s]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end">
        <button type="button" className={primaryBtn} disabled={busy || !stance || !carId} onClick={() => stance && go(carId, stance)}>
          🏁 Go to the drive →
        </button>
      </div>
    </div>
  );
}

// ── Result ──────────────────────────────────────────────────────────────────

function Result({ run, log, onNext, busy }: { run: TourRunView; log: BattleLog; onNext: () => void; busy: boolean }) {
  const won = log.result === "win";
  const over = run.status === "ended";
  // A Round played before driving existed has no driving record, so that panel is left out for it.
  const skill = log.skill as BattleLog["skill"] | undefined;
  const hasDriving = Boolean(skill) && log.corners.every((c) => typeof c.player.accuracy === "number");
  const mine = log.corners.map((c) => c.player.accuracy ?? 0);
  const average = mine.reduce((s, a) => s + a, 0) / Math.max(1, mine.length);
  return (
    <div className="space-y-4">
      <section
        className={`rounded-2xl border-2 p-4 ${won ? "border-emerald-500 bg-emerald-500/10" : "border-rose-500 bg-rose-500/10"}`}
        role="status"
        aria-live="polite"
      >
        <p className="text-xs font-black uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          Round {log.round} · {log.trackIcon} {log.trackName}
        </p>
        <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
          {won ? "You won!" : log.insuranceUsed ? "Lost, but insurance saved your strike" : "You lost the Round"}
        </h3>
        <p className="text-sm text-zinc-700 dark:text-zinc-200">
          Corners {log.cornersWon.player}-{log.cornersWon.rival} · Points {log.totals.player}-{log.totals.rival} vs {log.rival.name} ({log.rival.carName})
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          You chose {STANCE_ICON[log.stance.player]} {STANCE_LABEL[log.stance.player]}; they chose {STANCE_ICON[log.stance.rival]} {STANCE_LABEL[log.stance.rival]}.{" "}
          {log.stance.triangle === "player" ? "Your stance won the triangle." : log.stance.triangle === "rival" ? "Their stance won the triangle." : "The stances tied."}
        </p>
        {log.nearMiss && <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">So close, by {log.nearMiss.by}. {log.nearMiss.hint}</p>}
      </section>

      {hasDriving && skill && (
      <section className={`${panel} space-y-2`} aria-label="Your driving">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className={heading}>Your driving: {Math.round(average * 100)}% on the drift</h4>
          <span className="flex flex-wrap gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
            {(skill.bursts ?? 0) > 0 && <span>{skill.bursts} burst tyre{skill.bursts === 1 ? "" : "s"}</span>}
            {skill.walls > 0 && <span>{skill.walls} wall hit{skill.walls === 1 ? "" : "s"}</span>}
            {(skill.extraWear ?? 0) > 0 && <span>−{skill.extraWear}% condition from driving too hard</span>}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2">
          {log.corners.map((c, i) => (
            <li key={i} className={pill}>
              Corner {i + 1}: {Math.round(c.player.accuracy * 100)}% · ×{c.player.skillMultiplier.toFixed(2)} (them {Math.round(c.rival.accuracy * 100)}%)
            </li>
          ))}
        </ul>
        <p className={muted}>
          {Math.round(skill.pivot * 100)}% drift score changes nothing. Cleaner than that adds up to {Math.round(skill.swing * 100)}% to a corner&apos;s score; sloppier takes it off.
        </p>
      </section>
      )}

      <ol className="space-y-2" aria-label="Corner by corner">
        {log.corners.map((c, i) => (
          <li key={i} className={`${panel} space-y-1.5`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                Corner {i + 1}: {c.sectorName}
              </h4>
              <span className={`text-xs font-black ${c.winner === "player" ? "text-emerald-600" : c.winner === "rival" ? "text-rose-600" : "text-zinc-500"}`}>
                {c.winner === "player" ? "You" : c.winner === "rival" ? "Them" : "Tie"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="font-black text-zinc-900 dark:text-zinc-100">You: {c.player.score}</p>
                <p className={muted}>Crew: {c.player.crewName}</p>
                {c.player.notes.map((n, j) => (
                  <p key={j} className={muted}>{n}</p>
                ))}
              </div>
              <div>
                <p className="font-black text-zinc-900 dark:text-zinc-100">Them: {c.rival.score}</p>
                <p className={muted}>Crew: {c.rival.crewName}</p>
                {c.rival.notes.map((n, j) => (
                  <p key={j} className={muted}>{n}</p>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className={muted}>
        Your car &ldquo;{log.player.carName}&rdquo; condition: {log.player.conditionBefore}% → {log.player.conditionAfter}%.
      </p>

      <div className="flex justify-end">
        <button type="button" className={primaryBtn} onClick={onNext} disabled={busy}>
          {over ? "See your Tour summary →" : "Continue to the Pit Phase →"}
        </button>
      </div>
    </div>
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────

function Summary({ run, onDone }: { run: TourRunView; onDone: () => void }) {
  const s = run.summary;
  if (!s) return null;
  const delta = s.ratingAfter - s.ratingBefore;
  const prizeText = [s.prize.pCredits > 0 ? `${s.prize.pCredits} P-Credits` : "", s.prize.packCredits > 0 ? `${s.prize.packCredits} pack credit${s.prize.packCredits === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
  const bonusText = [s.streakBonus.pCredits > 0 ? `${s.streakBonus.pCredits} P-Credits` : "", s.streakBonus.packCredits > 0 ? `${s.streakBonus.packCredits} pack credit${s.streakBonus.packCredits === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
  return (
    <section className={`${panel} space-y-3`} aria-label="Tour summary">
      <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">Tour complete</h3>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        {s.endedBy === "finished" ? "You finished every Round." : s.endedBy === "strikes" ? "You ran out of strikes." : "The Tour was ended."} You won <strong>{s.wins}</strong> of {s.rounds} Round{s.rounds === 1 ? "" : "s"}.
      </p>
      <ul className="space-y-1 text-sm">
        <li>🎁 Prize: <strong>{prizeText || "none this time"}</strong></li>
        {bonusText && <li>🔥 Streak bonus ({s.streak} days): <strong>{bonusText}</strong></li>}
        <li>📈 Rating: {s.ratingAfter} ({delta >= 0 ? "+" : ""}{delta})</li>
        {s.streak > 0 && <li>🔥 Daily streak: {s.streak}</li>}
        {s.nextPrize && (
          <li className="text-amber-700 dark:text-amber-300">
            {s.nextPrize.wins - s.wins} more win{s.nextPrize.wins - s.wins === 1 ? "" : "s"} would have paid{" "}
            {[s.nextPrize.pCredits > 0 ? `${s.nextPrize.pCredits} P-Credits` : "", s.nextPrize.packCredits > 0 ? `${s.nextPrize.packCredits} pack credit` : ""].filter(Boolean).join(" + ")}.
          </li>
        )}
      </ul>
      <button type="button" className={primaryBtn} onClick={onDone}>
        Back to the lobby
      </button>
    </section>
  );
}

// ── The Tour screen ─────────────────────────────────────────────────────────

export function TourRun({ run, onChange, onExit }: { run: TourRunView; onChange: (run: TourRunView) => void; onExit: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showSummary, setShowSummary] = useState(false);

  // Every action returns the new state of the Tour (or an error). One place handles that.
  const apply: Apply = (promise) => {
    setError(null);
    startTransition(async () => {
      const res = await promise;
      if (res.success) onChange(res.data);
      else setError(res.error);
    });
  };

  const ended = run.status === "ended";
  let body: React.ReactNode;
  if (ended && (showSummary || !run.lastLog)) body = <Summary run={run} onDone={onExit} />;
  else if (run.step === "result" || (ended && run.lastLog)) {
    body = run.lastLog ? (
      <Result
        run={run}
        log={run.lastLog}
        busy={pending}
        onNext={() => (ended ? setShowSummary(true) : apply(continueTour({ runId: run.id })))}
      />
    ) : null;
  } else if (run.step === "drive" && run.drive) {
    body = (
      <DriveScreen
        key={`drive-${run.id}-${run.round}`}
        spec={run.drive}
        onFinish={(recording) => apply(submitTourDrive({ runId: run.id, recording }))}
        sendFailed={Boolean(error) && !pending}
      />
    );
  } else if (run.step === "setup" && run.opponent) body = <RoundSetup key={`setup-${run.round}`} run={run} apply={apply} busy={pending} />;
  else body = <PitPhase run={run} apply={apply} busy={pending} />;

  return (
    <div className="space-y-4">
      {run.step !== "drive" && <Hud run={run} />}
      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {pending && <p className={muted} role="status">Working…</p>}
      {body}
    </div>
  );
}
