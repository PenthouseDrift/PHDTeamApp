"use client";

import { useMemo, useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { RARITY_RANK, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { isCarBroken } from "@/lib/mechanical-faults";
import { getQuickSellPrice } from "@/tcg/config";
import { quickSellCards, type QuickSellBatchResult } from "@/tcg/sell-actions";
import { BottomSheet, sheetDanger, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { Spinner } from "@/tcg/ui/Shimmer";
import { buzz } from "@/tcg/ui/feedback";

/** Cards at or above this rarity are shown with a star, and (when asked) start out ticked to KEEP. */
const RARE = RARITY_RANK.legend;

/**
 * Quick sell several cards for one payout: a whole pack just opened, or a selection from the deck. Every card is listed with
 * what it pays; a tick means "sell this one", so any card can be kept by unticking it. The total updates as you go.
 */
export function QuickSellSheet({
  cards,
  title,
  subtitle,
  keepRareByDefault = false,
  onClose,
  onSold,
}: {
  cards: MemberCard[];
  title: string;
  subtitle?: string;
  /** Start with Legend and Mythic cards unticked (kept), so a whole pack can't sell them by accident. */
  keepRareByDefault?: boolean;
  onClose: () => void;
  /** The cards that were sold. Called once, after the server has paid. */
  onSold: (result: QuickSellBatchResult) => void;
}) {
  const [selling, setSelling] = useState<Set<string>>(
    () => new Set(cards.filter((c) => !(keepRareByDefault && RARITY_RANK[c.tier] >= RARE)).map((c) => c.id))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => [...cards].sort((a, b) => RARITY_RANK[b.tier] - RARITY_RANK[a.tier] || a.name.localeCompare(b.name)), [cards]);
  const chosen = rows.filter((c) => selling.has(c.id));
  const total = chosen.reduce((sum, c) => sum + getQuickSellPrice(c), 0);
  const rareChosen = chosen.filter((c) => RARITY_RANK[c.tier] >= RARE);
  const listedChosen = chosen.filter((c) => c.listedPrice);

  function toggle(id: string) {
    setError(null);
    setSelling((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sell() {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await quickSellCards(chosen.map((c) => c.id));
      if (res.success) {
        buzz(25);
        onSold(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      size="lg"
      tone="rose"
      fullHeight
      title={title}
      subtitle={subtitle}
      dismissible={!busy}
      onClose={onClose}
      footer={
        <div className="space-y-2 pb-2">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm font-bold text-rose-100">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={sheetSecondary}>
              Cancel
            </button>
            <button type="button" onClick={() => void sell()} disabled={busy || chosen.length === 0} className={sheetDanger}>
              {busy ? (
                <>
                  <Spinner className="h-4 w-4" /> Selling…
                </>
              ) : chosen.length === 0 ? (
                "Tick cards to sell"
              ) : (
                `Sell ${chosen.length} card${chosen.length === 1 ? "" : "s"} · +${total.toLocaleString()} P`
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-zinc-400">You&apos;ll receive</p>
            <p className="text-2xl font-black text-amber-400">+{total.toLocaleString()} P-Credits</p>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <p>
              <strong className="text-zinc-100">{chosen.length}</strong> of {cards.length} selling
            </p>
            <div className="mt-1 flex justify-end gap-3">
              <button type="button" onClick={() => setSelling(new Set(cards.map((c) => c.id)))} className="font-bold text-amber-400 hover:underline">
                All
              </button>
              <button type="button" onClick={() => setSelling(new Set())} className="font-bold text-amber-400 hover:underline">
                None
              </button>
            </div>
          </div>
        </div>

        {rareChosen.length > 0 && (
          <p className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-3 text-xs font-semibold text-fuchsia-200">
            ★ This includes {rareChosen.length === 1 ? "a rare card" : `${rareChosen.length} rare cards`} ({rareChosen.map((c) => c.name).join(", ")}). Quick selling
            deletes them for good: untick any you want to keep.
          </p>
        )}
        {listedChosen.length > 0 && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
            {listedChosen.length === 1 ? "1 card is" : `${listedChosen.length} cards are`} listed on the Marketplace. Selling {listedChosen.length === 1 ? "it" : "them"} removes the listing.
          </p>
        )}

        <ul className="space-y-2" aria-label="Cards to sell">
          {rows.map((c) => {
            const on = selling.has(c.id);
            const broken = isCarBroken(c);
            const rare = RARITY_RANK[c.tier] >= RARE;
            return (
              <li key={c.id}>
                <label
                  className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                    on ? "border-rose-500/50 bg-rose-500/10" : "border-zinc-700 bg-zinc-900 opacity-80"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} disabled={busy} className="h-5 w-5 shrink-0 accent-rose-500" />
                  <span className="w-11 shrink-0">
                    <FullArtCard card={c} className="drop-shadow-md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-zinc-100">
                      {rare && <span aria-hidden className="mr-1 text-fuchsia-300">★</span>}
                      {c.name}
                    </span>
                    <span className="block text-xs text-zinc-400">
                      {rarityLabel(c.tier)}
                      {c.cardType === "crew" ? " · Crew" : c.cardType === "maintenance" ? " · Repair kit" : ""}
                      {broken ? " · broken car" : ""}
                      {c.listedPrice ? " · listed" : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-black ${on ? "text-amber-400" : "text-zinc-500 line-through"}`}>+{getQuickSellPrice(c)} P</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
