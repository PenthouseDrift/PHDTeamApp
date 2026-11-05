"use client";

import { useMemo, useState, useTransition } from "react";
import { endStuckTourAction, saveTourConfigAction, setTourEarlyAccessAction, type TourAdminData } from "@/tcg/tour/admin-actions";
import { configWarnings, estimateReturn } from "@/tcg/tour/config";
import { describeUpgrade } from "@/tcg/tour/upgrades";
import type { TourConfig } from "@/tcg/tour/types";

/**
 * Settings for Tandem Tour: switches, prices and free runs, the prize table, streak rewards, tuning numbers, the upgrade
 * catalogue, who is in early access, plus a 7-day economy panel and a way to end a stuck Tour.
 * Nothing is saved until "Save settings" is pressed.
 */

const panel = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
const h3 = "text-base font-black text-zinc-900 dark:text-zinc-100";
const hint = "text-xs text-zinc-500 dark:text-zinc-400";
const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const primary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-black text-black hover:bg-amber-400 disabled:opacity-50";
const secondary =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

function Num({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-zinc-700 dark:text-zinc-200">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={input}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
      {help && <p className={`${hint} mt-0.5`}>{help}</p>}
    </div>
  );
}

function Switch({ id, label, help, checked, onChange }: { id: string; label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className={hint}>{help}</span>
      </span>
    </label>
  );
}

