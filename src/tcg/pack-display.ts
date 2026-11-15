import type { TcgCustomPackWithCards } from "@/tcg/types";

/**
 * Every card a pack gives each time it is opened: its own cards plus its Crew and Repair Kit cards.
 * (A bonus pull is only a chance, so it isn't counted.) Shared so the Home page and the Pack Store always agree.
 */
export function totalCardsInPack(pack: Pick<TcgCustomPackWithCards, "cardsPerPack" | "extraCards">): number {
  return pack.cardsPerPack + (pack.extraCards?.crew ?? 0) + (pack.extraCards?.repair ?? 0);
}

/** The card count on a pack's artwork: "5 CARDS". */
export function packCardsLabel(pack: Pick<TcgCustomPackWithCards, "cardsPerPack" | "extraCards">): string {
  const total = totalCardsInPack(pack);
  return `${total} CARD${total === 1 ? "" : "S"}`;
}

/** The smaller line under the count when the pack can also drop a bonus card. Undefined when it can't. */
export function packExtraLabel(pack: Pick<TcgCustomPackWithCards, "bonus">): string | undefined {
  return pack.bonus ? "+ BONUS CHANCE" : undefined;
}
