"use client";

import { useState } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel } from "@/lib/card-roll";
import { describeOffer, type MyTradeOffers, type OfferStatus, type TradeOffer } from "@/tcg/trade-types";
import { BottomSheet, sheetPrimary, sheetSecondary } from "@/tcg/ui/BottomSheet";
import { Spinner } from "@/tcg/ui/Shimmer";

export type OffersTab = "received" | "sent";

const STATUS_LABEL: Record<OfferStatus, string> = {
  pending: "Waiting",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};
const STATUS_STYLE: Record<OfferStatus, string> = {
  pending: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  accepted: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  declined: "border-rose-500/50 bg-rose-500/15 text-rose-300",
  withdrawn: "border-zinc-600 bg-zinc-800 text-zinc-300",
  cancelled: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

function timeAgo(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Trade offers: the ones made on my listings (accept or decline) and the ones I have made (withdraw).
 * Accepting asks twice, because a trade can't be undone.
 */
export function TradeOffersPanel({
  offers,
  tab,
  onTab,
  busyId,
  error,
  onAccept,
  onDecline,
  onWithdraw,
  onClose,
}: {
  offers: MyTradeOffers | null;
  tab: OffersTab;
  onTab: (tab: OffersTab) => void;
  /** The offer with an action in flight. */
  busyId: string | null;
  error: string | null;
  onAccept: (offer: TradeOffer) => void;
  onDecline: (offer: TradeOffer) => void;
  onWithdraw: (offer: TradeOffer) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = offers ? offers[tab] : [];
  // Waiting offers first, then the newest.
  const sorted = [...list].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt - a.createdAt);
  const waiting = (key: OffersTab) => (offers ? offers[key].filter((o) => o.status === "pending").length : 0);

  const tabBtn = (id: OffersTab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => {
        setConfirmId(null);
        onTab(id);
      }}
      className={`gx-tap flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black ${
        tab === id ? "border-amber-500 bg-amber-500 text-black" : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {label}
      {waiting(id) > 0 && (
        <span className={`rounded-full px-1.5 text-[11px] font-black ${tab === id ? "bg-black/20 text-black" : "bg-amber-500 text-black"}`}>{waiting(id)}</span>
      )}
    </button>
  );

  return (
    <BottomSheet
      size="lg"
      fullHeight
      title="Trade offers"
      subtitle={tab === "received" ? "Offers on the cards you have listed" : "Offers you have made"}
      dismissible={!busyId}
      onClose={onClose}
      footer={
        <div className="space-y-2 pb-2">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-sm font-bold text-rose-100">
              {error}
            </div>
          )}
          <button type="button" onClick={onClose} disabled={Boolean(busyId)} className={`${sheetSecondary} w-full`}>
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div role="tablist" aria-label="Offers" className="flex gap-2">
          {tabBtn("received", "Received")}
          {tabBtn("sent", "Sent")}
        </div>

        {!offers ? (
          <p className="py-8 text-center text-sm text-zinc-400" role="status">
            Loading offers…
          </p>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-base font-black text-zinc-100">{tab === "received" ? "No offers on your cards yet" : "You haven't made any offers"}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-400">
              {tab === "received"
                ? "When someone offers cards or P-Credits for one of your listings, it shows up here and you get a notification."
                : "Open any listing and tap Make offer to trade your cards or P-Credits for it."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((o) => {
              const mine = tab === "sent";
              const pending = o.status === "pending";
              const busy = busyId === o.id;
              const confirming = confirmId === o.id;
              return (
                <li key={o.id} className="space-y-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-black text-zinc-100">
                      {mine ? `Your offer to ${o.sellerName}` : `${o.buyerName} offers`}
                      <span className="ml-2 text-xs font-semibold text-zinc-500">{timeAgo(o.createdAt)}</span>
                    </p>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </div>

                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
                    <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{mine ? "You want" : "For your"}</p>
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 shrink-0">
                        <FullArtCard card={o.listedCard} className="drop-shadow-md" />
                      </div>
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-black text-zinc-100">{o.listedCard.name}</p>
                        <p className="text-zinc-400">
                          {rarityLabel(o.listedCard.tier)} · asking {o.listedPrice.toLocaleString()} P
                        </p>
                      </div>
                    </div>

                    <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{mine ? "You give" : "They give"}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {o.cards.map((c) => (
                        <div key={c.id} className="w-12 shrink-0" title={`${c.name} (${rarityLabel(c.tier)})`}>
                          <FullArtCard card={c} className="drop-shadow-md" />
                        </div>
                      ))}
                      {o.pCredits > 0 && (
                        <span className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-sm font-black text-amber-300">
                          {o.cards.length > 0 ? "+ " : ""}
                          {o.pCredits.toLocaleString()} P
                        </span>
                      )}
                    </div>
                  </div>

                  {o.cards.length > 0 && (
                    <p className="text-xs text-zinc-400">{o.cards.map((c) => `${c.name} (${rarityLabel(c.tier)})`).join(", ")}</p>
                  )}
                  {o.message && <p className="rounded-lg bg-zinc-800 px-3 py-2 text-xs italic text-zinc-200">&ldquo;{o.message}&rdquo;</p>}
                  {o.note && !pending && <p className="text-xs text-zinc-400">{o.note}</p>}

                  {pending && !mine && (
                    confirming ? (
                      <div className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                        <p className="text-xs text-zinc-200">
                          You give <strong>{o.listedCard.name}</strong> and get <strong>{describeOffer(o)}</strong> from {o.buyerName}. This can&apos;t be undone.
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setConfirmId(null)} disabled={busy} className={sheetSecondary}>
                            Back
                          </button>
                          <button type="button" onClick={() => onAccept(o)} disabled={busy} className={sheetPrimary}>
                            {busy ? (
                              <>
                                <Spinner className="h-4 w-4" /> Trading…
                              </>
                            ) : (
                              "Yes, accept"
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onDecline(o)} disabled={busy || Boolean(busyId)} className={sheetSecondary}>
                          {busy ? "Declining…" : "Decline"}
                        </button>
                        <button type="button" onClick={() => setConfirmId(o.id)} disabled={Boolean(busyId)} className={sheetPrimary}>
                          Accept…
                        </button>
                      </div>
                    )
                  )}
                  {pending && mine && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-400">Nothing is taken until they accept.</p>
                      <button type="button" onClick={() => onWithdraw(o)} disabled={Boolean(busyId)} className={sheetSecondary}>
                        {busy ? "Withdrawing…" : "Withdraw"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
