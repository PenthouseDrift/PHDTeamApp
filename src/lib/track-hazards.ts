/**
 * The extended Track Hazard pool for Tandem Clash.
 *
 * `rollUkTrackCard` rolls one Track Hazard per match. On top of the original 10 in `DYNAMIC_TRACK_HAZARD_PRESETS`
 * (crew-cards.ts) there are now three more sets:
 *
 *   - SERIOUS_TRACK_HAZARD_PRESETS (10)   realistic RC drift track problems.
 *   - FUNNY_TRACK_HAZARD_PRESETS (30)     silly venue mishaps.
 *   - MEMBER_HAZARD_TEMPLATES (30)        built around a real member and one of their GARAGE cars (the car they
 *                                         added in "My cars", never a trading card). The member and car are filled
 *                                         in when the hazard is rolled, so they differ from match to match.
 *
 * Every hazard is a penalty the existing engine already understands (`debuffCondition` in progression.ts), so none
 * of them needs new scoring code. The same condition hits both drivers' cars equally.
 *
 * Notes for editing:
 *  - Thresholds must be above 10. The engine treats 10 or below as "out of 10" and multiplies by 2.5.
 *  - Penalties are kept at 3 to 5 points, like the original hazards.
 *  - Keep the member hazards good-natured and about the CAR. They are shown to other players with a real name.
 *  - Keep `name` short: the card's ability line is cut at 60 characters, and the hazard name comes last.
 */

import { DYNAMIC_TRACK_HAZARD_PRESETS, type TrackCardRules, type TrackModifierPreset } from "@/lib/crew-cards";

type Stat = "drift" | "accel" | "grip" | "steer";
type HazardCondition = NonNullable<TrackCardRules["debuffCondition"]>;

/** One member and one of their garage cars, as sent to the client. Display text only, no ids. */
export interface HazardGarageSample {
  /** Nickname, or first name when there is no nickname. */
  user: string;
  /** The car's name from the member's garage. */
  car: string;
}

// ── Condition helpers ───────────────────────────────────────────────────────

const statMin = (stat: Stat, threshold: number, penaltyPoints: number): HazardCondition => ({
  type: "stat_min",
  stat,
  threshold,
  penaltyPoints,
});
const statMax = (stat: Stat, threshold: number, penaltyPoints: number): HazardCondition => ({
  type: "stat_max",
  stat,
  threshold,
  penaltyPoints,
});
const highTier = (penaltyPoints: number): HazardCondition => ({ type: "high_tier", penaltyPoints });

/** The rule in plain words, always generated from the condition so the text can never disagree with the scoring. */
function ruleText(c: HazardCondition): string {
  if (c.type === "high_tier") return `Legend & Mythic cars lose -${c.penaltyPoints} pts`;
  const op = c.type === "stat_min" ? ">=" : "<=";
  return `Cars with base ${String(c.stat).toUpperCase()} ${op} ${c.threshold} lose -${c.penaltyPoints} pts`;
}

interface HazardDef {
  id: string;
  name: string;
  /** The story. Leave out for a plain hazard. */
  flavour?: string;
  condition: HazardCondition;
}

