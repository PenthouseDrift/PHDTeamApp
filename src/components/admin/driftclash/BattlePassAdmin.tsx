"use client";

import { useMemo, useState, useTransition } from "react";
import { saveBattlePassConfigAction, type BattlePassAdminData } from "@/tcg/battle-pass/actions";
import {
  MAX_MAX_XP,
  MAX_PACK_REWARD,
  MAX_P_REWARD,
  MAX_MILESTONE_GIFTS,
  MAX_TIERS,
  MIN_MAX_XP,
  MIN_MILESTONE_XP,
  DEFAULT_LADDER,
  battlePassWarnings,
  generateTiers,
  ladderTotals,
  ladderValue,
  sanitizeBattlePassConfig,
  withoutMilestones,
  type BattlePassConfig,
  type BattlePassRewardKind,
  type BattlePassTier,
  type LadderOptions,
} from "@/tcg/battle-pass/config";

/**
 * Settings for the monthly Battle Pass: the on/off switch, the top of the ladder, and every gift on it (the XP it unlocks at,
 * what is inside, and whether it is hidden until opened). "Build a ladder" fills the list with gaps and gifts that grow as you
 * climb. Nothing is saved until "Save Battle Pass" is pressed.
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

const fmt = (n: number) => n.toLocaleString("en-GB");

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

/** The next free "t<number>" id. */
function freeId(tiers: BattlePassTier[]): string {
  const used = new Set(tiers.map((t) => t.id));
  let n = 1;
  while (used.has(`t${n}`)) n++;
  return `t${n}`;
}

