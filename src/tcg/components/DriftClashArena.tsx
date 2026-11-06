"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FullArtCard } from "@/components/cards/FullArtCard";
import { rarityLabel, type MemberCard } from "@/lib/card-roll";
import type { FullArtTier } from "@/lib/full-art-card";
import {
  CLASH_RARITY_ODDS,
  CLASH_RARITY_TIERS,
  CREW_CARD_SET,
  DEBUFF_CARD_SET,
  UK_TRACK_CARD_SET,
  crewDefinitionToCardData,
  debuffDefinitionToCardData,
  isCrewCard,
  scaleCrewCardDefinition,
  scaleDebuffCardDefinition,
  trackDefinitionToCardData,
  type CrewCardDefinition,
  type CrewCardModifiers,
  type DebuffCardDefinition,
  type TrackCardDefinition,
} from "@/lib/crew-cards";
import {
  isCarBroken,
  canRepairCarWithMaintenanceCard,
  MECHANICAL_FAULTS,
} from "@/lib/mechanical-faults";
import {
  getClashGameCardsConfigAction,
  listClashEarlyAccessRosterAction,
  grantClashEarlyAccessAction,
  revokeClashEarlyAccessAction,
  applyMaintenanceRepairAction,
  type EarlyAccessMemberItem,
} from "@/tcg/actions";
import {
  completeClashBattleAction,
  findNewClashOpponentAction,
  getHazardGarageSamplesAction,
} from "@/tcg/clash";
import type { HazardGarageSample } from "@/lib/track-hazards";
import {
  CLASH_SECTORS,
  applyCrewModsToStats,
  DAILY_CLASH_WIN_REWARD_PCREDITS,
  STARTER_LOANER_CREW_CARDS,
  STREAK_MILESTONE_REWARD_PCREDITS,
  computeDebuffBreakdown,
  computeTrackBreakdown,
  evaluateCornerMatchup,
  getCardPower,
  getNormalizedCardStats,
  normalizeStatValue,
  rollThreeClashSectors,
  rollThreeDebuffCards,
  rollUkTrackCard,
  scoreCardForSector,
  type ClashSectorSpec,
  type CornerScoreParts,
  type CornerStatStages,
  type DebuffBreakdown,
  type EvaluatedCornerResult,
  type TrackBreakdown,
} from "@/tcg/progression";
import type { ClashGameCardsConfig } from "@/tcg/storage";
import type { ClashOpponent, ClashPlayerStats } from "@/tcg/types";
import { ClashHowToPlayModal, type HowToPlayTab } from "./ClashHowToPlayModal";
import { ClashChallengesView } from "./ClashChallengesView";
import type { ArenaCampaignHook } from "@/tcg/campaign/types";
import {
  CASUAL_AI_SKILL,
  NEUTRAL_DEBUFF,
  NO_CREW_CARD,
  NO_CREW_DEF,
  arrangeRival,
  chooseRivalCrew,
  chooseRivalDebuff,
  crewCardsFromSpecs,
  type RivalContext,
  type Trio,
} from "../rival-ai";
import { carInsight, pickBestCarIds, pickBestCrewIds, type LineupContext } from "../lineup-insight";
import {
  applyFinaleToResult,
  chooseRivalFinale,
  DEFAULT_ALLOCATION_WEIGHTS,
  defaultPlayerChoice,
  resolveFinale,
  rollAllocationWeights,
  rollFinaleMode,
  type FinaleChoice,
  type FinaleMode,
  type FinaleOutcome,
  type FinaleWeights,
} from "../finale";
import { ClashFinalePanel } from "./ClashFinalePanel";
import { ClashFinaleResult } from "./ClashFinaleResult";
import { ClashRevealPanel } from "./ClashRevealPanel";
import { ClashFinaleRoulette } from "./ClashFinaleRoulette";
import { CarTrackEffects } from "./CarTrackEffects";
import { useUtcMidnightCountdown } from "../hooks/useUtcCountdown";
import {
  CHALLENGE_THEME_CONFIGS,
  isCarEligibleForChallenge,
  getCarNormalizedTotalScore,
  type TandemClashChallenge,
} from "../challenges-types";
import {
  startChallengeBattleAction,
  completeChallengeBattleAction,
} from "../challenges-actions";

type DebuffTrio = [DebuffCardDefinition, DebuffCardDefinition, DebuffCardDefinition];
/** A corner nobody has played a debuff on yet. */
const noDebuffs = (): DebuffTrio => [NEUTRAL_DEBUFF, NEUTRAL_DEBUFF, NEUTRAL_DEBUFF];
const isNoDebuff = (d?: DebuffCardDefinition | null) => !d || d.id === NEUTRAL_DEBUFF.id;
/** A debuff definition as a card the FullArtCard can draw. The id must be unique for the card dealt. */
function debuffToMemberCard(def: DebuffCardDefinition, id: string): MemberCard {
  return {
    ...debuffDefinitionToCardData(def),
    id,
    userId: "debuff",
    styleIds: [],
    kept: true,
    rerolled: false,
    createdAt: 0,
  } as MemberCard;
}

export interface DebuffScenario {
  id: number;
  icon: string;
  title: string;
  description: string;
}

/** A random incident from `DEBUFF_SCENARIOS`. */
function pickHazardScenario(rng: () => number = Math.random): DebuffScenario | null {
  return DEBUFF_SCENARIOS[Math.floor(rng() * DEBUFF_SCENARIOS.length)] ?? null;
}

export const DEBUFF_SCENARIOS: DebuffScenario[] = [
  {
    id: 1,
    icon: "🐈",
    title: "Cat On The Track!",
    description: "A giant stray tabby strolled straight across the apex clipping zone! Both drivers counter-steer wildly around giant furry paws.",
  },
  {
    id: 2,
    icon: "☕",
    title: "Iced Latte Spill!",
    description: "The pit mechanic knocked an iced latte right into the transmitter rack. Radio gyro sensitivity went completely berserk!",
  },
  {
    id: 3,
    icon: "⚙️",
    title: "Stripped Pinion Teeth!",
    description: "A violent high-RPM transition chewed two teeth clean off the pinion gear. The motor sounds like an angry blender!",
  },
  {
    id: 4,
    icon: "🧲",
    title: "Rogue Body Clip!",
    description: "A loose metal body clip dropped onto the track and magnetized to the chassis underpan, messing up corner weight balance.",
  },
  {
    id: 5,
    icon: "🍌",
    title: "Over-Polished Linoleum!",
    description: "Track marshals buffed the surface with high-gloss floor wax right before the heat. Zero rear lateral bite!",
  },
  {
    id: 6,
    icon: "📡",
    title: "2.4GHz Microwave Glitch!",
    description: "Someone in the lounge heated up a burrito, causing momentary radio frequency packet loss at the worst possible second.",
  },
  {
    id: 7,
    icon: "🪛",
    title: "Loose Wheel Nut Wobble!",
    description: "The rear left wheel nut is hanging on by two threads. The tyre is dancing the cha-cha at 40 degrees slip angle!",
  },
  {
    id: 8,
    icon: "⚡",
    title: "Overcooked Speed Control!",
    description: "Too many full-lock clutch-kicks triggered thermal safety limits on the ESC. Throttle power is begging for mercy!",
  },
  {
    id: 9,
    icon: "💨",
    title: "Industrial Fan Gust!",
    description: "The venue cooling fan pivoted and blast a sudden 30mph headwind directly into the initiation zone.",
  },
  {
    id: 10,
    icon: "🛞",
    title: "Glazed Hard Compounds!",
    description: "The plastic drift tyres overheated and turned into slick hockey pucks. Plenty of screech, zero forward drive.",
  },
  {
    id: 11,
    icon: "🕶️",
    title: "Fogged-Up Lenses!",
    description: "Intense tandem concentration caused the driver's glasses to mist over right as the cars reached the clipping cone.",
  },
  {
    id: 12,
    icon: "📻",
    title: "Reverse Gyro Twitch!",
    description: "A harsh kerb strike inverted the steering gyro logic for half a second. Instant tank-slapper down the straight!",
  },
  {
    id: 13,
    icon: "🧼",
    title: "Lifting Carpet Seam!",
    description: "The outer sweeper carpet seam lifted up and snagged the carbon front splitter.",
  },
  {
    id: 14,
    icon: "🔋",
    title: "LiPo Voltage Sag!",
    description: "Low-voltage buzzer is shrieking like a fire alarm as the cell drops under maximum full-throttle boost.",
  },
  {
    id: 15,
    icon: "🧯",
    title: "Ridiculous Camber Angle!",
    description: "Mechanic dialed in -12 degrees front camber. The car is literally sliding on the rim bevel!",
  },
  {
    id: 16,
    icon: "🐝",
    title: "Rogue Bumblebee Dive!",
    description: "An aggressive bumblebee landed directly on the transmitter steering wheel mid-tandem.",
  },
  {
    id: 17,
    icon: "🔌",
    title: "Pinched Servo Lead!",
    description: "The steering bellcrank pinched the servo wire at full lock, causing a violent front rack twitch.",
  },
  {
    id: 18,
    icon: "🍕",
    title: "Pepperoni Grease Slip!",
    description: "Pit chief handed over the transmitter after finishing a slice. The steering wheel slipped right through thumb grip!",
  },
  {
    id: 19,
    icon: "👟",
    title: "Spectator Sneaker Intrusion!",
    description: "An over-excited spectator stepped two inches across the white line into the outer clipping zone.",
  },
  {
    id: 20,
    icon: "💥",
    title: "Extreme Backward Entry!",
    description: "Driver attempted an absurd 85-degree backward entry and gave the outer tyre wall a solid high-five.",
  },
  {
    id: 21,
    icon: "🧲",
    title: "Stealth Body Mount Pop-Off!",
    description: "A violent clipping curb hit popped the magnetic body mounts. The shell is flying half-cocked at 45 degrees!",
  },
  {
    id: 22,
    icon: "💨",
    title: "ESC Fan Fluff Ingestion!",
    description: "The high-RPM 30mm cooling fan sucked in stray carpet fluff and seized solid with a high-pitched squeal.",
  },
  {
    id: 23,
    icon: "🛞",
    title: "Tyre Tape Delamination!",
    description: "The mounting tape inside the front left drift tyre rolled into a lump. The rim is vibrating like an out-of-balance washing machine!",
  },
  {
    id: 24,
    icon: "🔋",
    title: "Bullet Connector Back-Out!",
    description: "Violent transition inertia backed the 4mm gold battery bullet connector halfway out. Voltage is flickering intermittently!",
  },
  {
    id: 25,
    icon: "🦷",
    title: "Spur Gear Shred!",
    description: "A stray track pebble found the pinion mesh. Half the Delrin teeth just disintegrated into plastic confetti!",
  },
  {
    id: 26,
    icon: "🕹️",
    title: "Transmitter Wheel Sponge Slip!",
    description: "The foam grip on the transmitter steering wheel broke free from the plastic hub and is spinning freely!",
  },
  {
    id: 27,
    icon: "🔧",
    title: "Popped Steering Ball Cup!",
    description: "Aggressive initiation against the clipping box popped the front tie-rod ball cup off the knuckle pivot!",
  },
  {
    id: 28,
    icon: "⚖️",
    title: "Asymmetrical Corner Weights!",
    description: "Pit crew dialed preload unevenly in a hurry. The chassis has 65% cross-weight and crabs sideways down the straight!",
  },
  {
    id: 29,
    icon: "⚡",
    title: "High-Voltage BEC Voltage Spike!",
    description: "A voltage spike fed 8.4V into the steering servo. The steering horn is jittering like it drank three espressos!",
  },
  {
    id: 30,
    icon: "🧴",
    title: "Brake Cleaner Tyre Overdose!",
    description: "Overzealous crew wiped the drift tyres with brake cleaner seconds before rollout. Grip went from zero to negative!",
  },
  {
    id: 31,
    icon: "🧊",
    title: "Hall Sensor Thermal Shock!",
    description: "Paddock AC blasted directly onto the motor endbell. The sensored rotor dropped sync and started cogging like a diesel truck!",
  },
  {
    id: 32,
    icon: "🏁",
    title: "Over-Rotated 360 Entry!",
    description: "Lead car went for a flashy 360 entry and spun like a top, blinding the chase driver in a cloud of static tyre dust!",
  },
  {
    id: 33,
    icon: "📡",
    title: "Receiver Antenna Wire Chew!",
    description: "The micro 2.4GHz antenna escaped its tube and got chewed by the spur gear, creating packet jitter at the apex!",
  },
  {
    id: 34,
    icon: "🪚",
    title: "Spool Locker Grub Screw Slip!",
    description: "The solid rear spool locker screw backed out. The rear axle unexpectedly decided to act like an open diff from 1994!",
  },
  {
    id: 35,
    icon: "📻",
    title: "Transmitter Low-Voltage Beep!",
    description: "The remote controller started screaming high-pitched low-battery warning beeps straight into the driver's ears!",
  },
  {
    id: 36,
    icon: "🌊",
    title: "Paddock Drink Spill Crossover!",
    description: "A spilled energy drink on the crossover ramp turned the surface into sticky sandpaper before the sweeper!",
  },
  {
    id: 37,
    icon: "🚗",
    title: "3D-Printed GT Wing Snap!",
    description: "The scale PLA rear wing snapped its uprights on a barrier brush and is fluttering like a windsock!",
  },
  {
    id: 38,
    icon: "🪛",
    title: "Stripped Servo Horn Splines!",
    description: "The 25T aluminum servo horn stripped its splines. Steering wheel turns 90 degrees but the steering rack barely twitches!",
  },
  {
    id: 39,
    icon: "🔥",
    title: "Motor Can Thermal Overheat!",
    description: "Aggressive ESC turbo boost turned the 10.5T brushless motor can into an electric skillet reaching 95°C!",
  },
  {
    id: 40,
    icon: "🍕",
    title: "Greasy Pit Towel Wipe!",
    description: "Pit chief wiped the hard plastic tyres with a shop rag covered in diff fluid. Instant ice rink physics!",
  },
  {
    id: 41,
    icon: "📐",
    title: "Bent Kingpin Knuckle Pin!",
    description: "A heavy brush against the outer wooden barrier bent the front upright pin. Dynamic kingpin inclination is out the window!",
  },
  {
    id: 42,
    icon: "👟",
    title: "Trailing Shoelace Snag!",
    description: "A spectator's untied shoelace caught the driver's transmitter lanyard just as they initiated the tandem flick!",
  },
  {
    id: 43,
    icon: "🌀",
    title: "Excessive Gyro Gain Oscillation!",
    description: "Gyro gain was accidentally cranked to 98%. The front wheels are violently death-wobbling down the main straight!",
  },
  {
    id: 44,
    icon: "💨",
    title: "Damper Diaphragm Blowout!",
    description: "The rear damper silicone diaphragm ruptured under compression. Mineral oil is coating the rear chassis deck!",
  },
  {
    id: 45,
    icon: "🧯",
    title: "Carpet Static Discharge Zap!",
    description: "Friction on the high-pile carpet built up 10,000V of static and discharged straight into the alloy steering bellcrank!",
  },
  {
    id: 46,
    icon: "🏎️",
    title: "Rear Diffuser Ground Scrape!",
    description: "Ultra-low rear ride height caused the carbon diffuser to dig into a carpet seam, sounding like tearing Velcro!",
  },
  {
    id: 47,
    icon: "🔩",
    title: "Loose Motor Mount Shift!",
    description: "The M3 motor mount screws vibrated loose. The pinion gear slid back and is barely catching the spur teeth!",
  },
  {
    id: 48,
    icon: "🔋",
    title: "Unbalanced LiPo Cell Drift!",
    description: "Cell 1 is at 4.20V while Cell 2 cratered to 3.55V. The ESC throttle curve is stumbling under load!",
  },
  {
    id: 49,
    icon: "🪞",
    title: "Tweaked Carbon Chassis Deck!",
    description: "A heavy impact twisted the lower carbon deck. The front left tyre is floating 2mm in the air off throttle!",
  },
  {
    id: 50,
    icon: "🥫",
    title: "Trackside Energy Drink Can Roll!",
    description: "An empty soda can blew onto the outer clipping line. Both cars had to bunny-hop around aluminum debris!",
  },
  {
    id: 51,
    icon: "👓",
    title: "Steaming Eyeglass Lenses!",
    description: "Adrenaline and breath steamed up the driver's glasses right as the cars reached the high-speed wall ride!",
  },
  {
    id: 52,
    icon: "🕹️",
    title: "Accidental Dual-Rate Switch Knock!",
    description: "Driver's knuckle bumped the dual-rate toggle on the grip, cutting steering travel down to 45% mid-drift!",
  },
  {
    id: 53,
    icon: "🏎️",
    title: "Interlocked Wheel Rim Spokes!",
    description: "Door-to-door proximity was so tight the negative-offset wheel spokes meshed together like gear cogs!",
  },
  {
    id: 54,
    icon: "🧵",
    title: "Carpet Fibre Axle Wrap!",
    description: "A loose nylon carpet thread wrapped 50 times around the front stub axle, creating instant brake dragging!",
  },
  {
    id: 55,
    icon: "💡",
    title: "Track Floodlight Glare Blast!",
    description: "The low-mounted LED floodlight shone straight into the driver's eyes at the exact apex initiation point!",
  },
  {
    id: 56,
    icon: "⚡",
    title: "Capacitor Bank Solder Joint Crack!",
    description: "Vibrations cracked the solder joint on the ESC capacitor pack. Heavy throttle punches are causing micro-brownouts!",
  },
  {
    id: 57,
    icon: "🛢️",
    title: "Shock Fluid Viscosity Blunder!",
    description: "The mechanic filled the front shocks with 2000cSt diff lube by mistake. The front suspension is rigid as a church bench!",
  },
  {
    id: 58,
    icon: "🧲",
    title: "Grub Screw Sucked Into Motor!",
    description: "The neodymium motor rotor sucked a loose 2mm grub screw through the endbell vents with a loud tick!",
  },
  {
    id: 59,
    icon: "🛞",
    title: "Square Flat-Spotted Rim!",
    description: "A curb hit flattened the outer rim edge. The front tyre sounds like an air hammer clattering at 40mph!",
  },
  {
    id: 60,
    icon: "📻",
    title: "Wrong Model Profile Loaded!",
    description: "Driver accidentally loaded their touring car profile with 0% gyro sensitivity and 100% expo! Hold on tight!",
  },
  {
    id: 61,
    icon: "💥",
    title: "Front Bumper Foam Dislodge!",
    description: "The high-density foam bumper dislodged from the mounts and is wedged between the front steering tierods!",
  },
  {
    id: 62,
    icon: "🐝",
    title: "Camera Lens Moth Dive!",
    description: "A moth landed squarely on the track telemetry camera lens, obscuring the judges' view of the outer clipping zone!",
  },
  {
    id: 63,
    icon: "🚗",
    title: "Exhaust Backfire LED Short!",
    description: "Scale exhaust LED backfire module shorted against the alloy exhaust tip and started strobing like a disco ball!",
  },
  {
    id: 64,
    icon: "🔌",
    title: "Loose Sensored Motor Harness!",
    description: "The 6-pin motor sensor harness vibrated loose. The brushless ESC dropped into stuttering sensorless mode!",
  },
  {
    id: 65,
    icon: "🪚",
    title: "Stripped Camber Link Thread!",
    description: "The upper suspension camber screw pulled out of the bulkhead. The left rear wheel has +20 degrees positive camber!",
  },
  {
    id: 66,
    icon: "🧰",
    title: "Setup Tool Forgotten On Roof!",
    description: "Pit crew left an aluminum camber gauge magnetically stuck to the roof. Center of gravity is thoroughly ruined!",
  },
  {
    id: 67,
    icon: "🏎️",
    title: "Apex Rumble-Strip Bicycle Stunt!",
    description: "Hit the raised apex kerb so violently the chassis rode on two wheels like an action movie stunt car!",
  },
  {
    id: 68,
    icon: "❄️",
    title: "Sudden Venue Draft Freeze!",
    description: "The venue loading bay roller door opened, dropping track floor temp by 10°C in thirty seconds. Tyres feel like ice cubes!",
  },
  {
    id: 69,
    icon: "🕹️",
    title: "Sub-Trim Rocker Accidental Bump!",
    description: "Driver's thumb grazed the steering sub-trim switch. The car is tracking down the straight with 8 degrees of crab angle!",
  },
  {
    id: 70,
    icon: "💨",
    title: "High-RPM Blower Crosswind!",
    description: "Pit lane high-velocity cooling blower blew a blast of cold crosswind across the sweeper entry!",
  },
  {
    id: 71,
    icon: "🛞",
    title: "Mismatched Rim Offset Stance!",
    description: "Mechanic grabbed a +6mm offset wheel on the left and +9mm on the right. Track width is completely asymmetrical!",
  },
  {
    id: 72,
    icon: "⚡",
    title: "Sheared Wheel Hex Drive Pin!",
    description: "Full throttle torque sheared the tiny 1.5mm wheel hex pin. The rear left wheel is free-wheeling under power!",
  },
  {
    id: 73,
    icon: "🔋",
    title: "Swollen LiPo Battery Pack Squeeze!",
    description: "A slightly puffed battery pack is jammed tight against the carbon top deck, completely locking chassis flex!",
  },
  {
    id: 74,
    icon: "🔧",
    title: "Droop Screw Vibration Loss!",
    description: "The lower suspension arm droop set-screw vibrated out. Suspension has 15mm of uncontrolled down-travel!",
  },
  {
    id: 75,
    icon: "🎯",
    title: "Peeling Track Tape Mirage!",
    description: "White boundary tape peeled up and flapped in the breeze, tricking both drivers into an early apex flick!",
  },
  {
    id: 76,
    icon: "☕",
    title: "Coffee Rings On Setup Board!",
    description: "Camber and toe were measured on a setup board resting on three wet coffee coasters. Alignment is purely theoretical!",
  },
  {
    id: 77,
    icon: "🏎️",
    title: "Side Mirror Caught In Catch Netting!",
    description: "Scale 3D-printed side mirror hooked into the track boundary mesh and ripped off with a loud snap!",
  },
  {
    id: 78,
    icon: "🧲",
    title: "Velcro Battery Strap Failure!",
    description: "Hard weight-transfer snap released the battery strap. The 2S shorty pack slid 30mm forward onto the steering servo!",
  },
  {
    id: 79,
    icon: "💨",
    title: "Damper Spring Collar Thread Jump!",
    description: "The threaded preload collar jumped three threads on the shock body. Left rear ride height completely collapsed!",
  },
  {
    id: 80,
    icon: "🏁",
    title: "Premature Victory Donut!",
    description: "Driver thought the battle was won and initiated an 8000 RPM victory donut three feet before the final finish line!",
  },
];

const LOANER_CARDS: MemberCard[] = [
  {
    id: "loaner-1",
    userId: "loaner",
    name: "PHD Rental RDX #01",
    ability: "Reve D RDX",
    effect: "Hobbywing 10BL120 · Yokomo V4 Gyro",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "15", accel: "13", grip: "15", steer: "15" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-2",
    userId: "loaner",
    name: "PHD Rental YD-2S #02",
    ability: "Yokomo YD-2S",
    effect: "Surpass Rocket 10.5T · Futaba S-C400",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "14", accel: "15", grip: "15", steer: "14" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
  {
    id: "loaner-3",
    userId: "loaner",
    name: "PHD Rental Galm #03",
    ability: "Overdose GALM",
    effect: "Acuvance Agile · Sanwa PGS-CL II",
    driver: "Track Loaner",
    team: "PHD Academy",
    tier: "bronze",
    styleIds: ["touge"],
    stats: { drift: "15", accel: "15", grip: "13", steer: "15" },
    imageUrl: "/icons/icon-512.png",
    imageZoom: 106,
    imageX: 50,
    imageY: 50,
    kept: true,
    rerolled: false,
    createdAt: 0,
  },
];

type GamePhase =
  | "lobby"
  | "lineup"
  | "track_roulette"
  | "car_select"
  | "corner_battle"
  | "verdict";

type LoadoutSection = "cars" | "crew";

// How long each beat of the end of a corner lasts (ms).
/** The crew is shown deployed before the finale game is drawn. */
const CREW_DEPLOYED_MS = 1500;
/** After the crew card is played the cars come together in the middle for this long, before the finale is drawn. */
const FINALE_CLASH_MS = 2400;
/** The cars clash before the reveal starts. */
const CLASH_MS = 2000;
/** A pause on the face-off before the first rival stat appears. */
const REVEAL_LEAD_MS = 500;
/** Each of the rival's four stats is shown for this long before the next. */
const REVEAL_STAT_MS = 800;
/** The totals stay up this long before the winner is announced (the breakdown stays up through the winner too). */
const REVEAL_TOTALS_MS = 3500;
/** The winner banner shows for this long before the corner is done. */
const WINNER_MS = 1800;

type CornerSubStage = "car_draw" | "choose_crew" | "debuff_and_score";

type BattleAnimStep =
  | "cards_entrance"
  | "head_to_head"
  | "battle_initial"
  | "prompt_debuff"
  | "hazard_incident"
  | "debuff_overlay"
  | "battle_shake_1"
  | "prompt_crew"
  | "crew_overlay"
  | "finale_clash"
  | "finale_roulette"
  | "prompt_finale"
  | "finale_result"
  | "reveal_stats"
  | "battle_shake_2"
  | "knockout_and_winner"
  | "corner_finished";

/**
 * The Crew card's buffs as badges, from what the scoring engine says really happened: each stat's gain (after the
 * 25 cap), the Crew card's point bonuses that applied, and its shield. Falls back to the card's own numbers for a
 * result that has no breakdown.
 */
function crewBuffBadges(
  stages: CornerStatStages | undefined,
  parts: CornerScoreParts | undefined,
  shield: number,
  mods: CrewCardModifiers
): string[] {
  const out: string[] = [];
  if (stages && parts) {
    for (const stat of ["drift", "accel", "grip", "steer"] as const) {
      const gain = stages.afterCrew[stat] - stages.base[stat];
      if (gain > 0) out.push(`+${gain} ${stat.toUpperCase()}`);
    }
    if (parts.crewPts > 0) out.push(`+${parts.crewPts} PTS`);
  } else {
    if (mods.driftBonus) out.push(`+${mods.driftBonus} DRIFT`);
    if (mods.accelBonus) out.push(`+${mods.accelBonus} ACCEL`);
    if (mods.gripBonus) out.push(`+${mods.gripBonus} GRIP`);
    if (mods.steerBonus) out.push(`+${mods.steerBonus} STEER`);
    if (mods.flatBonus) out.push(`+${mods.flatBonus} PTS`);
  }
  if (shield > 0) out.push(`🛡️ ${Math.round(shield * 100)}% Shield`);
  return out;
}

function getStatDiffInfo(newVal: number, oldVal: number) {
  const diff = newVal - oldVal;
  if (diff > 0) {
    return {
      diff,
      text: `+${diff}`,
      colorClass: "text-emerald-300 bg-emerald-500/20 border-emerald-500/60",
      tagColor: "bg-emerald-500 text-black",
      status: "positive" as const,
    };
  }
  if (diff < 0) {
    return {
      diff,
      text: `${diff}`,
      colorClass: "text-rose-300 bg-rose-500/20 border-rose-500/60",
      tagColor: "bg-rose-500 text-white",
      status: "negative" as const,
    };
  }
  return {
    diff: 0,
    text: "±0",
    colorClass: "text-amber-300 bg-amber-500/20 border-amber-500/60",
    tagColor: "bg-amber-500 text-black",
    status: "same" as const,
  };
}

function shuffleThreeIndices(): [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2] {
  const arr: Array<0 | 1 | 2> = [0, 1, 2];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return [arr[0], arr[1], arr[2]];
}

function pickTopThreeIds(cards: MemberCard[]): [string, string, string] {
  const sorted = [...cards].sort((a, b) => getCardPower(b) - getCardPower(a));
  const c0 = sorted[0] ?? cards[0];
  const c1 = sorted[1] ?? sorted[0] ?? cards[0];
  const c2 = sorted[2] ?? sorted[1] ?? sorted[0] ?? cards[0];
  return [c0.id, c1.id, c2.id];
}

function MysteryCardBack({
  label = "MYSTERY CARD",
  accent = "amber",
}: {
  label?: string;
  accent?: "amber" | "cyan" | "rose";
}) {
  const borderClass =
    accent === "cyan"
      ? "border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.2)]"
      : accent === "rose"
        ? "border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.2)]"
        : "border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)]";
  return (
    <div
      className={`relative flex aspect-[63/88] w-full flex-col items-center justify-between overflow-hidden rounded-2xl border-2 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-3 text-center select-none ${borderClass}`}
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 35%, rgba(245,158,11,0.45), transparent 65%)",
        }}
      />
      <div className="relative z-10 flex w-full items-center justify-between text-[9px] font-black uppercase tracking-widest text-amber-400/80">
        <span>PHD CLASH</span>
        <span>LOCKED</span>
      </div>

      <div className="relative z-10 my-auto flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-8 opacity-90" />
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-amber-300">
          ???
        </span>
      </div>

      <p className="relative z-10 text-[9px] font-extrabold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
    </div>
  );
}