function toPreset(def: HazardDef, fill: (text: string) => string = (t) => t): TrackModifierPreset {
  const name = fill(def.name);
  const story = def.flavour ? `${fill(def.flavour)} ` : "";
  return {
    id: def.id,
    name,
    label: `${name}: ${story}${ruleText(def.condition)}`,
    rules: { debuffCondition: def.condition },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 10 SERIOUS HAZARDS
// ═════════════════════════════════════════════════════════════════════════════

const SERIOUS_DEFS: HazardDef[] = [
  { id: "hazard-s-cold-slab", name: "Cold slab", flavour: "Cold concrete gives the tyres nothing to bite.", condition: statMax("grip", 15, 4) },
  { id: "hazard-s-dusty-line", name: "Dusty racing line", flavour: "Dust on the entry kills the angle.", condition: statMax("drift", 14, 4) },
  { id: "hazard-s-tight-gate", name: "Tight clipping gate", flavour: "A narrow gate punishes soft steering.", condition: statMax("steer", 14, 4) },
  { id: "hazard-s-voltage-fade", name: "Voltage fade", flavour: "Packs sag on the long run.", condition: statMin("accel", 23, 5) },
  { id: "hazard-s-rubber-build", name: "Rubber build-up", flavour: "Old rubber on the apex makes sticky setups hop.", condition: statMin("grip", 23, 4) },
  { id: "hazard-s-expansion-seam", name: "Expansion seam", flavour: "A floor seam sets gyros twitching.", condition: statMin("steer", 21, 4) },
  { id: "hazard-s-tech-inspection", name: "Strict tech inspection", flavour: "Top-spec builds are checked twice.", condition: highTier(4) },
  { id: "hazard-s-damp-patch", name: "Damp patch", flavour: "A damp patch grabs the rear on a big angle.", condition: statMin("drift", 21, 4) },
  { id: "hazard-s-slow-launch", name: "Weak launch zone", flavour: "A long start straight finds slow cars out.", condition: statMax("accel", 13, 4) },
  { id: "hazard-s-loose-surface", name: "Loose surface", flavour: "Grit across the exit catches low-grip cars.", condition: statMax("grip", 13, 4) },
];

export const SERIOUS_TRACK_HAZARD_PRESETS: TrackModifierPreset[] = SERIOUS_DEFS.map((d) => toPreset(d));

// ═════════════════════════════════════════════════════════════════════════════
// 30 FUNNY HAZARDS
// ═════════════════════════════════════════════════════════════════════════════

const FUNNY_DEFS: HazardDef[] = [
  { id: "hazard-f-tumbleweed", name: "Dust bunny tumbleweed", flavour: "A huge dust bunny rolls across the line.", condition: statMin("drift", 20, 3) },
  { id: "hazard-f-cat", name: "Cat on the apex", flavour: "A cat has sat down on the clipping point.", condition: statMin("steer", 20, 4) },
  { id: "hazard-f-wet-floor", name: "Wet floor sign", flavour: "Someone put a wet floor sign in the middle of the line.", condition: statMin("grip", 20, 3) },
  { id: "hazard-f-biscuit", name: "Biscuit crumbs", flavour: "Digestive crumbs all over the pit exit.", condition: statMin("accel", 20, 3) },
  { id: "hazard-f-roomba", name: "Rogue robot vacuum", flavour: "A robot vacuum is doing laps of its own.", condition: highTier(4) },
  { id: "hazard-f-tea-break", name: "Judges' tea break", flavour: "The judges are making tea and not watching angle.", condition: statMin("drift", 22, 4) },
  { id: "hazard-f-marshal-chair", name: "Forgotten marshal chair", flavour: "A folding chair is left at the hairpin.", condition: statMax("steer", 14, 3) },
  { id: "hazard-f-static", name: "Static cling", flavour: "Static from the carpet makes the cars cling.", condition: statMin("grip", 22, 4) },
  { id: "hazard-f-sweet-wrapper", name: "Sticky sweet wrapper", flavour: "A sweet wrapper is stuck to the tarmac.", condition: statMin("grip", 21, 3) },
  { id: "hazard-f-speaker", name: "Wrong Bluetooth speaker", flavour: "Someone paired their phone to the radio kit.", condition: statMin("steer", 21, 4) },
  { id: "hazard-f-hex-driver", name: "Stray hex driver", flavour: "A 2.0mm hex driver is lying on the exit.", condition: statMin("accel", 21, 3) },
  { id: "hazard-f-glue", name: "Empty tyre glue bottle", flavour: "Empty glue bottle rolling about the pit lane.", condition: statMax("grip", 14, 3) },
  { id: "hazard-f-crowd", name: "Leaning crowd", flavour: "The crowd leans in for a better view.", condition: statMin("drift", 21, 3) },
  { id: "hazard-f-toast", name: "Burnt toast", flavour: "Someone burnt the toast and the smoke alarm is thinking about it.", condition: statMax("accel", 14, 3) },
  { id: "hazard-f-fog", name: "Overexcited fog machine", flavour: "The fog machine has gone off script.", condition: statMin("steer", 22, 4) },
  { id: "hazard-f-lap-gremlin", name: "Lap counter gremlin", flavour: "The lap counter keeps resetting itself.", condition: statMax("drift", 14, 3) },
  { id: "hazard-f-antenna", name: "Wandering antenna", flavour: "Someone's antenna is waving across the line.", condition: statMin("accel", 22, 4) },
  { id: "hazard-f-sofa", name: "Sofa delivery", flavour: "A sofa is being delivered through the track.", condition: highTier(5) },
  { id: "hazard-f-lift-music", name: "Penthouse lift music", flavour: "Smooth jazz makes the drivers far too relaxed.", condition: statMax("accel", 15, 3) },
  { id: "hazard-f-wonky-cone", name: "Wonky cone club", flavour: "The cones have formed a union and moved.", condition: statMax("steer", 13, 4) },
  { id: "hazard-f-pizza", name: "Pizza box chicane", flavour: "A pizza box has been added to the chicane.", condition: statMin("drift", 23, 4) },
  { id: "hazard-f-glitter", name: "After-party glitter", flavour: "Glitter from last night is still on the surface.", condition: statMin("grip", 21, 4) },
  { id: "hazard-f-skateboard", name: "Runaway skateboard", flavour: "A skateboard has rolled off on its own.", condition: statMin("accel", 20, 4) },
  { id: "hazard-f-marker-pen", name: "Missing marker pen", flavour: "The line was drawn with a dying marker pen.", condition: statMax("steer", 15, 3) },
  { id: "hazard-f-coffee", name: "Cold brew spill", flavour: "A cold brew coffee has been spilled on the apex.", condition: statMin("grip", 20, 3) },
  { id: "hazard-f-ghost", name: "Haunted hairpin", flavour: "The hairpin is haunted and nobody will say why.", condition: statMax("drift", 13, 4) },
  { id: "hazard-f-balloon", name: "Escaped balloon", flavour: "A birthday balloon is drifting over the track.", condition: statMin("drift", 22, 3) },
  { id: "hazard-f-sock", name: "Mystery sock", flavour: "There is a single sock on the racing line.", condition: statMax("grip", 15, 3) },
  { id: "hazard-f-dog", name: "Enthusiastic dog", flavour: "A very friendly dog wants to join the tandem.", condition: highTier(3) },
  { id: "hazard-f-zip-tie", name: "Zip-tie shower", flavour: "A pit crew has clipped off a lot of zip ties.", condition: statMin("steer", 20, 3) },
];

export const FUNNY_TRACK_HAZARD_PRESETS: TrackModifierPreset[] = FUNNY_DEFS.map((d) => toPreset(d));

// ═════════════════════════════════════════════════════════════════════════════
// 30 MEMBER + GARAGE CAR HAZARDS
// `{user}` and `{car}` are replaced when the hazard is rolled.
// ═════════════════════════════════════════════════════════════════════════════

export const MEMBER_HAZARD_TEMPLATES: HazardDef[] = [
  { id: "hazard-m-oil-trail", name: "{user}'s oil trail", flavour: "{user}'s {car} left a trail of shock oil across the apex.", condition: statMin("grip", 21, 4) },
  { id: "hazard-m-parked-line", name: "{user}'s parked car", flavour: "{user} left the {car} parked on the racing line.", condition: statMin("steer", 21, 4) },
  { id: "hazard-m-fresh-rubber", name: "{user}'s fresh rubber", flavour: "The {car} laid fresh rubber down on the entry.", condition: statMin("grip", 22, 4) },
  { id: "hazard-m-wall-scuff", name: "{user}'s wall scuff", flavour: "The {car} met the wall and {user} left a scuff.", condition: statMin("drift", 22, 5) },
  { id: "hazard-m-loose-screw", name: "{user}'s loose screw", flavour: "The {car} shed a grub screw at the hairpin.", condition: statMin("accel", 20, 4) },
  { id: "hazard-m-cone-chaos", name: "{user}'s cone chaos", flavour: "{user} knocked the cones sideways with the {car}.", condition: statMax("steer", 14, 4) },
  { id: "hazard-m-battery-swap", name: "{user}'s battery swap", flavour: "{user} is swapping packs on the {car} and blocking the pit lane.", condition: highTier(4) },
  { id: "hazard-m-lost-wheel", name: "{user}'s lost wheel", flavour: "The {car} has lost a wheel and it is somewhere on the track.", condition: statMax("grip", 14, 4) },
  { id: "hazard-m-gyro-wobble", name: "{user}'s gyro wobble", flavour: "The {car} gyro won't settle and the track feels it.", condition: statMin("steer", 22, 4) },
  { id: "hazard-m-hot-motor", name: "{user}'s heat haze", flavour: "The {car} overheated and left a heat haze over the line.", condition: statMin("accel", 22, 5) },
  { id: "hazard-m-spin-dirt", name: "{user}'s spin dirt", flavour: "{user} spun the {car} and left dirt on the line.", condition: statMax("drift", 14, 4) },
  { id: "hazard-m-dust-drag", name: "{user}'s dust trail", flavour: "{user} dragged the {car} through the dust to the grid.", condition: statMin("drift", 21, 4) },
  { id: "hazard-m-body-clip", name: "{user}'s body clip", flavour: "A body clip off the {car} is sitting on the apex.", condition: statMin("grip", 20, 3) },
  { id: "hazard-m-wonky-tape", name: "{user}'s wonky tape", flavour: "{user} re-taped the {car} and the cone is now wonky.", condition: statMax("steer", 15, 4) },
  { id: "hazard-m-marshal-car", name: "{user}'s marshal car", flavour: "The {car} is marshalling and is in the way.", condition: highTier(5) },
  { id: "hazard-m-practice-lap", name: "{user}'s polished line", flavour: "One more practice lap in the {car} has polished the line.", condition: statMin("grip", 23, 4) },
  { id: "hazard-m-tyre-wipe", name: "{user}'s tyre wipe", flavour: "{user} wiped the {car}'s tyres and flicked cleaner on the surface.", condition: statMin("drift", 22, 4) },
  { id: "hazard-m-lost-wing", name: "{user}'s lost wing", flavour: "The wing from the {car} is lying at the exit.", condition: statMin("accel", 21, 4) },
  { id: "hazard-m-lipo-puff", name: "{user}'s puffed pack", flavour: "{user}'s {car} puffed a pack and the pit lane smells.", condition: statMax("accel", 14, 4) },
  { id: "hazard-m-judge-distraction", name: "{user}'s showpiece", flavour: "The judges are watching the {car} instead of the line.", condition: highTier(4) },
  { id: "hazard-m-chassis-swap", name: "{user}'s parts pile", flavour: "{user} swapped the {car} chassis and left parts on the grid.", condition: statMax("grip", 15, 3) },
  { id: "hazard-m-warmup-crawl", name: "{user}'s warm-up lap", flavour: "{user} is crawling a warm-up lap in the {car}. Traffic ahead.", condition: statMin("accel", 23, 5) },
  { id: "hazard-m-shock-leak", name: "{user}'s leaky shock", flavour: "The {car} leaked shock oil at the hairpin.", condition: statMin("steer", 20, 4) },
  { id: "hazard-m-stuck-car", name: "{user}'s stuck car", flavour: "The {car} is stuck and someone is fetching it.", condition: statMax("drift", 13, 4) },
  { id: "hazard-m-led-bar", name: "{user}'s light bar", flavour: "The {car} LED light bar is dazzling the drivers.", condition: statMax("steer", 13, 4) },
  { id: "hazard-m-record-run", name: "{user}'s record run", flavour: "{user} just set a PB in the {car} and the crowd is rowdy.", condition: statMin("drift", 23, 5) },
  { id: "hazard-m-spare-tyres", name: "{user}'s spare tyres", flavour: "{user} left a box of spare {car} tyres by the exit.", condition: statMin("grip", 21, 3) },
  { id: "hazard-m-gritty-diff", name: "{user}'s gritty diff", flavour: "The {car} diff is gritty and has thrown grease on the line.", condition: statMin("accel", 20, 3) },
  { id: "hazard-m-pit-towel", name: "{user}'s pit towel", flavour: "The towel {user} uses to dry the {car} has blown onto the line.", condition: statMax("grip", 16, 3) },
  { id: "hazard-m-track-record", name: "{user}'s track record", flavour: "The {car} holds the track record, so everyone is trying too hard.", condition: statMin("steer", 23, 5) },
];

// ═════════════════════════════════════════════════════════════════════════════
// Rolling
// ═════════════════════════════════════════════════════════════════════════════

/** Plain text only: no control characters or angle brackets, collapsed spaces, cut to `max` characters. */
function cleanText(value: string, max: number): string {
  const text = value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Longest member name and car name printed in a hazard. */
export const HAZARD_USER_MAX = 16;
export const HAZARD_CAR_MAX = 28;

/** Make a sample safe to print. Returns null when either half is empty. */
export function cleanHazardSample(sample: HazardGarageSample): HazardGarageSample | null {
  const user = cleanText(sample.user ?? "", HAZARD_USER_MAX);
  const car = cleanText(sample.car ?? "", HAZARD_CAR_MAX);
  return user && car ? { user, car } : null;
}

/** Fill one member template with a member and their garage car. */
export function buildMemberHazard(def: HazardDef, sample: HazardGarageSample): TrackModifierPreset {
  const clean = cleanHazardSample(sample);
  const fill = (text: string) =>
    clean ? text.replace(/\{user\}/g, clean.user).replace(/\{car\}/g, clean.car) : text;
  return toPreset(def, fill);
}

/** Every hazard that needs no member data: the original 10, plus the serious and funny sets. */
export const STATIC_TRACK_HAZARD_PRESETS: TrackModifierPreset[] = [
  ...DYNAMIC_TRACK_HAZARD_PRESETS,
  ...SERIOUS_TRACK_HAZARD_PRESETS,
  ...FUNNY_TRACK_HAZARD_PRESETS,
];

/**
 * Pick the match's Track Hazard. Every hazard has the same chance. The 30 member hazards only join the pool when
 * `samples` has at least one usable member and car (the sim and offline play pass none), and the member and car
 * for the hazard that comes up are picked from `samples` at random.
 */
export function rollTrackHazardPreset(
  rng: () => number = Math.random,
  samples: HazardGarageSample[] = []
): TrackModifierPreset {
  const usable = samples.map(cleanHazardSample).filter((s): s is HazardGarageSample => s !== null);
  const staticCount = STATIC_TRACK_HAZARD_PRESETS.length;
  const total = staticCount + (usable.length > 0 ? MEMBER_HAZARD_TEMPLATES.length : 0);
  const index = Math.min(total - 1, Math.floor(rng() * total));

  if (index < staticCount) return STATIC_TRACK_HAZARD_PRESETS[index];

  const def = MEMBER_HAZARD_TEMPLATES[index - staticCount];
  const sample = usable[Math.min(usable.length - 1, Math.floor(rng() * usable.length))];
  return buildMemberHazard(def, sample);
}