export function BattlePassAdmin({ initial }: { initial: BattlePassAdminData }) {
  // What was saved includes the steady "every N XP" gifts. The list being edited does not: those are worked out from the two settings.
  const [saved, setSaved] = useState<BattlePassConfig>(initial.config);
  const [draft, setDraft] = useState<BattlePassConfig>(withoutMilestones(initial.config));
  const [ladder, setLadder] = useState<LadderOptions>({ ...initial.ladderDefaults, maxXp: initial.config.maxXp });
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const clean = useMemo(() => sanitizeBattlePassConfig(draft), [draft]);
  // Until something is saved the starting ladder counts as a change, so it can be saved as it is.
  const [neverSaved, setNeverSaved] = useState(initial.isDefault);
  const dirty = neverSaved || JSON.stringify({ ...clean, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 });
  const warnings = useMemo(() => battlePassWarnings(clean, initial.packPrice), [clean, initial.packPrice]);
  const needsConfirm = warnings.some((w) => w.needsConfirm);
  // Totals and the "by each point" table count every gift, the steady ones included.
  const totals = useMemo(() => ladderTotals(clean), [clean]);

  const change = (next: Partial<BattlePassConfig>) => {
    setDraft((d) => ({ ...d, ...next }));
    setConfirmed(false);
  };
  const setTier = (id: string, patch: Partial<BattlePassTier>) => change({ tiers: draft.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const sortTiers = () => change({ tiers: [...draft.tiers].sort((a, b) => a.xp - b.xp) });

  function addTier() {
    if (draft.tiers.length >= MAX_TIERS) return;
    const last = draft.tiers[draft.tiers.length - 1];
    const prevGap = last ? last.xp - (draft.tiers[draft.tiers.length - 2]?.xp ?? 0) : 250;
    const xp = Math.min(draft.maxXp, (last?.xp ?? 0) + Math.max(10, Math.round(prevGap * 1.1)));
    change({
      tiers: [...draft.tiers, { id: freeId(draft.tiers), xp, kind: last?.kind ?? "pcredits", amount: last?.amount ?? 50, secret: false }],
    });
  }

  /** Put the recommended ladder in the list (and its settings in the builder). Nothing is saved until you press Save. */
  function useRecommended() {
    if (draft.tiers.length > 0 && !confirm("Replace every gift on the ladder with the recommended one? (Nothing is saved until you press Save.)")) return;
    setLadder({ ...DEFAULT_LADDER });
    change({ maxXp: DEFAULT_LADDER.maxXp, tiers: generateTiers(DEFAULT_LADDER) });
  }

  function buildLadder() {
    if (draft.tiers.length > 0 && !confirm("Replace every gift on the ladder with a new one? (Nothing is saved until you press Save.)")) return;
    change({ maxXp: ladder.maxXp, tiers: generateTiers(ladder) });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await saveBattlePassConfigAction(draft);
      if (res.success) {
        setSaved(res.data.config);
        setDraft(withoutMilestones(res.data.config));
        setNeverSaved(false);
        setConfirmed(false);
        setMessage({ text: res.data.config.enabled ? "Saved. The Battle Pass is live." : "Saved. The Battle Pass is switched off, so members can't see it yet." });
      } else setMessage({ text: res.error, error: true });
    });
  }

  const setLadderNum = <K extends keyof LadderOptions>(key: K, value: number) => setLadder((l) => ({ ...l, [key]: value }));

  return (
    <div className="space-y-5">
      {initial.isDefault && (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
          Nothing has been saved yet, so this is the starting ladder and the Battle Pass is off. Look it over, change anything you like, switch it on and save.
        </p>
      )}

      {/* ── Switch and top of the ladder ── */}
      <section className={`${panel} space-y-4`} aria-label="Switch">
        <h2 className={h3}>Battle Pass</h2>
        <label htmlFor="bp-enabled" className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <input id="bp-enabled" type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={draft.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
          <span>
            <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">The Battle Pass is on</span>
            <span className={hint}>Off means members can&apos;t see it or open gifts. Admins can still look at it. XP keeps counting either way.</span>
          </span>
        </label>
        <div className="max-w-xs">
          <Num
            id="bp-max"
            label="Top of the ladder (XP)"
            value={draft.maxXp}
            min={MIN_MAX_XP}
            max={MAX_MAX_XP}
            step={100}
            onChange={(v) => change({ maxXp: v })}
            help="XP earned in a month. Gifts can't be set higher than this."
          />
        </div>
      </section>

      {/* ── Build a ladder ── */}
      <section className={`${panel} space-y-4`} aria-label="Build a ladder">
        <div>
          <h2 className={h3}>Build a ladder</h2>
          <p className={hint}>
            Fills the list below with gifts where the XP between each one, and the size of the gifts, both grow as you climb. You can still change any gift by hand
            afterwards.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num id="l-count" label="Number of gifts" value={ladder.count} min={1} max={MAX_TIERS} onChange={(v) => setLadderNum("count", v)} />
          <Num id="l-max" label="Top of the ladder (XP)" value={ladder.maxXp} min={MIN_MAX_XP} max={MAX_MAX_XP} step={100} onChange={(v) => setLadderNum("maxXp", v)} />
          <Num
            id="l-growth"
            label="Each gap is this many times bigger"
            value={ladder.gapGrowth}
            min={1}
            max={3}
            step={0.01}
            onChange={(v) => setLadderNum("gapGrowth", v)}
            help="1 = even gaps. 1.1 = each gap 10% bigger than the last."
          />
          <Num id="l-startp" label="First P-Credit gift" value={ladder.startP} min={1} max={MAX_P_REWARD} onChange={(v) => setLadderNum("startP", v)} />
          <Num id="l-endp" label="Biggest P-Credit gift" value={ladder.endP} min={1} max={MAX_P_REWARD} onChange={(v) => setLadderNum("endP", v)} help="The ones between grow smoothly." />
          <Num id="l-pack-every" label="Every Nth gift is pack credits" value={ladder.packEvery} min={0} max={MAX_TIERS} onChange={(v) => setLadderNum("packEvery", v)} help="0 = none." />
          <Num id="l-pack-amount" label="Pack credits in those" value={ladder.packAmount} min={1} max={MAX_PACK_REWARD} onChange={(v) => setLadderNum("packAmount", v)} />
          <Num id="l-final" label="Pack credits in the last gift" value={ladder.finalPack} min={0} max={MAX_PACK_REWARD} onChange={(v) => setLadderNum("finalPack", v)} help="0 = leave the last one as it falls." />
          <Num id="l-secret" label="Hide the last N gifts" value={ladder.secretLast} min={0} max={MAX_TIERS} onChange={(v) => setLadderNum("secretLast", v)} help="Secret gifts show as a mystery until opened." />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={buildLadder} disabled={pending}>
            Build this ladder
          </button>
          <button type="button" className={secondary} onClick={useRecommended} disabled={pending}>
            Use the recommended ladder
          </button>
        </div>
        <p className={hint}>
          The recommended ladder is built so the pass feels worth playing but never beats buying: lots of small P-Credit gifts that top up a pack rather than replace
          one, pack credits only as rare milestones, and a secret finale. A full pass is worth roughly thirteen Standard Packs, and only a very active player gets there.
        </p>
      </section>

      {/* ── Steady gifts ── */}
      <section className={`${panel} space-y-3`} aria-label="Steady gifts">
        <div>
          <h2 className={h3}>Free gift every so often</h2>
          <p className={hint}>
            On top of the gifts below, members get a free gift of P-Credits for every set amount of XP they earn in the month. They are added to the ladder for you, and
            are not edited one by one.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num
            id="ms-xp"
            label="A gift every (XP)"
            value={draft.milestoneXp}
            min={0}
            max={draft.maxXp}
            step={50}
            onChange={(v) => change({ milestoneXp: v })}
            help={`0 = none. At least ${MIN_MILESTONE_XP}, and no more than ${MAX_MILESTONE_GIFTS} gifts in all.`}
          />
          <Num
            id="ms-p"
            label="P-Credits in each"
            value={draft.milestoneP}
            min={1}
            max={MAX_P_REWARD}
            onChange={(v) => change({ milestoneP: v })}
          />
          <div className="self-end text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {(() => {
              const n = clean.tiers.filter((t) => t.id.startsWith("ms-")).length;
              return n === 0 ? "None" : `${n} gift${n === 1 ? "" : "s"}, ${fmt(n * clean.milestoneP)} P-Credits a month at the top`;
            })()}
          </div>
        </div>
      </section>

      {/* ── The gifts ── */}
      <section className={`${panel} space-y-3`} aria-label="Gifts on the ladder">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={h3}>
            Gifts ({draft.tiers.length}/{MAX_TIERS})
          </h2>
          <p className={hint}>
            Whole ladder: {fmt(totals.pCredits)} P-Credits and {totals.packCredits} pack credit{totals.packCredits === 1 ? "" : "s"}
          </p>
        </div>

        {clean.tiers.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <p className="mb-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200">
              What members have by each point (a Standard Pack is {fmt(initial.packPrice)} P)
            </p>
            <table className="w-full min-w-[26rem] text-left text-xs">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    XP this month
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    About how many games*
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    Gifts
                  </th>
                  <th scope="col" className="py-1">
                    Worth
                  </th>
                </tr>
              </thead>
              <tbody className="text-zinc-800 dark:text-zinc-100">
                {[0.1, 0.25, 0.5, 0.75, 1].map((share) => {
                  const xp = Math.round(draft.maxXp * share);
                  const got = clean.tiers.filter((t) => t.xp <= xp);
                  const totals = ladderTotals({ tiers: got });
                  const packs = ladderValue(got, initial.packPrice) / Math.max(1, initial.packPrice);
                  return (
                    <tr key={share} className="border-t border-zinc-200 dark:border-zinc-700">
                      <td className="py-1 pr-3 font-bold tabular-nums">{fmt(xp)}</td>
                      <td className="py-1 pr-3 tabular-nums">~{fmt(Math.round(xp / 15))}</td>
                      <td className="py-1 pr-3 tabular-nums">
                        {got.length} of {clean.tiers.length}
                      </td>
                      <td className="py-1 tabular-nums">
                        {fmt(totals.pCredits)} P{totals.packCredits > 0 ? ` + ${totals.packCredits} pack credit${totals.packCredits === 1 ? "" : "s"}` : ""} ≈ {packs.toFixed(1)} packs
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={`${hint} mt-1.5`}>*At about 15 XP a game from plain battles. Challenges and Campaign rounds earn more, so real players need fewer.</p>
          </div>
        )}

        {draft.tiers.length === 0 ? (
          <p className={hint}>No gifts yet. Build a ladder above or add one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th scope="col" className="w-8 py-1.5 pr-2">
                    #
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Unlocks at (XP)
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Gap
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Gift
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Amount
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Secret
                  </th>
                  <th scope="col" className="py-1.5">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.tiers.map((t, i) => {
                  const gap = t.xp - (draft.tiers[i - 1]?.xp ?? 0);
                  const maxAmount = t.kind === "pcredits" ? MAX_P_REWARD : MAX_PACK_REWARD;
                  return (
                    <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 pr-2 font-black text-zinc-500">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          aria-label={`Gift ${i + 1}: XP needed`}
                          className={input}
                          min={1}
                          max={draft.maxXp}
                          step={10}
                          value={t.xp}
                          onChange={(e) => setTier(t.id, { xp: Number(e.target.value) || 0 })}
                          onBlur={sortTiers}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">{gap > 0 ? `+${fmt(gap)}` : "–"}</td>
                      <td className="py-1.5 pr-2">
                        <select
                          aria-label={`Gift ${i + 1}: what it holds`}
                          className={input}
                          value={t.kind}
                          onChange={(e) => {
                            const kind = e.target.value as BattlePassRewardKind;
                            setTier(t.id, { kind, amount: Math.min(t.amount, kind === "pcredits" ? MAX_P_REWARD : MAX_PACK_REWARD) });
                          }}
                        >
                          <option value="pcredits">P-Credits</option>
                          <option value="packcredits">Pack credits</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          aria-label={`Gift ${i + 1}: amount`}
                          className={input}
                          min={1}
                          max={maxAmount}
                          value={t.amount}
                          onChange={(e) => setTier(t.id, { amount: Number(e.target.value) || 1 })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Gift ${i + 1}: hide until opened`}
                          className="h-5 w-5 accent-amber-500"
                          checked={t.secret}
                          onChange={(e) => setTier(t.id, { secret: e.target.checked })}
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400"
                          aria-label={`Remove gift ${i + 1}`}
                          onClick={() => change({ tiers: draft.tiers.filter((x) => x.id !== t.id) })}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={addTier} disabled={draft.tiers.length >= MAX_TIERS}>
            + Add a gift
          </button>
        </div>
        <p className={hint}>
          A secret gift shows as a mystery on the ladder, and in the box, until the member opens it. Changing a gift that was already opened doesn&apos;t change what
          that member got.
        </p>
      </section>

      {/* ── This month ── */}
      <section className={`${panel} space-y-1`} aria-label="This month">
        <h2 className={h3}>This month</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {fmt(initial.thisMonth.opens)} gift{initial.thisMonth.opens === 1 ? "" : "s"} opened · {fmt(initial.thisMonth.pcredits)} P-Credits and{" "}
          {fmt(initial.thisMonth.packcredits)} pack credits paid out
        </p>
        {initial.log.length > 0 && (
          <p className={hint}>Last saved {new Date(initial.log[0].at).toLocaleString("en-GB")}.</p>
        )}
      </section>

      {/* ── Save ── */}
      <section className={`${panel} space-y-3`} aria-label="Save">
        <ul className="space-y-1.5">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                w.needsConfirm ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {w.text}
            </li>
          ))}
        </ul>
        {needsConfirm && dirty && (
          <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I&apos;ve checked this and want it live</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primary} onClick={save} disabled={pending || !dirty || (needsConfirm && !confirmed)}>
            {pending ? "Saving…" : "Save Battle Pass"}
          </button>
          <button
            type="button"
            className={secondary}
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(withoutMilestones(saved));
              setConfirmed(false);
              setMessage(null);
            }}
          >
            Discard changes
          </button>
          <span role="status" aria-live="polite" className={`text-sm font-bold ${message?.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {message?.text}
          </span>
        </div>
      </section>
    </div>
  );
}