export function TourAdmin({ initial }: { initial: TourAdminData }) {
  const [saved, setSaved] = useState<TourConfig>(initial.config);
  const [draft, setDraft] = useState<TourConfig>(initial.config);
  const [earlyAccess, setEarlyAccess] = useState(initial.earlyAccess);
  const [runs, setRuns] = useState(initial.activeRuns);
  const [memberQuery, setMemberQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify({ ...draft, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 });
  const warnings = useMemo(() => configWarnings(draft), [draft]);
  const needsConfirm = warnings.some((w) => w.needsConfirm);
  const est = useMemo(() => estimateReturn(draft), [draft]);

  const set = <K extends keyof TourConfig>(key: K, value: TourConfig[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setConfirmed(false);
  };
  const setTuning = <K extends keyof TourConfig["tuning"]>(key: K, value: TourConfig["tuning"][K]) => {
    setDraft((d) => ({ ...d, tuning: { ...d.tuning, [key]: value } }));
    setConfirmed(false);
  };

  // The prize table always has one row for each win count from 0 to the Round count.
  const prizeRows = useMemo(
    () => Array.from({ length: draft.maxRounds + 1 }, (_, w) => draft.prizes.find((p) => p.wins === w) ?? { wins: w, pCredits: 0, packCredits: 0 }),
    [draft.maxRounds, draft.prizes]
  );
  const setPrize = (wins: number, field: "pCredits" | "packCredits", value: number) => {
    set(
      "prizes",
      prizeRows.map((p) => (p.wins === wins ? { ...p, [field]: Math.max(0, Math.round(value)) } : p))
    );
  };

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveTourConfigAction(draft);
      if (res.success) {
        setSaved(res.data.config);
        setDraft(res.data.config);
        setConfirmed(false);
        setMessage({ text: "Saved. The change is live now." });
      } else setMessage({ text: res.error, error: true });
    });
  }

  function toggleEarly(userId: string, name: string, email: string, allowed: boolean) {
    startTransition(async () => {
      const res = await setTourEarlyAccessAction({ userId, allowed });
      if (!res.success) return setMessage({ text: res.error, error: true });
      setEarlyAccess((list) => (allowed ? [...list.filter((m) => m.id !== userId), { id: userId, name, email }] : list.filter((m) => m.id !== userId)));
    });
  }

  function endRun(runId: string, userName: string) {
    if (!confirm(`End ${userName}'s Tour with no prize and give back the entry price if it was paid?`)) return;
    startTransition(async () => {
      const res = await endStuckTourAction({ runId });
      if (!res.success) return setMessage({ text: res.error, error: true });
      setRuns((list) => list.filter((r) => r.id !== runId));
      setMessage({ text: res.data.refunded > 0 ? `Tour ended. ${res.data.refunded} P-Credits refunded.` : "Tour ended." });
    });
  }

  const matches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const have = new Set(earlyAccess.map((m) => m.id));
    return initial.members.filter((m) => !have.has(m.id) && (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))).slice(0, 8);
  }, [memberQuery, earlyAccess, initial.members]);

  const totals = initial.economy.reduce(
    (t, d) => ({ started: t.started + d.started, free: t.free + d.free, paid: t.paid + d.paid, pIn: t.pIn + d.pIn, pOut: t.pOut + d.pOut, completed: t.completed + d.completed, wins: t.wins + d.winsTotal, drives: t.drives + d.drives, acc: t.acc + d.accuracySum }),
    { started: 0, free: 0, paid: 0, pIn: 0, pOut: 0, completed: 0, wins: 0, drives: 0, acc: 0 }
  );

  return (
    <div className="space-y-5">
      {/* ── Switches ── */}
      <section className={`${panel} space-y-3`} aria-label="Switches">
        <h2 className={h3}>Switches</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Switch id="t-enabled" label="Tandem Tour is on" help="Off means only admins can see the Tour tab." checked={draft.enabled} onChange={(v) => set("enabled", v)} />
          <Switch id="t-early" label="Early access only" help="On means only admins and the members listed below can play." checked={draft.earlyAccessOnly} onChange={(v) => set("earlyAccessOnly", v)} />
          <Switch id="t-admin-free" label="Free runs for admins" help="Admins can test without being charged." checked={draft.adminsRunFree} onChange={(v) => set("adminsRunFree", v)} />
        </div>
      </section>

      {/* ── Early access ── */}
      <section className={`${panel} space-y-3`} aria-label="Early access members">
        <h2 className={h3}>Early access members</h2>
        <p className={hint}>Only used while &ldquo;Early access only&rdquo; is on. These changes apply straight away.</p>
        <ul className="flex flex-wrap gap-2">
          {earlyAccess.length === 0 && <li className={hint}>Nobody yet. Admins can always play.</li>}
          {earlyAccess.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              {m.name}
              <button type="button" className="rounded-full bg-zinc-300 px-2 py-0.5 text-[11px] hover:bg-rose-300 dark:bg-zinc-700" onClick={() => toggleEarly(m.id, m.name, m.email, false)} disabled={pending} aria-label={`Remove ${m.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div>
          <label htmlFor="t-member-search" className="mb-1 block text-xs font-bold text-zinc-700 dark:text-zinc-200">
            Add a member
          </label>
          <input id="t-member-search" type="search" className={input} placeholder="Type a name or email" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
          {matches.length > 0 && (
            <ul className="mt-1 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-amber-500/10" onClick={() => { toggleEarly(m.id, m.name, m.email, true); setMemberQuery(""); }} disabled={pending}>
                    <span className="font-bold">{m.name}</span>
                    <span className={hint}>{m.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Runs and prices ── */}
      <section className={`${panel} space-y-3`} aria-label="Runs and prices">
        <h2 className={h3}>Runs and prices</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num id="t-rounds" label="Rounds in a Tour" value={draft.maxRounds} min={3} max={12} onChange={(v) => set("maxRounds", v)} help="3 to 12." />
          <Num id="t-strikes" label="Strikes (lives)" value={draft.maxStrikes} min={1} max={5} onChange={(v) => set("maxStrikes", v)} help="A lost Round costs one." />
          <Num id="t-timer" label="Decision timer (seconds)" value={draft.decisionTimerSeconds} min={0} max={120} onChange={(v) => set("decisionTimerSeconds", v)} help="0 = no timer. Otherwise 15 to 120." />
          <Num id="t-free" label="Free runs per day" value={draft.freeRunsPerDay} min={0} max={20} onChange={(v) => set("freeRunsPerDay", v)} />
          <Num id="t-price" label="Entry price (P-Credits)" value={draft.entryPricePCredits} onChange={(v) => set("entryPricePCredits", v)} help="For runs after the free ones." />
          <Num id="t-maxpaid" label="Paid runs per day (most)" value={draft.maxPaidRunsPerDay} min={0} max={100} onChange={(v) => set("maxPaidRunsPerDay", v)} help="Members can set a lower limit for themselves." />
          <Num id="t-reroll" label="Extra reroll price (P-Credits)" value={draft.rerollPricePCredits} onChange={(v) => set("rerollPricePCredits", v)} help="0 means each Tour only gets its one free reroll." />
        </div>
      </section>

      {/* ── Prize table ── */}
      <section className={`${panel} space-y-3`} aria-label="Prize table">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h3}>Prizes by rounds won</h2>
          <p className={hint}>
            Average prize about <strong>{est.averagePrize.toFixed(0)}</strong> P-Credits per Tour
            {est.returnPct !== null && <> (about {est.returnPct.toFixed(0)}% of the entry price)</>}. A guess based on the simulator against bots.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-3 font-bold">Rounds won</th>
                <th className="py-1 pr-3 font-bold">P-Credits</th>
                <th className="py-1 font-bold">Pack credits</th>
              </tr>
            </thead>
            <tbody>
              {prizeRows.map((p) => (
                <tr key={p.wins} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3 font-black">{p.wins}</td>
                  <td className="py-1.5 pr-3">
                    <input aria-label={`P-Credits for ${p.wins} wins`} type="number" min={0} className={`${input} max-w-28`} value={p.pCredits} onChange={(e) => setPrize(p.wins, "pCredits", Number(e.target.value) || 0)} />
                  </td>
                  <td className="py-1.5">
                    <input aria-label={`Pack credits for ${p.wins} wins`} type="number" min={0} max={100} className={`${input} max-w-24`} value={p.packCredits} onChange={(e) => setPrize(p.wins, "packCredits", Number(e.target.value) || 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Streak rewards ── */}
      <section className={`${panel} space-y-3`} aria-label="Streak rewards">
        <h2 className={h3}>Daily streak rewards</h2>
        <p className={hint}>Paid once, on the day a member&apos;s streak reaches that many days.</p>
        <ul className="space-y-2">
          {draft.streakRewards.map((r, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
              <Num id={`t-sr-d-${i}`} label="Days" value={r.days} min={1} max={365} onChange={(v) => set("streakRewards", draft.streakRewards.map((x, j) => (j === i ? { ...x, days: Math.max(1, Math.round(v)) } : x)))} />
              <Num id={`t-sr-p-${i}`} label="P-Credits" value={r.pCredits} onChange={(v) => set("streakRewards", draft.streakRewards.map((x, j) => (j === i ? { ...x, pCredits: Math.max(0, Math.round(v)) } : x)))} />
              <Num id={`t-sr-k-${i}`} label="Pack credits" value={r.packCredits} max={100} onChange={(v) => set("streakRewards", draft.streakRewards.map((x, j) => (j === i ? { ...x, packCredits: Math.max(0, Math.round(v)) } : x)))} />
              <button type="button" className={secondary} onClick={() => set("streakRewards", draft.streakRewards.filter((_, j) => j !== i))} aria-label={`Remove the ${r.days} day reward`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={secondary} disabled={draft.streakRewards.length >= 12} onClick={() => set("streakRewards", [...draft.streakRewards, { days: 30, pCredits: 0, packCredits: 0 }])}>
          Add a reward
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num id="t-mult-streak" label="Streak reward multiplier" value={draft.multipliers.streak} min={0} max={10} step={0.1} onChange={(v) => set("multipliers", { ...draft.multipliers, streak: v })} help="1 = as written. 0 turns streak rewards off." />
          <Num id="t-mult-early" label="Early access prize multiplier" value={draft.multipliers.earlyAccess} min={0} max={10} step={0.1} onChange={(v) => set("multipliers", { ...draft.multipliers, earlyAccess: v })} help="Applied to the P-Credit prize while early access is on. 1 = no change." />
        </div>
      </section>

      {/* ── Upgrades ── */}
      <section className={`${panel} space-y-3`} aria-label="Upgrades">
        <h2 className={h3}>Upgrades</h2>
        <p className={hint}>Switch an upgrade off, or change its numbers. Blank means the standard value. The offer chances by rarity:</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["common", "rare", "epic"] as const).map((r) => (
            <Num key={r} id={`t-w-${r}`} label={`${r[0].toUpperCase()}${r.slice(1)} weight`} value={draft.upgradeWeights[r]} min={0} max={1000} onChange={(v) => set("upgradeWeights", { ...draft.upgradeWeights, [r]: v })} />
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-2 font-bold">On</th>
                <th className="py-1 pr-2 font-bold">Upgrade</th>
                <th className="py-1 pr-2 font-bold">Size</th>
                <th className="py-1 pr-2 font-bold">Rounds</th>
                <th className="py-1 font-bold">Uses</th>
              </tr>
            </thead>
            <tbody>
              {initial.upgrades.map((u) => {
                const o = draft.upgradeOverrides[u.id] ?? {};
                const patch = (next: Partial<NonNullable<TourConfig["upgradeOverrides"][string]>>) => {
                  const merged = { ...o, ...next };
                  const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v)));
                  const all = { ...draft.upgradeOverrides };
                  if (Object.keys(clean).length === 0) delete all[u.id];
                  else all[u.id] = clean;
                  set("upgradeOverrides", all);
                };
                const numField = (key: "amount" | "rounds" | "uses", standard: number | undefined) =>
                  standard === undefined ? (
                    <span className={hint}>n/a</span>
                  ) : (
                    <input
                      aria-label={`${u.name} ${key}`}
                      type="number"
                      className={`${input} max-w-20`}
                      placeholder={String(standard)}
                      value={o[key] ?? ""}
                      onChange={(e) => patch({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  );
                return (
                  <tr key={u.id} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                    <td className="py-1.5 pr-2">
                      <input type="checkbox" aria-label={`${u.name} on`} className="h-4 w-4 accent-amber-500" checked={o.enabled !== false} onChange={(e) => patch({ enabled: e.target.checked ? undefined : false })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className="font-black">
                        {u.icon} {u.name}
                      </span>{" "}
                      <span className={hint}>({u.rarity})</span>
                      <span className={`${hint} block`}>{describeUpgrade({ ...u, values: { ...u.values, ...(o.amount !== undefined ? { amount: o.amount } : {}), ...(o.rounds !== undefined ? { rounds: o.rounds } : {}), ...(o.uses !== undefined ? { uses: o.uses } : {}) } })}</span>
                    </td>
                    <td className="py-1.5 pr-2">{numField("amount", u.values.amount)}</td>
                    <td className="py-1.5 pr-2">{numField("rounds", u.values.rounds)}</td>
                    <td className="py-1.5">{numField("uses", u.values.uses)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Tuning ── */}
      <details className={panel}>
        <summary className={`${h3} cursor-pointer`}>Tuning numbers (advanced)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Num id="t-k-start" label="Starting rating" value={draft.tuning.startRating} min={100} max={5000} onChange={(v) => setTuning("startRating", v)} />
          <Num id="t-k-k" label="Rating change speed (K)" value={draft.tuning.ratingK} min={1} max={100} onChange={(v) => setTuning("ratingK", v)} />
          <Num id="t-k-band" label="Rating band for opponents" value={draft.tuning.ratingBand} min={20} max={2000} onChange={(v) => setTuning("ratingBand", v)} help="Widens automatically if nobody is found." />
          <Num id="t-k-ghosts" label="Saved teams kept per Round" value={draft.tuning.ghostsPerRound} min={10} max={2000} onChange={(v) => setTuning("ghostsPerRound", v)} />
          <Num id="t-k-stance" label="Stance win bonus (per corner)" value={draft.tuning.stanceBonus} min={0} max={30} onChange={(v) => setTuning("stanceBonus", v)} />
          <Num id="t-k-gmin" label="Gamble swing, lowest" value={draft.tuning.gambleMin} min={-30} max={30} onChange={(v) => setTuning("gambleMin", v)} />
          <Num id="t-k-gmax" label="Gamble swing, highest" value={draft.tuning.gambleMax} min={-30} max={30} onChange={(v) => setTuning("gambleMax", v)} />
          <Num id="t-k-wear" label="Wear per Round" value={draft.tuning.wearBase} min={0} max={100} onChange={(v) => setTuning("wearBase", v)} />
          <Num id="t-k-wear-a" label="Extra wear for Attack" value={draft.tuning.wearAttack} min={0} max={100} onChange={(v) => setTuning("wearAttack", v)} />
          <Num id="t-k-burst" label="Wear per burst tyre" value={draft.tuning.burstWear} min={0} max={100} onChange={(v) => setTuning("burstWear", v)} help="Extra condition lost when a tyre bursts because the member pushed past the grip limit." />
          <Num id="t-k-wall" label="Wear per wall hit" value={draft.tuning.wallWear} min={0} max={100} onChange={(v) => setTuning("wallWear", v)} help="Extra condition lost when the car spins into the wall. The corner score also takes a penalty." />
          <Num id="t-k-floor" label="Score at 0% condition (×)" value={draft.tuning.conditionFloorMultiplier} min={0.3} max={1} step={0.05} onChange={(v) => setTuning("conditionFloorMultiplier", v)} help="0.8 means a wrecked car scores 80%." />
          {(["bronze", "silver", "gold", "legend", "mythic"] as const).map((t) => (
            <Num key={t} id={`t-k-rep-${t}`} label={`Repair kit restores (${t})`} value={draft.tuning.repairByRarity[t]} min={0} max={100} onChange={(v) => setTuning("repairByRarity", { ...draft.tuning.repairByRarity, [t]: v })} />
          ))}
        </div>
        <p className={`${hint} mt-4`}>Driving: how much the way a member drives changes a score, and how well the fallback bots drive.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <Num id="t-k-swing" label="Driving swing" value={draft.tuning.skillSwing} min={0} max={0.6} step={0.05} onChange={(v) => setTuning("skillSwing", v)} help="0.2 = a perfect line adds 20%, a poor one takes 20% off." />
          <Num id="t-k-pivot" label="Neutral accuracy" value={draft.tuning.skillPivot} min={0.2} max={0.9} step={0.05} onChange={(v) => setTuning("skillPivot", v)} help="Line accuracy that changes nothing. Move it toward the average member's accuracy (see the table below)." />
          <Num id="t-k-bot-acc" label="Bot driving, Round 1" value={draft.tuning.botAccuracyStart} min={0} max={1} step={0.05} onChange={(v) => setTuning("botAccuracyStart", v)} />
          <Num id="t-k-bot-acc-step" label="Bot driving, per Round" value={draft.tuning.botAccuracyPerRound} min={0} max={0.2} step={0.01} onChange={(v) => setTuning("botAccuracyPerRound", v)} />
        </div>
        <p className={`${hint} mt-4`}>Bot difficulty: a hidden bonus in points per corner for fallback bots, by how strong the member&apos;s cars are. Higher is harder.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(["bronze", "silver", "gold", "legend", "mythic"] as const).map((t) => (
            <Num key={t} id={`t-k-bot-${t}`} label={`Bot bonus vs ${t} cars`} value={draft.tuning.botEdge[t]} min={-30} max={30} step={0.5} onChange={(v) => setTuning("botEdge", { ...draft.tuning.botEdge, [t]: v })} />
          ))}
          <Num id="t-k-bot-round" label="Bot bonus per later Round" value={draft.tuning.botEdgePerRound} min={-10} max={10} step={0.1} onChange={(v) => setTuning("botEdgePerRound", v)} />
        </div>
        <button type="button" className={`${secondary} mt-4`} onClick={() => { setDraft(initial.defaults); setConfirmed(false); }}>
          Put every setting back to the standard values (not saved until you save)
        </button>
      </details>

      {/* ── Save ── */}
      <section className={`${panel} space-y-3`} aria-label="Save">
        {warnings.length > 0 && (
          <ul className="space-y-1" aria-label="Things to check">
            {warnings.map((w, i) => (
              <li key={i} className={`rounded-lg border px-3 py-2 text-xs font-bold ${w.needsConfirm ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"}`}>
                {w.needsConfirm ? "⚠️ " : "ℹ️ "}
                {w.text}
              </li>
            ))}
          </ul>
        )}
        {needsConfirm && (
          <label className="flex items-start gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I&apos;ve read the warnings above and want to save anyway.
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} disabled={pending || !dirty || (needsConfirm && !confirmed)} onClick={save}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          {dirty && (
            <button type="button" className={secondary} disabled={pending} onClick={() => { setDraft(saved); setConfirmed(false); }}>
              Discard changes
            </button>
          )}
          {!dirty && <span className={hint}>No unsaved changes.</span>}
        </div>
        <div role="status" aria-live="polite">
          {message && <p className={`text-sm font-bold ${message.error ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{message.text}</p>}
        </div>
      </section>

      {/* ── Economy ── */}
      <section className={`${panel} space-y-3`} aria-label="Economy, last 7 days">
        <h2 className={h3}>Last 7 days</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-3 font-bold">Day</th>
                <th className="py-1 pr-3 font-bold">Tours</th>
                <th className="py-1 pr-3 font-bold">Free / paid</th>
                <th className="py-1 pr-3 font-bold">Taken</th>
                <th className="py-1 pr-3 font-bold">Paid out</th>
                <th className="py-1 pr-3 font-bold">Net</th>
                <th className="py-1 pr-3 font-bold">Avg wins</th>
                <th className="py-1 font-bold">Avg line</th>
              </tr>
            </thead>
            <tbody>
              {initial.economy.map((d) => (
                <tr key={d.date} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3 font-bold">{d.date}</td>
                  <td className="py-1.5 pr-3">{d.started}</td>
                  <td className="py-1.5 pr-3">{d.free} / {d.paid}</td>
                  <td className="py-1.5 pr-3">{d.pIn}</td>
                  <td className="py-1.5 pr-3">{d.pOut}</td>
                  <td className={`py-1.5 pr-3 font-black ${d.pIn - d.pOut >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{d.pIn - d.pOut}</td>
                  <td className="py-1.5 pr-3">{d.completed > 0 ? (d.winsTotal / d.completed).toFixed(1) : "-"}</td>
                  <td className="py-1.5">{d.drives > 0 ? `${Math.round((d.accuracySum / d.drives) * 100)}%` : "-"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-300 font-black dark:border-zinc-700">
                <td className="py-1.5 pr-3">Total</td>
                <td className="py-1.5 pr-3">{totals.started}</td>
                <td className="py-1.5 pr-3">{totals.free} / {totals.paid}</td>
                <td className="py-1.5 pr-3">{totals.pIn}</td>
                <td className="py-1.5 pr-3">{totals.pOut}</td>
                <td className={`py-1.5 pr-3 ${totals.pIn - totals.pOut >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{totals.pIn - totals.pOut}</td>
                <td className="py-1.5 pr-3">{totals.completed > 0 ? (totals.wins / totals.completed).toFixed(1) : "-"}</td>
                <td className="py-1.5">{totals.drives > 0 ? `${Math.round((totals.acc / totals.drives) * 100)}%` : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={hint}>Taken = entry prices and rerolls. Paid out = P-Credit prizes and streak rewards. Pack credits are not counted here. Avg line = the average drift score members earned; use it to set the neutral accuracy. Completion rate: {totals.started > 0 ? `${Math.round((totals.completed / totals.started) * 100)}%` : "-"}.</p>
      </section>

      {/* ── Stuck Tours ── */}
      <section className={`${panel} space-y-3`} aria-label="Tours in progress">
        <h2 className={h3}>Tours in progress</h2>
        {runs.length === 0 ? (
          <p className={hint}>None right now.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  <strong>{r.userName}</strong> · Round {r.round}, {r.wins} win{r.wins === 1 ? "" : "s"}, {r.strikes} strike{r.strikes === 1 ? "" : "s"} left ·{" "}
                  {r.paid ? `paid ${r.price}` : "free run"} · idle {r.idleMinutes < 90 ? `${r.idleMinutes} min` : `${Math.round(r.idleMinutes / 60)} h`}
                </span>
                <button type="button" className={secondary} disabled={pending} onClick={() => endRun(r.id, r.userName)}>
                  End and refund
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Change log ── */}
      <section className={`${panel} space-y-2`} aria-label="Change log">
        <h2 className={h3}>Recent changes</h2>
        {initial.log.length === 0 ? (
          <p className={hint}>No changes saved yet.</p>
        ) : (
          <ul className="space-y-1">
            {initial.log.map((e, i) => (
              <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">
                <strong>{new Date(e.at).toLocaleString()}</strong>: {e.changes.length > 0 ? e.changes.join(", ") : "saved with no changes"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
