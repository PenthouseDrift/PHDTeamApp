"use client";

import { FullArtCard } from "@/components/cards/FullArtCard";
import { cardKind, RARITY_RANK, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { getQuickSellPrice } from "@/tcg/config";
import { BottomSheet } from "@/tcg/ui/BottomSheet";

export const MAX_COMPARE = 6;
export const MAX_LIST = 20;

/**
 * What to do with the cards picked in the deck: compare them, list them for sale, or quick sell them for a total.
 * Each button says what it will do, and why it is off when it is.
 */
export function SelectionSheet({
  cards,
  onClose,
  onClear,
  onCompare,
  onList,
  onSell,
}: {
  cards: MemberCard[];
  onClose: () => void;
  onClear: () => void;
  onCompare: () => void;
  onList: () => void;
  onSell: () => void;
}) {
  const total = cards.reduce((sum, c) => sum + getQuickSellPrice(c), 0);
  const cars = cards.filter((c) => cardKind(c) === "car").length;
  const unlisted = cards.filter((c) => !c.listedPrice).length;
  const byRarity = Object.entries(
    cards.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.tier]: (acc[c.tier] ?? 0) + 1 }), {})
  ).sort((a, b) => (RARITY_RANK[b[0] as MemberCard["tier"]] ?? 0) - (RARITY_RANK[a[0] as MemberCard["tier"]] ?? 0));

  const compareWhy = cards.length < 2 ? "Pick at least 2 cards" : cards.length > MAX_COMPARE ? `Pick up to ${MAX_COMPARE} cards` : cars < 2 ? "Needs at least 2 cars" : null;
  const listWhy = unlisted === 0 ? "They are all listed already" : unlisted > MAX_LIST ? `List up to ${MAX_LIST} at a time` : null;

  const row = "gx-tap flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <BottomSheet
      title={`${cards.length} card${cards.length === 1 ? "" : "s"} selected`}
      subtitle="Choose what to do with them"
      onClose={onClose}
      footer={
        <div className="flex gap-2 pb-2">
          <button
            type="button"
            onClick={onClear}
            className="gx-tap inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-xs font-black uppercase tracking-wide text-zinc-100 hover:bg-zinc-700"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={onClose}
            className="gx-tap inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-amber-500 px-4 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400"
          >
            Keep picking
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Selected cards">
          {cards.slice(0, 10).map((c) => (
            <li key={c.id} className="w-14 shrink-0">
              <FullArtCard card={c} className="drop-shadow-md" />
            </li>
          ))}
          {cards.length > 10 && <li className="flex w-14 shrink-0 items-center justify-center text-sm font-black text-zinc-400">+{cards.length - 10}</li>}
        </ul>

        <div className="flex flex-wrap gap-1.5">
          {byRarity.map(([tier, n]) => (
            <span key={tier} className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-bold text-zinc-200">
              {n} {rarityLabel(tier as MemberCard["tier"])}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <button type="button" onClick={onCompare} disabled={compareWhy !== null} className={`${row} border-zinc-700 bg-zinc-900 hover:border-amber-500/60 hover:bg-zinc-800`}>
            <span aria-hidden className="text-2xl">⚖️</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-zinc-100">Compare</span>
              <span className="block text-xs text-zinc-400">{compareWhy ?? "See their stats side by side"}</span>
            </span>
          </button>

          <button type="button" onClick={onList} disabled={listWhy !== null} className={`${row} border-zinc-700 bg-zinc-900 hover:border-amber-500/60 hover:bg-zinc-800`}>
            <span aria-hidden className="text-2xl">🏷️</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-zinc-100">List for sale</span>
              <span className="block text-xs text-zinc-400">{listWhy ?? `Set a price for ${unlisted} card${unlisted === 1 ? "" : "s"} on the Marketplace`}</span>
            </span>
          </button>

          <button type="button" onClick={onSell} className={`${row} border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20`}>
            <span aria-hidden className="text-2xl">💰</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-rose-100">Quick sell</span>
              <span className="block text-xs text-rose-200/80">Sell them all right now</span>
            </span>
            <span className="shrink-0 text-lg font-black text-amber-400">+{total.toLocaleString()} P</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
