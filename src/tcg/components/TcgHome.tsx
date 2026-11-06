"use client";

import type { ReactNode } from "react";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel } from "@/lib/card-roll";
import type { ComingSoonCard } from "@/lib/coming-soon";
import { CHALLENGE_THEME_CONFIGS, type TandemClashChallenge } from "@/tcg/challenges-types";
import { getEffectivePrice, getSaleDiscountPct, isOnSale } from "@/tcg/config";
import type { ShowcaseRareCard } from "@/tcg/storage";
import { PackArt } from "@/tcg/components/PackArt";
import type { TcgCustomPackWithCards } from "@/tcg/types";

// Rows swipe sideways and settle on a card; overscroll-x-contain stops a swipe at the end of a row dragging the whole page.
const rowCls = "no-scrollbar -mx-1 flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [&>li]:snap-start";
const sectionTitle = "text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100";
const linkBtn =
  "gx-tap inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-black text-amber-600 hover:bg-amber-500/10 dark:text-amber-400";

function SectionHeader({ title, hint, action, onAction }: { title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className={sectionTitle}>{title}</h3>
        {hint && <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      </div>
      {action && onAction && (
        <button type="button" onClick={onAction} className={linkBtn}>
          {action} →
        </button>
      )}
    </div>
  );
}

/**
 * The game's landing page: play now, what challenges are live, which packs are in the store, and the
 * rare cards that can drop. The play section itself (Tandem Clash) is passed in as `children`.
 */
export function TcgHome({
  children,
  showShowcase,
  challenges,
  completedIds,
  packs,
  standardPackPrice,
  standardPackSalePrice,
  rareCards,
  comingSoon,
  packCredits,
  onOpenChallenges,
  onOpenStore,
}: {
  /** The Tandem Clash play section. */
  children: ReactNode;
  /** Hide the showcase rows while the full challenges list is open in the play section. */
  showShowcase: boolean;
  challenges: TandemClashChallenge[];
  completedIds: string[];
  packs: TcgCustomPackWithCards[];
  standardPackPrice: number;
  standardPackSalePrice: number | null;
  rareCards: ShowcaseRareCard[];
  /** Teaser cards the admin has lined up. An empty list hides the row. */
  comingSoon: ComingSoonCard[];
  packCredits: number;
  onOpenChallenges: () => void;
  onOpenStore: () => void;
}) {
  const done = new Set(completedIds);
  // Cups not yet won today first, then the rest.
  const shownChallenges = [...challenges].sort((a, b) => Number(done.has(a.id)) - Number(done.has(b.id))).slice(0, 8);
  const stdOnSale = isOnSale(standardPackPrice, standardPackSalePrice);
  const stdPrice = getEffectivePrice(standardPackPrice, standardPackSalePrice);

  return (
    <div id="tcg-home" className="scroll-mt-20 space-y-4 sm:space-y-5">
      {children}

      {showShowcase && (
        <>
          {/* ── Live challenges ─────────────────────────────────────────── */}
          {shownChallenges.length > 0 && (
            <section aria-label="Live challenges" className="gx-fade-up space-y-2.5">
              <SectionHeader title="Live challenges" hint="Win a cup for P-Credits. Cups reset daily." action="See all" onAction={onOpenChallenges} />
              <ul className={rowCls}>
                {shownChallenges.map((c) => {
                  const theme = CHALLENGE_THEME_CONFIGS[c.themeStyle] ?? CHALLENGE_THEME_CONFIGS.cyber;
                  const completed = done.has(c.id);
                  return (
                    <li key={c.id} className="w-48 shrink-0">
                      <button
                        type="button"
                        onClick={onOpenChallenges}
                        aria-label={`${c.title}${completed ? ", won today" : ""}: open challenges`}
                        className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border bg-gradient-to-br p-3 text-left gx-tap transition-transform hover:-translate-y-0.5 ${theme.borderClass} ${theme.bgGradientClass} ${theme.glowClass} ${completed ? "opacity-70" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span aria-hidden className="text-xl">{theme.icon}</span>
                          {completed ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-black text-emerald-300">✓ Won today</span>
                          ) : (
                            c.badge && <span className={`truncate rounded-full border px-2 py-0.5 text-[11px] font-black ${theme.badgeClass}`}>{c.badge}</span>
                          )}
                        </span>
                        <span className="line-clamp-2 text-sm font-black leading-tight text-white">{c.title}</span>
                        <span className="mt-auto flex items-center justify-between gap-1 text-[11px] font-bold">
                          <span className={theme.accentTextClass}>+{c.rewardPCredits.toLocaleString()} P</span>
                          <span className="text-zinc-400">{c.entryCostPCredits > 0 ? `${c.entryCostPCredits.toLocaleString()} P entry` : "Free entry"}</span>
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          {c.allowedRarity === "any" ? "Any rarity" : `${c.allowedRarity} cars only`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Packs ───────────────────────────────────────────────────── */}
          <section aria-label="Packs" className="gx-fade-up space-y-2.5" style={{ animationDelay: "60ms" }}>
            <SectionHeader title="Packs" hint={packCredits > 0 ? `You have ${packCredits} pack credit${packCredits === 1 ? "" : "s"} ready` : "Spend P-Credits in the store"} action="Pack store" onAction={onOpenStore} />
            <ul className={`${rowCls} items-start pb-2 pt-1`}>
              <li className="w-36 shrink-0">
                <button
                  type="button"
                  onClick={onOpenStore}
                  aria-label={`Standard Pack, ${stdPrice.toLocaleString()} P-Credits: open the pack store`}
                  className="gx-tap group block w-full rounded-xl text-left transition-transform hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <PackArt
                    name="Standard Pack"
                    variant="standard"
                    cardsLabel="4 CARDS"
                    extraLabel="+ RARE CHANCE"
                    discountPct={stdOnSale ? getSaleDiscountPct(standardPackPrice, standardPackSalePrice) : 0}
                  />
                  <span className="mt-2.5 block text-center text-xs font-black text-amber-600 dark:text-amber-400">{stdPrice.toLocaleString()} P-Credits</span>
                </button>
              </li>
              {packs.map((pack) => {
                const onSale = isOnSale(pack.price, pack.salePrice);
                const price = getEffectivePrice(pack.price, pack.salePrice);
                return (
                  <li key={pack.id} className="w-36 shrink-0">
                    <button
                      type="button"
                      onClick={onOpenStore}
                      aria-label={`${pack.name}, ${price.toLocaleString()} P-Credits: open the pack store`}
                      className="gx-tap group block w-full rounded-xl text-left transition-transform hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <PackArt
                        name={pack.name}
                        variant="custom"
                        cardsLabel={`${pack.cardsPerPack} CARD${pack.cardsPerPack === 1 ? "" : "S"}`}
                        heroCard={pack.setList[0]?.card}
                        discountPct={onSale ? getSaleDiscountPct(pack.price, pack.salePrice) : 0}
                      />
                      <span className="mt-2.5 block text-center text-xs font-black text-amber-600 dark:text-amber-400">{price.toLocaleString()} P-Credits</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ── Rare cards to pull ──────────────────────────────────────── */}
          {rareCards.length > 0 && (
            <section aria-label="Rare cards to pull" className="gx-fade-up space-y-2.5" style={{ animationDelay: "120ms" }}>
              <SectionHeader title="Rare cards to pull" hint="Rare cards that can drop in packs" action="Open a pack" onAction={onOpenStore} />
              <ul className={rowCls}>
                {rareCards.map(({ card }) => (
                  <li key={card.id} className="w-28 shrink-0 space-y-1">
                    <FullArtCard card={card} className="drop-shadow-lg" />
                    <p className="truncate text-xs font-black text-zinc-900 dark:text-zinc-100">{card.name}</p>
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{rarityLabel(card.tier)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* ── Coming soon ─────────────────────────────────────────────── */}
          {comingSoon.length > 0 && (
            <section aria-label="Coming soon" className="gx-fade-up space-y-2.5" style={{ animationDelay: "180ms" }}>
              <SectionHeader title="Coming soon" hint="Cards on their way to the game" />
              <ul className={rowCls}>
                {comingSoon.map((item) => (
                  <li key={item.id} className="w-28 shrink-0 space-y-1">
                    <FullArtCard card={item.card} className="drop-shadow-lg" />
                    {item.when && <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{item.when}</p>}
                    {item.note && <p className="line-clamp-2 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">{item.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
