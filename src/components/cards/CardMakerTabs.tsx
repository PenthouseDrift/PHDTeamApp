"use client";

import { useState } from "react";
import { CardMaker } from "@/components/cards/CardMaker";
import { FullArtCardMaker } from "@/components/cards/FullArtCardMaker";
import type { CardData } from "@/lib/card-maker";
import type { FullArtCardData } from "@/lib/full-art-card";

type Kind = "full-art" | "original";

const TABS: Array<{ id: Kind; label: string; hint: string }> = [
  { id: "full-art", label: "Full art card", hint: "Picture fills the card. Pick a bronze, silver, gold, legend or mythic tier" },
  { id: "original", label: "Original card", hint: "The first card design, with its own colours and header" },
];

/**
 * Top-level switch between the card designs. Both stay mounted (the inactive one is just
 * hidden) so switching tabs never loses a half-edited card.
 */
export function CardMakerTabs({
  initialFullArtSaved,
  initialOriginalSaved,
  initialFeatured = {},
}: {
  initialFullArtSaved: FullArtCardData[];
  initialOriginalSaved: CardData[];
  /** Saved full art card id -> odds weight, for the cards that can be pulled from packs. */
  initialFeatured?: Record<string, number>;
}) {
  const [kind, setKind] = useState<Kind>("full-art");

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Card type" className="grid grid-cols-1 gap-2 rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800 sm:max-w-2xl sm:grid-cols-2">
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
                active ? "bg-white shadow-sm dark:bg-zinc-700" : "hover:bg-white/60 dark:hover:bg-zinc-700/50"
              }`}
            >
              <span className={`block text-sm font-black ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}>
                {t.label}
              </span>
              <span className="hidden text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:block">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="card-kind-panel-full-art" aria-labelledby="card-kind-tab-full-art" hidden={kind !== "full-art"}>
        <FullArtCardMaker initialSaved={initialFullArtSaved} initialFeatured={initialFeatured} />
      </div>
      <div role="tabpanel" id="card-kind-panel-original" aria-labelledby="card-kind-tab-original" hidden={kind !== "original"}>
        <CardMaker initialSaved={initialOriginalSaved} />
      </div>
    </div>
  );
}
