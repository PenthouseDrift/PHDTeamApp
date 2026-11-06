import type { MemberCard } from "@/lib/card-roll";
import { MIN_BRONZE_CARS, OFFER_SIZE, OFFER_TIER_WEIGHTS } from "./config";
import { isCampaignCar } from "./garage";
import type { RolledTier } from "./types";

/**
 * How the six cars for a cup are dealt, and the deck rule for entering one. Pure (the random numbers are passed in), so the
 * picker in the browser, the server and the simulation scripts all agree.
 *
 * Each of the six slots rolls a rarity (bronze, silver, gold or legend) and then takes a car of that rarity the member owns,
 * never the same car twice in one deal. If the member has no car of that rarity left, the next best one is used. A re-roll
 * clears the lot and deals again from the whole deck.
 */

/** Rarities from worst to best. Mythic cards sit in the legend slot. */
const RANKS = 4;

type RandomInt = (maxExclusive: number) => number;

function rankOf(card: MemberCard): number {
  if (card.tier === "mythic") return 3;
  const order = ["bronze", "silver", "gold", "legend"];
  return Math.max(0, order.indexOf(card.tier));
}

/** Roll a rarity (0 = bronze to 3 = legend) using the configured weights. */
function rollRank(randomInt: RandomInt): number {
  const total = OFFER_TIER_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let roll = randomInt(total);
  for (let rank = 0; rank < RANKS; rank++) {
    roll -= OFFER_TIER_WEIGHTS[rank];
    if (roll < 0) return rank;
  }
  return RANKS - 1;
}

/**
 * The order rarities are tried in when the rolled one has no cars left: the rolled rarity, then each one below it down to
 * bronze (the best car the member has that is not better than the roll), then upwards if nothing lower is left.
 */
function fallbackOrder(rank: number): number[] {
  const order: number[] = [];
  for (let r = rank; r >= 0; r--) order.push(r);
  for (let r = rank + 1; r < RANKS; r++) order.push(r);
  return order;
}

/** One dealt slot: the rarity it rolled, and the car it got (which differs from the roll when none of that rarity was left). */
export interface DealtSlot {
  car: MemberCard;
  rolled: RolledTier;
}

export const ROLLED_TIER_NAMES: RolledTier[] = ["bronze", "silver", "gold", "legend"];

/** The slot a card belongs in: its own rarity, with Mythic counted as legend. */
export function tierSlotOf(card: MemberCard): RolledTier {
  return ROLLED_TIER_NAMES[rankOf(card)];
}

/**
 * Deal up to `OFFER_SIZE` cars: every slot rolls a rarity, then takes a car of it from the whole deck. A car is never dealt
 * twice in the same deal, but every deal starts from the full deck, so a re-roll can hand back a car dealt before.
 */
export function dealOffer(cars: MemberCard[], randomInt: RandomInt): DealtSlot[] {
  const buckets: MemberCard[][] = Array.from({ length: RANKS }, () => []);
  for (const car of cars) buckets[rankOf(car)].push(car);

  const dealt: DealtSlot[] = [];
  const slots = Math.min(OFFER_SIZE, cars.length);
  for (let slot = 0; slot < slots; slot++) {
    const rolled = rollRank(randomInt);
    const rank = fallbackOrder(rolled).find((r) => buckets[r].length > 0);
    if (rank === undefined) break;
    const bucket = buckets[rank];
    dealt.push({ car: bucket.splice(randomInt(bucket.length), 1)[0], rolled: ROLLED_TIER_NAMES[rolled] });
  }
  return dealt;
}

/** How many bronze car cards a member's deck has that the cup can use. */
export function countBronzeCars(cards: MemberCard[]): number {
  return cards.filter((c) => isCampaignCar(c) && c.tier === "bronze").length;
}

/** Why a deck cannot enter the cup, or null when it can. */
export function deckProblem(cards: MemberCard[]): string | null {
  const bronze = countBronzeCars(cards);
  if (bronze >= MIN_BRONZE_CARS) return null;
  return `You need at least ${MIN_BRONZE_CARS} bronze car cards in your deck to enter the cup. You have ${bronze}.`;
}
