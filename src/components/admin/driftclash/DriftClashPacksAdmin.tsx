"use client";

import { useMemo, useState } from "react";
import type { FullArtCardData } from "@/lib/full-art-card";
import type { PackConfig } from "@/lib/pack-config";
import type { PackStyle } from "@/lib/pack-styles";
import type { AdminCustomPrompt } from "@/actions/admin/custom-prompts";
import { TcgPackManagerAdmin } from "@/tcg/components/TcgPackManagerAdmin";
import type { PCreditBundle, TcgCustomPackWithCards } from "@/tcg/types";
import { PackEditor, type Notice, type SetCard } from "@/components/admin/driftclash/PackEditor";
import { StyleEditor } from "@/components/admin/driftclash/StyleEditor";
import { ComingSoonEditor } from "@/components/admin/driftclash/ComingSoonEditor";
import type { ComingSoonItem } from "@/lib/coming-soon";
import { chip } from "@/components/admin/driftclash/preview";

type Tab = "packs" | "styles" | "coming-soon";
type Selection = "standard" | "new" | string;

export function DriftClashPacksAdmin({
  initialStandardConfig,
  initialStyles,
  initialPacks,
  initialComingSoon,
  savedPrompts,
  fullArtCards: initialFullArtCards,
  legacyPullable,
  standardPackPrice,
  standardPackSalePrice,
  pCreditBundles,
}: {
  initialStandardConfig: PackConfig;
  initialStyles: PackStyle[];
  initialPacks: TcgCustomPackWithCards[];
  initialComingSoon: ComingSoonItem[];
  savedPrompts: AdminCustomPrompt[];
  fullArtCards: FullArtCardData[];
  /** The old pullable list (card id -> odds weight). */
  legacyPullable: Record<string, number>;
  standardPackPrice: number;
  standardPackSalePrice: number | null;
  pCreditBundles: PCreditBundle[];
}) {
  const [tab, setTab] = useState<Tab>("packs");
  const [selected, setSelected] = useState<Selection>("standard");
  const [standardConfig, setStandardConfig] = useState(initialStandardConfig);
  const [fullArtCards, setFullArtCards] = useState(initialFullArtCards);
  const [styles, setStyles] = useState(initialStyles);
  const [packs, setPacks] = useState(initialPacks);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Every saved card with an id, including ones with no picture yet (a teaser can show those as a "?").
  const teaserCards = useMemo(() => fullArtCards.filter((c): c is SetCard => Boolean(c.id)), [fullArtCards]);
  const setCards = useMemo(
    () => fullArtCards.filter((c): c is SetCard => Boolean(c.id && c.imageUrl)),
    [fullArtCards]
  );

  // Which packs use each style, for the style library.
  const usage = useMemo(() => {
    const out: Record<string, string[]> = {};
    const add = (config: PackConfig | undefined, label: string) => {
      if (!config) return;
      const seen = new Set<string>();
      for (const entries of Object.values(config.rarities)) {
        for (const e of entries) {
          if (e.kind === "style" && !seen.has(e.refId)) {
            seen.add(e.refId);
            (out[e.refId] ??= []).push(label);
          }
        }
      }
    };
    add(standardConfig, "Standard Pack");
    for (const p of packs) add(p.config, p.name);
    return out;
  }, [standardConfig, packs]);

  const selectedPack = packs.find((p) => p.id === selected);
  const editorKey =
    selected === "standard"
      ? "standard"
      : selected === "new"
        ? "new"
        : `${selected}:${selectedPack?.config ? "v2" : "old"}:${selectedPack?.updatedAt ?? 0}`;

  function onPackSaved(pack: TcgCustomPackWithCards) {
    setPacks((list) => [pack, ...list.filter((p) => p.id !== pack.id)]);
    setSelected(pack.id);
  }

  const tabBtn = (active: boolean) =>
    `min-h-11 rounded-xl px-4 text-sm font-black transition-colors ${
      active ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
    }`;
  const packBtn = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold transition-colors ${
      active
        ? "border-amber-500 bg-amber-500/15 text-zinc-900 dark:text-zinc-100"
        : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Card packs sections" className="inline-flex gap-1 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
        <button type="button" role="tab" aria-selected={tab === "packs"} className={tabBtn(tab === "packs")} onClick={() => setTab("packs")}>
          Packs
        </button>
        <button type="button" role="tab" aria-selected={tab === "styles"} className={tabBtn(tab === "styles")} onClick={() => setTab("styles")}>
          Styles ({styles.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "coming-soon"} className={tabBtn(tab === "coming-soon")} onClick={() => setTab("coming-soon")}>
          Coming soon
        </button>
      </div>

      <div role="status" aria-live="polite">
        {notice && (
          <p
            className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
              notice.error
                ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {tab === "packs" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a pack">
            <button type="button" className={packBtn(selected === "standard")} aria-pressed={selected === "standard"} onClick={() => setSelected("standard")}>
              Standard Pack
              <span className={chip}>{standardConfig.enabled ? "Custom ON" : "Custom OFF"}</span>
            </button>
            {packs.map((p) => (
              <button key={p.id} type="button" className={packBtn(selected === p.id)} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
                {p.name}
                <span className={chip}>{p.status === "live" ? "Live" : "Draft"}</span>
                {!p.config && <span className={chip}>Old layout</span>}
              </button>
            ))}
            <button type="button" className={packBtn(selected === "new")} aria-pressed={selected === "new"} onClick={() => setSelected("new")}>
              + New pack
            </button>
          </div>

          <PackEditor
            key={editorKey}
            target={
              selected === "standard"
                ? { kind: "standard" }
                : selected === "new" || !selectedPack
                  ? { kind: "new" }
                  : { kind: "custom", pack: selectedPack }
            }
            standardConfig={standardConfig}
            standardPrice={standardPackPrice}
            standardSalePrice={standardPackSalePrice}
            styles={styles}
            cards={setCards}
            legacyPullable={legacyPullable}
            onStandardConfig={setStandardConfig}
            onCardCreated={(card) => setFullArtCards((list) => [card, ...list.filter((c) => c.id !== card.id)])}
            onPackSaved={onPackSaved}
            onPackDeleted={(id) => {
              setPacks((list) => list.filter((p) => p.id !== id));
              setSelected("standard");
            }}
            onNotify={setNotice}
          />

          <details className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer text-sm font-black text-zinc-900 dark:text-zinc-100">
              Store prices &amp; P-Credit bundles
            </summary>
            <div className="mt-4">
              <TcgPackManagerAdmin
                storeOnly
                savedFullArtCards={fullArtCards}
                initialStandardPackPrice={standardPackPrice}
                initialStandardPackSalePrice={standardPackSalePrice}
                initialPCreditBundles={pCreditBundles}
                initialCustomPacks={[]}
              />
            </div>
          </details>
        </div>
      ) : tab === "coming-soon" ? (
        <ComingSoonEditor initialItems={initialComingSoon} cards={teaserCards} styles={styles} onNotify={setNotice} />
      ) : (
        <StyleEditor
          styles={styles}
          savedPrompts={savedPrompts}
          usage={usage}
          onSaved={(style) => setStyles((list) => [style, ...list.filter((s) => s.id !== style.id)])}
          onDeleted={(id) => {
            setStyles((list) => list.filter((s) => s.id !== id));
            // Deleting a style also removes it from every pack's setup on the server.
            const strip = (config: PackConfig): PackConfig => ({
              ...config,
              rarities: Object.fromEntries(
                Object.entries(config.rarities).map(([tier, entries]) => [tier, entries.filter((e) => !(e.kind === "style" && e.refId === id))])
              ) as PackConfig["rarities"],
            });
            setStandardConfig(strip);
            setPacks((list) => list.map((p) => (p.config ? { ...p, config: strip(p.config) } : p)));
          }}
          onNotify={setNotice}
        />
      )}
    </div>
  );
}
