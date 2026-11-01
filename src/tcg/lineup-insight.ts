/**
 * What the track means for the cars and Crew cards a member brings, and the Auto-Pick that uses it.
 *
 * Only what the member is allowed to know is used. The track, with its buff and hazard, is shown before the
 * lineup is chosen. The three corner types and the three debuffs are NOT: they are rolled when the match starts
 * but only revealed one corner at a time during the battle, so nothing here reads them. Instead the picks are
 * judged across every corner type the game can roll, with the debuffs it can roll averaged in.
 */
import type { MemberCard } from "@/lib/card-roll";
import { DEBUFF_CARD_SET, type CrewCardDefinition, type DebuffCardDefinition, type TrackCardDefinition } from "@/lib/crew-cards";
import {
  CLASH_SECTOR_POOL,
  computeTrackBreakdown,
  evaluateCornerMatchup,
  getCardPower,
  type ClashSectorSpec,
} from "./progression";
import { NEUTRAL_DEBUFF } from "./rival-ai";

/** What the member knows when they choose a lineup. */
export interface LineupContext {
  track: TrackCardDefinition;
  /** The Crew definitions in play (admin-edited ones included). */
  crewDefs?: CrewCardDefinition[];
}

export interface TrackNote {
  text: string;
  tone: "buff" | "hazard";
}

export interface CarInsight {
  /** The track's effect on this car: stat buffs, bonus points and any hazard it triggers. */
  notes: TrackNote[];
  /** Bonus points minus hazard points from the track alone. */
  trackNetPoints: number;
}

/** The track's buffs and hazards on one car. */
export function carInsight(car: MemberCard, ctx: LineupContext): CarInsight {
  const track = computeTrackBreakdown({ card: car, trackCard: ctx.track });
  const notes: TrackNote[] = [];
  for (const part of track.statBuffParts) notes.push({ text: part, tone: "buff" });
  if (track.buffConditionMet && track.buffConditionLabel) notes.push({ text: track.buffConditionLabel, tone: "buff" });
  if (track.hazardTriggered) notes.push({ text: track.hazardLabel ?? `Track hazard -${track.effectiveHazardPenalty} PTS`, tone: "hazard" });
  return { notes, trackNetPoints: track.totalNetPoints };
}

/** Every corner type the game can roll. Which three come up, and in what order, is hidden until the battle. */
const POSSIBLE_CORNERS: ClashSectorSpec[] = CLASH_SECTOR_POOL.map((sector) => ({ ...sector, number: 1 }));

/** One in three corner types, spread across the whole pool, for the Crew pick (which scores every card against each). */
const SAMPLE_CORNERS: ClashSectorSpec[] = POSSIBLE_CORNERS.filter((_, i) => i % 3 === 0);

/** Debuffs the game can roll, thinned to a handful so a pick stays quick. Only Crew cards need them (shields). */
const SAMPLE_DEBUFFS: DebuffCardDefinition[] = DEBUFF_CARD_SET.filter((_, i) => i % 2 === 0).slice(0, 10);

function score(
  ctx: LineupContext,
  car: MemberCard,
  sector: ClashSectorSpec,
  crew: MemberCard | null,
  debuff: DebuffCardDefinition
): number {
  return evaluateCornerMatchup({
    cornerIdx: 0,
    sector,
    playerCard: car,
    rivalCard: car,
    playerCrewCard: crew,
    rivalCrewCard: null,
    playerDebuffCard: debuff,
    rivalDebuffCard: NEUTRAL_DEBUFF,
    trackCard: ctx.track,
    crewPool: ctx.crewDefs,
  }).playerScore;
}

/** How well a car does on this track on average, over every corner type it might meet. */
function carTrackFit(ctx: LineupContext, car: MemberCard): number {
  let sum = 0;
  for (const sector of POSSIBLE_CORNERS) sum += score(ctx, car, sector, null, NEUTRAL_DEBUFF);
  return sum / POSSIBLE_CORNERS.length;
}

/** Indexes of the `n` highest values, best first; ties go to the stronger card. */
function topByValue(values: number[], power: number[], n: number): number[] {
  return values
    .map((v, i) => ({ i, v }))
    .sort((a, b) => b.v - a.v || power[b.i] - power[a.i])
    .slice(0, n)
    .map((x) => x.i);
}

/**
 * The three cars that do best on this track: those the track buffs, that avoid its hazard, and that score well
 * whichever corner types turn up. Returns null when there are fewer than three cars to choose from.
 */
export function pickBestCarIds(cars: MemberCard[], ctx: LineupContext): [string, string, string] | null {
  if (cars.length < 3) return null;
  const fit = cars.map((car) => carTrackFit(ctx, car));
  const [a, b, c] = topByValue(fit, cars.map(getCardPower), 3);
  return [cars[a].id, cars[b].id, cars[c].id];
}

/**
 * The three Crew cards that help the chosen cars the most on this track: for each card, the points it adds on
 * average across the chosen cars, every possible corner type and the debuffs that could be rolled (so a shield
 * counts for what it is likely to save). Returns null when there are fewer than three cards.
 */
export function pickBestCrewIds(crew: MemberCard[], cars: MemberCard[], ctx: LineupContext): [string, string, string] | null {
  if (crew.length < 3 || cars.length === 0) return null;
  const gain = crew.map((card) => {
    let sum = 0;
    let count = 0;
    for (const car of cars) {
      for (const sector of SAMPLE_CORNERS) {
        for (const debuff of SAMPLE_DEBUFFS) {
          sum += score(ctx, car, sector, card, debuff) - score(ctx, car, sector, null, debuff);
          count++;
        }
      }
    }
    return count > 0 ? sum / count : 0;
  });
  const [a, b, c] = topByValue(gain, crew.map(getCardPower), 3);
  return [crew[a].id, crew[b].id, crew[c].id];
}
