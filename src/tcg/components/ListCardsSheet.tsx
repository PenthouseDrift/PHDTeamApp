"use client";

import { useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import { MAX_MARKET_LISTING_PRICE, MIN_MARKET_LISTING_PRICE, getQuickSellPrice } from "@/tcg/config";
import { listCardOnMarket } from "@/tcg/actions";
import type { TcgMarketListing } from "@/tcg/types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { Spinner } from "@/tcg/ui/Shimmer";
import { buzz } from "@/tcg/ui/feedback";

type Status = { state: "idle" } | { state: "listing" } | { state: "done"; price: number } | { state: "error"; message: string };

const input =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 pr-9 text-base font-bold text-zinc-100 focus:border-amber-500 focus:outline-none disabled:opacity-60";

/**
 * List several cards on the Marketplace at once, each with its own price (they start at twice the quick sell value, like
 * listing one card does). The cards are listed one after another; any that fail say why and can be tried again.
 */
export function ListCardsSheet({
  cards,
  onListed,
  onClose,
}: {
  cards: MemberCard[];
  /** Called for each card as it is listed. */
  onListed: (card: MemberCard, listing: TcgMarketListing) => void;
  onClose: () => void;
}) {
  // A card that is already for sale is left out; its price is changed from the Marketplace.
  // Worked out once, when the sheet opens: listing a card updates the deck behind it, and a card that has just been
  // listed must stay in this list (shown as done) instead of dropping out.
  const [{ todo, alreadyListed }] = useState(() => {
    const open = cards.filter((c) => !c.listedPrice);
    return { todo: open, alreadyListed: cards.length - open.length };
  });
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(todo.map((c) => [c.id, String(getQuickSellPrice(c) * 2)])));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [sameText, setSameText] = useState("");

  const priceOf = (id: string) => Math.round(Number(prices[id]));
  const valid = (id: string) => {
    const p = priceOf(id);
    return Number.isFinite(p) && p >= MIN_MARKET_LISTING_PRICE && p <= MAX_MARKET_LISTING_PRICE;
  };
  const pending = todo.filter((c) => status[c.id]?.state !== "done");
  const doneCount = todo.length - pending.length;
  const allValid = pending.every((c) => valid(c.id));
  const finished = todo.length > 0 && pending.length === 0;

  function applySame() {
    const p = Math.round(Number(sameText));
    if (!Number.isFinite(p)) return;
    setPrices((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, status[id]?.state === "done" ? prev[id] : String(p)])));
  }

  async function run() {
    if (running || !allValid || pending.length === 0) return;
    setRunning(true);
    for (const card of pending) {
      setStatus((prev) => ({ ...prev, [card.id]: { state: "listing" } }));
      try {
        const price = priceOf(card.id);
        const res = await listCardOnMarket(card.id, price);
        if (res.success) {
          setStatus((prev) => ({ ...prev, [card.id]: { state: "done", price } }));
          onListed(res.data.card, res.data.listing);
        } else {
          setStatus((prev) => ({ ...prev, [card.id]: { state: "error", message: res.error } }));
        }
      } catch {
        setStatus((prev) => ({ ...prev, [card.id]: { state: "error", message: "Something went wrong. Try again." } }));
      }
    }
    buzz(20);
    setRunning(false);
  }

  const failed = pending.filter((c) => status[c.id]?.state === "error").length;

  return (
    <BottomSheet
      size="lg"
      fullHeight
      title="List cards for sale"
      subtitle={`${todo.length} card${todo.length === 1 ? "" : "s"} · set a price for each`}
      dismissible={!running}
      onClose={onClose}
      footer={
        <div className="space-y-2 pb-2">
          {(doneCount > 0 || failed > 0) && (
            <p role="status" className="text-xs font-bold text-zinc-300">
              {doneCount} listed{failed > 0 ? ` · ${failed} didn't go through (see below)` : ""}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={running} className={sheetSecondary}>
              {finished ? "Done" : "Close"}
            </button>
            {!finished && (
              <button type="button" onClick={() => void run()} disabled={running || !allValid || pending.length === 0} className={sheetPrimary}>
                {running ? (
                  <>
                    <Spinner className="h-4 w-4" /> Listing…
                  </>
                ) : failed > 0 ? (
                  `Try ${pending.length} again`
                ) : (
                  `List ${pending.length} card${pending.length === 1 ? "" : "s"}`
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {alreadyListed > 0 && (
          <p className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300">
            {alreadyListed} of your selected cards {alreadyListed === 1 ? "is" : "are"} already for sale, so {alreadyListed === 1 ? "it is" : "they are"} not listed again here.
          </p>
        )}

        {todo.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Every card you picked is already listed.</p>
        ) : (
          <>
            <div className="flex items-end gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
              <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-300">
                Same price for all
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_MARKET_LISTING_PRICE}
                  max={MAX_MARKET_LISTING_PRICE}
                  value={sameText}
                  onChange={(e) => setSameText(e.target.value)}
                  placeholder="e.g. 50"
                  disabled={running}
                  className="mt-1 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base font-bold text-zinc-100 focus:border-amber-500 focus:outline-none"
                />
              </label>
              <button type="button" onClick={applySame} disabled={running || !sameText} className={sheetSecondary}>
                Apply
              </button>
            </div>

            <ul className="space-y-2" aria-label="Cards to list">
              {todo.map((c) => {
                const s = status[c.id] ?? { state: "idle" as const };
                const bad = !valid(c.id) && s.state !== "done";
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-2.5">
                    <span className="w-11 shrink-0">
                      <FullArtCard card={c} className="drop-shadow-md" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-zinc-100">{c.name}</span>
                      <span className="block text-xs text-zinc-400">
                        {rarityLabel(c.tier)} · quick sell {getQuickSellPrice(c)} P
                      </span>
                      {s.state === "error" && (
                        <span role="alert" className="mt-0.5 block text-xs font-bold text-rose-300">
                          {s.message}
                        </span>
                      )}
                    </span>
                    <span className="w-28 shrink-0">
                      {s.state === "done" ? (
                        <span className="block text-right text-sm font-black text-emerald-400">✓ {s.price.toLocaleString()} P</span>
                      ) : s.state === "listing" ? (
                        <span className="flex justify-end">
                          <Spinner className="h-5 w-5" />
                        </span>
                      ) : (
                        <span className="relative block">
                          <input
                            type="number"
                            inputMode="numeric"
                            aria-label={`Price for ${c.name}`}
                            aria-invalid={bad}
                            min={MIN_MARKET_LISTING_PRICE}
                            max={MAX_MARKET_LISTING_PRICE}
                            value={prices[c.id] ?? ""}
                            disabled={running}
                            onChange={(e) => setPrices((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onFocus={(e) => e.currentTarget.select()}
                            className={`${input} ${bad ? "border-rose-500" : ""}`}
                          />
                          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">
                            P
                          </span>
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!allValid && (
              <p className="text-xs font-semibold text-rose-300">
                Prices must be between {MIN_MARKET_LISTING_PRICE} and {MAX_MARKET_LISTING_PRICE.toLocaleString()} P-Credits.
              </p>
            )}
            <p className="text-xs text-zinc-400">Another member can buy a card at your price, or make you an offer of cards or P-Credits instead.</p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
