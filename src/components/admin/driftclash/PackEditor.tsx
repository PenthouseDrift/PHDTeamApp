"use client";

import { useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { tierFromStats } from "@/lib/card-roll";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import {
  ODDS_TIERS,
  configFromLegacyPack,
  effectivePcts,
  emptyPackConfig,
  entryOverallPct,
  generatedPct,
  oneInFromPct,
  packNeedsGeneration,
  pctFromOneIn,
  type OddsTier,
  type PackConfig,
  type PackEntry,
} from "@/lib/pack-config";
import { ALL_TIERS, type PackStyle } from "@/lib/pack-styles";
import {
  convertLegacyPackAction,
  deletePackAction,
  savePackAction,
  savePackConfigAction,
  setPackStatusAction,
  setStandardPackEnabledAction,
} from "@/actions/admin/driftclash-packs";
import { updateCustomPackPricingAction } from "@/tcg/actions";
import type { TcgCustomPackWithCards, TcgPackStatus } from "@/tcg/types";
import {
  FixedCardDetails,
  GeneratedDetails,
  Modal,
  PreviewTile,
  StyleDetails,
  chip,
  dangerBtn,
  fmtPct,
  generatedPreviewCard,
  inputCls,
  labelCls,
  panel,
  primaryBtn,
  secondaryBtn,
  stylePreviewCard,
  tierLabel,
} from "@/components/admin/driftclash/preview";

export type PackTarget = { kind: "standard" } | { kind: "new" } | { kind: "custom"; pack: TcgCustomPackWithCards };
export type SetCard = FullArtCardData & { id: string };
export type Notice = { text: string; error?: boolean };

type Detail =
  | { kind: "generated"; tier: FullArtTier }
  | { kind: "style"; style: PackStyle; tier: FullArtTier }
  | { kind: "card"; card: SetCard }
  | null;

const RARE_FIRST: FullArtTier[] = [...ALL_TIERS].reverse();

export function PackEditor({
  target,
  standardConfig,
  standardPrice,
  standardSalePrice,
  styles,
  cards,
  onStandardConfig,
  onPackSaved,
  onPackDeleted,
  onNotify,
}: {
  target: PackTarget;
  standardConfig: PackConfig;
  standardPrice: number;
  standardSalePrice: number | null;
  styles: PackStyle[];
  cards: SetCard[];
  onStandardConfig: (config: PackConfig) => void;
  onPackSaved: (pack: TcgCustomPackWithCards) => void;
  onPackDeleted: (id: string) => void;
  onNotify: (notice: Notice) => void;
}) {
  const pack = target.kind === "custom" ? target.pack : null;
  const legacy = pack && !pack.config ? pack : null;
  const isStandard = target.kind === "standard";

  const [draft, setDraft] = useState<PackConfig>(() => {
    if (target.kind === "standard") return standardConfig;
    if (target.kind === "new") return emptyPackConfig("new-pack-draft");
    if (target.pack.config) return target.pack.config;
    return configFromLegacyPack(
      target.pack.id,
      target.pack.setList.map((e) => ({ cardId: e.card.id!, weight: e.weight, tier: e.card.tier }))
    );
  });
  const [oneInText, setOneInText] = useState<Record<OddsTier, string>>(() => {
    const out = {} as Record<OddsTier, string>;
    for (const t of ODDS_TIERS) out[t] = String(oneInFromPct(draft.oddsPct[t]) ?? "");
    return out;
  });

  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [price, setPrice] = useState(String(pack?.price ?? 150));
  const [salePrice, setSalePrice] = useState(pack?.salePrice ? String(pack.salePrice) : "");
  const [cardsPerPack, setCardsPerPack] = useState(String(pack?.cardsPerPack ?? 1));
  const [status, setStatus] = useState<TcgPackStatus>(pack?.status ?? "draft");

  const [adding, setAdding] = useState<FullArtTier | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const [pending, startTransition] = useTransition();

  const readOnly = Boolean(legacy);
  const oddsEditable = !readOnly && (!isStandard || draft.oddsOverride);
  const pcts = effectivePcts(draft);
  const oddsTotal = ODDS_TIERS.reduce((s, t) => s + draft.oddsPct[t], 0);
  const needsCar = !isStandard && packNeedsGeneration(draft);

  const styleById = new Map(styles.map((s) => [s.id, s]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  function setEntries(tier: FullArtTier, entries: PackEntry[]) {
    setDraft((d) => ({ ...d, rarities: { ...d.rarities, [tier]: entries } }));
  }
  function setOneIn(tier: OddsTier, text: string) {
    setOneInText((t) => ({ ...t, [tier]: text }));
    const n = Number(text);
    setDraft((d) => ({ ...d, oddsPct: { ...d.oddsPct, [tier]: text.trim() === "" ? 0 : pctFromOneIn(n) } }));
  }
  function addEntry(tier: FullArtTier, kind: PackEntry["kind"], refId: string) {
    const used = draft.rarities[tier].reduce((s, e) => s + e.chancePct, 0);
    const chancePct = Math.max(0, Math.min(5, Math.round((100 - used) * 100) / 100));
    setEntries(tier, [...draft.rarities[tier], { kind, refId, chancePct }]);
    setAdding(null);
  }
  function setChance(tier: FullArtTier, index: number, value: string) {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setEntries(
      tier,
      draft.rarities[tier].map((e, i) => (i === index ? { ...e, chancePct: n } : e))
    );
  }
  function removeEntry(tier: FullArtTier, index: number) {
    setEntries(
      tier,
      draft.rarities[tier].filter((_, i) => i !== index)
    );
  }

  function problem(): string | null {
    if (oddsEditable && oddsTotal > 100.0001) return "The rarity odds add up to more than 100%.";
    for (const tier of ALL_TIERS) {
      const sum = draft.rarities[tier].reduce((s, e) => s + e.chancePct, 0);
      if (sum > 100.0001) return `${tierLabel(tier)}: the chances add up to more than 100%.`;
    }
    return null;
  }

  function save() {
    const bad = problem();
    if (bad) return onNotify({ text: bad, error: true });
    startTransition(async () => {
      if (isStandard) {
        const res = await savePackConfigAction(draft);
        if (res.success) {
          setDraft(res.data);
          onStandardConfig(res.data);
          onNotify({ text: "Standard Pack saved." });
        } else onNotify({ text: res.error, error: true });
        return;
      }
      const res = await savePackAction({
        id: pack?.id,
        name,
        description,
        price: Number(price),
        salePrice: salePrice.trim() ? Number(salePrice) : null,
        status,
        cardsPerPack: Number(cardsPerPack),
        config: draft,
      });
      if (res.success) {
        onPackSaved(res.data);
        onNotify({ text: `Saved "${res.data.name}" (${res.data.status === "live" ? "live in the store" : "draft"}).` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  function toggleStandard() {
    startTransition(async () => {
      const res = await setStandardPackEnabledAction(!standardConfig.enabled);
      if (res.success) {
        onStandardConfig(res.data);
        setDraft((d) => ({ ...d, enabled: res.data.enabled }));
        onNotify({
          text: res.data.enabled
            ? "Custom styles and set cards are ON for the Standard Pack."
            : "Switched OFF. The Standard Pack rolls exactly as it always has.",
        });
      } else onNotify({ text: res.error, error: true });
    });
  }

  function convert() {
    if (!pack) return;
    startTransition(async () => {
      const res = await convertLegacyPackAction(pack.id);
      if (res.success) {
        onPackSaved(res.data);
        onNotify({ text: `"${res.data.name}" moved to the rarity layout. Every card keeps its odds.` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  function saveLegacyPrice() {
    if (!pack) return;
    startTransition(async () => {
      const res = await updateCustomPackPricingAction(pack.id, Number(price), salePrice.trim() ? Number(salePrice) : null);
      if (res.success) {
        onPackSaved(res.data);
        onNotify({ text: `Updated the price of "${res.data.name}".` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  /** Live in the store or a draft. For a pack that exists this takes effect straight away; for a new pack it applies when created. */
  function toggleLive() {
    const next: TcgPackStatus = status === "live" ? "draft" : "live";
    if (!pack) {
      setStatus(next);
      return;
    }
    startTransition(async () => {
      const res = await setPackStatusAction(pack.id, next);
      if (res.success) {
        setStatus(res.data.status);
        onPackSaved(res.data);
        onNotify({
          text: res.data.status === "live" ? `"${res.data.name}" is now live in the store.` : `"${res.data.name}" is now a draft and hidden from the store.`,
        });
      } else onNotify({ text: res.error, error: true });
    });
  }

  function remove() {
    if (!pack || !window.confirm(`Delete the pack "${pack.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deletePackAction(pack.id);
      if (res.success) {
        onPackDeleted(pack.id);
        onNotify({ text: `Deleted "${pack.name}".` });
      } else onNotify({ text: res.error, error: true });
    });
  }

  const effectiveStandardPrice =
    standardSalePrice && standardSalePrice > 0 && standardSalePrice < standardPrice ? standardSalePrice : standardPrice;

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────── */}
      {isStandard ? (
        <section className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl space-y-1">
              <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Standard Pack</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {effectiveStandardPrice.toLocaleString()} P-Credits. Members choose their car photo, or generate from the community.
                Both car cards roll the setup below.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <span>{standardConfig.enabled ? "Custom styles & set cards ON" : "Custom styles & set cards OFF"}</span>
              <button
                type="button"
                role="switch"
                aria-checked={standardConfig.enabled}
                aria-label="Use custom styles and set cards in the Standard Pack"
                disabled={pending}
                onClick={toggleStandard}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${standardConfig.enabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${standardConfig.enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>
          </div>
          <p className="rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
            {standardConfig.enabled
              ? "ON: after a card's rarity is rolled, the entries on that rarity can take its place."
              : "OFF: whatever is set up below is ignored and the Standard Pack rolls exactly as it always has. You can set things up first and switch on when ready."}
          </p>
        </section>
      ) : (
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">{pack ? pack.name : "New pack"}</h3>
            <div className="flex flex-wrap gap-1.5">
              {legacy ? <span className={chip}>Old layout</span> : <span className={chip}>{needsCar ? "Needs a car when opened" : "Opens instantly"}</span>}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <span>
              <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">
                {status === "live" ? "Live in the store" : "Draft (hidden from members)"}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {pack
                  ? "Takes effect straight away."
                  : "Applies when you create the pack. Leave it off to build the pack first."}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={status === "live"}
              aria-label="Pack is live in the store"
              disabled={pending}
              onClick={toggleLive}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${status === "live" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${status === "live" ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pk-name" className={labelCls}>Name</label>
              <input id="pk-name" className={inputCls} value={name} maxLength={60} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black Flame Series" />
            </div>
            <div>
              <label htmlFor="pk-desc" className={labelCls}>Description</label>
              <input id="pk-desc" className={inputCls} value={description} maxLength={200} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} placeholder="Shown in the store" />
            </div>
            <div>
              <label htmlFor="pk-price" className={labelCls}>Price (P-Credits)</label>
              <input id="pk-price" type="number" min={1} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pk-sale" className={labelCls}>Sale price (optional)</label>
              <input id="pk-sale" type="number" min={1} className={inputCls} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Blank for no sale" />
            </div>
            {!readOnly && (
              <>
                <div>
                  <label htmlFor="pk-count" className={labelCls}>Cards per pack</label>
                  <select id="pk-count" className={inputCls} value={cardsPerPack} onChange={(e) => setCardsPerPack(e.target.value)}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          {legacy && (
            <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">This pack uses the old layout (one weighted card list).</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                What you see below is the same pack shown by rarity. Moving it over keeps every card&apos;s odds exactly, and lets you add
                styles and change the rarity odds. After moving, pulled cards keep the rarity and frame colours they were saved with.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={pending} onClick={convert}>
                  {pending ? "Moving…" : "Move to the rarity layout"}
                </button>
                <button type="button" className={secondaryBtn} disabled={pending} onClick={saveLegacyPrice}>Save price</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Rarity odds ──────────────────────────────────────────────── */}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">Rarity odds</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isStandard && !draft.oddsOverride
                ? "The Standard Pack's usual odds, which come from the rolled stats."
                : "How often each rarity is rolled. Bronze is whatever is left."}
            </p>
          </div>
          {isStandard && (
            <label className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <input
                type="checkbox"
                checked={draft.oddsOverride}
                onChange={(e) => setDraft((d) => ({ ...d, oddsOverride: e.target.checked }))}
              />
              Use my own rarity odds
            </label>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-5">
          {RARE_FIRST.map((tier) => {
            const pct = pcts[tier];
            return (
              <div key={tier} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <p className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">{tierLabel(tier)}</p>
                {tier !== "bronze" && oddsEditable ? (
                  <div className="mt-1 flex items-center gap-1.5 text-sm">
                    <label htmlFor={`oneIn-${tier}`} className="text-zinc-600 dark:text-zinc-300">1 in</label>
                    <input
                      id={`oneIn-${tier}`}
                      type="number"
                      min={1}
                      step="any"
                      inputMode="decimal"
                      className={`${inputCls} !px-2 !py-1.5`}
                      value={oneInText[tier as OddsTier]}
                      onChange={(e) => setOneIn(tier as OddsTier, e.target.value)}
                      placeholder="never"
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {pct > 0 ? `1 in ${Number((100 / pct).toFixed(pct < 1 ? 0 : 1))}` : "never"}
                  </p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{fmtPct(pct)}</p>
              </div>
            );
          })}
        </div>
        {oddsEditable && oddsTotal > 100.0001 && (
          <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">The odds above add up to more than 100%. Lower one of them.</p>
        )}
      </section>

      {/* ── Each rarity ──────────────────────────────────────────────── */}
      {RARE_FIRST.map((tier) => {
        const entries = draft.rarities[tier];
        const used = entries.reduce((s, e) => s + e.chancePct, 0);
        const rest = generatedPct(entries);
        const rolled = pcts[tier] > 0;
        return (
          <section key={tier} className={`${panel} ${rolled ? "" : "opacity-70"}`} aria-labelledby={`rar-${tier}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`rar-${tier}`} className="text-base font-black text-zinc-900 dark:text-zinc-100">
                {tierLabel(tier)}{" "}
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  {rolled ? `${fmtPct(pcts[tier])} of cards` : "not rolled by this pack"}
                </span>
              </h3>
              <span className={`text-xs font-bold ${used > 100.0001 ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                Entries use {fmtPct(used)} · normal card {fmtPct(rest)}
              </span>
            </div>

            <div className="flex flex-wrap gap-4">
              {(isStandard || needsCar || rest > 0 || entries.length === 0) && (
                <PreviewTile
                  card={generatedPreviewCard(tier)}
                  title="Normal card"
                  subtitle={`${fmtPct(rest)} of ${tierLabel(tier)}`}
                  onOpen={() => setDetail({ kind: "generated", tier })}
                />
              )}

              {entries.map((entry, index) => {
                const style = entry.kind === "style" ? styleById.get(entry.refId) : undefined;
                const card = entry.kind === "card" ? cardById.get(entry.refId) : undefined;
                const overall = entryOverallPct(pcts, tier, entry);
                const mismatch = card ? tierFromStats(card.stats) !== card.tier : false;
                const missing = !style && !card;
                return (
                  <PreviewTile
                    key={`${entry.kind}-${entry.refId}`}
                    card={
                      style
                        ? stylePreviewCard(style, tier)
                        : card ?? { ...generatedPreviewCard(tier), name: "Missing", ability: "Deleted" }
                    }
                    title={style?.name ?? card?.name ?? "Missing"}
                    subtitle={missing ? "Remove this entry" : `${entry.kind === "style" ? "Style" : "Set card"} · ${fmtPct(overall)} of all`}
                    onOpen={() => {
                      if (style) setDetail({ kind: "style", style, tier });
                      else if (card) setDetail({ kind: "card", card });
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <label htmlFor={`ch-${tier}-${index}`} className="sr-only">
                        Chance of {style?.name ?? card?.name ?? "entry"} on {tierLabel(tier)}
                      </label>
                      <input
                        id={`ch-${tier}-${index}`}
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        inputMode="decimal"
                        disabled={readOnly}
                        className={`${inputCls} !px-2 !py-1.5`}
                        value={entry.chancePct}
                        onChange={(e) => setChance(tier, index, e.target.value)}
                      />
                      <span className="text-xs font-bold text-zinc-500">%</span>
                    </div>
                    {mismatch && <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Stats don&apos;t match its rarity</p>}
                    {!readOnly && (
                      <button type="button" className={`${dangerBtn} !min-h-8 !px-2`} onClick={() => removeEntry(tier, index)}>
                        Remove
                      </button>
                    )}
                  </PreviewTile>
                );
              })}

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setAdding(tier)}
                  disabled={used >= 100 - 1e-4}
                  className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 self-start rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
                  style={{ aspectRatio: "63 / 88" }}
                >
                  <span aria-hidden="true" className="text-3xl font-black">+</span>
                  <span className="text-xs font-bold">{used >= 100 - 1e-4 ? "Full" : "Add style or card"}</span>
                </button>
              )}
            </div>
          </section>
        );
      })}

      {/* ── Save ─────────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryBtn} disabled={pending || (!isStandard && !name.trim())} onClick={save}>
            {pending ? "Saving…" : isStandard ? "Save Standard Pack" : pack ? "Save pack" : "Create pack"}
          </button>
          {pack && (
            <button type="button" className={dangerBtn} disabled={pending} onClick={remove}>
              Delete pack
            </button>
          )}
          {isStandard && !standardConfig.enabled && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Saved, but not used until the switch above is on.</span>
          )}
        </div>
      )}

      {/* ── Add dialog ───────────────────────────────────────────────── */}
      {adding && (
        <Modal title={`Add to ${tierLabel(adding)}`} onClose={() => setAdding(null)}>
          {(() => {
            const taken = new Set(draft.rarities[adding].map((e) => `${e.kind}:${e.refId}`));
            const availableStyles = styles.filter((s) => !taken.has(`style:${s.id}`));
            const availableCards = cards.filter((c) => c.tier === adding && !taken.has(`card:${c.id}`));
            return (
              <div className="space-y-5">
                <div>
                  <p className={labelCls}>Styles</p>
                  {availableStyles.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No styles to add. Create one on the Styles tab.</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {availableStyles.map((s) => (
                        <button key={s.id} type="button" onClick={() => addEntry(adding, "style", s.id)} aria-label={`Add style ${s.name}`} className="w-28 text-left">
                          <FullArtCard card={stylePreviewCard(s, adding)} />
                          <span className="mt-1 block truncate text-xs font-bold">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className={labelCls}>{tierLabel(adding)} set cards</p>
                  {availableCards.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No saved {tierLabel(adding)} cards to add. Make one in the Card maker; a set card can only go on its own rarity.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {availableCards.map((c) => (
                        <button key={c.id} type="button" onClick={() => addEntry(adding, "card", c.id)} aria-label={`Add set card ${c.name}`} className="w-28 text-left">
                          <FullArtCard card={c} />
                          <span className="mt-1 block truncate text-xs font-bold">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ── Detail dialog ────────────────────────────────────────────── */}
      {detail && (
        <Modal
          title={
            detail.kind === "generated"
              ? `Normal ${tierLabel(detail.tier)} card`
              : detail.kind === "style"
                ? detail.style.name
                : detail.card.name
          }
          onClose={() => setDetail(null)}
        >
          {detail.kind === "generated" && <GeneratedDetails tier={detail.tier} />}
          {detail.kind === "style" && <StyleDetails style={detail.style} tier={detail.tier} />}
          {detail.kind === "card" && <FixedCardDetails card={detail.card} />}
        </Modal>
      )}
    </div>
  );
}
