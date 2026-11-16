"use client";

import { useMemo, useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { RARITY_RANK, rarityLabel, type MemberCard } from "@/lib/card-roll";
import { makeTradeOffer } from "@/tcg/trade-actions";
import { MAX_OFFER_CARDS, MAX_OFFER_MESSAGE, describeOffer, type TradeOffer } from "@/tcg/trade-types";
import type { TcgMarketListing } from "@/tcg/types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { ProgressiveList } from "@/tcg/ui/ProgressiveList";
import { Spinner } from "@/tcg/ui/Shimmer";
import { buzz } from "@/tcg/ui/feedback";

/**
 * "Make an offer" on a card listed on the Marketplace: pick some of your own cards and/or an amount of P-Credits to offer
 * instead of paying the asking price. Nothing is taken until the seller accepts; it is all checked again at that moment.
 */
export function TradeOfferSheet({
  listing,
  myCards,
  pCredits,
  existing,
  onClose,
  onSent,
}: {
  listing: TcgMarketListing;
  /** The member's collection. Cards listed on the Marketplace can't be offered, so they are left out here. */
  myCards: MemberCard[];
  pCredits: number;
  /** An offer already waiting on this listing; making a new one replaces it. */
  existing?: TradeOffer | null;
  onClose: () => void;
  onSent: (offer: TradeOffer) => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => (existing ? existing.cards.map((c) => c.id) : []));
  const [pText, setPText] = useState(existing && existing.pCredits > 0 ? String(existing.pCredits) : "");
  const [message, setMessage] = useState(existing?.message ?? "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerable = useMemo(
    () => myCards.filter((c) => !c.listedPrice).sort((a, b) => RARITY_RANK[b.tier] - RARITY_RANK[a.tier] || a.name.localeCompare(b.name)),
    [myCards]
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? offerable.filter((c) => `${c.name} ${c.driver} ${c.team}`.toLowerCase().includes(q)) : offerable;
  }, [offerable, search]);
  // Cards picked earlier that have since left the collection are dropped rather than sent.
  const pickedCards = picked.map((id) => offerable.find((c) => c.id === id)).filter((c): c is MemberCard => Boolean(c));
  const pAmount = Math.max(0, Math.floor(Number(pText) || 0));
  const nothing = pickedCards.length === 0 && pAmount === 0;
  const summary = describeOffer({ cards: pickedCards, pCredits: pAmount });

  function toggle(id: string) {
    setError(null);
    setPicked((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      if (list.length >= MAX_OFFER_CARDS) {
        setError(`You can offer up to ${MAX_OFFER_CARDS} cards.`);
        return list;
      }
      return [...list, id];
    });
  }

  async function send() {
    if (busy || nothing) return;
    if (pAmount > pCredits) {
      setError(`You only have ${pCredits.toLocaleString()} P-Credits.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await makeTradeOffer({ listingId: listing.id, cardIds: pickedCards.map((c) => c.id), pCredits: pAmount, message });
      if (res.success) {
        buzz(15);
        onSent(res.data);
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
      fullHeight
      title={existing ? "Change your offer" : "Make an offer"}
      subtitle={`For ${listing.card.name} · asking ${listing.price.toLocaleString()} P`}
      dismissible={!busy}
      onClose={onClose}
      footer={
        <div className="space-y-2 pb-2">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm font-bold text-rose-100">
              {error}
            </div>
          )}
          <p className="text-xs text-zinc-400">
            Your offer: <strong className="text-zinc-100">{summary}</strong>. Nothing is taken from you unless {listing.sellerName} accepts.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={sheetSecondary}>
              Cancel
            </button>
            <button type="button" onClick={() => void send()} disabled={busy || nothing} className={sheetPrimary}>
              {busy ? (
                <>
                  <Spinner className="h-4 w-4" /> Sending…
                </>
              ) : nothing ? (
                "Add cards or P-Credits"
              ) : existing ? (
                "Replace offer"
              ) : (
                "Send offer"
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
          <div className="w-14 shrink-0">
            <FullArtCard card={listing.card} className="drop-shadow-md" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-black text-zinc-100">{listing.card.name}</p>
            <p className="text-xs text-zinc-400">
              {rarityLabel(listing.card.tier)} · from {listing.sellerName}
            </p>
            <p className="text-xs text-zinc-400">
              Asking <strong className="text-amber-400">{listing.price.toLocaleString()} P</strong>
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="offer-pcredits" className="block text-sm font-semibold text-zinc-200">
            P-Credits to add <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <div className="relative">
            <input
              id="offer-pcredits"
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={pText}
              onChange={(e) => {
                setError(null);
                setPText(e.target.value);
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0"
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 pr-24 text-base font-bold text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-400">P-Credits</span>
          </div>
          <p className="text-xs text-zinc-400">You have {pCredits.toLocaleString()} P-Credits.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Cards to offer</h3>
              <p className="text-xs text-zinc-400">
                {pickedCards.length} of {MAX_OFFER_CARDS} picked
              </p>
            </div>
            {pickedCards.length > 0 && (
              <button type="button" onClick={() => setPicked([])} className="text-xs font-bold text-amber-400 hover:underline">
                Clear
              </button>
            )}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your cards"
            aria-label="Search your cards"
            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          />
          {offerable.length === 0 ? (
            <p className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center text-sm text-zinc-400">
              You have no cards free to offer (cards listed for sale can&apos;t be offered). You can still offer P-Credits.
            </p>
          ) : shown.length === 0 ? (
            <p className="p-4 text-center text-sm text-zinc-400">No cards match that search.</p>
          ) : (
            <ProgressiveList
              items={shown}
              getKey={(c) => c.id}
              resetKey={search}
              batch={12}
              label="Your cards"
              className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
              render={(c) => {
                const on = picked.includes(c.id);
                return (
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    aria-label={`${c.name}, ${rarityLabel(c.tier)}${on ? ", picked" : ""}`}
                    className={`relative block w-full rounded-xl p-1 transition-colors ${
                      on ? "bg-amber-500/20 ring-2 ring-amber-400" : "hover:bg-zinc-800"
                    }`}
                  >
                    <FullArtCard card={c} className="drop-shadow-md" />
                    {on && (
                      <span aria-hidden className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-black shadow">
                        ✓
                      </span>
                    )}
                    <span className="mt-1 block truncate px-0.5 text-[11px] font-bold text-zinc-300">{c.name}</span>
                  </button>
                );
              }}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="offer-message" className="block text-sm font-semibold text-zinc-200">
            Message <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="offer-message"
            value={message}
            maxLength={MAX_OFFER_MESSAGE}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Two for one, and I'll add some P-Credits"
            className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