export function DriftClashArena({
  cards,
  initialOpponent,
  initialStats,
  initialClashStats,
  hasEarlyAccess = true,
  isAdmin = false,
  userId,
  pCredits,
  onPCreditsChange,
  onStatsChange,
  onRewardEarned,
  onCardsChange,
  onOpenStoreTab,
  lobbyTab,
  onLobbyTabChange,
  campaign,
}: {
  /** Set by the Drift Campaign (admin only) to play one fixed battle. Leave out for the normal game. */
  campaign?: ArenaCampaignHook;
  cards: MemberCard[];
  initialOpponent: ClashOpponent;
  initialStats?: ClashPlayerStats;
  initialClashStats?: ClashPlayerStats;
  hasEarlyAccess?: boolean;
  isAdmin?: boolean;
  userId?: string;
  pCredits?: number;
  onPCreditsChange?: (newPCredits: number) => void;
  onStatsChange?: (nextClashStats: ClashPlayerStats) => void;
  onRewardEarned?: (newPCredits: number, nextClashStats: ClashPlayerStats) => void;
  onCardsChange?: (updatedCards: MemberCard[]) => void;
  onOpenStoreTab: () => void;
  /** Which lobby view shows. Leave it out and the arena keeps this itself. */
  lobbyTab?: "quick" | "challenges";
  onLobbyTabChange?: (tab: "quick" | "challenges") => void;
}) {
  const startingStats = initialStats ?? initialClashStats ?? {
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    dailyWinClaimed: false,
  };

  // Mode switcher: "quick" for standard match, "challenges" for cups & tournaments
  const [internalLobbyTab, setInternalLobbyTab] = useState<"quick" | "challenges">("quick");
  const arenaLobbyTab = lobbyTab ?? internalLobbyTab;
  const setArenaLobbyTab = (next: "quick" | "challenges") => {
    setInternalLobbyTab(next);
    onLobbyTabChange?.(next);
  };
  const [activeChallenge, setActiveChallenge] = useState<TandemClashChallenge | null>(null);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<string[]>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeWonCelebration, setChallengeWonCelebration] = useState<{
    challengeTitle: string;
    rewardGranted: number;
    challengeCompleted: boolean;
  } | null>(null);
  const [internalPCredits, setInternalPCredits] = useState(pCredits ?? 0);
  useEffect(() => {
    if (typeof pCredits === "number") setInternalPCredits(pCredits);
  }, [pCredits]);

  // Early Access Beta Admin modal state
  const [showEarlyAccessModal, setShowEarlyAccessModal] = useState(false);
  const [earlyAccessRoster, setEarlyAccessRoster] = useState<EarlyAccessMemberItem[]>([]);
  const [loadingEarlyAccessRoster, setLoadingEarlyAccessRoster] = useState(false);
  const [earlyAccessSearch, setEarlyAccessSearch] = useState("");
  const [togglingEarlyAccessUserId, setTogglingEarlyAccessUserId] = useState<string | null>(null);

  async function loadEarlyAccessRoster() {
    setLoadingEarlyAccessRoster(true);
    try {
      const res = await listClashEarlyAccessRosterAction();
      if (res.success) {
        setEarlyAccessRoster(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingEarlyAccessRoster(false);
    }
  }

  async function handleToggleEarlyAccessInArena(member: EarlyAccessMemberItem) {
    if (member.role === "admin") return;
    setTogglingEarlyAccessUserId(member.id);
    const newStatus = !member.hasEarlyAccess;
    setEarlyAccessRoster((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: newStatus } : m))
    );
    try {
      const res = newStatus
        ? await grantClashEarlyAccessAction(member.id)
        : await revokeClashEarlyAccessAction(member.id);
      if (!res.success) {
        setEarlyAccessRoster((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
        );
      }
    } catch {
      setEarlyAccessRoster((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, hasEarlyAccess: !newStatus } : m))
      );
    } finally {
      setTogglingEarlyAccessUserId(null);
    }
  }

  // Live Clash Game Cards config (Crew Advantages, Debuff Cards, UK Track Cards)
  const [gameCardsConfig, setGameCardsConfig] = useState<ClashGameCardsConfig>({
    crewCards: CREW_CARD_SET,
    debuffCards: DEBUFF_CARD_SET,
    trackCards: UK_TRACK_CARD_SET,
  });

  useEffect(() => {
    let mounted = true;
    getClashGameCardsConfigAction()
      .then((cfg) => {
        if (mounted && cfg) {
          setGameCardsConfig(cfg);
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, []);

  // Members and their garage cars for the member Track Hazards. Loaded ahead of time so the track roll stays instant,
  // and topped up after every roll so the next match gets fresh ones. If it never loads, those hazards just don't come up.
  const hazardSamplesRef = useRef<HazardGarageSample[]>([]);
  const refreshHazardSamples = useCallback(() => {
    getHazardGarageSamplesAction()
      .then((samples) => {
        hazardSamplesRef.current = samples;
      })
      .catch(() => null);
  }, []);
  useEffect(() => {
    refreshHazardSamples();
  }, [refreshHazardSamples]);

  const [localCards, setLocalCards] = useState<MemberCard[]>(cards);
  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  const [pitReport, setPitReport] = useState<
    Array<{
      type: "fault" | "repaired";
      cardId: string;
      cardName: string;
      faultName?: string;
      faultIcon?: string;
      battlesNeeded?: number;
      freshBattles?: number;
    }>
  >([]);
  const [repairingCarId, setRepairingCarId] = useState<string | null>(null);

  async function handleQuickRepair(car: MemberCard, consumable: MemberCard) {
    setRepairingCarId(car.id);
    try {
      const res = await applyMaintenanceRepairAction({
        carCardId: car.id,
        maintenanceCardId: consumable.id,
      });
      if (res.success) {
        setLocalCards((prev) =>
          prev
            .filter((c) => c.id !== consumable.id)
            .map((c) => (c.id === car.id ? res.data.car : c))
        );
      }
    } catch (err) {
      console.error("Failed to apply quick repair:", err);
    } finally {
      setRepairingCarId(null);
    }
  }

  const crewCatalogDefs: CrewCardDefinition[] = gameCardsConfig.crewCards;
  const debuffCatalogDefs: DebuffCardDefinition[] = gameCardsConfig.debuffCards;
  const trackCatalogDefs: TrackCardDefinition[] = gameCardsConfig.trackCards;

  // Split player's collection into Car Cards, Maintenance Consumables, and Crew Advantage Cards
  const carCards = useMemo(
    () => localCards.filter((c) => !isCrewCard(c) && c.cardType !== "maintenance"),
    [localCards]
  );

  const maintenanceCards = useMemo(
    () => localCards.filter((c) => c.cardType === "maintenance"),
    [localCards]
  );

  // Refresh owned Crew Cards with latest Advantage definitions from gameCardsConfig, scaled to the card's pulled tier
  const ownedCrewCards = useMemo(() => {
    return localCards
      .filter((c) => isCrewCard(c))
      .map((c) => {
        const def =
          crewCatalogDefs.find(
            (d) => d.id === c.crewCardId || d.id === c.id || d.name === c.name
          ) ??
          CREW_CARD_SET.find(
            (d) => d.id === c.crewCardId || d.id === c.id || d.name === c.name
          );
        if (!def) return c;
        const targetTier = c.tier ?? def.tier ?? "bronze";
        const scaledDef = scaleCrewCardDefinition(def, targetTier);
        const freshData = crewDefinitionToCardData(scaledDef);
        return {
          ...c,
          crewCardId: def.id,
          name: freshData.name,
          tier: freshData.tier,
          ability: freshData.ability,
          effect: freshData.effect,
          driver: freshData.driver,
          team: freshData.team,
          imageUrl: freshData.imageUrl,
          crewIcon: freshData.crewIcon,
        };
      });
  }, [localCards, crewCatalogDefs]);

  // Robust resolver for Crew Card definitions, preserving and scaling to the card's pulled rarity tier
  function resolveCrewDef(card?: MemberCard | null): CrewCardDefinition {
    if (!card) return scaleCrewCardDefinition(crewCatalogDefs[0] ?? CREW_CARD_SET[0], "bronze");
    const found =
      crewCatalogDefs.find(
        (d) => d.id === card.crewCardId || d.id === card.id || d.name === card.name
      ) ??
      CREW_CARD_SET.find(
        (d) => d.id === card.crewCardId || d.id === card.id || d.name === card.name
      );
    const baseDef = found ?? crewCatalogDefs[0] ?? CREW_CARD_SET[0];
    const targetTier = card.tier ?? baseDef.tier ?? "bronze";
    return scaleCrewCardDefinition(baseDef, targetTier);
  }

  // Filter for healthy car cards without active mechanical faults
  const healthyCarCards = useMemo(
    () => carCards.filter((c) => !isCarBroken(c)),
    [carCards]
  );

  // Ensure at least 3 Car Cards (pad with Academy Loaner Cars if healthy cars < 3)
  const usableCarCards = useMemo(
    () =>
      healthyCarCards.length >= 3
        ? healthyCarCards
        : [
            ...healthyCarCards,
            ...LOANER_CARDS.slice(0, Math.max(0, 3 - healthyCarCards.length)),
          ],
    [healthyCarCards]
  );
  const usingLoanerCars = healthyCarCards.length < 3;

  // Ensure at least 3 Crew Advantage Cards (pad with Starter Loaner Crew Cards if player owns < 3)
  const usableCrewCards = useMemo(() => {
    if (ownedCrewCards.length >= 3) return ownedCrewCards;
    const needed = 3 - ownedCrewCards.length;
    return [...ownedCrewCards, ...STARTER_LOANER_CREW_CARDS.slice(0, needed)];
  }, [ownedCrewCards]);
  const usingLoanerCrew = ownedCrewCards.length < 3;

  const [clashStats, setClashStats] = useState<ClashPlayerStats>(startingStats);
  const [opponent, setOpponent] = useState<ClashOpponent>(initialOpponent);
  const utcCountdown = useUtcMidnightCountdown();

  // Guard against playing against oneself in casual lobby (never override challenge cups)
  useEffect(() => {
    if (activeChallenge || campaign) return;
    if (!cards || cards.length === 0) return;
    const playerCardIdSet = new Set(cards.map((c) => c.id));
    const playerUserId = cards.find((c) => Boolean(c.userId))?.userId;
    const hasOwnCardInRival = opponent.cards.some(
      (c) => playerCardIdSet.has(c.id) || (Boolean(playerUserId) && c.userId === playerUserId)
    );
    if (hasOwnCardInRival) {
      findNewClashOpponentAction()
        .then((res) => {
          if (res && res.success && res.data) {
            setOpponent(res.data);
          }
        })
        .catch(() => null);
    }
  }, [cards, opponent.cards, activeChallenge, campaign]);

  // Step 1 Loadout state: 3 Car IDs + 3 Crew IDs
  const [selectedCarIds, setSelectedCarIds] = useState<[string, string, string]>(() =>
    pickTopThreeIds(usableCarCards)
  );
  const [selectedCrewIds, setSelectedCrewIds] = useState<[string, string, string]>(() =>
    pickTopThreeIds(usableCrewCards)
  );

  // Step 2: Randomised UK Track Card state
  const [activeTrackDef, setActiveTrackDef] = useState<TrackCardDefinition>(
    () => UK_TRACK_CARD_SET[0]
  );
  const [rouletteTrackIdx, setRouletteTrackIdx] = useState(0);
  const [trackLockedIn, setTrackLockedIn] = useState(false);

  // Step 3: 3-Corner Battle state
  const [activeSectors, setActiveSectors] = useState<
    [ClashSectorSpec, ClashSectorSpec, ClashSectorSpec]
  >(() => rollThreeClashSectors());
  const [playerCarOrder, setPlayerCarOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  const [rivalCarOrder, setRivalCarOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  const [playerCarAssignments, setPlayerCarAssignments] = useState<Array<0 | 1 | 2 | null>>([null, null, null]);
  const [rivalCarAssignments, setRivalCarAssignments] = useState<Array<0 | 1 | 2 | null>>([null, null, null]);
  const [rivalCrewOrder, setRivalCrewOrder] = useState<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]>([0, 1, 2]);
  // The debuff that lands on each side's car at each corner. Each side plays the debuff for the OTHER side's car at
  // the corner itself, so until then a corner holds "no debuff".
  const [debuffsOnPlayer, setDebuffsOnPlayer] = useState<DebuffTrio>(noDebuffs);
  const [debuffsOnRival, setDebuffsOnRival] = useState<DebuffTrio>(noDebuffs);
  // The 3 debuff cards dealt for the corner being played: yours (to play on the rival's car) and the rival's.
  const [debuffHand, setDebuffHand] = useState<DebuffCardDefinition[]>([]);
  const [rivalDebuffHand, setRivalDebuffHand] = useState<DebuffCardDefinition[]>([]);
  const [debuffPickIdx, setDebuffPickIdx] = useState<number | null>(null);
  const [activeCornerIdx, setActiveCornerIdx] = useState<0 | 1 | 2>(0);
  const [battleAnimStep, setBattleAnimStep] = useState<BattleAnimStep>("cards_entrance");
  const [cornerSubStage, setCornerSubStage] = useState<CornerSubStage>("car_draw");
  const [carDrawShuffleTick, setCarDrawShuffleTick] = useState(0);
  const [carDrawLocked, setCarDrawLocked] = useState(false);

  // Track which of the 3 selected Crew Cards (indices 0, 1, 2) the player and rival have played on each corner
  const [playerCrewAssignments, setPlayerCrewAssignments] = useState<Array<number | null>>([null, null, null]);
  const [rivalCrewAssignments, setRivalCrewAssignments] = useState<Array<number | null>>([null, null, null]);
  const [playedCrewIndices, setPlayedCrewIndices] = useState<Array<0 | 1 | 2>>([]);
  const [cornerResults, setCornerResults] = useState<EvaluatedCornerResult[]>([]);
  // The finale for the corner being played: after both Crew cards are down and before the corner is judged. `base`
  // is the corner's result without the finale's points. The rival's stats stay hidden until the finale is done.
  // What the finale decided for the corner, shown after the player's pick and before the reveal.
  const [finaleOutcome, setFinaleOutcome] = useState<{ cornerIdx: 0 | 1 | 2; outcome: FinaleOutcome } | null>(null);
  // The funny track incident (one of DEBUFF_SCENARIOS) shown when the corner's debuffs hit.
  const [hazardScenario, setHazardScenario] = useState<DebuffScenario | null>(null);
  // How much of the rival's car the reveal has shown so far: 1 to 4 stats, then 5 for the totals.
  const [rivalReveal, setRivalReveal] = useState(0);
  const [pendingFinale, setPendingFinale] = useState<{
    cornerIdx: 0 | 1 | 2;
    mode: FinaleMode;
    base: EvaluatedCornerResult;
    /** What each stat's judge is worth if the finale is Setup Allocation. */
    weights: FinaleWeights;
  } | null>(null);
  // Previewing crew card selection in crew_prep phase
  const [previewCrewIdx, setPreviewCrewIdx] = useState<number | null>(null);
  // Previewing car card selection in car_select phase
  const [previewCarSlot, setPreviewCarSlot] = useState<0 | 1 | 2 | null>(null);

  // Sub-stage 3 animation flags
  const [debuffRevealed, setDebuffRevealed] = useState(false);
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [cornerStamped, setCornerStamped] = useState(false);
  const [expandedCornerDetails, setExpandedCornerDetails] = useState<Record<number, boolean>>({});

  function toggleCornerDetails(idx: number) {
    setExpandedCornerDetails((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  }

  // UI Navigation & Modals
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [loadoutSection, setLoadoutSection] = useState<LoadoutSection>("cars");
  const [pickerModalTarget, setPickerModalTarget] = useState<{
    type: "car" | "crew";
    slotIdx: 0 | 1 | 2;
  } | null>(null);
  const [showCatalogModal, setShowCatalogModal] = useState<
    "crew" | "debuff" | "track" | null
  >(null);
  const [showHowToPlayModal, setShowHowToPlayModal] = useState<boolean>(false);
  const [howToPlayTab, setHowToPlayTab] = useState<HowToPlayTab>("quickstart");
  const [challengeReplayConfirm, setChallengeReplayConfirm] = useState<TandemClashChallenge | null>(null);

  function openHowToPlay(tab: HowToPlayTab = "quickstart") {
    setHowToPlayTab(tab);
    setShowHowToPlayModal(true);
  }
  const [viewerState, setViewerState] = useState<{
    list: MemberCard[];
    index: number;
  } | null>(null);

  const [battleBanner, setBattleBanner] = useState<{
    won: boolean;
    playerCorners: number;
    opponentCorners: number;
    tiedCorners: number;
    rewardGranted: number;
    streakBonusGranted: number;
  } | null>(null);

  const [, startTransition] = useTransition();
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  function clearTimers() {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }

  useEffect(() => () => clearTimers(), []);

  // Lock body scroll while full-screen game stage is open
  useEffect(() => {
    if (phase === "lobby") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Keyboard navigation for the Large Card Viewer Modal
  useEffect(() => {
    if (!viewerState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setViewerState(null);
      } else if (e.key === "ArrowLeft") {
        setViewerState((prev) =>
          prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
        );
      } else if (e.key === "ArrowRight") {
        setViewerState((prev) =>
          prev && prev.index < prev.list.length - 1
            ? { ...prev, index: prev.index + 1 }
            : prev
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerState]);

  const [catalogTierTab, setCatalogTierTab] = useState<FullArtTier>("bronze");

  // Catalog preview card lists scaled to the selected rarity tab
  const catalogCrewMemberCards = useMemo<MemberCard[]>(
    () =>
      crewCatalogDefs.map((def) => {
        const scaled = scaleCrewCardDefinition(def, catalogTierTab);
        return {
          id: `${def.id}-${catalogTierTab}`,
          userId: "catalog",
          ...crewDefinitionToCardData(scaled),
          styleIds: [],
          kept: true,
          rerolled: false,
          createdAt: 0,
        };
      }),
    [crewCatalogDefs, catalogTierTab]
  );

  const catalogDebuffMemberCards = useMemo<MemberCard[]>(
    () =>
      debuffCatalogDefs.map((def) => {
        const scaled = scaleDebuffCardDefinition(def, catalogTierTab);
        return {
          id: `${def.id}-${catalogTierTab}`,
          userId: "catalog",
          ...debuffDefinitionToCardData(scaled),
          styleIds: [],
          kept: true,
          rerolled: false,
          createdAt: 0,
        };
      }),
    [debuffCatalogDefs, catalogTierTab]
  );

  const catalogTrackMemberCards = useMemo<MemberCard[]>(
    () =>
      trackCatalogDefs.map((def) => ({
        id: def.id,
        userId: "catalog",
        ...trackDefinitionToCardData(def),
        styleIds: [],
        kept: true,
        rerolled: false,
        createdAt: 0,
      })),
    [trackCatalogDefs]
  );

  // Resolve Player's 3 Selected Car Cards
  const selectedCarCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    const resolved = selectedCarIds.map(
      (id, idx) =>
        usableCarCards.find((c) => c.id === id) ??
        usableCarCards[idx] ??
        LOANER_CARDS[idx]
    );
    return [resolved[0], resolved[1], resolved[2]];
  }, [selectedCarIds, usableCarCards]);

  // Check how many currently equipped cars violate the active challenge restrictions
  const challengeIneligibleCount = useMemo(() => {
    if (!activeChallenge) return 0;
    return selectedCarCards.filter(
      (c) => !isCarEligibleForChallenge(c, activeChallenge).eligible
    ).length;
  }, [selectedCarCards, activeChallenge]);

  const isLineupEligible = challengeIneligibleCount === 0;

  // Resolve Player's 3 Selected Crew Advantage Cards
  const selectedCrewCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    const resolved = selectedCrewIds.map(
      (id, idx) =>
        usableCrewCards.find((c) => c.id === id) ??
        usableCrewCards[idx] ??
        STARTER_LOANER_CREW_CARDS[idx]
    );
    return [resolved[0], resolved[1], resolved[2]];
  }, [selectedCrewIds, usableCrewCards]);

  // What the track, the corner types and this match's debuffs mean for the lineup.
  const lineupContext = useMemo<LineupContext>(
    () => ({ track: activeTrackDef, crewDefs: crewCatalogDefs }),
    [activeTrackDef, crewCatalogDefs]
  );
  const carInsights = useMemo(
    () => selectedCarCards.map((car) => carInsight(car, lineupContext)),
    [selectedCarCards, lineupContext]
  );

  // Resolve Rival's 3 Crew Advantage Cards (uses opponent.crewCards or Starter Loaner Crew Cards)
  const rivalCrewCards = useMemo<[MemberCard, MemberCard, MemberCard]>(() => {
    if (opponent.crewCards && opponent.crewCards.length === 3) {
      return opponent.crewCards;
    }
    if (opponent.crewCard) {
      return [
        opponent.crewCard,
        STARTER_LOANER_CREW_CARDS[1],
        STARTER_LOANER_CREW_CARDS[2],
      ];
    }
    return STARTER_LOANER_CREW_CARDS;
  }, [opponent.crewCards, opponent.crewCard]);

  // Convert active UK Track definition into a FullArtCard-compatible MemberCard
  const activeTrackCard = useMemo<MemberCard>(
    () => ({
      id: activeTrackDef.id,
      userId: "track",
      ...trackDefinitionToCardData(activeTrackDef),
      styleIds: [],
      kept: true,
      rerolled: false,
      createdAt: 0,
    }),
    [activeTrackDef]
  );

  // Helper to assign a Car or Crew card into one of the 3 slots without duplicates
  function assignCardToSlot(
    type: "car" | "crew",
    slotIdx: 0 | 1 | 2,
    cardId: string
  ) {
    if (type === "car" && activeChallenge) {
      const card = carCards.find((c) => c.id === cardId);
      if (card && !isCarEligibleForChallenge(card, activeChallenge).eligible) {
        return;
      }
    }
    const setter = type === "car" ? setSelectedCarIds : setSelectedCrewIds;
    setter((prev) => {
      const next: [string, string, string] = [...prev] as [string, string, string];
      const existingIdx = next.indexOf(cardId);
      if (existingIdx !== -1 && existingIdx !== slotIdx) {
        next[existingIdx] = next[slotIdx];
      }
      next[slotIdx] = cardId;
      return next;
    });
    setPickerModalTarget(null);
  }

  // Launch Step 1: Select 3 Car Cards & 3 Crew Cards (Quick Standard Match)
  function handleLaunchGame() {
    if (!hasEarlyAccess) {
      return;
    }
    clearTimers();
    setActiveChallenge(null);
    setChallengeWonCelebration(null);
    setSelectedCarIds(pickTopThreeIds(usableCarCards));
    setSelectedCrewIds(pickTopThreeIds(usableCrewCards));
    setLoadoutSection("cars");
    setPickerModalTarget(null);
    setBattleBanner(null);
    setCornerResults([]);
    setPlayedCrewIndices([]);
    setPlayerCrewAssignments([null, null, null]);
    setRivalCrewAssignments([null, null, null]);
    setPlayerCarAssignments([null, null, null]);
    setRivalCarAssignments([null, null, null]);
    setPreviewCarSlot(null);
    setPlayerCarOrder([0, 1, 2]);
    setRivalCarOrder([0, 1, 2]);
    handleStartTrackRoulette();
  }

  // Launch Step 1 via Challenge Cup (Track Selection first)
  async function handleLaunchChallenge(challenge: TandemClashChallenge) {
    if (!hasEarlyAccess) {
      alert("Tandem Clash is currently in private preview. Closed beta access is required.");
      return;
    }
    clearTimers();
    setChallengeLoading(true);
    try {
      const res = await startChallengeBattleAction(challenge.id);
      if (!res.success || !res.data) {
        alert((!res.success && res.error) || "Could not enter challenge.");
        setChallengeLoading(false);
        return;
      }

      if (typeof res.data.pCredits === "number") {
        setInternalPCredits(res.data.pCredits);
        onPCreditsChange?.(res.data.pCredits);
      }

      setActiveChallenge(res.data.challenge);
      setOpponent(res.data.opponent);
      setChallengeWonCelebration(null);

      // Auto-pick strictly from eligible cars for this challenge
      const eligibleCars = usableCarCards.filter(
        (c) => isCarEligibleForChallenge(c, challenge).eligible
      );
      if (eligibleCars.length < 3) {
        alert(
          `You need at least 3 qualifying ${challenge.allowedRarity !== "any" ? challenge.allowedRarity.toUpperCase() : ""} cars in your garage to enter this challenge. (${eligibleCars.length}/3 available)`
        );
        setChallengeLoading(false);
        return;
      }
      setSelectedCarIds(pickTopThreeIds(eligibleCars));
      setSelectedCrewIds(pickTopThreeIds(usableCrewCards));

      setLoadoutSection("cars");
      setPickerModalTarget(null);
      setBattleBanner(null);
      setCornerResults([]);
      setPlayedCrewIndices([]);
      setPlayerCrewAssignments([null, null, null]);
      setRivalCrewAssignments([null, null, null]);
      setPlayerCarAssignments([null, null, null]);
      setRivalCarAssignments([null, null, null]);
      setPreviewCarSlot(null);
      setPlayerCarOrder([0, 1, 2]);
      setRivalCarOrder([0, 1, 2]);
      handleStartTrackRoulette(res.data.challenge);
    } catch (err) {
      console.error("handleLaunchChallenge error:", err);
      alert("Error entering challenge cup.");
    } finally {
      setChallengeLoading(false);
    }
  }

  // Drift Campaign: the battle starts as soon as the arena opens, with the campaign's rival and the cars and Crew it was given.
  // Safe to run twice (React dev mode does): the roulette simply restarts.
  useEffect(() => {
    if (!campaign) return;
    clearTimers();
    // This effect starts the battle on opening; there is nothing to derive these from during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveChallenge(null);
    setOpponent(campaign.opponent);
    setSelectedCarIds(pickTopThreeIds(usableCarCards));
    setSelectedCrewIds(pickTopThreeIds(usableCrewCards));
    setLoadoutSection("cars");
    setBattleBanner(null);
    handleStartTrackRoulette(null);
    // Only on opening: the campaign gives a fresh arena (a new key) for each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRequestReplayChallenge(challenge: TandemClashChallenge) {
    if (challenge.entryCostPCredits > 0) {
      setChallengeReplayConfirm(challenge);
    } else {
      handleLaunchChallenge(challenge);
    }
  }

  // Launch Step 1: Randomise UK Track Card Roulette + Matchmaking
  function handleStartTrackRoulette(challengeOverride?: TandemClashChallenge | null) {
    const effectiveChallenge = challengeOverride !== undefined ? challengeOverride : activeChallenge;
    clearTimers();
    setPickerModalTarget(null);
    setTrackLockedIn(false);
    setCornerResults([]);
    setPlayedCrewIndices([]);
    setPlayerCrewAssignments([null, null, null]);
    setRivalCrewAssignments([null, null, null]);
    setPlayerCarAssignments([null, null, null]);
    setRivalCarAssignments([null, null, null]);
    setPreviewCarSlot(null);
    setPlayerCarOrder([0, 1, 2]);
    setRivalCarOrder([0, 1, 2]);
    setPhase("track_roulette");

    const tracks = trackCatalogDefs.length > 0 ? trackCatalogDefs : UK_TRACK_CARD_SET;
    const chosenTrack = rollUkTrackCard(tracks, Math.random, hazardSamplesRef.current);
    refreshHazardSamples();
    const chosenIdx = tracks.findIndex((t) => t.id === chosenTrack.id);
    const finalTrackIdx = chosenIdx >= 0 ? chosenIdx : 0;
    const startOffset = Math.floor(Math.random() * tracks.length);

    const rolledSectors = rollThreeClashSectors();
    setActiveSectors(rolledSectors);
    // Debuffs are played corner by corner, not rolled up front.
    setDebuffsOnPlayer(noDebuffs());
    setDebuffsOnRival(noDebuffs());
    setDebuffHand([]);
    setRivalDebuffHand([]);
    setDebuffPickIdx(null);
    setRivalCrewOrder([0, 1, 2]);

    // Animate roulette cycling through UK tracks with realistic slot deceleration
    // Intervals start fast (60ms) and gradually slow down (up to 380ms) over ~2.3 seconds
    const tickIntervals = [
      60, 60, 65, 70, 75, 85, 95, 110, 130, 155, 185, 220, 265, 315, 380
    ];
    let cumulativeDelay = 0;

    tickIntervals.forEach((interval, step) => {
      cumulativeDelay += interval;
      const isLast = step === tickIntervals.length - 1;
      const t = setTimeout(() => {
        if (isLast) {
          setRouletteTrackIdx(finalTrackIdx);
        } else {
          setRouletteTrackIdx((startOffset + step) % tracks.length);
        }
      }, cumulativeDelay);
      timersRef.current.push(t);
    });

    const totalSpinTime = cumulativeDelay + 250;

    startTransition(async () => {
      // In challenge cups, the opponent is strictly configured for the cup spec; only casual lobby randomizes rival
      // The campaign also brings its own rival, so it never asks for a random one.
      const oppPromise = !effectiveChallenge && !campaign ? findNewClashOpponentAction().catch(() => null) : null;
      await new Promise((r) => setTimeout(r, totalSpinTime));
      if (oppPromise) {
        const oppRes = await oppPromise;
        if (oppRes && oppRes.success) {
          setOpponent(oppRes.data);
        }
      }
      setActiveTrackDef(chosenTrack);
      // Now the track is known, start the lineup with the best cars and Crew for it. The corners and debuffs stay hidden, so the pick doesn't use them.
      const matchContext: LineupContext = { track: chosenTrack, crewDefs: crewCatalogDefs };
      const carPool = effectiveChallenge
        ? usableCarCards.filter((c) => isCarEligibleForChallenge(c, effectiveChallenge).eligible)
        : usableCarCards;
      const bestCarIds = pickBestCarIds(carPool, matchContext);
      if (bestCarIds) {
        setSelectedCarIds(bestCarIds);
        const bestCars = bestCarIds.map((id) => carPool.find((c) => c.id === id)).filter((c): c is MemberCard => Boolean(c));
        const bestCrewIds = pickBestCrewIds(usableCrewCards, bestCars, matchContext);
        if (bestCrewIds) setSelectedCrewIds(bestCrewIds);
      }
      setTrackLockedIn(true);
    });
  }

  // Step 2 -> Step 3: Validate and start corner battles
  function handleStartBattleFromLineup() {
    if (activeChallenge) {
      const ineligible = selectedCarCards.filter(
        (c) => !isCarEligibleForChallenge(c, activeChallenge).eligible
      );
      if (ineligible.length > 0) {
        alert(
          `Cannot start challenge match: ${ineligible.length} of your equipped cars do not meet the challenge restrictions (${activeChallenge.allowedRarity !== "any" ? activeChallenge.allowedRarity.toUpperCase() + " only" : ""}).`
        );
        return;
      }
    }
    // The rival studies the track, the corner types, its own debuffs and your lineup, then brings the cars
    // and Crew cards that suit them and decides which goes on which corner.
    const pool = opponent.carPool && opponent.carPool.length >= 3 ? opponent.carPool : opponent.cards;
    const crewPool =
      opponent.crewPoolSpecs && opponent.crewPoolSpecs.length >= 3
        ? crewCardsFromSpecs(opponent.crewPoolSpecs, crewCatalogDefs)
        : [...rivalCrewCards];
    if (pool.length >= 3 && crewPool.length >= 3) {
      const arranged = arrangeRival({
        cars: pool,
        crew: crewPool,
        ctx: rivalContext(),
        playerCars: selectedCarCards,
        skill: opponent.aiSkill ?? CASUAL_AI_SKILL,
        rng: Math.random,
      });
      setOpponent((prev) => ({ ...prev, cards: arranged.cars, crewCards: arranged.crew, crewCard: arranged.crew[0] }));
    }
    startCornerBattle(0);
  }

  /** What the rival knows about this battle: the track, the corner types, and its own debuffs. */
  function rivalContext(): RivalContext {
    return { track: activeTrackDef, sectors: activeSectors, rivalDebuffs: debuffsOnRival, crewDefs: crewCatalogDefs };
  }

  // ── STEP 3: ARCADE GAME VIEW CORNER BATTLE ANIMATION ────────────────────────
  function startCornerBattle(cornerIdx: 0 | 1 | 2) {
    clearTimers();
    setPendingFinale(null);
    setFinaleOutcome(null);
    setRivalReveal(0);
    setActiveCornerIdx(cornerIdx);

    // If this corner already has an assigned car, crew and evaluated result (e.g. replaying)
    if (
      playerCarAssignments[cornerIdx] !== null &&
      playerCrewAssignments[cornerIdx] !== null &&
      cornerResults[cornerIdx]
    ) {
      launchCornerBattleAnimation(cornerIdx, true);
      return;
    }

    // Determine available unplayed cars from the player's 3 loadout slots
    const alreadyDeployed = playerCarAssignments.slice(0, cornerIdx).filter((x): x is 0 | 1 | 2 => x !== null);
    const availableCars = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
      (idx) => !alreadyDeployed.includes(idx)
    );

    // When only 1 car is left (Corner 3) -> AUTO-SELECT!
    if (availableCars.length === 1) {
      handleDeployCar(availableCars[0], cornerIdx);
      return;
    }

    // For Corner 1 (3 cars available) or Corner 2 (2 cars available) -> prompt car selection!
    setPreviewCarSlot(availableCars[0]);
    setPhase("car_select");
  }

  function handleDeployCar(chosenCarSlot: 0 | 1 | 2, targetCornerIdx: 0 | 1 | 2 = activeCornerIdx) {
    clearTimers();
    const cornerIdx = targetCornerIdx;

    // 1. Assign player car for this corner
    const nextPlayerCars = [...playerCarAssignments];
    nextPlayerCars[cornerIdx] = chosenCarSlot;
    setPlayerCarAssignments(nextPlayerCars);

    const nextPlayerOrder = [...playerCarOrder];
    nextPlayerOrder[cornerIdx] = chosenCarSlot;
    setPlayerCarOrder(nextPlayerOrder as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]);

    // 2. Auto-pick rival car from rival's unused cars
    const alreadyDeployedRival = rivalCarAssignments.slice(0, cornerIdx).filter((x): x is 0 | 1 | 2 => x !== null);
    const remainingRivalCars = ([0, 1, 2] as const).filter(
      (idx) => !alreadyDeployedRival.includes(idx)
    );
    const rivalChosen = remainingRivalCars[0] ?? 0;
    const nextRivalCars = [...rivalCarAssignments];
    nextRivalCars[cornerIdx] = rivalChosen;
    setRivalCarAssignments(nextRivalCars);

    const nextRivalOrder = [...rivalCarOrder];
    nextRivalOrder[cornerIdx] = rivalChosen;
    setRivalCarOrder(nextRivalOrder as [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]);

    // 3. Launch corner battle!
    launchCornerBattleAnimation(cornerIdx, false);
  }

  function launchCornerBattleAnimation(cornerIdx: 0 | 1 | 2, isReplay = false) {
    clearTimers();
    setActiveCornerIdx(cornerIdx);
    setPhase("corner_battle");

    if (isReplay) {
      setBattleAnimStep("cards_entrance");
      const t0 = setTimeout(() => setBattleAnimStep("head_to_head"), 1000);
      const t1 = setTimeout(() => setBattleAnimStep("battle_initial"), 2000);
      const t2 = setTimeout(() => setBattleAnimStep("debuff_overlay"), 4500);
      const t3 = setTimeout(() => setBattleAnimStep("battle_shake_1"), 5900);
      const t4 = setTimeout(() => setBattleAnimStep("crew_overlay"), 7500);
      // The finale is not replayed; the clash and the reveal are.
      scheduleClashReveal(7500 + CREW_DEPLOYED_MS);
      timersRef.current.push(t0, t1, t2, t3, t4);
      return;
    }

    // 1. Cards Entrance: 0ms (Card pops in on left, rival on right)
    setBattleAnimStep("cards_entrance");

    // 2. Head-to-Head: 1000ms (Both cards slide in head-to-head)
    const t0 = setTimeout(() => {
      setBattleAnimStep("head_to_head");
    }, 1000);

    // 3. Initial Tandem Battle: 2000ms (Cars engage, trade door paint, clash shake for a few seconds!)
    const t1 = setTimeout(() => {
      setBattleAnimStep("battle_initial");
    }, 2000);

    // 4. After the cars have clashed for a few seconds (4800ms) a random track hazard pops up and the battle pauses.
    // Each side is dealt 3 debuff cards; once the player clicks continue they pick the one to play on the rival's car,
    // before calling their crew.
    const t2 = setTimeout(() => {
      dealDebuffHands();
      setHazardScenario(pickHazardScenario());
      setBattleAnimStep("hazard_incident");
    }, 4800);

    timersRef.current.push(t0, t1, t2);
  }

  /** Deal 3 debuff cards to each side for the corner being played. */
  function dealDebuffHands(): { mine: DebuffCardDefinition[]; theirs: DebuffCardDefinition[] } {
    const pool = debuffCatalogDefs.length >= 3 ? debuffCatalogDefs : DEBUFF_CARD_SET;
    const mine = rollThreeDebuffCards(pool);
    const theirs = rollThreeDebuffCards(pool);
    setDebuffHand(mine);
    setRivalDebuffHand(theirs);
    setDebuffPickIdx(null);
    return { mine, theirs };
  }
  /** The two cars on a corner. */
  function carsForCorner(cornerIdx: 0 | 1 | 2) {
    const playerCar = selectedCarCards[playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0];
    const rivalCar = opponent.cards[rivalCarAssignments[cornerIdx] ?? rivalCarOrder[cornerIdx] ?? 0] ?? opponent.cards[0];
    return { playerCar, rivalCar };
  }
  /** Which card in a hand hurts the rival's car most on this corner (used when the player skips the pick). */
  function bestDebuffIndex(hand: DebuffCardDefinition[], cornerIdx: 0 | 1 | 2): number {
    if (hand.length <= 1) return 0;
    const { playerCar, rivalCar } = carsForCorner(cornerIdx);
    const margin = hand.map((debuff) => {
      const r = evaluateCornerMatchup({
        cornerIdx,
        sector: activeSectors[cornerIdx],
        playerCard: playerCar,
        rivalCard: rivalCar,
        playerCrewCard: null,
        rivalCrewCard: null,
        playerDebuffCard: NEUTRAL_DEBUFF,
        rivalDebuffCard: debuff,
        trackCard: activeTrackDef,
        crewPool: crewCatalogDefs,
      });
      return r.playerScore - r.rivalScore;
    });
    return margin.indexOf(Math.max(...margin));
  }
  /**
   * Lock in a corner's debuffs: the player's pick goes on the rival's car and the AI's pick (made at the same time,
   * without seeing the player's) goes on the player's car.
   */
  function playDebuffs(
    cornerIdx: 0 | 1 | 2,
    mineHand: DebuffCardDefinition[],
    theirsHand: DebuffCardDefinition[],
    pickIdx: number
  ): { onPlayer: DebuffCardDefinition; onRival: DebuffCardDefinition } {
    const { playerCar, rivalCar } = carsForCorner(cornerIdx);
    const onRival = mineHand[pickIdx] ?? mineHand[0] ?? NEUTRAL_DEBUFF;
    const aiIdx = chooseRivalDebuff({
      cornerIdx,
      ctx: rivalContext(),
      rivalCar,
      playerCar,
      hand: theirsHand,
      skill: opponent.aiSkill ?? CASUAL_AI_SKILL,
      rng: Math.random,
    });
    const onPlayer = theirsHand[aiIdx] ?? theirsHand[0] ?? NEUTRAL_DEBUFF;
    setDebuffsOnRival((prev) => {
      const next = [...prev] as DebuffTrio;
      next[cornerIdx] = onRival;
      return next;
    });
    setDebuffsOnPlayer((prev) => {
      const next = [...prev] as DebuffTrio;
      next[cornerIdx] = onPlayer;
      return next;
    });
    return { onPlayer, onRival };
  }
  function handleConfirmDebuffPick(pickIdx: number) {
    playDebuffs(activeCornerIdx, debuffHand, rivalDebuffHand, pickIdx);
    handleContinueFromDebuff();
  }
  function handleContinueFromDebuff() {
    clearTimers();
    // 1. Debuffs hit the cars & display incoming penalties!
    setBattleAnimStep("debuff_overlay");

    // 2. Hazard impact battle clash shake
    const t1 = setTimeout(() => {
      setBattleAnimStep("battle_shake_1");
    }, 1400);

    // 3. Pit Crew response: Now prompt crew cards so player can strategically counter the hazard!
    const t2 = setTimeout(() => {
      const alreadyPlayedCrew = playerCrewAssignments
        .slice(0, activeCornerIdx)
        .filter((x): x is number => x !== null);
      const available = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
        (idx) => !alreadyPlayedCrew.includes(idx) && !playedCrewIndices.includes(idx)
      );
      setPreviewCrewIdx(available[0] ?? 0);
      setBattleAnimStep("prompt_crew");
    }, 3200);

    timersRef.current.push(t1, t2);
  }

  function handleApplyCrewAndResumeBattle(
    chosenCrewIdx: number,
    targetCornerIdx?: 0 | 1 | 2,
    playedNow?: { onPlayer: DebuffCardDefinition; onRival: DebuffCardDefinition },
    /** Skipping: settle the finale with default picks instead of asking the player. */
    autoFinale = false
  ) {
    clearTimers();
    const cornerIdx = targetCornerIdx !== undefined ? targetCornerIdx : activeCornerIdx;
    setActiveCornerIdx(cornerIdx);

    // 1. Record player assignment
    const nextPlayerAssignments = [...playerCrewAssignments];
    nextPlayerAssignments[cornerIdx] = chosenCrewIdx;
    setPlayerCrewAssignments(nextPlayerAssignments);

    // 2. Auto-pick rival crew from unused rival crew cards
    const usedRivalCrew = rivalCrewAssignments.filter((x): x is number => x !== null);
    const playerCarForCorner = selectedCarCards[playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0];
    const rivalCarsInOrder = [0, 1, 2].map(
      (k) => opponent.cards[rivalCarAssignments[k] ?? k] ?? opponent.cards[k] ?? opponent.cards[0]
    ) as Trio<MemberCard>;
    const debuffOnPlayer = playedNow?.onPlayer ?? debuffsOnPlayer[cornerIdx];
    const debuffOnRival = playedNow?.onRival ?? debuffsOnRival[cornerIdx];
    const crewCtx: RivalContext = playedNow
      ? { ...rivalContext(), rivalDebuffs: debuffsOnRival.map((d, i) => (i === cornerIdx ? debuffOnRival : d)) }
      : rivalContext();
    const rivalChosenIdx = chooseRivalCrew({
      cornerIdx,
      ctx: crewCtx,
      cars: rivalCarsInOrder,
      crew: rivalCrewCards,
      usedCrew: usedRivalCrew,
      playerCar: playerCarForCorner,
      playerDebuff: debuffOnPlayer,
      playerCars: selectedCarCards,
      skill: opponent.aiSkill ?? CASUAL_AI_SKILL,
      rng: Math.random,
    });
    const nextRivalAssignments = [...rivalCrewAssignments];
    nextRivalAssignments[cornerIdx] = rivalChosenIdx;
    setRivalCrewAssignments(nextRivalAssignments);

    // 3. Resolve cards and evaluate
    const playerCarSlot = playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0;
    const rivalCarSlot = rivalCarAssignments[cornerIdx] ?? rivalCarOrder[cornerIdx] ?? 0;
    const playerCar = selectedCarCards[playerCarSlot];
    const rivalCar = opponent.cards[rivalCarSlot] ?? opponent.cards[0];
    const playerCrew = selectedCrewCards[chosenCrewIdx];
    const rivalCrew = rivalCrewCards[rivalChosenIdx];
    const playerDebuffDef = debuffOnPlayer;
    const rivalDebuffDef = debuffOnRival;

    const result = evaluateCornerMatchup({
      cornerIdx,
      sector: activeSectors[cornerIdx],
      playerCard: playerCar,
      rivalCard: rivalCar,
      playerCrewCard: playerCrew,
      rivalCrewCard: rivalCrew,
      playerDebuffCard: playerDebuffDef,
      rivalDebuffCard: rivalDebuffDef,
      trackCard: activeTrackDef,
      crewPool: crewCatalogDefs,
    });

    setPlayedCrewIndices((prev) => [...prev, chosenCrewIdx as 0 | 1 | 2]);

    // 4. The FINALE: a random last game that can still swing the corner. The corner is only judged once it is done.
    const mode = rollFinaleMode();
    const weights = rollAllocationWeights();
    if (autoFinale) {
      completeFinale(cornerIdx, result, mode, null, true, weights);
      return;
    }
    setPendingFinale({ cornerIdx, mode, base: result, weights });
    // The crew is deployed and the cars slam together in the middle. Only then is the game for the finale drawn.
    setBattleAnimStep("finale_clash");
    const toRoulette = setTimeout(() => setBattleAnimStep("finale_roulette"), FINALE_CLASH_MS);
    timersRef.current.push(toRoulette);
  }

  /**
   * The clash and the reveal, from the moment the finale is settled: the cars clash, then the rival car's stats
   * appear one by one, then both corner totals, then the winner. `offset` delays the whole thing (used by the replay).
   */
  function scheduleClashReveal(offset = 0) {
    const at = (ms: number, fn: () => void) => timersRef.current.push(setTimeout(fn, offset + ms));
    at(0, () => {
      setRivalReveal(0);
      setBattleAnimStep("battle_shake_2");
    });
    at(CLASH_MS, () => {
      setRivalReveal(0);
      setBattleAnimStep("reveal_stats");
    });
    for (let level = 1; level <= 4; level++) {
      at(CLASH_MS + REVEAL_LEAD_MS + (level - 1) * REVEAL_STAT_MS, () => setRivalReveal(level));
    }
    const totalsAt = CLASH_MS + REVEAL_LEAD_MS + 4 * REVEAL_STAT_MS;
    at(totalsAt, () => setRivalReveal(5));
    at(totalsAt + REVEAL_TOTALS_MS, () => setBattleAnimStep("knockout_and_winner"));
    at(totalsAt + REVEAL_TOTALS_MS + WINNER_MS, () => setBattleAnimStep("corner_finished"));
  }

  /**
   * Settle the finale: the rival makes its pick (without seeing the player's), both picks are resolved, and the points
   * are added to the corner. Then the stats are revealed and the clash plays out. `instant` stores the result and stops.
   */
  function completeFinale(
    cornerIdx: 0 | 1 | 2,
    base: EvaluatedCornerResult,
    mode: FinaleMode,
    playerChoice: FinaleChoice | null,
    instant = false,
    weights: FinaleWeights = DEFAULT_ALLOCATION_WEIGHTS
  ) {
    clearTimers();
    let result = base;
    let finished: FinaleOutcome | null = null;
    const playerStats = base.playerFinalStats;
    const rivalStats = base.rivalFinalStats;
    if (playerStats && rivalStats) {
      const rivalChoice = chooseRivalFinale({
        mode,
        rivalStats,
        playerStats,
        skill: opponent.aiSkill ?? CASUAL_AI_SKILL,
        weights,
        rng: Math.random,
      });
      finished = resolveFinale({
        playerStats,
        rivalStats,
        playerChoice: playerChoice ?? defaultPlayerChoice(mode, playerStats, weights),
        rivalChoice,
      });
      result = applyFinaleToResult(base, finished);
    }
    setPendingFinale(null);
    setCornerResults((prev) => {
      const next = [...prev];
      next[cornerIdx] = result;
      return next;
    });
    if (instant) return;

    // 5. The comparison is shown and the points count up. Then the clash plays, the rival's stats are revealed one
    // by one, then the totals, then the winner.
    if (finished) {
      setFinaleOutcome({ cornerIdx, outcome: finished });
      setBattleAnimStep("finale_result");
    } else {
      scheduleClashReveal();
    }
  }

  function handleSkipBattleAnimation() {
    clearTimers();
    // Skipping the debuff pick plays the debuff that hurts the rival's car most, then carries on to the crew.
    if (battleAnimStep === "prompt_debuff" || battleAnimStep === "hazard_incident") {
      handleConfirmDebuffPick(debuffPickIdx ?? bestDebuffIndex(debuffHand, activeCornerIdx));
      return;
    }
    // Skipping the finale settles it with default picks (your best stat, an even setup, a middling run).
    if (
      pendingFinale &&
      (battleAnimStep === "crew_overlay" ||
        battleAnimStep === "finale_clash" ||
        battleAnimStep === "finale_roulette" ||
        battleAnimStep === "prompt_finale")
    ) {
      completeFinale(pendingFinale.cornerIdx, pendingFinale.base, pendingFinale.mode, null, true, pendingFinale.weights);
      setBattleAnimStep("corner_finished");
      return;
    }
    const cornerIdx = activeCornerIdx;
    if (!cornerResults[cornerIdx]) {
      const alreadyPlayedCrew = playerCrewAssignments
        .slice(0, cornerIdx)
        .filter((x): x is number => x !== null);
      const available = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
        (idx) => !alreadyPlayedCrew.includes(idx) && !playedCrewIndices.includes(idx)
      );
      const chosenCrew = previewCrewIdx ?? available[0] ?? 0;
      // Skipped before any debuff was played: deal and play them now so the corner still has its debuffs.
      let playedNow: { onPlayer: DebuffCardDefinition; onRival: DebuffCardDefinition } | undefined;
      if (isNoDebuff(debuffsOnRival[cornerIdx]) && isNoDebuff(debuffsOnPlayer[cornerIdx])) {
        const { mine, theirs } = dealDebuffHands();
        playedNow = playDebuffs(cornerIdx, mine, theirs, bestDebuffIndex(mine, cornerIdx));
      }
      handleApplyCrewAndResumeBattle(chosenCrew, cornerIdx, playedNow, true);
    }
    setBattleAnimStep("corner_finished");
  }

  function handleNextCornerOrVerdict() {
    clearTimers();
    if (activeCornerIdx < 2) {
      startCornerBattle((activeCornerIdx + 1) as 0 | 1 | 2);
    } else {
      finishBattleAndShowVerdict();
    }
  }

  function finishBattleAndShowVerdict(passedResults?: EvaluatedCornerResult[]) {
    clearTimers();
    const baseResults = passedResults ?? cornerResults;
    const allThreeResults: EvaluatedCornerResult[] = [0, 1, 2].map((idx) => {
      const cornerIdx = idx as 0 | 1 | 2;
      if (baseResults[cornerIdx]) {
        return baseResults[cornerIdx];
      }
      const playerCarSlot = playerCarAssignments[cornerIdx] ?? playerCarOrder[cornerIdx] ?? 0;
      const rivalCarSlot = rivalCarAssignments[cornerIdx] ?? rivalCarOrder[cornerIdx] ?? 0;
      const playerCrewSlot = playerCrewAssignments[cornerIdx] ?? idx;
      const rivalCrewSlot = rivalCrewAssignments[cornerIdx] ?? rivalCrewOrder[cornerIdx] ?? idx;

      const pCar = selectedCarCards[playerCarSlot];
      const rCar = opponent.cards[rivalCarSlot] ?? opponent.cards[0];
      const pCrew = selectedCrewCards[playerCrewSlot];
      const rCrew = rivalCrewCards[rivalCrewSlot];
      const pDebuff = debuffsOnPlayer[cornerIdx];
      const rDebuff = debuffsOnRival[cornerIdx];

      return evaluateCornerMatchup({
        cornerIdx,
        sector: activeSectors[cornerIdx],
        playerCard: pCar,
        rivalCard: rCar,
        playerCrewCard: pCrew,
        rivalCrewCard: rCrew,
        playerDebuffCard: pDebuff,
        rivalDebuffCard: rDebuff,
        trackCard: activeTrackDef,
        crewPool: crewCatalogDefs,
      });
    });

    setCornerResults(allThreeResults);

    let playerCorners = 0;
    let opponentCorners = 0;
    let tiedCorners = 0;
    let playerTotalScore = 0;
    let opponentTotalScore = 0;

    for (const r of allThreeResults) {
      if (!r) continue;
      playerTotalScore += r.playerScore;
      opponentTotalScore += r.rivalScore;
      if (r.won) playerCorners++;
      else if (r.tied) tiedCorners++;
      else opponentCorners++;
    }

    const won =
      playerCorners > opponentCorners ||
      (playerCorners === opponentCorners && playerTotalScore >= opponentTotalScore);

    setBattleBanner({
      won,
      playerCorners,
      opponentCorners,
      tiedCorners,
      rewardGranted: 0,
      streakBonusGranted: 0,
    });
    setPhase("verdict");

    // Drift Campaign: the cup records the result. No P-Credits, streaks or car wear for these battles.
    if (campaign) {
      campaign.onResult({ won, playerCorners, opponentCorners });
      return;
    }

    startTransition(async () => {
      if (activeChallenge) {
        const res = await completeChallengeBattleAction({
          challengeId: activeChallenge.id,
          won,
          playedCarCardIds: selectedCarIds,
        });
        if (res.success) {
          setClashStats(res.data.stats);
          setBattleBanner({
            won,
            playerCorners,
            opponentCorners,
            tiedCorners,
            rewardGranted: res.data.rewardGranted,
            streakBonusGranted: 0,
          });
          setChallengeWonCelebration({
            challengeTitle: activeChallenge.title,
            rewardGranted: res.data.rewardGranted,
            challengeCompleted: res.data.challengeCompleted,
          });
          if (res.data.challengeCompleted) {
            setCompletedChallengeIds((prev) =>
              prev.includes(activeChallenge.id) ? prev : [...prev, activeChallenge.id]
            );
          }
          setPitReport(res.data.faultEvents ?? []);
          setInternalPCredits(res.data.pCredits);
          onPCreditsChange?.(res.data.pCredits);
          onStatsChange?.(res.data.stats);
          onRewardEarned?.(res.data.pCredits, res.data.stats);

          // Update car durability immediately in state
          if (res.data.updatedCars && res.data.updatedCars.length > 0) {
            const updateMap = new Map(res.data.updatedCars.map((c) => [c.id, c]));
            setLocalCards((prev) => {
              const next = prev.map((c) => updateMap.get(c.id) ?? c);
              onCardsChange?.(next);
              return next;
            });
          } else if (selectedCarIds && selectedCarIds.length > 0) {
            const playedSet = new Set(selectedCarIds.filter((id) => !id.startsWith("loaner-")));
            setLocalCards((prev) => {
              const next = prev.map((c) => {
                if (!playedSet.has(c.id)) return c;
                const cur = c.battlesRemaining ?? c.maxBattles ?? 6;
                return { ...c, battlesRemaining: Math.max(0, cur - 1) };
              });
              onCardsChange?.(next);
              return next;
            });
          }
        }
      } else {
        const res = await completeClashBattleAction({
          won,
          playedCarCardIds: selectedCarIds,
        });
        if (res.success) {
          setClashStats(res.data.stats);
          setBattleBanner({
            won,
            playerCorners,
            opponentCorners,
            tiedCorners,
            rewardGranted: res.data.rewardGranted,
            streakBonusGranted: res.data.streakBonusGranted,
          });
          setPitReport(res.data.faultEvents ?? []);
          setInternalPCredits(res.data.pCredits);
          onPCreditsChange?.(res.data.pCredits);
          onStatsChange?.(res.data.stats);
          onRewardEarned?.(res.data.pCredits, res.data.stats);

          // Update car durability immediately in state
          if (res.data.updatedCars && res.data.updatedCars.length > 0) {
            const updateMap = new Map(res.data.updatedCars.map((c) => [c.id, c]));
            setLocalCards((prev) => {
              const next = prev.map((c) => updateMap.get(c.id) ?? c);
              onCardsChange?.(next);
              return next;
            });
          } else if (selectedCarIds && selectedCarIds.length > 0) {
            const playedSet = new Set(selectedCarIds.filter((id) => !id.startsWith("loaner-")));
            setLocalCards((prev) => {
              const next = prev.map((c) => {
                if (!playedSet.has(c.id)) return c;
                const cur = c.battlesRemaining ?? c.maxBattles ?? 6;
                return { ...c, battlesRemaining: Math.max(0, cur - 1) };
              });
              onCardsChange?.(next);
              return next;
            });
          }
        }
      }
    });
  }

  const runningScore = useMemo(() => {
    let you = 0;
    let rival = 0;
    const count =
      phase === "verdict"
        ? 3
        : phase === "corner_battle"
          ? activeCornerIdx + (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished" ? 1 : 0)
          : 0;
    for (let i = 0; i < count; i++) {
      const r = cornerResults[i];
      if (!r) continue;
      if (r.won) you++;
      else if (!r.tied) rival++;
    }
    return { you, rival };
  }, [phase, activeCornerIdx, battleAnimStep, cornerResults]);

  // Remaining unplayed Crew Card slot indices (0, 1, 2)
  const remainingCrewSlotIndices = useMemo(() => {
    return ([0, 1, 2] as Array<0 | 1 | 2>).filter(
      (idx) => !playedCrewIndices.includes(idx)
    );
  }, [playedCrewIndices]);

  // Remaining unplayed Car Card indices at the start of activeCornerIdx
  const remainingPlayerCarIndicesForCorner = useMemo(() => {
    return playerCarOrder.slice(activeCornerIdx);
  }, [playerCarOrder, activeCornerIdx]);

  const remainingRivalCarIndicesForCorner = useMemo(() => {
    return rivalCarOrder.slice(activeCornerIdx);
  }, [rivalCarOrder, activeCornerIdx]);

  // ── LOBBY VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {campaign ? (
        // The campaign opens straight into the battle; this only shows for a moment, or if the stage is closed.
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm font-bold text-zinc-300" role="status">
          Setting up the battle…
        </p>
      ) : arenaLobbyTab === "challenges" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2">
            <button
              type="button"
              onClick={() => setArenaLobbyTab("quick")}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-black uppercase tracking-wider text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              <span aria-hidden>←</span> Back
            </button>
            <span className="pr-2 text-xs font-black uppercase tracking-wider text-purple-300">🏆 Challenges</span>
          </div>
          <ClashChallengesView
            userCards={localCards}
            pCredits={internalPCredits}
            userId={userId}
            isAdmin={isAdmin}
            completedChallengeIds={completedChallengeIds}
            onSelectChallenge={handleLaunchChallenge}
            onPCreditsChange={(bal) => {
              setInternalPCredits(bal);
              onPCreditsChange?.(bal);
            }}
          />
        </div>
      ) : (
        <section
          aria-label="Play Tandem Clash"
          className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-3 text-white shadow-xl sm:rounded-3xl sm:p-4"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-amber-500/15 blur-3xl" aria-hidden />
          <div className="relative z-10 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-black tracking-tight sm:text-lg">Tandem Clash</h2>
              <div className="flex items-center gap-2 text-xs font-black tabular-nums">
                <span className="rounded-lg bg-zinc-900 px-2.5 py-1">
                  <span className="text-emerald-400">{clashStats.wins}W</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-zinc-300">{clashStats.losses}L</span>
                </span>
                {clashStats.streak > 0 && <span className="rounded-lg bg-zinc-900 px-2.5 py-1 text-amber-400">🔥 {clashStats.streak}</span>}
              </div>
            </div>

            {!clashStats.dailyWinClaimed ? (
              <p className="text-xs font-bold text-emerald-300">🎁 +{DAILY_CLASH_WIN_REWARD_PCREDITS} P-Credits for your first win today</p>
            ) : (
              <p className="text-xs font-bold text-zinc-400 tabular-nums">
                ✓ Daily win claimed · +{STREAK_MILESTONE_REWARD_PCREDITS} P every 3-win streak · resets in {utcCountdown}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {hasEarlyAccess ? (
                <button
                  type="button"
                  onClick={handleLaunchGame}
                  className="group flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-3 py-2.5 text-left text-black shadow-[0_0_18px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide sm:text-base">
                    <span aria-hidden>🎮</span> Normal game
                  </span>
                  <span className="text-[11px] font-bold leading-tight text-black/70">Pick 3 cars, battle a rival</span>
                </button>
              ) : (
                <div className="flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border border-amber-500/40 bg-zinc-900/90 px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-zinc-400 sm:text-base">
                    <span aria-hidden>🔒</span> Normal game
                  </span>
                  <span className="text-[11px] font-bold leading-tight text-zinc-400">Early access needed</span>
                  {userId && (
                    <span className="break-all text-[10px] leading-tight text-zinc-400">
                      Driver ID: <span className="select-all font-mono font-black text-amber-400">{userId}</span>
                    </span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setArenaLobbyTab("challenges")}
                className="group flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-3 py-2.5 text-left text-white shadow-[0_0_18px_rgba(168,85,247,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide sm:text-base">
                  <span aria-hidden>🏆</span> Challenge
                </span>
                <span className="text-[11px] font-bold leading-tight tabular-nums text-white/80">Cups · resets {utcCountdown}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-zinc-800 pt-2 text-[11px] font-bold text-zinc-400">
              <button type="button" onClick={() => openHowToPlay("quickstart")} className="hover:text-amber-300">
                📖 How to play
              </button>
              <button type="button" onClick={() => setShowCatalogModal("crew")} className="hover:text-cyan-300">
                ⚡ Crew cards ({crewCatalogDefs.length})
              </button>
              <button type="button" onClick={() => setShowCatalogModal("debuff")} className="hover:text-rose-300">
                ⚠️ Debuffs ({debuffCatalogDefs.length})
              </button>
              <button type="button" onClick={() => setShowCatalogModal("track")} className="hover:text-emerald-300">
                🇬🇧 Tracks ({trackCatalogDefs.length})
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowEarlyAccessModal(true);
                    if (earlyAccessRoster.length === 0) loadEarlyAccessRoster();
                  }}
                  className="hover:text-purple-300"
                >
                  🔒 Early access roster
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Catalog Modal for Crew, Debuff, or UK Track Cards */}
      {showCatalogModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Clash Cards Set Catalog"
          >
            <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-3xl sm:border sm:border-amber-500/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3.5 sm:px-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {showCatalogModal === "crew"
                      ? `100% Positive Advantages · Pullable in Standard Packs (${ownedCrewCards.length} Owned)`
                      : showCatalogModal === "debuff"
                        ? "Random Corner Hazards Applied to Both Drivers"
                        : "Automated UK RC Drift Venues (Buff + Debuff)"}
                  </span>
                  <h3 className="text-base font-black sm:text-lg">
                    {showCatalogModal === "crew"
                      ? `⚡ Crew Advantage Cards (${crewCatalogDefs.length})`
                      : showCatalogModal === "debuff"
                        ? `⚠️ Random Debuff Cards (${debuffCatalogDefs.length})`
                        : `🇬🇧 UK Drift Track Cards (${trackCatalogDefs.length})`}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("crew")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "crew"
                        ? "bg-cyan-500 text-black"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    ⚡ Crew
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("debuff")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "debuff"
                        ? "bg-rose-500 text-white"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Debuffs
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal("track")}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-black ${
                      showCatalogModal === "track"
                        ? "bg-emerald-500 text-black"
                        : "bg-zinc-900 text-zinc-400 hover:text-white"
                    }`}
                  >
                    🇬🇧 Tracks
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(null)}
                    className="ml-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {showCatalogModal === "crew" && (
                  <div className="space-y-4">
                    {/* Rarity Variation Stepper Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mr-1">
                          Rarity Variation:
                        </span>
                        {(["bronze", "silver", "gold", "legend"] as const).map((tier) => {
                          const isActive = catalogTierTab === tier;
                          const tabTheme =
                            tier === "bronze"
                              ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
                              : tier === "silver"
                                ? "border-slate-400/60 bg-slate-800/40 text-slate-200"
                                : tier === "gold"
                                  ? "border-amber-400/70 bg-amber-500/20 text-amber-300"
                                  : "border-purple-400/70 bg-purple-950/40 text-purple-300";
                          const oddsText =
                            tier === "bronze"
                              ? "Standard (72.5%)"
                              : tier === "silver"
                                ? "1 in 5 (20%)"
                                : tier === "gold"
                                  ? "1 in 20 (5%)"
                                  : "1 in 40 (2.5%)";
                          const icon =
                            tier === "bronze" ? "🥉" : tier === "silver" ? "🥈" : tier === "gold" ? "🥇" : "👑";

                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setCatalogTierTab(tier)}
                              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition-all ${
                                isActive
                                  ? `${tabTheme} ring-2 ring-amber-400 shadow-md scale-105`
                                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                              }`}
                            >
                              <span>{icon}</span>
                              <span>{tier}</span>
                              <span className="hidden sm:inline text-[9px] font-bold text-zinc-400">
                                ({oddsText})
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-black text-amber-400">
                        <span>⚡ Scaled Advantages:</span>
                        <span className="text-zinc-300 font-bold">
                          {catalogTierTab === "bronze"
                            ? "+1 stats · +1-2 pts · 25% Shield"
                            : catalogTierTab === "silver"
                              ? "+2 stats · +2-3 pts · 50% Shield"
                              : catalogTierTab === "gold"
                                ? "+3 stats · +4-5 pts · 75% Shield"
                                : "+4 stats · +6-8 pts · 100% Shield"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {crewCatalogDefs.map((def, idx) => {
                        const scaledDef = scaleCrewCardDefinition(def, catalogTierTab);
                        const ownedCount = ownedCrewCards.filter(
                          (c) => (c.crewCardId === def.id || c.name === def.name) && (c.tier === catalogTierTab)
                        ).length;
                        const totalOwned = ownedCrewCards.filter(
                          (c) => c.crewCardId === def.id || c.name === def.name
                        ).length;
                        const previewCard = catalogCrewMemberCards[idx];
                        const mods = scaledDef.modifiers;
                        return (
                          <div
                            key={def.id}
                            className={`flex flex-col justify-between rounded-2xl border p-2 transition-transform hover:-translate-y-1 ${
                              ownedCount > 0
                                ? "border-cyan-500/60 bg-cyan-950/20"
                                : "border-zinc-800 bg-zinc-900/50 opacity-90"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setViewerState({ list: catalogCrewMemberCards, index: idx })
                              }
                              className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/70"
                              aria-label={`View ${scaledDef.name}`}
                            >
                              <FullArtCard card={previewCard} className="drop-shadow-lg" />
                            </button>

                            {/* Scaled Modifiers Micro-Badges */}
                            <div className="mt-2 flex flex-wrap gap-1 px-1">
                              {mods.driftBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.driftBonus} D
                                </span>
                              ) : null}
                              {mods.accelBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.accelBonus} A
                                </span>
                              ) : null}
                              {mods.gripBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.gripBonus} G
                                </span>
                              ) : null}
                              {mods.steerBonus ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.steerBonus} S
                                </span>
                              ) : null}
                              {mods.boostWeakestStat ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  +{mods.boostWeakestStat} Low
                                </span>
                              ) : null}
                              {mods.minStatFloor ? (
                                <span className="rounded bg-emerald-500/20 border border-emerald-400/50 px-1 py-0.5 text-[8px] font-black text-emerald-300">
                                  Floor {mods.minStatFloor}
                                </span>
                              ) : null}
                              {mods.debuffShield ? (
                                <span className="rounded bg-cyan-500/20 border border-cyan-400/50 px-1 py-0.5 text-[8px] font-black text-cyan-300">
                                  🛡️ {Math.round(mods.debuffShield * 100)}%
                                </span>
                              ) : null}
                              {mods.flatBonus ? (
                                <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1 py-0.5 text-[8px] font-black text-amber-300">
                                  +{mods.flatBonus} Pts
                                </span>
                              ) : null}
                              {mods.underdogBonus ? (
                                <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1 py-0.5 text-[8px] font-black text-amber-300">
                                  +{mods.underdogBonus} Underdog
                                </span>
                              ) : null}
                              {mods.giantSlayerBonus ? (
                                <span className="rounded bg-pink-500/20 border border-pink-400/50 px-1 py-0.5 text-[8px] font-black text-pink-300">
                                  +{mods.giantSlayerBonus} Slayer
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1.5 flex items-center justify-between px-1 text-[11px]">
                              <span className="font-bold text-zinc-400">
                                #{String(def.setNumber).padStart(2, "0")}
                              </span>
                              {ownedCount > 0 ? (
                                <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-black text-black">
                                  Owned ({catalogTierTab}) ×{ownedCount}
                                </span>
                              ) : totalOwned > 0 ? (
                                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                                  Other Tiers ({totalOwned})
                                </span>
                              ) : (
                                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                                  In Packs
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showCatalogModal === "debuff" && (
                  <div className="space-y-4">
                    {/* Debuff Rarity Odds Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mr-1">
                          Hazard Severity:
                        </span>
                        {(["bronze", "silver", "gold", "legend"] as const).map((tier) => {
                          const isActive = catalogTierTab === tier;
                          const tabTheme =
                            tier === "bronze"
                              ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
                              : tier === "silver"
                                ? "border-slate-400/60 bg-slate-800/40 text-slate-200"
                                : tier === "gold"
                                  ? "border-amber-400/70 bg-amber-500/20 text-amber-300"
                                  : "border-purple-400/70 bg-purple-950/40 text-purple-300";
                          const oddsText =
                            tier === "bronze"
                              ? "Standard (72.5%)"
                              : tier === "silver"
                                ? "1 in 5 (20%)"
                                : tier === "gold"
                                  ? "1 in 20 (5%)"
                                  : "1 in 40 (2.5%)";
                          const icon =
                            tier === "bronze" ? "🥉" : tier === "silver" ? "🥈" : tier === "gold" ? "🥇" : "👑";

                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => setCatalogTierTab(tier)}
                              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition-all ${
                                isActive
                                  ? `${tabTheme} ring-2 ring-rose-500 shadow-md scale-105`
                                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700"
                              }`}
                            >
                              <span>{icon}</span>
                              <span>{tier}</span>
                              <span className="hidden sm:inline text-[9px] font-bold text-zinc-400">
                                ({oddsText})
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-black text-rose-400">
                        <span>⚠️ Scaled Penalties:</span>
                        <span className="text-zinc-300 font-bold">
                          {catalogTierTab === "bronze"
                            ? "-1 stat · -1 pt"
                            : catalogTierTab === "silver"
                              ? "-2 stats · -2 pts"
                              : catalogTierTab === "gold"
                                ? "-3 stats · -4 pts"
                                : "-4 stats · -6 pts"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {debuffCatalogDefs.map((def, idx) => {
                        const scaledDef = scaleDebuffCardDefinition(def, catalogTierTab);
                        const previewCard = catalogDebuffMemberCards[idx];
                        const pen = scaledDef.penalties;
                        return (
                          <div
                            key={def.id}
                            className="flex flex-col justify-between rounded-2xl border border-rose-500/40 bg-rose-950/15 p-2 transition-transform hover:-translate-y-1"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setViewerState({ list: catalogDebuffMemberCards, index: idx })
                              }
                              className="block w-full rounded-xl text-left"
                              aria-label={`View ${scaledDef.name}`}
                            >
                              <FullArtCard card={previewCard} className="drop-shadow-lg" />
                            </button>

                            {/* Scaled Penalty Micro-Badges */}
                            <div className="mt-2 flex flex-wrap gap-1 px-1">
                              {pen.driftPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.driftPenalty} DRIFT
                                </span>
                              ) : null}
                              {pen.accelPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.accelPenalty} ACCEL
                                </span>
                              ) : null}
                              {pen.gripPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.gripPenalty} GRIP
                                </span>
                              ) : null}
                              {pen.steerPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.steerPenalty} STEER
                                </span>
                              ) : null}
                              {pen.flatPenalty ? (
                                <span className="rounded bg-rose-500/20 border border-rose-400/50 px-1 py-0.5 text-[8px] font-black text-rose-300">
                                  -{pen.flatPenalty} PTS
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1.5 px-1 text-[10px] font-bold text-rose-300 line-clamp-2">
                              {scaledDef.effect}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showCatalogModal === "track" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {trackCatalogDefs.map((def, idx) => {
                      const previewCard = catalogTrackMemberCards[idx];
                      return (
                        <div
                          key={def.id}
                          className="flex flex-col justify-between rounded-2xl border border-amber-500/40 bg-amber-950/20 p-2 transition-transform hover:-translate-y-1"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setViewerState({ list: catalogTrackMemberCards, index: idx })
                            }
                            className="block w-full rounded-xl text-left"
                            aria-label={`View ${def.name}`}
                          >
                            <FullArtCard card={previewCard} className="drop-shadow-lg" />
                          </button>
                          <div className="mt-2 space-y-1 px-1 text-[10px]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-black text-amber-300">
                              🏆 Gold Venue
                            </span>
                            <p className="line-clamp-2 text-zinc-300">{def.effect}</p>
                            <p className="font-semibold text-emerald-400">
                              🎲 Buff &amp; Hazard rolled on match spin
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Admin Early Access Beta Management Modal */}
      {showEarlyAccessModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-stretch justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Manage Early Access Beta Roster"
            onClick={() => setShowEarlyAccessModal(false)}
          >
            <div
              className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-white sm:h-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-3xl sm:border sm:border-purple-500/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3.5 sm:px-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    Track Admin Control Panel
                  </span>
                  <h3 className="text-base font-black sm:text-lg">
                    🔒 Tandem Clash Early Access Roster
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadEarlyAccessRoster}
                    disabled={loadingEarlyAccessRoster}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {loadingEarlyAccessRoster ? "..." : "↻ Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEarlyAccessModal(false)}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <input
                  type="text"
                  value={earlyAccessSearch}
                  onChange={(e) => setEarlyAccessSearch(e.target.value)}
                  placeholder="Filter drivers by name, email, or user ID..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />

                <div className="divide-y divide-zinc-800">
                  {earlyAccessRoster
                    .filter((m) => {
                      if (!earlyAccessSearch.trim()) return true;
                      const q = earlyAccessSearch.toLowerCase();
                      return (
                        (m.name || "").toLowerCase().includes(q) ||
                        (m.email || "").toLowerCase().includes(q) ||
                        (m.id || "").toLowerCase().includes(q)
                      );
                    })
                    .map((m) => {
                      const isAdminMember = m.role === "admin";
                      const isToggling = togglingEarlyAccessUserId === m.id;
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-zinc-100">
                                {m.name || "Driver"}
                              </span>
                              {isAdminMember && (
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-amber-400">
                                  👑 Admin
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                  m.hasEarlyAccess
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {isAdminMember
                                  ? "Auto Access"
                                  : m.hasEarlyAccess
                                  ? "Granted ✓"
                                  : "Locked 🔒"}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              <span>{m.email}</span> · <span className="font-mono text-zinc-500">ID: {m.id}</span>
                            </div>
                          </div>

                          <div>
                            {isAdminMember ? (
                              <span className="text-[11px] text-zinc-500 italic">Always Active</span>
                            ) : (
                              <button
                                type="button"
                                disabled={isToggling}
                                onClick={() => handleToggleEarlyAccessInArena(m)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                                  m.hasEarlyAccess
                                    ? "border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                    : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:opacity-90 shadow-sm"
                                }`}
                              >
                                {isToggling
                                  ? "..."
                                  : m.hasEarlyAccess
                                  ? "✕ Revoke"
                                  : "⚡ Grant"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── DEDICATED FULL-SCREEN GAME STAGE (PORTAL) ──────────────────────── */}
      {phase !== "lobby" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex h-[100dvh] w-screen flex-col overflow-hidden bg-zinc-950 text-white"
            role="dialog"
            aria-modal="true"
            aria-label="Penthouse Tandem Clash Game Stage"
          >
            {/* Top Game Stage Bar */}
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 bg-black/75 px-4 py-2.5 backdrop-blur-md sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-black">
                  ⚡
                </span>
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {phase === "track_roulette"
                      ? `Step 1 · Randomising UK Drift Track Card`
                      : phase === "lineup"
                        ? `Step 2 · Select 3 Cars & 3 Crew Cards (${activeTrackDef.name})`
                        : phase === "car_select"
                          ? `Step 3 · Corner ${activeCornerIdx + 1} of 3 · Deploy Car Card`
                          : phase === "corner_battle"
                            ? `Step 3 · Corner ${activeCornerIdx + 1} of 3 (${activeTrackDef.name})`
                            : "Final Judge Verdict"}
                  </span>
                  <h2 className="text-xs font-black text-white sm:text-sm">
                    {campaign ? `Drift Campaign · ${campaign.roundLabel}` : "Penthouse Tandem Clash"}
                  </h2>
                </div>
              </div>

              {/* Center Live Scoreboard during Battle/Verdict */}
              {(phase === "car_select" || phase === "corner_battle" || phase === "verdict") && (
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-1">
                  <span className="text-[10px] font-black uppercase text-amber-400">YOU</span>
                  <span className="text-base font-black text-white">{runningScore.you}</span>
                  <span className="text-xs font-bold text-zinc-600">–</span>
                  <span className="text-base font-black text-white">{runningScore.rival}</span>
                  <span className="text-[10px] font-black uppercase text-rose-400">RIVAL</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openHowToPlay("quickstart")}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
                  title="How to Play & Rules Guide"
                >
                  📖 Rules
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearTimers();
                    setPickerModalTarget(null);
                    if (campaign) {
                      campaign.onExit();
                      return;
                    }
                    setPhase("lobby");
                  }}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                >
                  ✕ Exit
                </button>
              </div>
            </header>

            {/* Main Stage Body */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-5">
              <div className="mx-auto max-w-3xl pb-24 sm:pb-28">
                {/* ── STEP 2: SELECT 3 CAR CARDS & 3 CREW CARDS ────────────── */}
                {phase === "lineup" && (
                  <div className="space-y-4">
                    {/* Active Challenge Header Banner */}
                    {activeChallenge && (
                      <div
                        className={`rounded-2xl border p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg ${
                          CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.borderClass || "border-purple-500/50"
                        } ${
                          CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.bgGradientClass || "bg-purple-950/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">
                            {CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.icon || "🏆"}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase text-black">
                                CHALLENGE CUP ACTIVE
                              </span>
                              <h4 className="text-sm font-black text-white">{activeChallenge.title}</h4>
                            </div>
                            <p className="text-[11px] text-zinc-300">
                              Restriction:{" "}
                              <strong className="text-white">
                                {activeChallenge.allowedRarity === "any"
                                  ? "Open Rarity"
                                  : `${activeChallenge.allowedRarity.toUpperCase()} Only`}
                                {activeChallenge.maxTotalScore ? ` · Max ${activeChallenge.maxTotalScore} PTS` : ""}
                              </strong>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] font-bold uppercase text-zinc-400">Purse Reward</span>
                          <span className="text-sm font-black text-emerald-400">
                            ⚡ +{activeChallenge.rewardPCredits} P-Credits
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Active Track Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-900/90 p-3 shadow-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{activeTrackDef.icon}</span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300">
                              STEP 1 VENUE
                            </span>
                            <h4 className="text-sm font-black text-white">{activeTrackDef.name}</h4>
                            <span className="text-xs text-zinc-400 font-bold">({activeTrackDef.region})</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                            <span className="rounded-lg bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-300">
                              ✨ {activeTrackDef.buffLabel}
                            </span>
                            <span className="rounded-lg bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 font-bold text-rose-300">
                              ⚠️ {activeTrackDef.debuffLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-center sm:self-auto ml-auto">
                        <div className="text-right">
                          <span className="block text-[9px] font-bold uppercase text-zinc-400">Rival</span>
                          <span className="text-xs font-black text-rose-300 truncate max-w-[120px] block">
                            {opponent.driverName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPhase("track_roulette")}
                          className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all cursor-pointer"
                        >
                          View Track
                        </button>
                      </div>
                    </div>

                    {/* Loadout Stepper Switcher */}
                    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1.5">
                      <button
                        type="button"
                        onClick={() => setLoadoutSection("cars")}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
                          loadoutSection === "cars"
                            ? "bg-amber-500 text-black shadow-md"
                            : "bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black uppercase">
                            🚗 1. Your 3 Car Cards
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              loadoutSection === "cars" ? "text-black/80" : "text-zinc-400"
                            }`}
                          >
                            Drawn in random order across Corners 1–3
                          </span>
                        </div>
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black">
                          3/3 Ready
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLoadoutSection("crew")}
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
                          loadoutSection === "crew"
                            ? "bg-cyan-500 text-black shadow-md"
                            : "bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black uppercase">
                            ⚡ 2. Your 3 Crew Cards
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              loadoutSection === "crew" ? "text-black/80" : "text-zinc-400"
                            }`}
                          >
                            100% Advantages · Play 1 per corner
                          </span>
                        </div>
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-black">
                          3/3 Ready
                        </span>
                      </button>
                    </div>

                    {loadoutSection === "cars" ? (
                      <div className="rounded-3xl border border-amber-500/40 bg-zinc-900/90 p-4 shadow-xl sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
                              STEP 2A · SELECT YOUR 3 CAR CARDS
                            </span>
                            <h3 className="mt-1 text-base font-black text-white sm:text-lg">
                              Your 3-Car Tandem Lineup
                            </h3>
                            <p className="text-xs text-zinc-400">
                              At each corner, 1 of your remaining Car Cards is randomly drawn against 1 of the Challenger&apos;s 3 cars!
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (activeChallenge) {
                                  const eligible = usableCarCards.filter(
                                    (c) => isCarEligibleForChallenge(c, activeChallenge).eligible
                                  );
                                  if (eligible.length >= 3) {
                                    setSelectedCarIds(pickBestCarIds(eligible, lineupContext) ?? pickTopThreeIds(eligible));
                                  } else {
                                    alert(
                                      `Only ${eligible.length} qualifying cars found in your garage for this challenge.`
                                    );
                                  }
                                } else {
                                  setSelectedCarIds(pickBestCarIds(usableCarCards, lineupContext) ?? pickTopThreeIds(usableCarCards));
                                }
                              }}
                              className="rounded-xl border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                            >
                              ⚡ Auto-Pick Best 3
                            </button>
                            <button
                              type="button"
                              onClick={() => setLoadoutSection("crew")}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-sky-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-md hover:scale-[1.02] cursor-pointer"
                            >
                              <span>Next: Crew Cards →</span>
                            </button>
                          </div>
                        </div>

                        {usingLoanerCars && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
                            🚗 Academy Loaner Cars have been activated to fill your 3-car lineup until you pull more cars!
                          </div>
                        )}

                        {challengeIneligibleCount > 0 && activeChallenge && (
                          <div className="rounded-2xl border border-rose-500/50 bg-rose-500/15 p-3 text-xs font-bold text-rose-300">
                            ⚠️ {challengeIneligibleCount} of your equipped cars do not meet the <strong>{activeChallenge.title}</strong> restrictions ({activeChallenge.allowedRarity !== "any" ? `${activeChallenge.allowedRarity.toUpperCase()} Only` : ""}{activeChallenge.maxTotalScore ? ` · Max ${activeChallenge.maxTotalScore} PTS` : ""}). Please swap them with qualifying cars to launch the match.
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                          {selectedCarCards.map((car, idx) => {
                            const slotIdx = idx as 0 | 1 | 2;
                            const isLoaner = car.userId === "loaner";
                            const carEligibility = activeChallenge
                              ? isCarEligibleForChallenge(car, activeChallenge)
                              : { eligible: true };
                            return (
                              <div
                                key={`${slotIdx}-${car.id}`}
                                className={`flex flex-col justify-between rounded-2xl border p-2 sm:p-3 ${
                                  !carEligibility.eligible
                                    ? "border-rose-500/80 bg-rose-950/20"
                                    : "border-zinc-800 bg-zinc-950"
                                }`}
                              >
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-black">
                                  <span className="text-amber-400">CAR #{slotIdx + 1}</span>
                                  {!carEligibility.eligible ? (
                                    <span className="rounded bg-rose-500/30 border border-rose-500 px-1.5 py-0.5 text-[9px] text-rose-200 animate-pulse">
                                      INELIGIBLE
                                    </span>
                                  ) : isLoaner ? (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                                      LOANER
                                    </span>
                                  ) : (
                                    <span className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[9px] text-emerald-400">
                                      🔋 {car.battlesRemaining ?? car.maxBattles ?? 6}L
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewerState({ list: selectedCarCards, index: slotIdx })
                                  }
                                  className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                                  aria-label={`View ${car.name}`}
                                >
                                  <FullArtCard card={car} />
                                </button>
                                <div className="mt-2 space-y-1.5">
                                  <p className="truncate text-center text-xs font-black text-white">
                                    {car.name}
                                  </p>
                                  {!carEligibility.eligible && (
                                    <p className="text-center text-[10px] font-bold text-rose-400 leading-tight">
                                      {carEligibility.reason}
                                    </p>
                                  )}
                                  {carInsights[idx] && (
                                    <CarTrackEffects carName={car.name} insight={carInsights[idx]} track={activeTrackDef} />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPickerModalTarget({ type: "car", slotIdx })
                                    }
                                    className="min-h-9 w-full rounded-xl border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-black text-amber-300 hover:bg-amber-500/25"
                                  >
                                    🔄 Swap Car #{slotIdx + 1}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-cyan-500/40 bg-zinc-900/90 p-4 shadow-xl sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                              STEP 2B · SELECT YOUR 3 CREW ADVANTAGE CARDS
                            </span>
                            <h3 className="mt-1 text-base font-black text-white sm:text-lg">
                              Your 3 Pit Crew Advantage Cards
                            </h3>
                            <p className="text-xs text-zinc-400">
                              All Crew Cards are 100% positive advantages! You will choose 1 to play on Corner 1, 1 on Corner 2, and your final Crew Card on Corner 3.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCrewIds(
                                  pickBestCrewIds(usableCrewCards, selectedCarCards, lineupContext) ?? pickTopThreeIds(usableCrewCards)
                                )
                              }
                              className="rounded-xl border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
                            >
                              ⚡ Auto-Pick Best 3
                            </button>
                            <button
                              type="button"
                              disabled={!isLineupEligible}
                              onClick={handleStartBattleFromLineup}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-md shadow-amber-500/25 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <span>
                                {!isLineupEligible ? "⚠️ Lineup Invalid" : "Deploy (Corner 1) →"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {usingLoanerCrew && (
                          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200">
                            ⚡ Starter Loaner Crew Cards are activated for your empty slots until you pull more Crew Cards from Standard Packs!
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                          {selectedCrewCards.map((crew, idx) => {
                            const slotIdx = idx as 0 | 1 | 2;
                            const isLoaner = crew.userId === "loaner";
                            return (
                              <div
                                key={`${slotIdx}-${crew.id}`}
                                className="flex flex-col justify-between rounded-2xl border border-cyan-500/30 bg-zinc-950 p-2 sm:p-3"
                              >
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-black">
                                  <span className="text-cyan-400">CREW #{slotIdx + 1}</span>
                                  {isLoaner && (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
                                      LOANER
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewerState({ list: selectedCrewCards, index: slotIdx })
                                  }
                                  className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                                  aria-label={`View ${crew.name}`}
                                >
                                  <FullArtCard card={crew} />
                                </button>
                                <div className="mt-2 space-y-1.5">
                                  <p className="truncate text-center text-xs font-black text-white flex items-center justify-center gap-1.5">
                                    <span className="text-sm">{crew.crewIcon || resolveCrewDef(crew).icon}</span>
                                    <span className="truncate">{crew.name}</span>
                                  </p>
                                  <p className="line-clamp-2 text-center text-[10px] font-semibold text-cyan-300">
                                    {crew.effect}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPickerModalTarget({ type: "crew", slotIdx })
                                    }
                                    className="min-h-9 w-full rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/25"
                                  >
                                    🔄 Swap Crew #{slotIdx + 1}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 2 Floating Action Dock (Overlays bottom of screen) */}
                    <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-zinc-950/95 to-transparent px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-md shadow-[0_-10px_25px_rgba(0,0,0,0.8)]">
                      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2.5">
                        {loadoutSection === "cars" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPhase("track_roulette")}
                              className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900/90 px-4 text-xs font-black text-zinc-300 hover:bg-zinc-800 cursor-pointer shadow-lg shrink-0"
                            >
                              ← Back to Track
                            </button>
                            <button
                              type="button"
                              onClick={() => setLoadoutSection("crew")}
                              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-sky-500 px-6 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:scale-[1.01] active:scale-[0.98] transition-all sm:text-sm cursor-pointer"
                            >
                              <span>⚡ Next: Select 3 Crew Advantage Cards →</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setLoadoutSection("cars")}
                              className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900/90 px-4 text-xs font-black text-zinc-200 hover:bg-zinc-800 cursor-pointer shadow-lg shrink-0"
                            >
                              ← Back to 3 Car Cards
                            </button>

                            <button
                              type="button"
                              disabled={!isLineupEligible}
                              onClick={handleStartBattleFromLineup}
                              className="inline-flex min-h-12 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:scale-[1.01] active:scale-[0.98] transition-all sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <span>
                                {!isLineupEligible
                                  ? `⚠️ ${challengeIneligibleCount} Ineligible Car(s) in Lineup`
                                  : "🏁 Lock Lineup & Deploy Car (Corner 1) →"}
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STEP 1: UK TRACK ROULETTE ANIMATION & RIVAL LOCK ────── */}
                {phase === "track_roulette" && (
                  <div className="flex min-h-[70dvh] flex-col items-center justify-center space-y-5 text-center">
                    {!trackLockedIn ? (
                      <>
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-4 py-1 text-xs font-black uppercase tracking-widest text-emerald-300 animate-pulse">
                          🇬🇧 Spinning UK Drift Venue Roulette...
                        </span>
                        <h3 className="text-2xl font-black text-white sm:text-3xl">
                          Selecting Track &amp; Challenger...
                        </h3>

                        {(() => {
                          const tracks =
                            trackCatalogDefs.length > 0 ? trackCatalogDefs : UK_TRACK_CARD_SET;
                          const spinningTrack = tracks[rouletteTrackIdx % tracks.length];
                          const spinningCard: MemberCard = {
                            id: spinningTrack.id,
                            userId: "track",
                            ...trackDefinitionToCardData(spinningTrack),
                            styleIds: [],
                            kept: true,
                            rerolled: false,
                            createdAt: 0,
                          };
                          return (
                            <div className="mx-auto w-52 sm:w-60 transition-all duration-100 scale-105 filter drop-shadow-[0_0_35px_rgba(16,185,129,0.5)]">
                              <FullArtCard card={spinningCard} className="drop-shadow-2xl" />
                            </div>
                          );
                        })()}
                        <p className="text-xs font-bold text-zinc-400">
                          Determining track surface, rules &amp; matching a rival UK driver...
                        </p>
                      </>
                    ) : (
                      <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="space-y-1">
                          <span className="inline-block rounded-full bg-emerald-500 px-3.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-black">
                            🇬🇧 Step 1 Complete · UK Track Locked In!
                          </span>
                          <h3 className="text-2xl font-black text-white sm:text-3xl">
                            {activeTrackDef.icon} {activeTrackDef.name}
                          </h3>
                          <p className="text-xs font-bold text-zinc-400">
                            {activeTrackDef.region} · {activeTrackDef.ability}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 items-center gap-4 rounded-3xl border border-emerald-500/40 bg-zinc-900/90 p-4 text-left sm:grid-cols-[13rem_1fr] sm:p-5">
                          <button
                            type="button"
                            onClick={() =>
                              setViewerState({ list: [activeTrackCard], index: 0 })
                            }
                            className="mx-auto block w-44 sm:w-full rounded-2xl transition-transform hover:-translate-y-0.5"
                            aria-label={`View ${activeTrackCard.name}`}
                          >
                            <FullArtCard card={activeTrackCard} className="drop-shadow-xl" />
                          </button>

                          <div className="space-y-3">
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                🇬🇧 Track Buff · Match Roll
                              </span>
                              <p className="mt-0.5 text-xs font-black text-emerald-200">
                                {activeTrackDef.buffLabel}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                                ⚠️ Track Hazard Debuff · Match Roll
                              </span>
                              <p className="mt-0.5 text-xs font-black text-rose-200">
                                {activeTrackDef.debuffLabel}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                🕵️ Rival Challenger Ready
                              </span>
                              <p className="mt-0.5 text-sm font-black text-white">
                                {opponent.driverName}{" "}
                                <span className="text-xs font-bold text-zinc-400">
                                  ({opponent.teamName})
                                </span>
                              </p>
                              <p className="text-[11px] text-zinc-400">
                                3 Car Cards + 3 Crew Advantage Cards locked face-down
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-zinc-950/95 to-transparent px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-md shadow-[0_-10px_25px_rgba(0,0,0,0.8)]">
                          <div className="mx-auto max-w-xl">
                            <button
                              type="button"
                              onClick={() => setPhase("lineup")}
                              className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-sm sm:text-base font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <span>🚗 Step 2: Choose 3 Cars &amp; Crew for this Track →</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── STEP 2.5: SELECT CAR CARD FOR CORNER 1 OR 2 (FANNED-OUT HAND SPREAD) ── */}
                {phase === "car_select" &&
                  (() => {
                    const sector = activeSectors[activeCornerIdx];
                    const alreadyDeployed = playerCarAssignments
                      .slice(0, activeCornerIdx)
                      .filter((x): x is 0 | 1 | 2 => x !== null);
                    const availableCarIndices = ([0, 1, 2] as Array<0 | 1 | 2>).filter(
                      (idx) => !alreadyDeployed.includes(idx)
                    );

                    const activeSlot =
                      previewCarSlot !== null && availableCarIndices.includes(previewCarSlot)
                        ? previewCarSlot
                        : availableCarIndices[0];
                    const activeCar = selectedCarCards[activeSlot];
                    const activeSectorScore = scoreCardForSector(activeCar, sector.id);

                    return (
                      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header Banner */}
                        <div className="rounded-3xl border border-amber-500/40 bg-zinc-950/90 p-4 sm:p-5 text-center shadow-xl backdrop-blur-md space-y-2">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs font-black text-amber-300 uppercase tracking-wider">
                              ⚡ CORNER {sector.number} OF 3 TACTICAL DEPLOYMENT
                            </span>
                            <span className="rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">
                              🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                            </span>
                          </div>

                          <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                            Select Car for {sector.name}
                          </h3>

                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-zinc-300">
                            <span>Corner Formula:</span>
                            <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 font-black text-amber-300">
                              {sector.formulaBadge}
                            </span>
                            <span className="text-zinc-400 hidden sm:inline">({sector.subtitle})</span>
                          </div>

                          {/* Dynamic Track Surface Buff & Hazard Callouts */}
                          {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                              {activeTrackDef.buffLabel && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-bold text-emerald-300">
                                  <span>🟢 Track Buff:</span> {activeTrackDef.buffLabel}
                                </span>
                              )}
                              {activeTrackDef.debuffLabel && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-bold text-rose-300">
                                  <span>⚠️ Track Hazard:</span> {activeTrackDef.debuffLabel}
                                </span>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-zinc-400 max-w-md mx-auto">
                            Pick a car card from your hand below to deploy into the tandem clash!
                          </p>
                        </div>

                        {/* Fanned Out Car Hand Spread */}
                        <div className="relative py-4 sm:py-6 overflow-visible">
                          <div className="flex items-end justify-center -space-x-8 sm:-space-x-12 pb-4 w-full max-w-2xl mx-auto overflow-visible">
                            {availableCarIndices.map((slotIdx, spreadIdx) => {
                              const car = selectedCarCards[slotIdx];
                              const sectorScore = scoreCardForSector(car, sector.id);
                              const isSelected = activeSlot === slotIdx;

                              const total = availableCarIndices.length;
                              let fanRotation = "rotate-0";
                              if (total === 3) {
                                if (spreadIdx === 0) fanRotation = "-rotate-6 -translate-y-1";
                                else if (spreadIdx === 1) fanRotation = "rotate-0 -translate-y-3";
                                else if (spreadIdx === 2) fanRotation = "rotate-6 -translate-y-1";
                              } else if (total === 2) {
                                if (spreadIdx === 0) fanRotation = "-rotate-4 -translate-y-2";
                                else if (spreadIdx === 1) fanRotation = "rotate-4 -translate-y-2";
                              }

                              return (
                                <button
                                  key={car.id || slotIdx}
                                  type="button"
                                  onClick={() => setPreviewCarSlot(slotIdx)}
                                  onDoubleClick={() => handleDeployCar(slotIdx)}
                                  className={`group relative flex flex-col items-center rounded-3xl transition-all duration-300 select-none text-left ${fanRotation} ${
                                    isSelected
                                      ? "-translate-y-8 sm:-translate-y-10 scale-105 sm:scale-110 z-30 rotate-0 ring-4 ring-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.7)]"
                                      : "opacity-80 hover:opacity-100 hover:-translate-y-4 hover:scale-102 z-10 shadow-2xl"
                                  }`}
                                >
                                  {/* Overlaid Micro Header Badges */}
                                  <div className="absolute -top-3.5 inset-x-2 z-30 flex items-center justify-between pointer-events-none">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shadow ${
                                        isSelected
                                          ? "bg-amber-400 text-black border border-amber-300"
                                          : "bg-zinc-900/90 text-zinc-300 border border-zinc-700"
                                      }`}
                                    >
                                      SLOT #{slotIdx + 1}
                                    </span>
                                    <span className="rounded-full bg-emerald-500 text-black font-black px-2 py-0.5 text-[9px] shadow border border-emerald-400">
                                      ⚡ {sectorScore.total}
                                    </span>
                                  </div>

                                  {/* The Full Art Card */}
                                  <div className="w-36 sm:w-48 max-w-[190px] pointer-events-none drop-shadow-xl">
                                    <FullArtCard card={car} />
                                  </div>

                                  {/* Selection Glow / Badge */}
                                  {isSelected && (
                                    <div className="absolute -bottom-3 inset-x-4 z-30 flex justify-center pointer-events-none">
                                      <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-black shadow-lg animate-pulse">
                                        ✓ SELECTED
                                      </span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Selected Car Telemetry & Deploy Action Dock */}
                        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-4 sm:p-5 max-w-xl mx-auto shadow-2xl backdrop-blur-md space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                SELECTED DRIFT MACHINE
                              </span>
                              <h4 className="text-base sm:text-lg font-black text-white truncate">
                                {activeCar.name}
                              </h4>
                              <p className="text-[11px] font-bold text-zinc-400">
                                Driver: {activeCar.driver || "Team Pilot"} · {activeCar.team || "Team PHD"}
                              </p>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                                SECTOR RATING
                              </span>
                              <div className="text-xl sm:text-2xl font-black text-emerald-400">
                                ⚡ {activeSectorScore.total} PTS
                              </div>
                            </div>
                          </div>

                          {/* Base Stats Pills */}
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">DRIFT</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.drift)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">ACCEL</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.accel)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">GRIP</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.grip)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-1.5">
                              <span className="block text-[9px] font-black uppercase text-zinc-400">STEER</span>
                              <span className="font-black text-white">{normalizeStatValue(activeCar.stats?.steer)}</span>
                            </div>
                          </div>

                          {/* Floating Deploy Action Dock (Overlays bottom of screen) */}
                          <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-zinc-950/95 to-transparent px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-md shadow-[0_-10px_25px_rgba(0,0,0,0.8)]">
                            <div className="mx-auto max-w-xl">
                              <button
                                type="button"
                                onClick={() => handleDeployCar(activeSlot)}
                                className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                🏁 Deploy {activeCar.name.split(" ")[0]} into Corner {sector.number} →
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {/* ── STEP 3: CORNER 1 → CORNER 2 → CORNER 3 BATTLE ────────── */}
                {/* ── STEP 3: ARCADE GAME VIEW CORNER BATTLE (CINEMATIC ARENA) ── */}
                {phase === "corner_battle" &&
                  (() => {
                    const sector = activeSectors[activeCornerIdx];
                    const cornerInfo = {
                      number: sector.number,
                      title: sector.name,
                      subtitle: sector.subtitle,
                      eventDescription: sector.eventDescription,
                      formulaBadge: sector.formulaBadge,
                    };

                    const playerCar = selectedCarCards[playerCarOrder[activeCornerIdx]];
                    const rivalCar = opponent.cards[rivalCarOrder[activeCornerIdx]] ?? opponent.cards[0];

                    // Resolve crew cards based on user's manual selection for this corner (or fallback)
                    const assignedPlayerCrewIdx = playerCrewAssignments[activeCornerIdx] ?? remainingCrewSlotIndices[0] ?? 0;
                    const assignedRivalCrewIdx = rivalCrewAssignments[activeCornerIdx] ?? rivalCrewOrder[activeCornerIdx] ?? 0;
                    const playerCrew = selectedCrewCards[assignedPlayerCrewIdx];
                    const rivalCrew = rivalCrewCards[assignedRivalCrewIdx];
                    const playerDebuffDef = debuffsOnPlayer[activeCornerIdx];
                    const rivalDebuffDef = debuffsOnRival[activeCornerIdx];
                    const currentResult = cornerResults[activeCornerIdx];

                    // Base Stats (Normalized)
                    const pBase = getNormalizedCardStats(playerCar);
                    const rBase = getNormalizedCardStats(rivalCar);

                    // Crew Stats
                    const pCrewDef = resolveCrewDef(playerCrew);
                    const rCrewDef = resolveCrewDef(rivalCrew);
                    const pCrewMods = pCrewDef.modifiers;
                    const rCrewMods = rCrewDef.modifiers;

                    const pCrewStats = applyCrewModsToStats(pBase, pCrewMods);
                    const rCrewStats = applyCrewModsToStats(rBase, rCrewMods);

                    // Track & Debuff Stats (shielded by crew debuffShield)
                    // A Crew shield only counts once the Crew card has been played (before that, debuffs show in full).
                    const crewIsDown =
                      battleAnimStep === "crew_overlay" ||
                      battleAnimStep === "finale_clash" ||
                      battleAnimStep === "finale_roulette" ||
                      battleAnimStep === "prompt_finale" ||
                      battleAnimStep === "finale_result" ||
                      battleAnimStep === "battle_shake_2" ||
                      battleAnimStep === "reveal_stats" ||
                      battleAnimStep === "knockout_and_winner" ||
                      battleAnimStep === "corner_finished";
                    const pShield = crewIsDown ? Math.min(1, Math.max(0, pCrewMods?.debuffShield ?? 0)) : 0;
                    const rShield = crewIsDown ? Math.min(1, Math.max(0, rCrewMods?.debuffShield ?? 0)) : 0;

                    const tRules = activeTrackDef.rules ?? {};
                    const pTrackBreakdown = computeTrackBreakdown({
                      card: playerCar,
                      trackCard: activeTrackDef,
                      shield: pShield,
                    });
                    const rTrackBreakdown = computeTrackBreakdown({
                      card: rivalCar,
                      trackCard: activeTrackDef,
                      shield: rShield,
                    });

                    const pDebuffBreakdown = computeDebuffBreakdown({
                      card: playerCar,
                      debuffCard: playerDebuffDef,
                      trackCard: activeTrackDef,
                      shield: pShield,
                    });

                    const rDebuffBreakdown = computeDebuffBreakdown({
                      card: rivalCar,
                      debuffCard: rivalDebuffDef,
                      trackCard: activeTrackDef,
                      shield: rShield,
                    });

                    const pTrackStats = {
                      drift: Math.min(25, pCrewStats.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, pCrewStats.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, pCrewStats.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, pCrewStats.steer + (tRules.steerBuff ?? 0)),
                    };
                    const rTrackStats = {
                      drift: Math.min(25, rCrewStats.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, rCrewStats.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, rCrewStats.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, rCrewStats.steer + (tRules.steerBuff ?? 0)),
                    };

                    const pFinalStatsLocal = {
                      drift: Math.max(1, pTrackStats.drift - pDebuffBreakdown.effectiveDriftPenalty),
                      accel: Math.max(1, pTrackStats.accel - pDebuffBreakdown.effectiveAccelPenalty),
                      grip: Math.max(1, pTrackStats.grip - pDebuffBreakdown.effectiveGripPenalty),
                      steer: Math.max(1, pTrackStats.steer - pDebuffBreakdown.effectiveSteerPenalty),
                    };
                    const rFinalStatsLocal = {
                      drift: Math.max(1, rTrackStats.drift - rDebuffBreakdown.effectiveDriftPenalty),
                      accel: Math.max(1, rTrackStats.accel - rDebuffBreakdown.effectiveAccelPenalty),
                      grip: Math.max(1, rTrackStats.grip - rDebuffBreakdown.effectiveGripPenalty),
                      steer: Math.max(1, rTrackStats.steer - rDebuffBreakdown.effectiveSteerPenalty),
                    };

                    // In the updated flow:
                    // 1) Debuffs strike first (debuff_overlay, battle_shake_1)
                    // 2) Then Pit Crew responds (prompt_crew)
                    // 3) Then Crew buffs apply & final clash (crew_overlay, battle_shake_2, knockout_and_winner, corner_finished)
                    const isDebuffStage =
                      battleAnimStep === "debuff_overlay" ||
                      battleAnimStep === "battle_shake_1";
                    const isPromptCrew = battleAnimStep === "prompt_crew";
                    // After the Crew cards are down the corner goes: crew_overlay -> finale_roulette -> prompt_finale (the
                    // finale game) -> battle_shake_2 (the clash) -> reveal_stats (the rival's stats, one by one, then the
                    // totals) -> knockout_and_winner -> corner_finished.
                    const isCrewStage =
                      battleAnimStep === "crew_overlay" ||
                      battleAnimStep === "finale_clash" ||
                      battleAnimStep === "finale_roulette" ||
                      battleAnimStep === "prompt_finale" ||
                      battleAnimStep === "finale_result" ||
                      battleAnimStep === "battle_shake_2" ||
                      battleAnimStep === "reveal_stats" ||
                      battleAnimStep === "knockout_and_winner" ||
                      battleAnimStep === "corner_finished";
                    // The corner's result before the finale is settled (only set while the finale is still to come).
                    const pendingBase = pendingFinale?.cornerIdx === activeCornerIdx ? pendingFinale.base : null;
                    const isCrewOrLater = isCrewStage;
                    const isDebuffOrLater = isDebuffStage || isPromptCrew || isCrewStage;
                    // How much of the rival car is shown: 0 = nothing, 1 to 4 = that many stats (drift, accel, grip,
                    // steer) and 5 = everything, including the points. Only the reveal steps count up, and the steps
                    // after them show it all.
                    const revealLevel =
                      battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished"
                        ? 5
                        : battleAnimStep === "reveal_stats"
                          ? rivalReveal
                          : 0;
                    const hideRival = revealLevel < 5;

                    // Once the Crew card is down, the card faces show the scoring engine's own final stats, so what is on
                    // the card is exactly what the score was worked out from.
                    const settledResult = currentResult ?? pendingBase;
                    const pFinalStats = settledResult?.playerFinalStats ?? pFinalStatsLocal;
                    const rFinalStats = settledResult?.rivalFinalStats ?? rFinalStatsLocal;

                    // Compute unshielded debuffed stats for the initial debuff phase (before crew is called)
                    const pInitialDebuff = computeDebuffBreakdown({
                      card: playerCar,
                      debuffCard: playerDebuffDef,
                      trackCard: activeTrackDef,
                      shield: 0,
                    });
                    const rInitialDebuff = computeDebuffBreakdown({
                      card: rivalCar,
                      debuffCard: rivalDebuffDef,
                      trackCard: activeTrackDef,
                      shield: 0,
                    });

                    const pBaseTrackStats = {
                      drift: Math.min(25, pBase.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, pBase.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, pBase.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, pBase.steer + (tRules.steerBuff ?? 0)),
                    };
                    const rBaseTrackStats = {
                      drift: Math.min(25, rBase.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, rBase.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, rBase.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, rBase.steer + (tRules.steerBuff ?? 0)),
                    };

                    const pDebuffedStats = {
                      drift: Math.max(1, pBaseTrackStats.drift - pInitialDebuff.effectiveDriftPenalty),
                      accel: Math.max(1, pBaseTrackStats.accel - pInitialDebuff.effectiveAccelPenalty),
                      grip: Math.max(1, pBaseTrackStats.grip - pInitialDebuff.effectiveGripPenalty),
                      steer: Math.max(1, pBaseTrackStats.steer - pInitialDebuff.effectiveSteerPenalty),
                    };
                    const rDebuffedStats = {
                      drift: Math.max(1, rBaseTrackStats.drift - rInitialDebuff.effectiveDriftPenalty),
                      accel: Math.max(1, rBaseTrackStats.accel - rInitialDebuff.effectiveAccelPenalty),
                      grip: Math.max(1, rBaseTrackStats.grip - rInitialDebuff.effectiveGripPenalty),
                      steer: Math.max(1, rBaseTrackStats.steer - rInitialDebuff.effectiveSteerPenalty),
                    };

                    // During prompt_crew, compute live preview diffs directly from previewCrewIdx
                    const activePreviewCrewCard = selectedCrewCards[previewCrewIdx ?? remainingCrewSlotIndices[0] ?? 0];
                    const activePreviewCrewDef = resolveCrewDef(activePreviewCrewCard);
                    const previewMods = activePreviewCrewDef?.modifiers ?? {};
                    const previewShield = Math.min(1, Math.max(0, previewMods.debuffShield ?? 0));
                    const pPreviewDebuff = computeDebuffBreakdown({
                      card: playerCar,
                      debuffCard: playerDebuffDef,
                      trackCard: activeTrackDef,
                      shield: previewShield,
                    });
                    const previewCrewBase = applyCrewModsToStats(pBase, previewMods);
                    const previewTrackStats = {
                      drift: Math.min(25, previewCrewBase.drift + (tRules.driftBuff ?? 0)),
                      accel: Math.min(25, previewCrewBase.accel + (tRules.accelBuff ?? 0)),
                      grip: Math.min(25, previewCrewBase.grip + (tRules.gripBuff ?? 0)),
                      steer: Math.min(25, previewCrewBase.steer + (tRules.steerBuff ?? 0)),
                    };
                    const previewCrewStats = {
                      drift: Math.max(1, previewTrackStats.drift - pPreviewDebuff.effectiveDriftPenalty),
                      accel: Math.max(1, previewTrackStats.accel - pPreviewDebuff.effectiveAccelPenalty),
                      grip: Math.max(1, previewTrackStats.grip - pPreviewDebuff.effectiveGripPenalty),
                      steer: Math.max(1, previewTrackStats.steer - pPreviewDebuff.effectiveSteerPenalty),
                    };

                    // Stats shown on each car. The track's buffs are in from the very first step, then the debuff, then Crew.
                    const pDisplayStats = isCrewOrLater
                      ? pFinalStats
                      : isPromptCrew
                        ? previewCrewStats
                        : isDebuffStage
                          ? pDebuffedStats
                          : pBaseTrackStats;
                    const rDisplayStats = isCrewOrLater
                      ? rFinalStats
                      : isDebuffStage || isPromptCrew
                        ? rDebuffedStats
                        : rBaseTrackStats;
                    // The coloured +/- chips show what the latest step changed: track buffs first, then the debuff, then Crew.
                    // The track's bonus or hazard POINTS for each car right now (a Crew shield only counts once it is played).
                    const pTrackNow = computeTrackBreakdown({
                      card: playerCar,
                      trackCard: activeTrackDef,
                      shield: isCrewOrLater ? pShield : isPromptCrew ? previewShield : 0,
                    });
                    const rTrackNow = computeTrackBreakdown({
                      card: rivalCar,
                      trackCard: activeTrackDef,
                      shield: isCrewStage ? rShield : 0,
                    });
                    const trackChip = (net: number) =>
                      net === 0 ? null : (
                        <div
                          className={`flex w-full max-w-[200px] items-center justify-center gap-1 rounded-xl border-2 px-2 py-0.5 shadow-lg ${
                            net > 0 ? "border-emerald-500 bg-emerald-950/95 text-emerald-200" : "border-rose-500 bg-rose-950/95 text-rose-200"
                          }`}
                        >
                          <span className="text-[10px]" aria-hidden>{activeTrackDef.icon}</span>
                          <span className="shrink-0 text-[8px] font-black uppercase tracking-wider sm:text-[9px]">TRACK</span>
                          <span className="truncate text-[10px] font-black sm:text-xs">
                            {net > 0 ? "+" : ""}
                            {net} PTS
                          </span>
                        </div>
                      );
                    const pDiffTarget = pDisplayStats;
                    // Once the Crew card is down the chips show each stat's net change from the card's own number, which
                    // is exactly what the breakdown at the bottom adds up to (a shield that softens a debuff is not
                    // shown as a gain, so a stat that ended lower never shows a plus).
                    const pDiffBase = isCrewOrLater
                      ? (settledResult?.playerStatStages?.base ?? pBase)
                      : isPromptCrew
                        ? pDebuffedStats
                        : isDebuffStage
                          ? pBaseTrackStats
                          : pBase;
                    const rDiffTarget = isCrewOrLater ? rFinalStats : rDisplayStats;
                    const rDiffBase = isCrewOrLater
                      ? (settledResult?.rivalStatStages?.base ?? rBase)
                      : isPromptCrew
                        ? rDebuffedStats
                        : isDebuffStage
                          ? rBaseTrackStats
                          : rBase;
                    const statDiffs = (target: typeof pBase, base: typeof pBase) => ({
                      drift: target.drift !== base.drift ? getStatDiffInfo(target.drift, base.drift) : null,
                      accel: target.accel !== base.accel ? getStatDiffInfo(target.accel, base.accel) : null,
                      grip: target.grip !== base.grip ? getStatDiffInfo(target.grip, base.grip) : null,
                      steer: target.steer !== base.steer ? getStatDiffInfo(target.steer, base.steer) : null,
                    });
                    const pDiffs = statDiffs(pDiffTarget, pDiffBase);
                    const rDiffs = statDiffs(rDiffTarget, rDiffBase);
                    const showPlayerCrewGlow = isCrewOrLater || (isPromptCrew && previewCrewIdx !== null);
                    const showPlayerStatChanges = true;

                    // The running totals come from the real scoring engine at every step, so they always add up the same way
                    // the final result does: the car's stats, tier, the TRACK's buffs and hazard, then the debuff, then Crew.
                    // Before a Crew card is played a "no Crew" stand-in is used (the engine would otherwise use a loaner card).
                    const scoringPool = [NO_CREW_DEF, ...crewCatalogDefs];
                    const scoreStage = (
                      playerDebuffCard: DebuffCardDefinition,
                      rivalDebuffCard: DebuffCardDefinition,
                      playerCrewCard: MemberCard
                    ) =>
                      evaluateCornerMatchup({
                        cornerIdx: activeCornerIdx,
                        sector,
                        playerCard: playerCar,
                        rivalCard: rivalCar,
                        playerCrewCard,
                        rivalCrewCard: NO_CREW_CARD,
                        playerDebuffCard,
                        rivalDebuffCard,
                        trackCard: activeTrackDef,
                        crewPool: scoringPool,
                      });
                    // Cars only, with the track's effects (before any debuff is played).
                    const baseStage = scoreStage(NEUTRAL_DEBUFF, NEUTRAL_DEBUFF, NO_CREW_CARD);
                    // Plus the debuffs just played.
                    const debuffStage = scoreStage(playerDebuffDef, rivalDebuffDef, NO_CREW_CARD);
                    // Plus the Crew card you are looking at.
                    const previewStage = scoreStage(playerDebuffDef, rivalDebuffDef, activePreviewCrewCard);
                    // The debuff total on your car: with the Crew card you are looking at while you choose, with the
                    // Crew card that was played afterwards.
                    const pDebuffShown = isPromptCrew ? pPreviewDebuff : pDebuffBreakdown;
                    const pBaseCornerScore = baseStage.playerScore;
                    const rBaseCornerScore = baseStage.rivalScore;
                    const pDebuffedCornerScore = debuffStage.playerScore;
                    const rDebuffedCornerScore = debuffStage.rivalScore;
                    const pPreviewScore = previewStage.playerScore;
                    const pCrewScore =
                      scoreCardForSector(
                        {
                          ...playerCar,
                          stats: {
                            drift: String(pCrewStats.drift),
                            accel: String(pCrewStats.accel),
                            grip: String(pCrewStats.grip),
                            steer: String(pCrewStats.steer),
                          },
                        },
                        sector.id
                      ).total + (pCrewMods.flatBonus ?? 0);

                    const rCrewScore =
                      scoreCardForSector(
                        {
                          ...rivalCar,
                          stats: {
                            drift: String(rCrewStats.drift),
                            accel: String(rCrewStats.accel),
                            grip: String(rCrewStats.grip),
                            steer: String(rCrewStats.steer),
                          },
                        },
                        sector.id
                      ).total + (rCrewMods.flatBonus ?? 0);

                    // Your points stay at the pre-finale number until the final total is revealed.
                    const pScore = isCrewStage
                      ? currentResult
                        ? revealLevel >= 5
                          ? currentResult.playerScore
                          : (currentResult.playerScoreBeforeFinale ?? currentResult.playerScore)
                        : (pendingBase?.playerScore ?? pCrewScore)
                      : isPromptCrew
                        ? pPreviewScore
                        : isDebuffStage
                          ? pDebuffedCornerScore
                          : pBaseCornerScore;

                    const rScore = isCrewStage
                      ? (currentResult?.rivalScore ?? rCrewScore)
                      : (isDebuffStage || isPromptCrew)
                        ? rDebuffedCornerScore
                        : rBaseCornerScore;

                    // Dynamic card class positioning for Player
                    let pCardClass = "transition-all duration-500 will-change-transform ";
                    if (battleAnimStep === "cards_entrance") {
                      pCardClass += "-translate-x-8 opacity-80 rotate-2 duration-700 ease-out";
                    } else if (battleAnimStep === "finale_clash") {
                      // The cars slam together in the middle of the track.
                      pCardClass += "translate-x-[38%] sm:translate-x-[52%] scale-110 rotate-6 animate-clash-shake z-30";
                    } else if (battleAnimStep === "finale_roulette" || battleAnimStep === "prompt_finale" || battleAnimStep === "finale_result" || battleAnimStep === "reveal_stats") {
                      // ...and stay locked together while the finale is drawn, played and revealed.
                      pCardClass += "translate-x-[38%] sm:translate-x-[52%] scale-105 rotate-3 z-30 duration-500";
                    } else if (battleAnimStep === "head_to_head" || battleAnimStep === "prompt_crew" || battleAnimStep === "prompt_debuff" || battleAnimStep === "hazard_incident") {
                      pCardClass += "translate-x-[12%] sm:translate-x-[16%] scale-100 rotate-1 z-20 duration-500";
                    } else if (battleAnimStep === "battle_initial") {
                      pCardClass += "translate-x-[20%] sm:translate-x-[26%] rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "crew_overlay") {
                      pCardClass += "translate-x-[12%] sm:translate-x-[16%] scale-105 rotate-1 z-20 duration-300";
                    } else if (battleAnimStep === "battle_shake_1") {
                      pCardClass += "translate-x-[20%] sm:translate-x-[26%] rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "debuff_overlay") {
                      pCardClass += "translate-x-[6%] sm:translate-x-[8%] rotate-1 z-20";
                    } else if (battleAnimStep === "battle_shake_2") {
                      pCardClass += "translate-x-[24%] sm:translate-x-[34%] rotate-6 animate-clash-shake z-20";
                    } else if (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") {
                      if (currentResult?.won) {
                        pCardClass += "translate-x-[40%] sm:translate-x-[46%] scale-110 rotate-0 animate-winner-pulse z-30 drop-shadow-[0_0_35px_rgba(245,158,11,0.85)]";
                      } else if (currentResult?.tied) {
                        pCardClass += "translate-x-[12%] scale-105 rotate-1 z-20";
                      } else {
                        pCardClass += "animate-spinout-left z-10 pointer-events-none";
                      }
                    }

                    // Dynamic card class positioning for Rival
                    let rCardClass = "transition-all duration-500 will-change-transform ";
                    if (battleAnimStep === "cards_entrance") {
                      rCardClass += "translate-x-8 opacity-80 -rotate-2 duration-700 ease-out";
                    } else if (battleAnimStep === "finale_clash") {
                      rCardClass += "-translate-x-[38%] sm:-translate-x-[52%] scale-110 -rotate-6 animate-clash-shake z-30";
                    } else if (battleAnimStep === "finale_roulette" || battleAnimStep === "prompt_finale" || battleAnimStep === "finale_result" || battleAnimStep === "reveal_stats") {
                      rCardClass += "-translate-x-[38%] sm:-translate-x-[52%] scale-105 -rotate-3 z-30 duration-500";
                    } else if (battleAnimStep === "head_to_head" || battleAnimStep === "prompt_crew" || battleAnimStep === "prompt_debuff" || battleAnimStep === "hazard_incident") {
                      rCardClass += "-translate-x-[12%] sm:-translate-x-[16%] scale-100 -rotate-1 z-20 duration-500";
                    } else if (battleAnimStep === "battle_initial") {
                      rCardClass += "-translate-x-[20%] sm:-translate-x-[26%] -rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "crew_overlay") {
                      rCardClass += "-translate-x-[12%] sm:-translate-x-[16%] scale-105 -rotate-1 z-20 duration-300";
                    } else if (battleAnimStep === "battle_shake_1") {
                      rCardClass += "-translate-x-[20%] sm:-translate-x-[26%] -rotate-3 animate-clash-shake z-20";
                    } else if (battleAnimStep === "debuff_overlay") {
                      rCardClass += "-translate-x-[6%] sm:-translate-x-[8%] -rotate-1 z-20";
                    } else if (battleAnimStep === "battle_shake_2") {
                      rCardClass += "-translate-x-[24%] sm:-translate-x-[34%] -rotate-6 animate-clash-shake z-20";
                    } else if (battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") {
                      if (!currentResult?.won && !currentResult?.tied) {
                        rCardClass += "-translate-x-[40%] sm:-translate-x-[46%] scale-110 rotate-0 animate-winner-pulse z-30 drop-shadow-[0_0_35px_rgba(244,63,94,0.85)]";
                      } else if (currentResult?.tied) {
                        rCardClass += "-translate-x-[12%] scale-105 -rotate-1 z-20";
                      } else {
                        rCardClass += "animate-spinout-right z-10 pointer-events-none";
                      }
                    }

                    return (
                      <div className="space-y-3.5">
                        {/* 3-Corner Progress Stepper */}
                        <div className="grid grid-cols-3 gap-2">
                          {activeSectors.map((c, idx) => {
                            const done = idx < activeCornerIdx;
                            const currentStep = idx === activeCornerIdx;
                            const res = cornerResults[idx];
                            return (
                              <button
                                key={`${c.id}-${idx}`}
                                type="button"
                                onClick={() => startCornerBattle(idx as 0 | 1 | 2)}
                                className={`rounded-xl border px-3 py-2 text-center transition-all ${
                                  currentStep
                                    ? "border-amber-500 bg-amber-500/15 text-white ring-2 ring-amber-500/40"
                                    : done && res
                                      ? res.won
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                        : res.tied
                                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                          : "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                      : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800"
                                }`}
                              >
                                <span className="block text-[10px] font-black uppercase truncate">
                                  {c.icon} Corner {c.number}
                                </span>
                                <span className="block text-[9px] font-bold text-zinc-400 truncate">
                                  {c.name.split("·")[1]?.trim() ?? c.name}
                                </span>
                                <span className="text-[11px] font-extrabold">
                                  {done && res
                                    ? res.won
                                      ? `Won (${res.playerScore}–${res.rivalScore})`
                                      : res.tied
                                        ? `Tied (${res.playerScore}–${res.rivalScore})`
                                        : `Lost (${res.playerScore}–${res.rivalScore})`
                                    : currentStep
                                      ? battleAnimStep === "cards_entrance"
                                        ? "Cars Entering..."
                                        : battleAnimStep === "head_to_head"
                                          ? "Head to Head! ⚔️"
                                          : battleAnimStep === "battle_initial"
                                            ? "Tandem Entry Clash! ⚔️"
                                            : battleAnimStep === "prompt_debuff"
                                              ? "Pick a Debuff! ⚠️"
                                              : battleAnimStep === "hazard_incident"
                                              ? "Hazard Incident! 🚨"
                                              : battleAnimStep === "debuff_overlay"
                                                ? "Debuffs Applied! ⚠️"
                                                : battleAnimStep === "battle_shake_1"
                                                  ? "Hazard Battle! ⚠️"
                                                  : battleAnimStep === "prompt_crew"
                                                    ? "Pick Crew Card ⚡"
                                                    : battleAnimStep === "finale_clash"
                                                    ? "Cars Collide! 💥"
                                                    : battleAnimStep === "finale_roulette"
                                                    ? "Drawing the Finale 🎲"
                                                    : battleAnimStep === "prompt_finale"
                                                    ? "Final Showdown 🎯"
                                                    : battleAnimStep === "finale_result"
                                                    ? "Finale Result 🏁"
                                                    : battleAnimStep === "reveal_stats"
                                                    ? (rivalReveal >= 5 ? "Totals In! 🧮" : "Revealing Rival… 🔍")
                                                    : battleAnimStep === "crew_overlay"
                                                      ? "Crew Advantage! ⚡"
                                                      : battleAnimStep === "battle_shake_2"
                                                        ? "Apex Clash! 💥"
                                                        : battleAnimStep === "knockout_and_winner"
                                                          ? (currentResult?.won ? "You Won!" : currentResult?.tied ? "Dead Heat Tie! ⚖️" : "Rival Won!")
                                                          : "Corner Done"
                                      : "Upcoming"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Top Telemetry & Track Banner */}
                        <div className="flex flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-black text-cyan-300">
                                🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                              </span>
                              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
                                {cornerInfo.formulaBadge}
                              </span>
                              <span className="text-xs font-black text-white">
                                {sector.icon} {cornerInfo.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-black text-zinc-200 border border-zinc-700">
                                SCORE: <strong className="text-amber-400">{runningScore.you}</strong> – <strong className="text-rose-400">{runningScore.rival}</strong>
                              </span>
                              {battleAnimStep !== "corner_finished" && (
                                <button
                                  type="button"
                                  onClick={handleSkipBattleAnimation}
                                  className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700"
                                >
                                  ⚡ Skip Animation
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Dynamic Track Surface Buff & Hazard Sub-strip */}
                          {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-zinc-800/60 text-[10px]">
                              <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">TRACK CONDITIONS:</span>
                              {activeTrackDef.buffLabel && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-bold text-emerald-300">
                                  <span>🟢 Buff:</span> {activeTrackDef.buffLabel}
                                </span>
                              )}
                              {activeTrackDef.debuffLabel && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 font-bold text-rose-300">
                                  <span>⚠️ Hazard:</span> {activeTrackDef.debuffLabel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ── ARCADE GAME VIEW BATTLE ARENA ── */}
                        <div className="relative min-h-[440px] sm:min-h-[520px] w-full overflow-hidden rounded-3xl border-2 border-amber-500/30 bg-gradient-to-b from-zinc-950 via-zinc-900 to-black p-3 sm:p-5 shadow-2xl">
                          {/* Asphalt track curbs & markings */}
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,#ef4444_0,#ef4444_20px,#ffffff_20px,#ffffff_40px)] opacity-60" />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-[repeating-linear-gradient(90deg,#ef4444_0,#ef4444_20px,#ffffff_20px,#ffffff_40px)] opacity-60" />
                          <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 border-l border-dashed border-zinc-700/60" />
                          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-36 w-36 rounded-full border border-amber-500/20 bg-amber-500/5 blur-[1px]" />

                          {/* Stage Grid: Left (Player) vs Right (Rival) */}
                          <div className="relative z-10 grid grid-cols-2 items-start gap-2 sm:gap-6 min-h-[380px]">
                            {/* PLAYER SIDE (LEFT) */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between px-1">
                                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-amber-300">
                                  YOU · {playerCar.name.split(" ")[0]}
                                </span>
                                <span className="text-xs font-black text-amber-400">
                                  {pScore} PTS
                                </span>
                              </div>

                              {/* Player Card Container */}
                              <div className={`relative mx-auto w-32 sm:w-44 max-w-full ${pCardClass}`}>
                                {/* Crew Glow Aura around Player Card */}
                                {showPlayerCrewGlow && (
                                  <>
                                    <div className="pointer-events-none absolute -inset-2.5 sm:-inset-3.5 rounded-3xl bg-gradient-to-r from-amber-400/50 via-yellow-300/40 to-emerald-400/50 blur-xl animate-pulse z-0" />
                                    <div className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.85)] animate-pulse z-20" />
                                  </>
                                )}

                                {/* Floating Stat Value Changes Animated Directly Over Player Card */}
                                {showPlayerStatChanges && (
                                  <div className="pointer-events-none absolute inset-x-0 top-2 sm:top-3 z-30 flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                                    <div className="flex flex-wrap justify-center gap-1 px-1">
                                      {pDiffs.drift && pDiffs.drift.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.drift.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">DRIFT</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.drift.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.accel && pDiffs.accel.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.accel.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">ACCEL</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.accel.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.grip && pDiffs.grip.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.grip.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">GRIP</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.grip.text}
                                          </span>
                                        </div>
                                      )}
                                      {pDiffs.steer && pDiffs.steer.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${pDiffs.steer.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">STEER</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {pDiffs.steer.text}
                                          </span>
                                        </div>
                                      )}
                                      {/* Flat Score Points Bonus */}
                                      {(isCrewStage || isPromptCrew) && (() => {
                                        // Everything the Crew card adds to the score (flat, underdog, specialist,
                                        // giant slayer), straight from the scoring engine.
                                        const flatPts = isPromptCrew
                                          ? (previewStage.playerScoreParts?.crewPts ?? 0)
                                          : (settledResult?.playerScoreParts?.crewPts ?? 0);
                                        if (flatPts <= 0) return null;
                                        return (
                                          <div className="animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 border-amber-400 px-1.5 py-0.5 shadow-lg text-amber-300">
                                            <span className="text-[8px] sm:text-[9px] font-black uppercase">BONUS</span>
                                            <span className="text-xs sm:text-sm font-black">+{flatPts} PTS</span>
                                          </div>
                                        );
                                      })()}
                                      {/* Debuff Shield Indicator */}
                                      {(isCrewStage || isPromptCrew) && (() => {
                                        const activeMods = isPromptCrew ? previewMods : isCrewStage ? pCrewMods : null;
                                        const shield = activeMods?.debuffShield ?? 0;
                                        if (shield <= 0) return null;
                                        return (
                                          <div className="animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 border-cyan-400 px-1.5 py-0.5 shadow-lg text-cyan-300">
                                            <span className="text-[8px] sm:text-[9px] font-black uppercase">SHIELD</span>
                                            <span className="text-xs sm:text-sm font-black">{Math.round(shield * 100)}%</span>
                                          </div>
                                        );
                                      })()}

                                      {trackChip(pTrackNow.totalNetPoints)}
                                      {/* PROMINENT TOTAL DEBUFF SUMMARY BADGE */}
                                      {isDebuffOrLater && pDebuffShown.hasAnyDebuff && (
                                        <div className="animate-pulse flex items-center justify-center gap-1 rounded-xl bg-rose-950/95 border-2 border-rose-500 px-2 py-0.5 shadow-[0_0_15px_rgba(244,63,94,0.7)] text-white w-full max-w-[200px]">
                                          <span className="text-[10px]">⚠️</span>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                                            TOTAL:
                                          </span>
                                          <span className="text-[10px] sm:text-xs font-black text-rose-100 truncate">
                                            {pDebuffShown.totalSummary}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <FullArtCard
                                  card={{
                                    ...playerCar,
                                    stats: {
                                      drift: String(pDisplayStats.drift),
                                      accel: String(pDisplayStats.accel),
                                      grip: String(pDisplayStats.grip),
                                      steer: String(pDisplayStats.steer),
                                    },
                                  }}
                                  className="drop-shadow-2xl"
                                />

                                {/* Debuff Micro Badge */}
                                {isDebuffOrLater && (
                                  <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 rounded-lg border border-rose-500/80 bg-zinc-950/95 py-0.5 px-1.5 shadow-xl backdrop-blur-md">
                                    <span className="text-xs shrink-0">{playerDebuffDef.icon}</span>
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate">
                                      {playerDebuffDef.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* RIVAL SIDE (RIGHT) */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between px-1">
                                <span className="truncate text-xs font-black text-rose-400">
                                  {hideRival ? "??? PTS" : `${rScore} PTS`}
                                </span>
                                <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate max-w-[100px]">
                                  {opponent.driverName}
                                </span>
                              </div>

                              {/* Rival Card Container */}
                              <div className={`relative mx-auto w-32 sm:w-44 max-w-full ${rCardClass}`}>
                                {/* Crew Glow Aura around Rival Card */}
                                {isCrewStage && (
                                  <>
                                    <div className="pointer-events-none absolute -inset-2.5 sm:-inset-3.5 rounded-3xl bg-gradient-to-r from-rose-500/50 via-amber-400/40 to-pink-500/50 blur-xl animate-pulse z-0" />
                                    <div className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.85)] animate-pulse z-20" />
                                  </>
                                )}

                                {/* Floating Stat Value Changes Animated Directly Over Rival Card (hidden until the reveal) */}
                                {showPlayerStatChanges && !hideRival && (
                                  <div className="pointer-events-none absolute inset-x-0 top-2 sm:top-3 z-30 flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                                    <div className="flex flex-wrap justify-center gap-1 px-1">
                                      {rDiffs.drift && rDiffs.drift.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.drift.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">DRIFT</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.drift.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.accel && rDiffs.accel.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.accel.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">ACCEL</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.accel.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.grip && rDiffs.grip.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.grip.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">GRIP</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.grip.text}
                                          </span>
                                        </div>
                                      )}
                                      {rDiffs.steer && rDiffs.steer.diff !== 0 && (
                                        <div className={`animate-bounce flex items-center gap-1 rounded-xl bg-zinc-950/95 border-2 px-1.5 py-0.5 shadow-lg ${rDiffs.steer.colorClass}`}>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase">STEER</span>
                                          <span className="text-xs sm:text-sm font-black">
                                            {rDiffs.steer.text}
                                          </span>
                                        </div>
                                      )}

                                      {/* PROMINENT TOTAL DEBUFF SUMMARY BADGE FOR RIVAL */}
                                      {trackChip(rTrackNow.totalNetPoints)}
                                      {isDebuffOrLater && rDebuffBreakdown.hasAnyDebuff && (
                                        <div className="animate-pulse flex items-center justify-center gap-1 rounded-xl bg-rose-950/95 border-2 border-rose-500 px-2 py-0.5 shadow-[0_0_15px_rgba(244,63,94,0.7)] text-white w-full max-w-[200px]">
                                          <span className="text-[10px]">⚠️</span>
                                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-rose-300 shrink-0">
                                            TOTAL:
                                          </span>
                                          <span className="text-[10px] sm:text-xs font-black text-rose-100 truncate">
                                            {rDebuffBreakdown.totalSummary}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <FullArtCard
                                  card={{
                                    ...rivalCar,
                                    // Hidden stats show as "?" and the card's /100 total is left off, until the reveal.
                                    stats: {
                                      drift: revealLevel >= 1 ? String(rDisplayStats.drift) : "?",
                                      accel: revealLevel >= 2 ? String(rDisplayStats.accel) : "?",
                                      grip: revealLevel >= 3 ? String(rDisplayStats.grip) : "?",
                                      steer: revealLevel >= 4 ? String(rDisplayStats.steer) : "?",
                                    },
                                  }}
                                  className="drop-shadow-2xl"
                                />

                                {/* Debuff Micro Badge */}
                                {isDebuffOrLater && (
                                  <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 rounded-lg border border-rose-500/80 bg-zinc-950/95 py-0.5 px-1.5 shadow-xl backdrop-blur-md">
                                    <span className="text-xs shrink-0">{rivalDebuffDef.icon}</span>
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-rose-300 truncate">
                                      {rivalDebuffDef.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center Battle Indicator: Head-to-Head */}
                          {battleAnimStep === "head_to_head" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-amber-400 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
                                <span className="text-xl">⚔️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                  HEAD-TO-HEAD FACE-OFF!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Staging at the start line!</p>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator: Initial Tandem Battle */}
                          {battleAnimStep === "battle_initial" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-amber-400 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
                                <span className="text-xl">⚔️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                  TANDEM BATTLE INITIATED!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Door-to-door through the entry clipping zone!</p>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator 1: Battle Shake 1 */}
                          {battleAnimStep === "battle_shake_1" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-amber-400 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(245,158,11,0.6)]">
                                <span className="text-xl">⚠️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                                  HAZARD IMPACT!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Both cars fighting through the debuffs!</p>
                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator: Debuff Overlay Hit */}
                          {battleAnimStep === "debuff_overlay" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200 px-3">
                              <div className="inline-block rounded-2xl border-2 border-rose-500 bg-zinc-950/95 p-3 sm:px-6 sm:py-3.5 shadow-[0_0_35px_rgba(244,63,94,0.7)] backdrop-blur-md">
                                <span className="text-2xl animate-pulse">⚠️</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-400">
                                  CORNER DEBUFFS PLAYED!
                                </p>
                                <div className="mt-1.5 flex flex-col sm:flex-row items-center justify-center gap-2 text-[10px] sm:text-[11px] font-bold text-zinc-200">
                                  <div className="flex items-center gap-1 rounded-lg bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 text-rose-200">
                                    <span>ON YOU (RIVAL&apos;S PICK):</span>
                                    <span className="text-white font-extrabold">{playerDebuffDef.name}</span>
                                    <span className="text-rose-300">({pDebuffBreakdown.totalSummary})</span>
                                  </div>
                                  <div className="flex items-center gap-1 rounded-lg bg-rose-950/80 border border-rose-500/50 px-2.5 py-1 text-rose-200">
                                    <span>ON RIVAL (YOUR PICK):</span>
                                    <span className="text-white font-extrabold">{rivalDebuffDef.name}</span>
                                    {!hideRival && <span className="text-rose-300">({rDebuffBreakdown.totalSummary})</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ── INTERACTIVE CREW CARD SPREAD AT BOTTOM (OPTIMIZED FOR MOBILE) ── */}
                          {battleAnimStep === "prompt_crew" && (
                            <div className="absolute inset-x-0 bottom-2 sm:bottom-3 z-40 flex flex-col items-center px-2 animate-in slide-in-from-bottom-4 duration-300">
                              {/* Micro instruction pill */}
                              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/95 border border-amber-500/50 px-3 py-0.5 shadow-lg backdrop-blur-md">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                                  ⚡ DEPLOY PIT CREW COUNTER ({remainingCrewSlotIndices.length} Available)
                                </span>
                              </div>

                              {/* Overlapping Hand Spread of Crew Cards */}
                              <div className="flex items-end justify-center -space-x-4 sm:-space-x-6 pb-1.5 w-full max-w-md mx-auto">
                                {remainingCrewSlotIndices.map((crewIdx, spreadIdx) => {
                                  const crewCard = selectedCrewCards[crewIdx];
                                  const def = resolveCrewDef(crewCard);
                                  const mods = def.modifiers;
                                  const isSelected = previewCrewIdx === crewIdx;

                                  const total = remainingCrewSlotIndices.length;
                                  let fanRotation = "rotate-0";
                                  if (total === 3) {
                                    if (spreadIdx === 0) fanRotation = "-rotate-3";
                                    else if (spreadIdx === 2) fanRotation = "rotate-3";
                                  } else if (total === 2) {
                                    if (spreadIdx === 0) fanRotation = "-rotate-2";
                                    else if (spreadIdx === 1) fanRotation = "rotate-2";
                                  }

                                  return (
                                    <button
                                      key={crewCard.id || crewIdx}
                                      type="button"
                                      onClick={() => setPreviewCrewIdx(crewIdx)}
                                      className={`group relative flex flex-col justify-between w-28 sm:w-32 h-36 sm:h-40 rounded-2xl border-2 p-2.5 text-left transition-all duration-200 select-none ${fanRotation} ${
                                        isSelected
                                          ? "-translate-y-4 scale-105 z-30 rotate-0 border-amber-400 bg-gradient-to-b from-amber-950/95 via-zinc-900 to-black shadow-[0_0_30px_rgba(245,158,11,0.65)] ring-2 ring-amber-400/80"
                                          : "border-zinc-700 bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 hover:border-zinc-500 hover:-translate-y-1 z-10 opacity-90 shadow-xl"
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-xl sm:text-2xl drop-shadow">{def.icon}</span>
                                          {isSelected && (
                                            <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[8px] font-black uppercase text-black">
                                              ✓
                                            </span>
                                          )}
                                        </div>
                                        <span className="mt-1 block text-[8px] font-black uppercase tracking-wider text-amber-400 truncate">
                                          {def.category || "Tactical"}
                                        </span>
                                        <h5 className="text-[11px] sm:text-xs font-black text-white line-clamp-2 leading-tight">
                                          {crewCard.name}
                                        </h5>
                                      </div>

                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {mods.driftBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.driftBonus} D
                                          </span>
                                        ) : null}
                                        {mods.accelBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.accelBonus} A
                                          </span>
                                        ) : null}
                                        {mods.gripBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.gripBonus} G
                                          </span>
                                        ) : null}
                                        {mods.steerBonus ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.steerBonus} S
                                          </span>
                                        ) : null}
                                        {mods.boostWeakestStat ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            +{mods.boostWeakestStat} Low Stat
                                          </span>
                                        ) : null}
                                        {mods.minStatFloor ? (
                                          <span className="rounded bg-emerald-500/25 border border-emerald-400/60 px-1 py-0.5 text-[9px] font-black text-emerald-300">
                                            Floor {mods.minStatFloor}
                                          </span>
                                        ) : null}
                                        {mods.flatBonus ? (
                                          <span className="rounded bg-amber-500/25 border border-amber-400/60 px-1 py-0.5 text-[9px] font-black text-amber-300">
                                            +{mods.flatBonus} Pts
                                          </span>
                                        ) : null}
                                        {mods.underdogBonus ? (
                                          <span className="rounded bg-amber-500/25 border border-amber-400/60 px-1 py-0.5 text-[9px] font-black text-amber-300">
                                            +{mods.underdogBonus} Underdog
                                          </span>
                                        ) : null}
                                        {mods.giantSlayerBonus ? (
                                          <span className="rounded bg-pink-500/25 border border-pink-400/60 px-1 py-0.5 text-[9px] font-black text-pink-300">
                                            +{mods.giantSlayerBonus} Slayer
                                          </span>
                                        ) : null}
                                        {mods.debuffShield ? (
                                          <span className="rounded bg-cyan-500/25 border border-cyan-400/60 px-1 py-0.5 text-[9px] font-black text-cyan-300">
                                            🛡️ {Math.round(mods.debuffShield * 100)}%
                                          </span>
                                        ) : null}
                                        {mods.cornerSpecialist ? (
                                          <span className="rounded bg-purple-500/25 border border-purple-400/60 px-1 py-0.5 text-[9px] font-black text-purple-300">
                                            +{mods.cornerSpecialist.bonusPoints} Spec
                                          </span>
                                        ) : null}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Confirm Button */}
                              <button
                                type="button"
                                onClick={() => handleApplyCrewAndResumeBattle(previewCrewIdx ?? remainingCrewSlotIndices[0] ?? 0, activeCornerIdx)}
                                className="inline-flex min-h-10 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_25px_rgba(245,158,11,0.55)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                              >
                                <span>⚡ Apply Crew Counter &amp; Clash! →</span>
                              </button>
                            </div>
                          )}

                          {/* ── FINALE RESULT: the comparison, then the points count up, then the reveal ── */}
                          {battleAnimStep === "finale_result" &&
                            finaleOutcome &&
                            finaleOutcome.cornerIdx === activeCornerIdx &&
                            currentResult?.playerFinalStats &&
                            currentResult.rivalFinalStats && (
                              <ClashFinaleResult
                                key={`finale-result-${activeCornerIdx}`}
                                outcome={finaleOutcome.outcome}
                                cornerNumber={sector.number}
                                playerStats={currentResult.playerFinalStats}
                                rivalStats={currentResult.rivalFinalStats}
                                playerScoreBefore={currentResult.playerScoreBeforeFinale ?? currentResult.playerScore}
                                playerScoreAfter={currentResult.playerScore}
                                onDone={() => scheduleClashReveal()}
                              />
                            )}

                          {/* ── FINALE: a random last game that can still swing the corner ── */}
                          {battleAnimStep === "finale_roulette" && pendingFinale && pendingFinale.cornerIdx === activeCornerIdx && (
                            <ClashFinaleRoulette
                              key={`roulette-${activeCornerIdx}-${pendingFinale.mode}`}
                              mode={pendingFinale.mode}
                              cornerNumber={sector.number}
                              onDone={() => setBattleAnimStep("prompt_finale")}
                            />
                          )}
                          {battleAnimStep === "prompt_finale" && pendingFinale && pendingFinale.cornerIdx === activeCornerIdx && pendingFinale.base.playerFinalStats && (
                            <ClashFinalePanel
                              key={`finale-${activeCornerIdx}-${pendingFinale.mode}`}
                              mode={pendingFinale.mode}
                              cornerNumber={sector.number}
                              carName={playerCar.name}
                              playerStats={pendingFinale.base.playerFinalStats}
                              weights={pendingFinale.weights}
                              onSubmit={(choice) =>
                                completeFinale(
                                  pendingFinale.cornerIdx,
                                  pendingFinale.base,
                                  pendingFinale.mode,
                                  choice,
                                  false,
                                  pendingFinale.weights
                                )
                              }
                              onSkip={handleSkipBattleAnimation}
                            />
                          )}

                          {/* ── TRACK HAZARD INCIDENT POPUP: one of the DEBUFF_SCENARIOS explains the debuffs that just hit ── */}
                          {battleAnimStep === "hazard_incident" && (
                            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 sm:items-center">
                              <div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="hazard-incident-title"
                                className="relative my-auto w-full max-w-sm rounded-3xl border-2 border-amber-500/80 bg-zinc-950 p-5 text-center shadow-[0_0_60px_rgba(245,158,11,0.5)] sm:max-w-md sm:p-6"
                              >
                                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-500/20 px-3 py-1">
                                  <span className="text-xs motion-safe:animate-pulse" aria-hidden>⚠️</span>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 sm:text-[11px]">
                                    Corner {activeCornerIdx + 1} Hazard Incident
                                  </span>
                                </div>
                                <div
                                  className="mx-auto my-3 flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-amber-500/20 via-zinc-900 to-black text-4xl shadow-[0_0_25px_rgba(245,158,11,0.3)] motion-safe:animate-bounce sm:h-24 sm:w-24 sm:text-5xl"
                                  aria-hidden
                                >
                                  {hazardScenario?.icon || "⚠️"}
                                </div>
                                <h3 id="hazard-incident-title" className="mt-1 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
                                  {hazardScenario?.title || "Track Incident!"}
                                </h3>
                                <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-300 sm:text-sm">
                                  {hazardScenario?.description || "A sudden mishap on the track disrupted corner entry!"}
                                </p>
                                <p className="mt-3 text-[11px] font-bold text-rose-300">
                                  Both sides are dealt debuff cards. Pick the one to play on the rival&apos;s car.
                                </p>
                                <button
                                  type="button"
                                  autoFocus
                                  onClick={() => setBattleAnimStep("prompt_debuff")}
                                  className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98] sm:text-sm"
                                >
                                  <span>Continue &amp; pick a debuff</span>
                                  <span aria-hidden>→</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ── PICK A DEBUFF: 3 cards are dealt and one is played on the rival's car ── */}
                          {battleAnimStep === "prompt_debuff" && (
                            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 sm:items-center">
                              <div
                                role="dialog"
                                aria-modal="true"
                                aria-label="Choose a debuff to play on the rival's car"
                                className="relative my-auto w-full max-w-lg rounded-3xl border-2 border-rose-500/80 bg-zinc-950 p-4 text-center shadow-[0_0_60px_rgba(244,63,94,0.45)] sm:p-6"
                              >
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-500/20 px-3 py-1">
                                  <span className="text-xs" aria-hidden>⚠️</span>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-300 sm:text-[11px]">
                                    Corner {activeCornerIdx + 1} · Play a debuff
                                  </span>
                                </div>
                                <h3 className="mt-2 text-lg font-black uppercase tracking-tight text-white sm:text-xl">
                                  Hit {opponent.driverName}&apos;s {rivalCar.name}
                                </h3>
                                <p className="mt-1 text-xs text-zinc-400">
                                  Pick one of your 3 debuff cards. The rival is picking one for your car too. Their car&apos;s stats are hidden.
                                </p>
                                <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                                  {debuffHand.map((def, i) => {
                                    // The rival car's stats are hidden, so the card shows its own rule instead of
                                    // what it would do to that car.
                                    const selected = debuffPickIdx === i;
                                    return (
                                      <button
                                        key={`${def.id}-${def.tier}-${i}`}
                                        type="button"
                                        onClick={() => setDebuffPickIdx(i)}
                                        aria-pressed={selected}
                                        aria-label={`${def.name}, ${def.tier}: ${def.ability}`}
                                        className={`flex cursor-pointer flex-col gap-1.5 rounded-2xl border-2 p-1.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                          selected
                                            ? "-translate-y-1 border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                                            : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                                        }`}
                                      >
                                        <FullArtCard card={debuffToMemberCard(def, `hand-${activeCornerIdx}-${i}-${def.id}`)} />
                                        <span className="rounded-lg bg-rose-500/20 px-1.5 py-1 text-center text-[10px] font-black leading-tight text-rose-200">
                                          {def.ability}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <button
                                  type="button"
                                  disabled={debuffPickIdx === null}
                                  onClick={() => debuffPickIdx !== null && handleConfirmDebuffPick(debuffPickIdx)}
                                  className="mt-5 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:text-sm"
                                >
                                  <span>{debuffPickIdx === null ? "Choose a debuff" : "Play it on the rival"}</span>
                                  <span className="text-base" aria-hidden>→</span>
                                </button>
                              </div>
                            </div>
                          )}
                          {/* The cars slam together in the middle before the final showdown is drawn */}
                          {battleAnimStep === "finale_clash" && (
                            <>
                              <div
                                className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 text-6xl motion-safe:animate-ping sm:text-7xl"
                                aria-hidden
                              >
                                💥
                              </div>
                              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 px-3 text-center animate-in zoom-in-75 duration-200">
                                <div className="inline-block rounded-2xl border-2 border-cyan-400 bg-zinc-950/95 px-4 py-2.5 shadow-[0_0_35px_rgba(6,182,212,0.7)] backdrop-blur-md">
                                  <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-cyan-300">
                                    ⚡ Crew locked in · Final showdown!
                                  </p>
                                  <p className="text-[10px] sm:text-[11px] font-bold text-zinc-200">
                                    The cars collide. One last game decides the corner.
                                  </p>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Center Battle Indicator: Crew Buff Applied */}
                          {battleAnimStep === "crew_overlay" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200 px-3">
                              <div className="inline-block rounded-2xl border-2 border-cyan-400 bg-zinc-950/95 p-3 sm:px-6 sm:py-3.5 shadow-[0_0_35px_rgba(6,182,212,0.7)] backdrop-blur-md">
                                <span className="text-2xl animate-pulse">⚡</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-cyan-300">
                                  PIT CREW ADVANTAGE LOCKED IN!
                                </p>
                                <p className="text-[10px] sm:text-[11px] font-bold text-zinc-200 mt-0.5">
                                  Deploying crew tuning &amp; counter buffs!
                                </p>

                              </div>
                            </div>
                          )}

                          {/* Center Battle Indicator 2: Battle Shake 2 */}
                          {battleAnimStep === "battle_shake_2" && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 text-center animate-in zoom-in-75 duration-200">
                              <div className="inline-block rounded-2xl border-2 border-rose-500 bg-black/90 px-4 py-2.5 shadow-[0_0_35px_rgba(244,63,94,0.6)]">
                                <span className="text-xl">💥</span>
                                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-300">
                                  APEX CLASH!
                                </p>
                                <p className="text-[10px] font-bold text-zinc-300">Full-throttle battle for the corner finish!</p>
                              </div>
                            </div>
                          )}

                          {/* The reveal, docked at the bottom: both cars' stats with every buff and debuff (the rival's one by one),
                              then the totals. It stays up while the winner is announced. */}
                          {(battleAnimStep === "reveal_stats" || battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") &&
                            currentResult && (
                              <ClashRevealPanel
                      result={currentResult}
                      cornerNumber={sector.number}
                      level={revealLevel}
                      winnerStage={battleAnimStep !== "reveal_stats"}
                    />
                            )}

                          {/* Knockout & Winner Celebratory Banner */}
                          {(battleAnimStep === "knockout_and_winner" || battleAnimStep === "corner_finished") && currentResult && (
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 z-40 text-center animate-in zoom-in-75 duration-400">
                              <div className={`inline-block rounded-3xl border-2 px-6 py-4 shadow-2xl backdrop-blur-md ${
                                currentResult.won
                                  ? "border-amber-400 bg-black/90 shadow-[0_0_50px_rgba(245,158,11,0.7)]"
                                  : currentResult.tied
                                    ? "border-amber-400 bg-black/90 shadow-[0_0_50px_rgba(245,158,11,0.7)]"
                                    : "border-rose-500 bg-black/90 shadow-[0_0_50px_rgba(244,63,94,0.7)]"
                              }`}>
                                <span className="text-3xl sm:text-4xl">
                                  {currentResult.won ? "🏆" : currentResult.tied ? "⚖️" : "💥"}
                                </span>
                                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
                                  {currentResult.won
                                    ? `CORNER ${activeCornerIdx + 1} WON!`
                                    : currentResult.tied
                                      ? "DEAD HEAT TIE!"
                                      : `RIVAL TAKES CORNER ${activeCornerIdx + 1}!`}
                                </h3>
                                <p className={`mt-1 text-xs sm:text-sm font-black ${
                                  currentResult.won ? "text-emerald-400" : currentResult.tied ? "text-amber-400" : "text-rose-400"
                                }`}>
                                  {currentResult.playerScore} PTS vs {currentResult.rivalScore} PTS
                                  {currentResult.won && ` (+${currentResult.playerScore - currentResult.rivalScore} PTS LEAD)`}
                                </p>
                                {currentResult.finaleSummary && (
                                  <p className="mt-1 max-w-xs text-[10px] font-bold text-zinc-300">
                                    Finale: {(currentResult.playerFinalePoints ?? 0) >= 0 ? "+" : ""}
                                    {currentResult.playerFinalePoints ?? 0} you · {(currentResult.rivalFinalePoints ?? 0) >= 0 ? "+" : ""}
                                    {currentResult.rivalFinalePoints ?? 0} rival
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── STEP 3 FLOATING ACTION DOCK / NEXT CORNER ACTION BUTTON (OVERLAYS BOTTOM OF SCREEN) ── */}
                        {battleAnimStep === "corner_finished" && (
                          <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-zinc-950/95 to-transparent px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-md shadow-[0_-10px_25px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => startCornerBattle(activeCornerIdx)}
                                className="rounded-xl border border-zinc-700 bg-zinc-900/90 px-3.5 sm:px-4 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors shadow-lg shrink-0 cursor-pointer"
                              >
                                🔄 Replay
                              </button>

                              <button
                                type="button"
                                onClick={handleNextCornerOrVerdict}
                                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 sm:px-7 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                {activeCornerIdx === 0
                                  ? "🏁 Onto Corner 2 →"
                                  : activeCornerIdx === 1
                                    ? "🏁 Onto Final Corner 3 →"
                                    : "🏆 View Final Scores & Verdict →"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* ── STEP 4: FINAL PODIUM VERDICT ───────────────────────── */}
                {phase === "verdict" && battleBanner && (
                  <div className="space-y-4">
                    <div
                      className={`rounded-3xl border-2 p-5 text-center shadow-2xl ${
                        battleBanner.won
                          ? "border-emerald-400/60 bg-gradient-to-b from-emerald-950/80 via-zinc-950 to-black"
                          : "border-rose-500/50 bg-gradient-to-b from-rose-950/70 via-zinc-950 to-black"
                      }`}
                    >
                      <span className="inline-block rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-black uppercase tracking-widest text-amber-300">
                        Final Judge Decision · 🇬🇧 {activeTrackDef.icon} {activeTrackDef.name}
                      </span>
                      {(activeTrackDef.buffLabel || activeTrackDef.debuffLabel) && (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px]">
                          {activeTrackDef.buffLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-bold text-emerald-300">
                              <span>🟢 Track Buff:</span> {activeTrackDef.buffLabel}
                            </span>
                          )}
                          {activeTrackDef.debuffLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-bold text-rose-300">
                              <span>⚠️ Track Hazard:</span> {activeTrackDef.debuffLabel}
                            </span>
                          )}
                        </div>
                      )}
                      <h3 className="mt-1 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                        {battleBanner.won ? "🏆 TANDEM VICTORY!" : "😤 DEFEATED ON TRACK"}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-zinc-300">
                        {battleBanner.tiedCorners > 0 ? (
                          <>
                            You won <strong className="text-emerald-400">{battleBanner.playerCorners}</strong>,{" "}
                            tied <strong className="text-amber-400">{battleBanner.tiedCorners}</strong>, and lost{" "}
                            <strong className="text-rose-400">{battleBanner.opponentCorners}</strong> of 3 corners against{" "}
                            <strong className="text-white">{opponent.driverName}</strong> ({opponent.teamName})
                          </>
                        ) : (
                          <>
                            You won <strong className="text-white">{battleBanner.playerCorners}</strong> of 3 corners against{" "}
                            <strong className="text-white">{opponent.driverName}</strong> ({opponent.teamName})
                          </>
                        )}
                      </p>

                      <div className="mt-2 flex items-center justify-center gap-2">
                        <span className="rounded-full bg-zinc-950/80 border border-zinc-700 px-3.5 py-1 text-xs font-black text-zinc-200">
                          MATCH TOTAL:{" "}
                          <strong className="text-amber-400">
                            {cornerResults.reduce((sum, r) => sum + (r?.playerScore ?? 0), 0)}
                          </strong>{" "}
                          –{" "}
                          <strong className="text-rose-400">
                            {cornerResults.reduce((sum, r) => sum + (r?.rivalScore ?? 0), 0)}
                          </strong>{" "}
                          PTS
                        </span>
                      </div>

                      {(battleBanner.rewardGranted > 0 ||
                        battleBanner.streakBonusGranted > 0) && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-black shadow-lg">
                          <span>
                            🪙 +
                            {battleBanner.rewardGranted + battleBanner.streakBonusGranted}{" "}
                            P-Credits Earned!
                          </span>
                        </div>
                      )}

                      {activeChallenge && battleBanner.won && (
                        <div
                          className={`mt-4 rounded-2xl border-2 p-3 text-center shadow-lg ${
                            CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.borderClass || "border-purple-500"
                          } ${
                            CHALLENGE_THEME_CONFIGS[activeChallenge.themeStyle]?.bgGradientClass || "bg-purple-950/60"
                          }`}
                        >
                          <span className="text-2xl">🏆</span>
                          <h4 className="text-base font-black text-white">
                            CHALLENGE CUP WON: {activeChallenge.title}
                          </h4>
                          <p className="text-xs text-zinc-300 mt-0.5">
                            You conquered this challenge series and claimed the victory purse!
                          </p>
                          {activeChallenge.rewardPCredits > 0 && (
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1 text-xs font-black text-black">
                              ⚡ +{activeChallenge.rewardPCredits} P-Credits Awarded!
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3-Corner Complete Breakdown with full Buffs & Debuffs Telemetry */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {cornerResults.map((s, idx) => {
                        if (!s) return null;
                        const pCrewDef = resolveCrewDef(s.playerCrewCard);
                        const rCrewDef = resolveCrewDef(s.rivalCrewCard);
                        const pMods = pCrewDef.modifiers ?? {};
                        const rMods = rCrewDef.modifiers ?? {};
                        const pShield = Math.min(1, Math.max(0, pMods.debuffShield ?? 0));
                        const rShield = Math.min(1, Math.max(0, rMods.debuffShield ?? 0));

                        const pDebuff = s.playerDebuffBreakdown ?? computeDebuffBreakdown({
                          card: s.playerCard,
                          debuffCard: s.playerDebuffCard,
                          trackCard: s.trackCard,
                          shield: pShield,
                        });
                        const rDebuff = s.rivalDebuffBreakdown ?? computeDebuffBreakdown({
                          card: s.rivalCard,
                          debuffCard: s.rivalDebuffCard,
                          trackCard: s.trackCard,
                          shield: rShield,
                        });
                        const pTrack = s.playerTrackBreakdown ?? computeTrackBreakdown({
                          card: s.playerCard,
                          trackCard: s.trackCard,
                          shield: pShield,
                        });
                        const rTrack = s.rivalTrackBreakdown ?? computeTrackBreakdown({
                          card: s.rivalCard,
                          trackCard: s.trackCard,
                          shield: rShield,
                        });

                        // Player buffs: what the Crew card really added (a stat already near 25 gains less than the card says,
                        // and its point bonuses only count when they apply), straight from the scoring engine.
                        const pBuffBadges = crewBuffBadges(s.playerStatStages, s.playerScoreParts, pShield, pMods);

                        // Player penalties
                        const pPenBadges: string[] = [];
                        if (pDebuff.effectiveDriftPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveDriftPenalty} DRIFT`);
                        if (pDebuff.effectiveAccelPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveAccelPenalty} ACCEL`);
                        if (pDebuff.effectiveGripPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveGripPenalty} GRIP`);
                        if (pDebuff.effectiveSteerPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveSteerPenalty} STEER`);
                        if (pDebuff.conditionMet && pDebuff.effectiveConditionPenalty > 0) {
                          pPenBadges.push(
                            `${pDebuff.conditionStat?.toUpperCase()} ${pDebuff.conditionOp} ${pDebuff.conditionThreshold} (-${pDebuff.effectiveConditionPenalty} PTS)`
                          );
                        }
                        if (pDebuff.effectiveFlatPenalty > 0) pPenBadges.push(`-${pDebuff.effectiveFlatPenalty} PTS`);

                        // Rival buffs
                        const rBuffBadges = crewBuffBadges(s.rivalStatStages, s.rivalScoreParts, rShield, rMods);

                        // Rival penalties
                        const rPenBadges: string[] = [];
                        if (rDebuff.effectiveDriftPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveDriftPenalty} DRIFT`);
                        if (rDebuff.effectiveAccelPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveAccelPenalty} ACCEL`);
                        if (rDebuff.effectiveGripPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveGripPenalty} GRIP`);
                        if (rDebuff.effectiveSteerPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveSteerPenalty} STEER`);
                        if (rDebuff.conditionMet && rDebuff.effectiveConditionPenalty > 0) {
                          rPenBadges.push(
                            `${rDebuff.conditionStat?.toUpperCase()} ${rDebuff.conditionOp} ${rDebuff.conditionThreshold} (-${rDebuff.effectiveConditionPenalty} PTS)`
                          );
                        }
                        if (rDebuff.effectiveFlatPenalty > 0) rPenBadges.push(`-${rDebuff.effectiveFlatPenalty} PTS`);

                        return (
                          <div
                            key={s.sector.id}
                            className={`rounded-3xl border-2 p-3 sm:p-4 space-y-3 shadow-xl backdrop-blur-md ${
                              s.won
                                ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/40 via-zinc-950 to-black"
                                : s.tied
                                  ? "border-amber-500/40 bg-gradient-to-b from-amber-950/30 via-zinc-950 to-black"
                                  : "border-rose-500/50 bg-gradient-to-b from-rose-950/40 via-zinc-950 to-black"
                            }`}
                          >
                            {/* Corner Header */}
                            <div className="flex items-center justify-between gap-1 text-xs font-black">
                              <span className="flex items-center gap-1.5 text-white truncate">
                                <span>{s.sector.icon}</span>
                                <span>Corner {idx + 1} · {s.sector.name}</span>
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                  s.won
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                    : s.tied
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                }`}
                              >
                                {s.won ? "WON" : s.tied ? "TIED" : "LOST"} · {s.playerScore} vs {s.rivalScore}
                              </span>
                            </div>

                            {/* Overlapping Matchup Cars Display (Winner Overlaps Loser) */}
                            <div className="relative py-2">
                              <div className="relative flex items-center justify-center -space-x-8 sm:-space-x-12 select-none overflow-visible">
                                {/* Player Car */}
                                <div
                                  className={`transition-all duration-300 ${
                                    s.won
                                      ? "relative z-20 w-36 sm:w-44 scale-105 rotate-0 shadow-[0_0_30px_rgba(245,158,11,0.6)] ring-2 ring-amber-400 rounded-2xl"
                                      : s.tied
                                        ? "relative z-10 w-32 sm:w-38 scale-95 -rotate-2 opacity-95"
                                        : "relative z-10 w-32 sm:w-38 scale-95 -rotate-3 opacity-75 grayscale-[20%]"
                                  }`}
                                >
                                  {s.won && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 px-2.5 py-0.5 text-[9px] font-black uppercase text-black shadow-lg">
                                      👑 WINNER
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewerState({
                                        list: [s.playerCard, s.rivalCard],
                                        index: 0,
                                      })
                                    }
                                    className="block w-full text-left transition-transform hover:scale-102"
                                    aria-label={`View ${s.playerCard.name}`}
                                  >
                                    <FullArtCard card={s.playerCard} />
                                  </button>
                                </div>

                                {/* Rival Car */}
                                <div
                                  className={`transition-all duration-300 ${
                                    !s.won && !s.tied
                                      ? "relative z-20 w-36 sm:w-44 scale-105 rotate-0 shadow-[0_0_30px_rgba(244,63,94,0.6)] ring-2 ring-rose-500 rounded-2xl"
                                      : s.tied
                                        ? "relative z-10 w-32 sm:w-38 scale-95 rotate-2 opacity-95"
                                        : "relative z-10 w-32 sm:w-38 scale-95 rotate-3 opacity-75 grayscale-[20%]"
                                  }`}
                                >
                                  {!s.won && !s.tied && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 via-rose-400 to-pink-500 px-2.5 py-0.5 text-[9px] font-black uppercase text-white shadow-lg">
                                      👑 WINNER
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewerState({
                                        list: [s.playerCard, s.rivalCard],
                                        index: 1,
                                      })
                                    }
                                    className="block w-full text-left transition-transform hover:scale-102"
                                    aria-label={`View ${s.rivalCard.name}`}
                                  >
                                    <FullArtCard card={s.rivalCard} />
                                  </button>
                                </div>
                              </div>

                              {/* Centered Comparative Score Bar */}
                              <div className="mt-2.5 flex items-center justify-center gap-2">
                                <span
                                  className={`rounded-xl px-2.5 py-1 text-center text-[11px] font-black transition-all ${
                                    s.won
                                      ? "bg-amber-500/25 border border-amber-400 text-amber-300 shadow-sm"
                                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  You · <strong className={s.won ? "text-amber-200" : "text-white"}>{s.playerScore} PTS</strong>
                                </span>
                                <span className="text-[10px] font-black text-zinc-600">VS</span>
                                <span
                                  className={`rounded-xl px-2.5 py-1 text-center text-[11px] font-black transition-all ${
                                    !s.won && !s.tied
                                      ? "bg-rose-500/25 border border-rose-400 text-rose-300 shadow-sm"
                                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  Rival · <strong className={!s.won && !s.tied ? "text-rose-200" : "text-white"}>{s.rivalScore} PTS</strong>
                                </span>
                              </div>
                            </div>

                            {/* View Details Accordion Trigger */}
                            <button
                              type="button"
                              onClick={() => toggleCornerDetails(idx)}
                              className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-left text-[11px] font-black transition-all hover:border-amber-500/40 hover:bg-zinc-850"
                            >
                              <span className="flex items-center gap-1.5 text-zinc-300">
                                <span>📊</span>
                                <span>
                                  {expandedCornerDetails[idx]
                                    ? "Hide Corner Details"
                                    : "View Details (Buffs, Debuffs & Formula)"}
                                </span>
                              </span>
                              <span
                                className={`text-[10px] text-zinc-400 transition-transform duration-200 ${
                                  expandedCornerDetails[idx] ? "rotate-180 text-amber-400" : ""
                                }`}
                              >
                                ▼
                              </span>
                            </button>

                            {/* Collapsible Detailed Telemetry: Buffs & Debuffs */}
                            {expandedCornerDetails[idx] && (
                              <div className="space-y-2 rounded-2xl bg-black/60 p-2.5 text-[10px] border border-zinc-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* YOUR BUFFS & DEBUFFS */}
                                <div className="space-y-1.5 rounded-xl bg-zinc-950/90 p-2 border border-zinc-800">
                                  <div className="flex items-center justify-between text-[11px] font-black">
                                    <span className="text-amber-400 uppercase tracking-wider">
                                      YOU · ADVANTAGES &amp; HAZARDS
                                    </span>
                                    <span className="font-extrabold text-white">{s.playerScore} PTS</span>
                                  </div>

                                  {/* Crew Advantage */}
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                                      <span>⚡ {pCrewDef.icon}</span>
                                      <span className="truncate">{pCrewDef.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pBuffBadges.length > 0 ? (
                                        pBuffBadges.map((b, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-black text-emerald-300"
                                          >
                                            {b}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">{pCrewDef.ability}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* 🇬🇧 Track Card Buffs & Hazards */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                                      <span>🇬🇧 {s.trackCard.icon}</span>
                                      <span className="truncate">{s.trackCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-cyan-200 bg-cyan-950 border border-cyan-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {pTrack.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pTrack.badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                                            b.type === "buff"
                                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                              : b.type === "hazard"
                                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                                                : "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                                          }`}
                                        >
                                          {b.text}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Hazard / Debuff */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                                      <span>⚠️ {s.playerDebuffCard.icon}</span>
                                      <span className="truncate"><span className="mr-1 text-[8px] font-black uppercase tracking-wide text-zinc-500">Rival&apos;s pick</span>{s.playerDebuffCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-rose-200 bg-rose-950 border border-rose-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {pDebuff.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {pPenBadges.length > 0 ? (
                                        pPenBadges.map((p, pIdx) => (
                                          <span
                                            key={pIdx}
                                            className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[9px] font-black text-rose-300"
                                          >
                                            {p}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">No penalties applied</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* RIVAL BUFFS & DEBUFFS */}
                                <div className="space-y-1.5 rounded-xl bg-zinc-950/90 p-2 border border-zinc-800">
                                  <div className="flex items-center justify-between text-[11px] font-black">
                                    <span className="text-zinc-400 uppercase tracking-wider">
                                      RIVAL · ADVANTAGES &amp; HAZARDS
                                    </span>
                                    <span className="font-extrabold text-zinc-300">{s.rivalScore} PTS</span>
                                  </div>

                                  {/* Rival Crew Advantage */}
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                      <span>⚡ {rCrewDef.icon}</span>
                                      <span className="truncate">{rCrewDef.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rBuffBadges.length > 0 ? (
                                        rBuffBadges.map((b, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className="rounded bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-black text-amber-300"
                                          >
                                            {b}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">{rCrewDef.ability}</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* 🇬🇧 Rival Track Card Buffs & Hazards */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                                      <span>🇬🇧 {s.trackCard.icon}</span>
                                      <span className="truncate">{s.trackCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-cyan-200 bg-cyan-950 border border-cyan-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {rTrack.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rTrack.badges.map((b, bIdx) => (
                                        <span
                                          key={bIdx}
                                          className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                                            b.type === "buff"
                                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                              : b.type === "hazard"
                                                ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                                                : "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                                          }`}
                                        >
                                          {b.text}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Rival Hazard / Debuff */}
                                  <div className="flex flex-col gap-1 pt-1 border-t border-zinc-800/70">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                                      <span>⚠️ {s.rivalDebuffCard.icon}</span>
                                      <span className="truncate">{s.rivalDebuffCard.name}</span>
                                      <span className="ml-auto text-[8px] font-black uppercase text-rose-200 bg-rose-950 border border-rose-500/50 rounded px-1.5 py-0.2">
                                        TOTAL: {rDebuff.totalSummary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {rPenBadges.length > 0 ? (
                                        rPenBadges.map((p, pIdx) => (
                                          <span
                                            key={pIdx}
                                            className="rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[9px] font-black text-rose-300"
                                          >
                                            {p}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[9px] text-zinc-400">No penalties applied</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Judge Telemetry & Formula Breakdown */}
                                <div className="rounded-xl bg-zinc-900/90 p-2 border border-zinc-800 text-[9px] space-y-1">
                                  <span className="block font-black text-zinc-400 uppercase tracking-wider">
                                    ⚖️ Corner Telemetry &amp; Formula
                                  </span>
                                  <p className="font-mono text-zinc-300 break-words">
                                    <strong className="text-amber-400">YOU:</strong> {s.playerBreakdown} ={" "}
                                    <strong className="text-white">{s.playerScore} pts</strong>
                                  </p>
                                  <p className="font-mono text-zinc-400 break-words">
                                    <strong className="text-zinc-300">RIVAL:</strong> {s.rivalBreakdown} ={" "}
                                    <strong className="text-zinc-200">{s.rivalScore} pts</strong>
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Drift Campaign: what this battle cost the cars (the normal game's wear, applied to your real cards) */}
                    {campaign?.maintenance && (
                      <div className="rounded-3xl border border-amber-500/40 bg-zinc-900/90 p-4 text-left shadow-lg space-y-2.5">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-400">🔧 Maintenance</span>
                          <span className="text-[10px] font-bold text-zinc-400">Each car lost 1 battle of durability</span>
                        </div>
                        <ul className="space-y-1.5">
                          {campaign.maintenance.cars.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate font-bold text-zinc-200">{c.name}</span>
                              <span className={`shrink-0 font-black tabular-nums ${c.broken ? "text-rose-400" : "text-emerald-400"}`}>
                                {c.broken
                                  ? "Needs repair"
                                  : c.remaining !== null
                                    ? `${c.remaining}${c.max !== null ? `/${c.max}` : ""} battles left`
                                    : "worn"}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {campaign.maintenance.events.map((ev, i) => (
                          <p
                            key={i}
                            className={`rounded-2xl border p-2.5 text-[11px] font-bold ${
                              ev.type === "fault"
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            }`}
                          >
                            {ev.type === "fault"
                              ? `${ev.faultIcon || "⚠️"} ${ev.cardName} broke down: ${ev.faultName}. Repair it with a ${ev.faultName} kit before the next battle.`
                              : `✅ ${ev.cardName} finished its repair and has ${ev.freshBattles} fresh battles.`}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Pit Garage Status & Mechanical Report */}
                    {pitReport.length > 0 && (
                      <div className="rounded-3xl border border-amber-500/40 bg-zinc-900/90 p-4 space-y-2.5 text-left shadow-lg">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <span>🛠️</span> Pit Garage Report
                          </span>
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            Mechanical Wear &amp; Repairs
                          </span>
                        </div>
                        <div className="space-y-2">
                          {pitReport.map((ev, rIdx) => (
                            <div
                              key={rIdx}
                              className={`flex items-center justify-between gap-3 rounded-2xl p-3 border ${
                                ev.type === "fault"
                                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl">{ev.type === "fault" ? ev.faultIcon || "⚠️" : "✅"}</span>
                                <div>
                                  <p className="text-xs font-black">
                                    {ev.cardName}: {ev.type === "fault" ? `Mechanical Breakdown · ${ev.faultName}` : "Fully Repaired & Race Ready!"}
                                  </p>
                                  <p className="text-[11px] opacity-80 leading-relaxed">
                                    {ev.type === "fault"
                                      ? `Car broke down! Must sit out ${ev.battlesNeeded} battles in maintenance or use a ${ev.faultName} Repair Kit.`
                                      : `Pit crew completed full maintenance overhaul. ${ev.freshBattles} fresh battles ready!`}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="sticky bottom-0 z-40 -mx-3.5 sm:-mx-6 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] bg-gradient-to-t from-black via-zinc-950/95 to-transparent backdrop-blur-md shadow-[0_-10px_25px_rgba(0,0,0,0.8)] flex flex-wrap items-center justify-center gap-3">
                      {campaign ? (
                        <button
                          type="button"
                          onClick={campaign.onContinue}
                          disabled={campaign.continueDisabled}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-sm font-black uppercase text-black shadow-lg hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                        >
                          {campaign.continueLabel}
                        </button>
                      ) : activeChallenge ? (
                        <>
                          {completedChallengeIds.includes(activeChallenge.id) ||
                          challengeWonCelebration?.challengeCompleted ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/60 px-6 text-sm font-black uppercase text-emerald-300 shadow-lg">
                                ✓ Challenge Completed Today
                              </span>
                              <span className="text-[11px] font-bold text-zinc-400 tabular-nums">
                                Daily purse claimed · Resets in {utcCountdown}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestReplayChallenge(activeChallenge)}
                              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-6 text-sm font-black uppercase text-white shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:scale-[1.02]"
                            >
                              <span>🔄 Replay Challenge Cup</span>
                              {activeChallenge.entryCostPCredits > 0 && (
                                <span className="rounded-full bg-black/40 border border-amber-400/50 px-2 py-0.5 text-[10px] font-black text-amber-300">
                                  🪙 {activeChallenge.entryCostPCredits}
                                </span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              clearTimers();
                              setActiveChallenge(null);
                              setArenaLobbyTab("challenges");
                              setPhase("lobby");
                            }}
                            className="min-h-12 rounded-2xl border border-purple-500/50 bg-purple-950/40 px-5 text-xs font-black uppercase tracking-wider text-purple-300 hover:bg-purple-900/50"
                          >
                            🏆 All Challenges
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              clearTimers();
                              setActiveChallenge(null);
                              setPhase("lobby");
                            }}
                            className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                          >
                            Back to Lobby
                          </button>
                        </>
                      ) : hasEarlyAccess ? (
                        <button
                          type="button"
                          onClick={handleLaunchGame}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-6 text-sm font-black uppercase text-black shadow-lg hover:scale-[1.02]"
                        >
                          <span>🎮 Play Again (New UK Track &amp; Rival)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-800 px-6 text-sm font-black uppercase text-zinc-500 cursor-not-allowed"
                        >
                          <span>🔒 Early Access Required</span>
                        </button>
                      )}
                      {!activeChallenge && !campaign && (
                        <button
                          type="button"
                          onClick={() => setPhase("lobby")}
                          className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                        >
                          Back to Lobby
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nested Picker Modal for Swapping a Car Card or Crew Card Slot */}
            {pickerModalTarget && (
              <div
                className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
                onClick={() => setPickerModalTarget(null)}
              >
                <div
                  className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-amber-500/40 bg-zinc-950 p-4 text-white shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                        {pickerModalTarget.type === "car"
                          ? `Select Car Card for Slot #${pickerModalTarget.slotIdx + 1}`
                          : `Select Crew Advantage Card for Slot #${pickerModalTarget.slotIdx + 1}`}
                      </span>
                      <h4 className="text-base font-black">
                        {pickerModalTarget.type === "car"
                          ? "Choose from your Car Cards"
                          : "Choose from your Crew Advantage Cards"}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerModalTarget(null)}
                      className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                    {(() => {
                      const baseList =
                        pickerModalTarget.type === "car"
                          ? carCards.length >= 3
                            ? carCards
                            : usableCarCards
                          : usableCrewCards;
                      const displayList =
                        pickerModalTarget.type === "car" && activeChallenge
                          ? [...baseList].sort((a, b) => {
                              const aElig = isCarEligibleForChallenge(a, activeChallenge).eligible ? 1 : 0;
                              const bElig = isCarEligibleForChallenge(b, activeChallenge).eligible ? 1 : 0;
                              return bElig - aElig;
                            })
                          : baseList;
                      return displayList;
                    })().map((c, idx, list) => {
                      const isSelectedHere =
                        pickerModalTarget.type === "car"
                          ? selectedCarIds[pickerModalTarget.slotIdx] === c.id
                          : selectedCrewIds[pickerModalTarget.slotIdx] === c.id;
                      const broken = pickerModalTarget.type === "car" && isCarBroken(c);
                      const eligibility =
                        pickerModalTarget.type === "car" && activeChallenge
                          ? isCarEligibleForChallenge(c, activeChallenge)
                          : { eligible: true };
                      const isEligible = eligibility.eligible;
                      const matchingRepair = broken
                        ? maintenanceCards.find((m) => canRepairCarWithMaintenanceCard(c, m))
                        : null;
                      return (
                        <div
                          key={c.id}
                          className={`flex flex-col justify-between rounded-2xl border-2 p-2 text-left transition-all ${
                            broken
                              ? "border-rose-500/50 bg-rose-950/20"
                              : !isEligible
                                ? "border-zinc-800 bg-zinc-950/40 opacity-70"
                                : isSelectedHere
                                  ? "border-amber-400 bg-amber-500/15"
                                  : "border-zinc-800 bg-zinc-900 hover:border-amber-500/60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setViewerState({ list, index: idx })}
                            className="block w-full rounded-xl text-left transition-transform hover:-translate-y-0.5"
                            aria-label={`View ${c.name}`}
                          >
                            <FullArtCard card={c} />
                          </button>
                          <div className="mt-2 space-y-1.5 px-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-zinc-300">
                                {rarityLabel(c.tier)}
                              </span>
                              <span className="text-[10px] font-bold text-amber-300">
                                {pickerModalTarget.type === "car"
                                  ? (broken
                                      ? "⚠️ Broken"
                                      : `🔋 ${c.battlesRemaining ?? c.maxBattles ?? 6}L`)
                                  : "⚡ Crew"}
                              </span>
                            </div>
                            {broken ? (
                              <div className="space-y-1 pt-0.5">
                                <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-center">
                                  <span className="text-[10px] font-black uppercase text-rose-400 block truncate">
                                    ⚠️ {c.fault?.name || "Broken"}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block">
                                    Sits out {c.fault?.battlesRemaining} battle(s)
                                  </span>
                                </div>
                                {matchingRepair ? (
                                  <button
                                    type="button"
                                    disabled={repairingCarId === c.id}
                                    onClick={() => handleQuickRepair(c, matchingRepair)}
                                    className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-500 py-1.5 text-[10px] font-black uppercase text-black hover:opacity-95 shadow-md"
                                  >
                                    {repairingCarId === c.id
                                      ? "Repairing..."
                                      : `🛠️ Quick Fix (-${matchingRepair.repairBattles}L)`}
                                  </button>
                                ) : (
                                  <div className="rounded-xl bg-zinc-800/80 px-1 py-1 text-center text-[9px] text-zinc-500 italic">
                                    Needs {c.fault?.type} Kit
                                  </div>
                                )}
                              </div>
                            ) : !isEligible ? (
                              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-center">
                                <span className="text-[10px] font-black uppercase text-amber-400 block truncate">
                                  🔒 Ineligible
                                </span>
                                <span className="text-[9px] text-zinc-400 block">
                                  {eligibility.reason}
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  assignCardToSlot(
                                    pickerModalTarget.type,
                                    pickerModalTarget.slotIdx,
                                    c.id
                                  )
                                }
                                className={`w-full rounded-xl py-1.5 text-[11px] font-black transition-colors ${
                                  isSelectedHere
                                    ? "bg-amber-500 text-black"
                                    : "bg-zinc-800 text-amber-300 hover:bg-amber-500 hover:text-black"
                                }`}
                              >
                                {isSelectedHere
                                  ? "✓ Equipped"
                                  : `Select Slot #${pickerModalTarget.slotIdx + 1}`}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

      {/* ── LARGE CARD VIEWER MODAL ────────────────────────────────────────── */}
      {viewerState &&
        typeof document !== "undefined" &&
        (() => {
          const card = viewerState.list[viewerState.index];
          if (!card) return null;
          const isCrew = isCrewCard(card);
          const isDebuff = card.cardType === "debuff";
          const isTrack = card.cardType === "track";

          return createPortal(
            <div
              className="fixed inset-0 z-[10000] flex h-[100dvh] w-screen items-stretch justify-center overflow-y-auto bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clash-large-card-title"
              onClick={() => setViewerState(null)}
            >
              <div
                className="relative my-auto grid h-full w-full gap-6 overflow-y-auto bg-zinc-950 p-5 text-zinc-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:w-[min(60rem,94vw)] sm:rounded-3xl sm:border sm:border-amber-500/30 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto w-full max-w-[22rem]">
                  <FullArtCard card={card} className="drop-shadow-2xl" />
                </div>

                <div className="flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                          {rarityLabel(card.tier)}{" "}
                          {isCrew
                            ? "· Crew Advantage Card"
                            : isDebuff
                              ? "· Corner Debuff Card"
                              : isTrack
                                ? "· UK Drift Track Card"
                                : "· Car Card"}
                        </p>
                        <h2 id="clash-large-card-title" className="text-2xl font-black text-white">
                          {card.name}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewerState(null)}
                        className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
                      >
                        Close
                      </button>
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="font-bold text-zinc-400">
                        {isCrew || isDebuff || isTrack ? "Category" : "Driver"}
                      </dt>
                      <dd>{card.driver || "—"}</dd>
                      <dt className="font-bold text-zinc-400">
                        {isCrew || isDebuff || isTrack ? "Set" : "Team"}
                      </dt>
                      <dd>{card.team || "—"}</dd>
                      <dt className="font-bold text-zinc-400">
                        {isCrew
                          ? "Advantage Trigger"
                          : isDebuff
                            ? "Hazard Trigger"
                            : isTrack
                              ? "Surface"
                              : "Chassis"}
                      </dt>
                      <dd className="font-semibold text-amber-300">
                        {card.ability?.trim() || (!isCrew && !isDebuff && !isTrack ? (card as { chassis?: string }).chassis?.trim() || card.name : "—")}
                      </dd>
                      <dt className="font-bold text-zinc-400">Effect</dt>
                      <dd className="leading-relaxed text-zinc-200">
                        {card.effect || "—"}
                      </dd>
                      {!isCrew && !isDebuff && !isTrack && (
                        <>
                          <dt className="font-bold text-zinc-400">Stats</dt>
                          <dd className="font-bold text-amber-300">
                            DRIFT {normalizeStatValue(card.stats.drift)} · ACCEL {normalizeStatValue(card.stats.accel)} · GRIP{" "}
                            {normalizeStatValue(card.stats.grip)} · STEER {normalizeStatValue(card.stats.steer)}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      onClick={() =>
                        setViewerState((prev) =>
                          prev && prev.index > 0
                            ? { ...prev, index: prev.index - 1 }
                            : prev
                        )
                      }
                      disabled={viewerState.index <= 0}
                    >
                      ← Previous
                    </button>
                    <span className="text-xs font-bold text-zinc-400">
                      {viewerState.index + 1} of {viewerState.list.length}
                    </span>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      onClick={() =>
                        setViewerState((prev) =>
                          prev && prev.index < prev.list.length - 1
                            ? { ...prev, index: prev.index + 1 }
                            : prev
                        )
                      }
                      disabled={viewerState.index >= viewerState.list.length - 1}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

      {/* Challenge Replay Entry Fee Confirmation Modal */}
      {challengeReplayConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="relative w-full max-w-sm rounded-3xl border-2 border-purple-500/80 bg-zinc-950 p-6 shadow-[0_0_50px_rgba(168,85,247,0.45)] text-center">
            {/* Icon Badge */}
            <div className="mx-auto my-2 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-purple-400/40 bg-purple-500/20 text-3xl shadow-inner animate-pulse">
              🔄
            </div>

            {/* Header */}
            <h3 className="text-lg font-black uppercase tracking-tight text-white mt-2">
              Replay Challenge Cup?
            </h3>

            {/* Challenge Title */}
            <p className="text-xs font-bold text-purple-300 mt-1">
              {challengeReplayConfirm.title}
            </p>

            {/* Fee Deduct Notice Box */}
            <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-3.5 text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block mb-1">
                ⚠️ Entry Fee Required
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed">
                Replaying this challenge will deduct{" "}
                <strong className="text-amber-400 font-black text-sm">
                  {challengeReplayConfirm.entryCostPCredits} P-Credits
                </strong>{" "}
                again.
              </p>
              <span className="text-[10px] text-zinc-400 block mt-2">
                Current Balance: <strong className="text-white">{internalPCredits} P-Credits</strong>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const ch = challengeReplayConfirm;
                  setChallengeReplayConfirm(null);
                  handleLaunchChallenge(ch);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 px-5 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-[0_0_25px_rgba(168,85,247,0.5)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Pay {challengeReplayConfirm.entryCostPCredits} P-Credits &amp; Replay</span>
                <span>→</span>
              </button>
              <button
                type="button"
                onClick={() => setChallengeReplayConfirm(null)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Manual & Instructions on How to Play Overlay */}
      <ClashHowToPlayModal
        isOpen={showHowToPlayModal}
        onClose={() => setShowHowToPlayModal(false)}
        initialTab={howToPlayTab}
        onOpenCatalog={(category) => {
          setShowCatalogModal(category);
        }}
      />
    </div>
  );
}
