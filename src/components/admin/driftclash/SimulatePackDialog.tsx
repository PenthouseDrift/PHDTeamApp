"use client";

import { useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { simulatePackOpeningAction, simulatePackStatsAction } from "@/actions/admin/driftclash-packs";
import { Modal, fmtPct, generatedPreviewCard, primaryBtn, secondaryBtn, stylePreviewCard, tierLabel } from "@/components/admin/driftclash/preview";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import type { PackConfig } from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import { ALL_TIERS } from "@/lib/pack-styles";
import type { SimSlot, SimStats } from "@/tcg/pack-simulate";

const COUNTS = [100, 500, 1000, 5000] as const;

/** What a slot looks like on screen: the card to draw and the words under it. */
function describe(slot: SimSlot, styleById: Map<string, PackStyle>): { card: FullArtCardData; label: string; sub: string } {
  switch (slot.kind) {
    case "set":
      return { card: slot.card, label: "Set card", sub: slot.card.name };
    case "bonus":
      return { card: slot.card, label: "Bonus card", sub: slot.card.name };
    case "crew":
      return { card: slot.card, label: "Crew card", sub: slot.card.name };
    case "repair":
      return { card: slot.card, label: "Repair kit", sub: slot.card.name };
    case "drawn": {
      const style = slot.styleId ? styleById.get(slot.styleId) : undefined;
      return {
        card: style ? stylePreviewCard(style, slot.tier) : generatedPreviewCard(slot.tier),
        label: "Drawn by AI",
        sub: `${tierLabel(slot.tier)}${slot.styleName ? ` · ${slot.styleName}` : ""}`,
      };
    }
  }
}

const pct = (n: number, of: number) => fmtPct(of > 0 ? (100 * n) / of : 0);

/**
 * Open the pack as it is in the editor right now, on paper: once to see what comes out, or thousands of times to check the
 * odds. Nobody is charged, nothing is saved, and no AI pictures are made (those cards show as "?" with their rarity), so
 * it costs nothing however many packs it opens.
 */
export function SimulatePackDialog({
  config,
  cardsPerPack,
  styles,
  title,
  onClose,
}: {
  config: PackConfig;
  cardsPerPack: number;
  styles: PackStyle[];
  title: string;
  onClose: () => void;
}) {
  const styleById = new Map(styles.map((s) => [s.id, s]));
  const [slots, setSlots] = useState<SimSlot[] | null>(null);
  const [opened, setOpened] = useState(0);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [count, setCount] = useState<(typeof COUNTS)[number]>(1000);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openOne() {
    setError(null);
    startTransition(async () => {
      const res = await simulatePackOpeningAction({ config, cardsPerPack });
      if (res.success) {
        setSlots(res.data.slots);
        setOpened((n) => n + 1);
      } else setError(res.error);
    });
  }
  function runMany() {
    setError(null);
    startTransition(async () => {
      const res = await simulatePackStatsAction({ config, cardsPerPack, packs: count });
      if (res.success) setStats(res.data);
      else setError(res.error);
    });
  }

  const drawnInOne = slots?.filter((s) => s.kind === "drawn").length ?? 0;

  return (
    <Modal title={`Simulate opening: ${title}`} onClose={onClose}>
      <div className="space-y-6">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Opens the pack as it is in the editor now, even if you haven&apos;t saved. Nobody is charged and nothing is saved. No AI pictures are made, so a
          card that opening would draw with AI shows as a <strong>?</strong> with its rarity (and style).
        </p>

        <section className="space-y-3" aria-label="Open one pack">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primaryBtn} disabled={pending} onClick={openOne}>
              {pending && !stats ? "Opening…" : slots ? "Open another pack" : "Open a pack"}
            </button>
            {slots && <span className="text-xs text-zinc-500 dark:text-zinc-400">Pack {opened}</span>}
          </div>
          {slots && (
            <>
              <ul className="flex flex-wrap gap-3">
                {slots.map((slot, i) => {
                  const d = describe(slot, styleById);
                  return (
                    <li key={`${opened}-${i}`} className="w-32 shrink-0 space-y-1">
                      <FullArtCard card={d.card} className="drop-shadow-lg" />
                      <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{d.label}</p>
                      <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{d.sub}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-zinc-600 dark:text-zinc-400" role="status">
                {drawnInOne === 0
                  ? "No AI picture in this pack: it would cost nothing to open."
                  : `${drawnInOne} AI picture${drawnInOne === 1 ? "" : "s"} would be made when a member opens this one.`}
              </p>
            </>
          )}
        </section>

        <section className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800" aria-label="Open many packs">
          <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Check the odds</h4>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sim-count" className="sr-only">
              How many packs
            </label>
            <select
              id="sim-count"
              className="min-h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={count}
              onChange={(e) => setCount(Number(e.target.value) as (typeof COUNTS)[number])}
            >
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()} packs
                </option>
              ))}
            </select>
            <button type="button" className={secondaryBtn} disabled={pending} onClick={runMany}>
              {pending && stats === null ? "Working…" : "Open them all"}
            </button>
          </div>

          {stats && <StatsView stats={stats} />}
        </section>

        <div role="status" aria-live="polite">
          {error && <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}

function StatsView({ stats }: { stats: SimStats }) {
  const tiers = [...ALL_TIERS].reverse() as FullArtTier[];
  return (
    <div className="space-y-4 text-sm">
      <p className="text-zinc-700 dark:text-zinc-300">
        {stats.packs.toLocaleString()} packs, {stats.rolledCards.toLocaleString()} rolled cards
        {stats.crewPerPack + stats.repairPerPack > 0
          ? `, plus ${stats.crewPerPack} crew and ${stats.repairPerPack} repair kit${stats.repairPerPack === 1 ? "" : "s"} in every pack`
          : ""}
        .
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <p className="text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400">Set cards</p>
          <p className="text-lg font-black">{pct(stats.setCards, stats.rolledCards)}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">of rolled cards</p>
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <p className="text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400">Drawn by AI</p>
          <p className="text-lg font-black">{pct(stats.drawnCards, stats.rolledCards)}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            of rolled cards ({stats.drawnCards.toLocaleString()} pictures, about {(stats.drawnCards / stats.packs).toFixed(2)} per pack)
          </p>
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
          <p className="text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400">Packs with an AI card</p>
          <p className="text-lg font-black">{pct(stats.packsWithDrawn, stats.packs)}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">of packs</p>
        </div>
      </div>

      <div>
        <h5 className="mb-1 text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">By rarity</h5>
        <table className="w-full text-left text-xs">
          <tbody>
            {tiers.map((t) => (
              <tr key={t} className="border-b border-zinc-200 dark:border-zinc-800">
                <th scope="row" className="py-1 pr-3 font-bold">
                  {tierLabel(t)}
                </th>
                <td className="py-1 pr-3 tabular-nums">{stats.byTier[t].toLocaleString()}</td>
                <td className="py-1 tabular-nums">{pct(stats.byTier[t], stats.rolledCards)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(stats.setCardHits.length > 0 || stats.styleHits.length > 0) && (
        <div>
          <h5 className="mb-1 text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">What came up</h5>
          <table className="w-full text-left text-xs">
            <tbody>
              {stats.setCardHits.slice(0, 25).map((h) => (
                <tr key={`${h.name}-${h.tier}`} className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="row" className="py-1 pr-3 font-bold">
                    {h.name}
                  </th>
                  <td className="py-1 pr-3 text-zinc-500 dark:text-zinc-400">{tierLabel(h.tier)} set card</td>
                  <td className="py-1 pr-3 tabular-nums">{h.count.toLocaleString()}</td>
                  <td className="py-1 tabular-nums">{pct(h.count, stats.rolledCards)}</td>
                </tr>
              ))}
              {stats.styleHits.map((h) => (
                <tr key={h.name} className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="row" className="py-1 pr-3 font-bold">
                    {h.name}
                  </th>
                  <td className="py-1 pr-3 text-zinc-500 dark:text-zinc-400">Style (AI)</td>
                  <td className="py-1 pr-3 tabular-nums">{h.count.toLocaleString()}</td>
                  <td className="py-1 tabular-nums">{pct(h.count, stats.rolledCards)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.setCardHits.length > 25 && (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Showing the 25 set cards that came up most.</p>
          )}
        </div>
      )}

      <div>
        <h5 className="mb-1 text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">Bonus card</h5>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">
          {stats.bonusHits === 0 ? "None came up." : `${stats.bonusHits.toLocaleString()} packs (${pct(stats.bonusHits, stats.packs)}) had one.`}
          {stats.bonusCardHits.length > 0 && ` ${stats.bonusCardHits.map((h) => `${h.name} ${h.count}`).join(", ")}.`}
        </p>
      </div>
    </div>
  );
}
