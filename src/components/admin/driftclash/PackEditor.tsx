"use client";

import { useCallback, useState, useTransition } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { MemberCarPicker } from "@/components/admin/driftclash/MemberCarPicker";
import { SavedSetCardPicker, describeVariant } from "@/components/admin/driftclash/SavedSetCardPicker";
import { EntryStatsDialog } from "@/components/admin/driftclash/StatsModeControl";
import { StyleCardWizard } from "@/components/admin/driftclash/StyleCardWizard";
import { EntryEditorDialog } from "@/components/admin/driftclash/EntryEditorDialog";
import { BonusPullEditor } from "@/components/admin/driftclash/BonusPullEditor";
import { tierFromStats } from "@/lib/card-roll";
import type { FullArtCardData, FullArtTier } from "@/lib/full-art-card";
import {
  ODDS_TIERS,
  applyVariant,
  configFromLegacyPack,
  effectivePcts,
  MAX_EXTRA_CARDS,
  emptyPackConfig,
  packExtraCounts,
  entryOverallPct,
  generatedPct,
  oneInFromPct,
  packNeedsGeneration,
  pctFromOneIn,
  variantStatsMode,
  type EntryVariant,
  type OddsTier,
  type PackConfig,
  type PackEntry,
} from "@/lib/pack-config";
import { ALL_TIERS, type PackStyle } from "@/lib/pack-styles";
import {
  createFinishedSetCardAction,
  convertLegacyPackAction,
  deletePackAction,
  savePackAction,
  savePackConfigAction,
  setPackPurchasableAction,
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
  legacyPullable,
  onStandardConfig,
  onCardCreated,
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
  /** The old pullable list (card id -> odds weight), which the Standard Pack can move into its bonus pull. */
  legacyPullable: Record<string, number>;
  onStandardConfig: (config: PackConfig) => void;
  /** A set card was just made from a member's car, so the page's list of saved cards needs it. */
  onCardCreated: (card: SetCard) => void;
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
  /** Whether a live pack can be bought. Off means members can see the pack and what is in it, but not buy it. */
  const [purchasable, setPurchasable] = useState(pack?.purchasable !== false);

  const [adding, setAdding] = useState<FullArtTier | null>(null);
  const [addTab, setAddTab] = useState<"members" | "styles" | "cards">("cards");
  const closeAdd = useCallback(() => setAdding(null), []);
  /** The style chosen on the Styles tab, while the admin decides how to use it. */
  const [pickedStyle, setPickedStyle] = useState<PackStyle | null>(null);
  /** The set card being edited in the card editor. */
  const [editing, setEditing] = useState<{ tier: FullArtTier; index: number } | null>(null);
  const closeEditing = useCallback(() => setEditing(null), []);
  const [statsFor, setStatsFor] = useState<{ tier: FullArtTier; index: number } | null>(null);
  const closeStats = useCallback(() => setStatsFor(null), []);
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
  function addEntry(tier: FullArtTier, kind: PackEntry["kind"], refId: string, variant?: EntryVariant) {
    const used = draft.rarities[tier].reduce((s, e) => s + e.chancePct, 0);
    const chancePct = Math.max(0, Math.min(5, Math.round((100 - used) * 100) / 100));
    setEntries(tier, [...draft.rarities[tier], { kind, refId, chancePct, ...(variant ? { variant } : {}) }]);
    setAdding(null);
  }
  /**
   * Add several set cards to a rarity in one go. A card already in the rarity is skipped. Each new entry starts with a share of
   * what is left (up to 5%), the same as adding one at a time, and the chances can be set afterwards. Returns how many were
   * added and how many were skipped as already there.
   */
  function addCardEntries(tier: FullArtTier, items: { refId: string; variant?: EntryVariant }[]): { added: number; skipped: number } {
    const entries = [...draft.rarities[tier]];
    let used = entries.reduce((s, e) => s + e.chancePct, 0);
    let added = 0;
    let skipped = 0;
    for (const item of items) {
      if (entries.some((e) => e.kind === "card" && e.refId === item.refId)) {
        skipped++;
        continue;
      }
      const chancePct = Math.max(0, Math.min(5, Math.round((100 - used) * 100) / 100));
      used += chancePct;
      entries.push({ kind: "card", refId: item.refId, chancePct, ...(item.variant ? { variant: item.variant } : {}) });
      added++;
    }
    setEntries(tier, entries);
    setAdding(null);
    return { added, skipped };
  }
  /** True when the card as this pack uses it is not the card as saved: another rarity, a restyle, a redraw, or stats set by hand. */
  function differsFromSaved(saved: SetCard, entry: PackEntry, tier: FullArtTier): boolean {
    const v = entry.variant;
    return saved.tier !== tier || Boolean(v?.styleId || v?.artUrl || v?.stats || v?.edits);
  }
  /**
   * Turn a card as this pack would use it (the entry's changes, or changes just made in the editor) into a real saved set
   * card, so it is in Saved set cards and the Card maker, and point the entry at it. Only "reroll at the pull" stays on the
   * entry. The card it was made from is left as it is. Resolves to an error message, or null when it worked.
   */
  async function saveEntryAsCardWith(tier: FullArtTier, index: number, variant: EntryVariant | undefined): Promise<string | null> {
    const entry = draft.rarities[tier][index];
    if (!entry || entry.kind !== "card") return "That card is no longer in the pack.";
    const res = await createFinishedSetCardAction({ source: { kind: "saved", id: entry.refId }, tier, variant });
    if (!res.success) return res.error;
    const created = res.data.card as SetCard;
    onCardCreated(created);
    setDraft((d) => ({
      ...d,
      rarities: {
        ...d.rarities,
        [tier]: d.rarities[tier].map((e, i) => {
          if (i !== index || e.refId !== entry.refId) return e;
          const { variant: _old, ...rest } = e;
          void _old;
          return { ...rest, refId: created.id, ...(res.data.entryVariant ? { variant: res.data.entryVariant } : {}) };
        }),
      },
    }));
    onNotify({
      text: `Saved "${created.name}" as a new ${tierLabel(tier)} set card and pointed this pack at it. The card it was made from is unchanged. Save the pack to keep your changes.`,
    });
    return null;
  }
  function saveEntryAsCard(tier: FullArtTier, index: number) {
    const entry = draft.rarities[tier][index];
    if (!entry || entry.kind !== "card") return;
    startTransition(async () => {
      const error = await saveEntryAsCardWith(tier, index, entry.variant);
      if (error) onNotify({ text: error, error: true });
    });
  }
  /** Replace everything this pack changes about a set card in a rarity. The saved card is not changed. */
  function setEntryVariant(tier: FullArtTier, index: number, variant: EntryVariant | undefined) {
    setEntries(
      tier,
      draft.rarities[tier].map((e, i) => {
        if (i !== index) return e;
        const { variant: _old, ...rest } = e;
        void _old;
        return variant ? { ...rest, variant } : rest;
      })
    );
  }
  /** Change what happens to a set card's stats in a rarity. Kept on the entry only; the saved card is not changed. */
  function setEntryStats(tier: FullArtTier, index: number, fields: Pick<EntryVariant, "stats" | "rerollOnPull">) {
    setEntries(
      tier,
      draft.rarities[tier].map((e, i) => {
        if (i !== index) return e;
        // Take out the old stats choice, put the new one in, and drop the variant if nothing is left in it.
        const { stats: _stats, rerollOnPull: _reroll, ...rest } = e.variant ?? {};
        void _stats;
        void _reroll;
        const variant: EntryVariant = { ...rest, ...fields };
        const { variant: _old, ...entry } = e;
        void _old;
        return Object.keys(variant).length > 0 ? { ...entry, variant } : entry;
      })
    );
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
    if (draft.bonus && draft.bonus.chancePct > 0 && draft.bonus.entries.length === 0) {
      return "The bonus pull has a chance but no cards. Add a card to it, or clear its chance.";
    }
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
        purchasable,
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

  /** Whether members can buy this live pack. For a pack that exists this takes effect straight away; for a new pack it applies when created. */
  function togglePurchasable() {
    const next = !purchasable;
    if (!pack) {
      setPurchasable(next);
      return;
    }
    startTransition(async () => {
      const res = await setPackPurchasableAction(pack.id, next);
      if (res.success) {
        setPurchasable(res.data.purchasable !== false);
        onPackSaved(res.data);
        onNotify({
          text:
            res.data.purchasable === false
              ? `"${res.data.name}" can't be bought right now. ${res.data.status === "live" ? "Members can still see it and what is in it." : "It is still a draft, so members can't see it."}`
              : `"${res.data.name}" can be bought again.`,
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
          <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <span>
              <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100">
                {purchasable ? "Members can buy this pack" : "Not available to buy right now"}
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {purchasable
                  ? "Turn this off to keep the pack in the store for members to look at, without letting them buy or open it."
                  : status === "live"
                    ? "Members can still see the pack and everything in it, but the buy button is off."
                    : "Takes effect once the pack is live. While it is a draft, members can't see it at all."}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={purchasable}
              aria-label="Members can buy this pack"
              disabled={pending}
              onClick={togglePurchasable}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${purchasable ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${purchasable ? "left-[22px]" : "left-0.5"}`} />
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
                {!isStandard && (
                  <>
                    <div>
                      <label htmlFor="pk-crew" className={labelCls}>Crew cards per pack</label>
                      <select
                        id="pk-crew"
                        className={inputCls}
                        value={packExtraCounts(draft).crew}
                        onChange={(e) => setDraft((d) => ({ ...d, crewCards: Number(e.target.value) }))}
                      >
                        {Array.from({ length: MAX_EXTRA_CARDS + 1 }, (_, n) => (
                          <option key={n} value={n}>{n === 0 ? "None" : n}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Tactical Crew cards for Clash Arena, rolled from the crew set.</p>
                    </div>
                    <div>
                      <label htmlFor="pk-repair" className={labelCls}>Repair kits per pack</label>
                      <select
                        id="pk-repair"
                        className={inputCls}
                        value={packExtraCounts(draft).repair}
                        onChange={(e) => setDraft((d) => ({ ...d, repairCards: Number(e.target.value) }))}
                      >
                        {Array.from({ length: MAX_EXTRA_CARDS + 1 }, (_, n) => (
                          <option key={n} value={n}>{n === 0 ? "None" : n}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Maintenance cards that repair a mechanical fault. Not drawn by AI.</p>
                    </div>
                  </>
                )}
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
                const saved = entry.kind === "card" ? cardById.get(entry.refId) : undefined;
                // The card as this pack uses it: with its rolled stats, restyled frame and redrawn picture, if any.
                const card = saved ? applyVariant(saved, entry.variant, styleById, tier) : undefined;
                const overall = entryOverallPct(pcts, tier, entry);
                // Stats rolled at the pull always fit the rarity, so only kept or hand-set stats can be a mismatch.
                const mismatch = card ? !entry.variant?.rerollOnPull && tierFromStats(card.stats) !== card.tier : false;
                const missing = !style && !card;
                const changes = entry.kind === "card" && entry.variant ? describeVariant(entry.variant) : "";
                return (
                  <PreviewTile
                    key={`${entry.kind}-${entry.refId}`}
                    card={
                      style
                        ? stylePreviewCard(style, tier)
                        : card ?? { ...generatedPreviewCard(tier), name: "Missing", ability: "Deleted" }
                    }
                    title={style?.name ?? card?.name ?? "Missing"}
                    subtitle={
                      missing
                        ? "Remove this entry"
                        : `${entry.kind === "style" ? "Style" : changes ? `Set card (${changes})` : "Set card"} · ${fmtPct(overall)} of all`
                    }
                    onOpen={() => {
                      if (style) setDetail({ kind: "style", style, tier });
                      // A set card opens the editor. A pack still on the old layout can't be edited, so it just shows the card.
                      else if (card && saved) {
                        if (readOnly) setDetail({ kind: "card", card });
                        else setEditing({ tier, index });
                      }
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
                    {entry.kind === "card" && card && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {{ keep: "Keeps its stats", reroll: "Rerolled at each pull", custom: "Your own stats" }[variantStatsMode(entry.variant)]}
                      </p>
                    )}
                    {!readOnly && card && (
                      <button type="button" className={`${secondaryBtn} !min-h-8 !px-2`} onClick={() => setStatsFor({ tier, index })}>
                        Stats…
                      </button>
                    )}
                    {!readOnly && saved && card && entry.kind === "card" && differsFromSaved(saved, entry, tier) && (
                      <button
                        type="button"
                        className={`${secondaryBtn} !min-h-8 !px-2`}
                        disabled={pending}
                        onClick={() => saveEntryAsCard(tier, index)}
                      >
                        Save as new card
                      </button>
                    )}
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
                  onClick={() => {
                    setAddTab("cards");
                    setPickedStyle(null);
                    setAdding(tier);
                  }}
                  disabled={used >= 100 - 1e-4}
                  className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 self-start rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
                  style={{ aspectRatio: "63 / 88" }}
                >
                  <span aria-hidden="true" className="text-3xl font-black">+</span>
                  <span className="text-xs font-bold">{used >= 100 - 1e-4 ? "Full" : "Add card or style"}</span>
                </button>
              )}
            </div>
          </section>
        );
      })}

      {/* ── Bonus pull ───────────────────────────────────────────────── */}
      <BonusPullEditor
        bonus={draft.bonus}
        cards={cards}
        isStandard={isStandard}
        legacyPullable={legacyPullable}
        styles={styles}
        readOnly={readOnly}
        onChange={(bonus) => setDraft((d) => ({ ...d, bonus }))}
        onCardCreated={onCardCreated}
        onNotify={onNotify}
        onOpenCard={(card) => setDetail({ kind: "card", card })}
      />

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
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              The rarity setup is saved but not used until the switch above is on. The bonus pull works either way.
            </span>
          )}
        </div>
      )}

      {/* ── Add dialog ───────────────────────────────────────────────── */}
      {adding && (
        <Modal title={`Add to ${tierLabel(adding)}`} onClose={closeAdd}>
          <div role="tablist" aria-label="What to add" className="inline-flex gap-1 self-start rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
            {(
              [
                ["cards", "Saved set cards"],
                ["members", "Members' cars"],
                ["styles", "Styles"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={addTab === id}
                onClick={() => {
                  setAddTab(id);
                  setPickedStyle(null);
                }}
                className={`min-h-10 rounded-xl px-3.5 text-sm font-black transition-colors ${
                  addTab === id ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {addTab === "members" && (
            <MemberCarPicker
              tier={adding}
              styles={styles}
              onImported={(card, variant) => {
                onCardCreated(card);
                addEntry(adding, "card", card.id, variant);
                onNotify({
                  text: `Added "${card.name}" to ${tierLabel(adding)} with ${describeVariant(variant)}. The member's car is saved as a set card once and reused if you pick it again. Save the pack to keep your changes.`,
                });
              }}
              onImportedMany={(items, failed) => {
                items.forEach((i) => onCardCreated(i.card));
                const { added, skipped } = addCardEntries(
                  adding,
                  items.map((i) => ({ refId: i.card.id, variant: i.variant }))
                );
                const parts = [
                  `Added ${added} member car${added === 1 ? "" : "s"} to ${tierLabel(adding)}.`,
                  skipped > 0 ? `${skipped} ${skipped === 1 ? "was" : "were"} already there and skipped.` : "",
                  failed.length > 0 ? `Could not add: ${failed.join("; ")}.` : "",
                  "Each car is saved as a set card once. Set their chances below, then save the pack to keep your changes.",
                ].filter(Boolean);
                onNotify({ text: parts.join(" "), error: failed.length > 0 && added === 0 });
              }}
            />
          )}

          {addTab === "cards" && (
            <SavedSetCardPicker
              tier={adding}
              styles={styles}
              cards={cards.filter((c) => !draft.rarities[adding].some((e) => e.kind === "card" && e.refId === c.id))}
              onAdd={(card, variant, created) => {
                if (created) onCardCreated(card);
                addEntry(adding, "card", card.id, variant);
                onNotify({
                  text: created
                    ? `Saved "${card.name}" as a new ${tierLabel(adding)} set card and added it. Your original card is unchanged. Save the pack to keep your changes.`
                    : `Added "${card.name}" to ${tierLabel(adding)}${variant ? ` with ${describeVariant(variant)}` : ""}. The saved card is unchanged and no new card was saved. Save the pack to keep your changes.`,
                });
              }}
            />
          )}

          {addTab === "styles" &&
            (() => {
              const inRarity = new Set(draft.rarities[adding].filter((e) => e.kind === "style").map((e) => e.refId));
              if (pickedStyle) {
                return (
                  <StyleCardWizard
                    tier={adding}
                    style={pickedStyle}
                    styles={styles}
                    alreadyInRarity={inRarity.has(pickedStyle.id)}
                    onBack={() => setPickedStyle(null)}
                    onUseStyle={() => {
                      addEntry(adding, "style", pickedStyle.id);
                      onNotify({
                        text: `Added the style "${pickedStyle.name}" to ${tierLabel(adding)}. Set its chance below, then save the pack.`,
                      });
                    }}
                    onCardAdded={(card, variant) => {
                      onCardCreated(card);
                      addEntry(adding, "card", card.id, variant);
                      onNotify({
                        text: `Saved "${card.name}" as a new ${tierLabel(adding)} set card in the style "${pickedStyle.name}" and added it. Save the pack to keep your changes.`,
                      });
                    }}
                  />
                );
              }
              return (
                <div>
                  <p className={labelCls}>Styles</p>
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Choose a style to use it on this rarity, or to make a card in it from a member&apos;s car or your own picture. To restyle a
                    card you already have, use the other two tabs.
                  </p>
                  {styles.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No styles yet. Create one on the Styles tab.</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {styles.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setPickedStyle(s)}
                          aria-label={`Choose style ${s.name}${inRarity.has(s.id) ? " (already on this rarity)" : ""}`}
                          className="w-28 text-left"
                        >
                          <FullArtCard card={stylePreviewCard(s, adding)} />
                          <span className="mt-1 block truncate text-xs font-bold">{s.name}</span>
                          {inRarity.has(s.id) && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">On this rarity</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
        </Modal>
      )}

      {/* ── Card editor ──────────────────────────────────────────────── */}
      {editing &&
        (() => {
          const entry = draft.rarities[editing.tier][editing.index];
          const saved = entry ? cardById.get(entry.refId) : undefined;
          if (!entry || !saved) return null;
          return (
            <EntryEditorDialog
              mode="rarity"
              tier={editing.tier}
              saved={saved}
              variant={entry.variant}
              styles={styles}
              onApply={(variant) => {
                setEntryVariant(editing.tier, editing.index, variant);
                setEditing(null);
                onNotify({ text: `Updated "${saved.name}" on ${tierLabel(editing.tier)}. The saved card is unchanged. Save the pack to keep your changes.` });
              }}
              onSaveAsNew={async (variant) => {
                const error = await saveEntryAsCardWith(editing.tier, editing.index, variant);
                if (!error) setEditing(null);
                return error;
              }}
              onClose={closeEditing}
            />
          );
        })()}

      {/* ── Stats dialog ─────────────────────────────────────────────── */}
      {statsFor &&
        (() => {
          const entry = draft.rarities[statsFor.tier][statsFor.index];
          const saved = entry ? cardById.get(entry.refId) : undefined;
          if (!entry || !saved) return null;
          return (
            <EntryStatsDialog
              title={`Stats for ${saved.name} on ${tierLabel(statsFor.tier)}`}
              tier={statsFor.tier}
              saved={saved}
              variant={entry.variant}
              onApply={(fields) => {
                setEntryStats(statsFor.tier, statsFor.index, fields);
                setStatsFor(null);
              }}
              onClose={closeStats}
            />
          );
        })()}

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
