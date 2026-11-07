import type { MemberCard } from "@/lib/card-roll";
import { isCrewCard } from "@/lib/crew-cards";
import { isCarBroken } from "@/lib/mechanical-faults";
import { getCardPower, STARTER_LOANER_CREW_CARDS } from "../progression";

/**
 * Which of a member's own cards the campaign can use, and how long a car will last. Pure, so the picker in the browser
 * and the checks on the server agree. The cup is played with the cars the member owns, as they are: their stats are not
 * changed.
 */

/** A plain car card (not Crew, a Maintenance kit, or a re-rolled away card). It may be worn or broken. */
export function isCampaignCar(card: MemberCard): boolean {
  if (card.archived) return false;
  if (card.cardType && card.cardType !== "car") return false;
  return !card.crewCardId && !isCrewCard(card);
}

export function isCampaignCrew(card: MemberCard): boolean {
  return !card.archived && card.cardType !== "maintenance" && isCrewCard(card);
}

export function isMaintenanceKit(card: MemberCard): boolean {
  return !card.archived && card.cardType === "maintenance";
}

/** The member's three best Crew cards, filled up with the starter loaners if they own fewer than three. */
export function bestCrewFor(cards: MemberCard[]): MemberCard[] {
  const owned = cards
    .filter(isCampaignCrew)
    .sort((a, b) => getCardPower(b) - getCardPower(a))
    .slice(0, 3);
  return [...owned, ...STARTER_LOANER_CREW_CARDS.slice(0, 3 - owned.length)];
}

export type OutlookKind = "ready" | "short" | "broken" | "unknown";

export interface Outlook {
  kind: OutlookKind;
  /** Battles the car can still race before it breaks down, or null when the card has no durability recorded. */
  left: number | null;
  /** How many battles the cup could still need from it. */
  ahead: number;
}

/**
 * Whether a car will last the battles still ahead. Every car races every battle, so `ahead` is the number of rounds
 * left (6 before the cup starts). A car with N battles of durability races N more battles and then breaks down.
 */
export function outlookOf(car: MemberCard, ahead: number): Outlook {
  if (isCarBroken(car)) return { kind: "broken", left: 0, ahead };
  const left = typeof car.battlesRemaining === "number" ? car.battlesRemaining : typeof car.maxBattles === "number" ? car.maxBattles : null;
  if (left === null) return { kind: "unknown", left, ahead };
  return { kind: left >= ahead ? "ready" : "short", left, ahead };
}

/** Battles a Maintenance kit adds to a car's durability when it services a car that is not broken. A kit of 5 or more is a full service. */
export function serviceGainOf(kit: MemberCard, ahead: number): number {
  const power = kit.repairBattles ?? 1;
  return power >= 5 ? ahead : Math.max(1, power);
}

/** The durability a car has after a kit services it: its battles left plus the kit's, never more than the battles ahead. */
export function durabilityAfterService(left: number, kit: MemberCard, ahead: number): number {
  return Math.min(ahead, left + serviceGainOf(kit, ahead));
}
