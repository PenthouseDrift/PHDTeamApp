"use client";

import { useState } from "react";
import { CardMaker } from "@/components/cards/CardMaker";
import { FullArtCardMaker } from "@/components/cards/FullArtCardMaker";
import { TcgPackManagerAdmin } from "@/tcg/components/TcgPackManagerAdmin";
import { TcgClashCardsAdmin } from "@/tcg/components/TcgClashCardsAdmin";
import { TcgChallengesAdmin } from "@/tcg/components/TcgChallengesAdmin";
import type { CardData } from "@/lib/card-maker";
import type { FullArtCardData } from "@/lib/full-art-card";
import { CREW_CARD_SET, DEBUFF_CARD_SET, UK_TRACK_CARD_SET } from "@/lib/crew-cards";
import { P_CREDIT_BUNDLES } from "@/tcg/config";
import type { ClashGameCardsConfig } from "@/tcg/storage";
import type { PCreditBundle, TcgCustomPackWithCards } from "@/tcg/types";

export type CardMakerTabKind = "full-art" | "packs" | "clash-cards" | "challenges" | "original";

const TABS: Array<{ id: CardMakerTabKind; label: string; hint: string }> = [
  {
    id: "full-art",
    label: "Full art card",
    hint: "Picture fills the card. Pick a bronze, silver, gold, legend or mythic tier",
  },
  {
    id: "packs",
    label: "Packs & Store",
    hint: "Configure Standard Pack price & build custom set packs (Draft / Live) for P-Credits",
  },
  {
    id: "clash-cards",
    label: "Clash Game Cards",
    hint: "Manage Crew Advantages, Debuff Cards & UK Track Cards (edit rules, upload art, or create bespoke cards)",
  },
  {
    id: "challenges",
    label: "Clash Challenges",
    hint: "Create and configure Tandem Clash challenge series, rarity cups, power caps & rewards",
  },
  {
    id: "original",
    label: "Original card",
    hint: "The first card design, with its own colours and header",
  },
];

/**
 * Top-level switch between the card designs and the TCG Pack Manager.
 * Panels stay mounted (the inactive ones are hidden) so switching tabs never loses work in progress.
 */
export function CardMakerTabs({
  initialTab = "full-art",
  initialFullArtSaved,
  initialOriginalSaved,
  initialFeatured = {},
  initialStandardPackPrice = 100,
  initialStandardPackSalePrice = null,
  initialPCreditBundles = P_CREDIT_BUNDLES,
  initialCustomPacks = [],
  initialClashCardsConfig = {
    crewCards: CREW_CARD_SET,
    debuffCards: DEBUFF_CARD_SET,
    trackCards: UK_TRACK_CARD_SET,
  },
}: {
  initialTab?: CardMakerTabKind;
  initialFullArtSaved: FullArtCardData[];
  initialOriginalSaved: CardData[];
  /** Saved full art card id -> odds weight, for the cards that can be pulled from packs. */
  initialFeatured?: Record<string, number>;
  initialStandardPackPrice?: number;
  initialStandardPackSalePrice?: number | null;
  initialPCreditBundles?: PCreditBundle[];
  initialCustomPacks?: TcgCustomPackWithCards[];
  initialClashCardsConfig?: ClashGameCardsConfig;
}) {
  const [kind, setKind] = useState<CardMakerTabKind>(initialTab);
  const [fullArtSaved, setFullArtSaved] = useState<FullArtCardData[]>(initialFullArtSaved);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Card maker and store tabs"
        className="grid grid-cols-1 gap-2 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800 sm:max-w-5xl sm:grid-cols-5"
      >
        {TABS.map((t) => {
          const active = kind === t.id;
          return (
            <button
              key={t.id}
              id={`card-kind-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`card-kind-panel-${t.id}`}
              onClick={() => setKind(t.id)}
              className={`min-h-14 rounded-xl px-3 py-2 text-left transition-colors ${
                active
                  ? "bg-white shadow-sm dark:bg-zinc-700"
                  : "hover:bg-white/60 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span
                className={`block text-sm font-black ${
                  active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {t.label}
              </span>
              <span className="hidden text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:block">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="card-kind-panel-full-art"
        aria-labelledby="card-kind-tab-full-art"
        hidden={kind !== "full-art"}
      >
        <FullArtCardMaker
          initialSaved={fullArtSaved}
          initialFeatured={initialFeatured}
          onSavedCardsChange={setFullArtSaved}
        />
      </div>

      <div
        role="tabpanel"
        id="card-kind-panel-packs"
        aria-labelledby="card-kind-tab-packs"
        hidden={kind !== "packs"}
      >
        <TcgPackManagerAdmin
          savedFullArtCards={fullArtSaved}
          initialStandardPackPrice={initialStandardPackPrice}
          initialStandardPackSalePrice={initialStandardPackSalePrice}
          initialPCreditBundles={initialPCreditBundles}
          initialCustomPacks={initialCustomPacks}
        />
      </div>

      <div
        role="tabpanel"
        id="card-kind-panel-clash-cards"
        aria-labelledby="card-kind-tab-clash-cards"
        hidden={kind !== "clash-cards"}
      >
        <TcgClashCardsAdmin initialConfig={initialClashCardsConfig} />
      </div>

      <div
        role="tabpanel"
        id="card-kind-panel-challenges"
        aria-labelledby="card-kind-tab-challenges"
        hidden={kind !== "challenges"}
      >
        <TcgChallengesAdmin />
      </div>

      <div
        role="tabpanel"
        id="card-kind-panel-original"
        aria-labelledby="card-kind-tab-original"
        hidden={kind !== "original"}
      >
        <CardMaker initialSaved={initialOriginalSaved} />
      </div>
    </div>
  );
}
