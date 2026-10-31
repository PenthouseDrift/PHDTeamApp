import { ART_STYLES } from "@/lib/card-maker";
import type { MechanicalFault, MechanicalFaultType } from "@/lib/mechanical-faults";

/**
 * Full art cards: the picture fills the whole card and the tier (bronze, silver, gold, legend)
 * sets the frame colours and the AI art prompt. Pure (no server imports) so the editor, the
 * renderer and the server actions share one definition.
 */

/** "mythic" can be awarded on a perfect 100/100 roll, or set by hand in the admin card maker. */
export type FullArtTier = "bronze" | "silver" | "gold" | "legend" | "mythic";

export interface TierPalette {
  /** Brightest highlight on the frame. */
  light: string;
  /** Main metal colour. */
  accent: string;
  /** Shadow side of the metal. */
  dark: string;
  /** Glow around the frame and the tier tag. */
  glow: string;
}

export interface FullArtTierInfo {
  id: FullArtTier;
  label: string;
  hint: string;
  palette: TierPalette;
}

export const FULL_ART_TIERS: FullArtTierInfo[] = [
  { id: "bronze", label: "Bronze", hint: "Gritty dusk backstreet", palette: { light: "#efc197", accent: "#cd7f32", dark: "#6b3f17", glow: "#ff9a4d" } },
  { id: "silver", label: "Silver", hint: "Rain-slick blue hour", palette: { light: "#f4f7fb", accent: "#b8c0cc", dark: "#5d6572", glow: "#bfe3ff" } },
  { id: "gold", label: "Gold", hint: "Penthouse golden hour", palette: { light: "#fff2a8", accent: "#e8b923", dark: "#8a6508", glow: "#ffd75e" } },
  { id: "legend", label: "Legend", hint: "Mythic cosmic drift", palette: { light: "#e8f4ff", accent: "#a78bfa", dark: "#3b2a85", glow: "#7df9ff" } },
  { id: "mythic", label: "Mythic", hint: "Molten crimson & gold. 100 pts or admin", palette: { light: "#ffe9b0", accent: "#ff2d55", dark: "#4a0618", glow: "#ff4d6d" } },
];

export const tierInfo = (tier: FullArtTier): FullArtTierInfo => FULL_ART_TIERS.find((t) => t.id === tier) ?? FULL_ART_TIERS[0];

// ── AI art prompts ──────────────────────────────────────────────────────────

/**
 * Picking a tier is all that's needed: each tier fully sets the art style, time of day, colours,
 * setting and effects, so the prompt is built from the tier alone. BASE and ENDING are shared; the
 * look in between belongs to the tier.
 */

/** What every tier shares: the car, the portrait framing, and room for text. It never says "card": the model then draws a bordered card. */
const BASE =
  "A full-bleed, portrait-orientation (3:4) illustration of the customized RC drift car from the reference image, captured mid-drift at a dramatic three-quarter angle with high steering lock. Preserve the exact body shell, paint finish, livery decals, wheel rims, and stance of the car in the reference photo. The picture runs edge to edge, with the scene continuing right up to every side of the image and no border, frame, bezel, matte, margin, or rounded corners of any kind. Keep the car large and centred in the upper two-thirds of the frame, well inside the left and right edges, and leave the lower quarter calmer and darker so text can be placed over it later.";

/**
 * The same opening when an art style is chosen. The reference photo is only used to copy the car's design;
 * otherwise Gemini tends to keep the photograph's own look and the style barely shows.
 */
const BASE_STYLED =
  "A full-bleed, portrait-orientation (3:4) artwork of the customized RC drift car from the reference image, captured mid-drift at a dramatic three-quarter angle with high steering lock. Use the reference photo only to copy the car's design: its body shape, livery design and colours, wheel design, and stance. Do not copy the photograph's own look, lighting, or textures; draw the whole car and scene in the art style given above." +
  " The picture runs edge to edge, with the scene continuing right up to every side of the image and no border, frame, bezel, matte, margin, or rounded corners of any kind. Keep the car large and centred in the upper two-thirds of the frame, well inside the left and right edges, and leave the lower quarter calmer and darker so text can be placed over it later.";

const ENDING =
  "Show only this one car: no other cars, no people, and no text, lettering, or logos other than those already on the car. The image must not look like a framed print or a collectible card: no borders, frames, bezels, metallic edges, outlines around the picture, or rounded corners.";

/** The look of each tier: style, time of day, setting, colours, effects and mood. */
const TIER_LOOKS: Record<FullArtTier, string> = {
  bronze:
    "Bronze tier. Look: raw and hard-edged, with a gritty finish and a touch of film grain. Time of day: dusk, the last orange light fading. Setting: a weathered backstreet of concrete and rust-toned industrial warehouses under a hazy bronze sky. Colours: burnt orange, copper, and warm bronze highlights. Effects: modest bright sparks and tire smoke lit warm copper. Mood: raw, hard-working underdog.",
  silver:
    "Silver tier. Look: sleek and precise, with crisp mirror reflections and a clean finish. Time of day: blue hour, early night. Setting: a rain-slicked circuit under cool white floodlights. Colours: polished chrome, steel blue, and platinum. Effects: silver sparks and cool-lit tire smoke with glints of platinum light on the wet asphalt. Mood: refined, precise, and high-performance.",
  gold:
    "Gold tier. Look: polished and high-contrast, with rich metallic paint, like premium racing game key art. Time of day: golden hour, low warm sun. Setting: a luxurious penthouse rooftop drift arena with a glowing city skyline behind it. Colours: gold, amber, and warm white. Effects: sunbeams, lens flares, golden sparks, drifting gold dust, and tire smoke glowing amber and gold. Mood: prestigious, a championship winner.",
  mythic:
    "Mythic tier. Look: the rarest card in existence, ferocious and regal, with molten metallic detail and an ultra-premium finish. Time of day: none, a blazing eclipse. Setting: a volcanic penthouse arena split by rivers of lava under a black sun with a crimson corona. Colours: deep crimson, molten gold, obsidian black, and white-hot highlights. Effects: erupting embers, golden lightning, a swirling vortex of fire behind the car, wheels glowing like forged metal, and tire smoke turning into burning phoenix-like plumes. Mood: unstoppable, mythical, the one-of-a-kind prize.",
  legend:
    "Legend tier. Look: epic, where racing meets myth, with glowing energy and iridescent detail. Time of day: none, a cosmic night sky beyond time. Setting: swirling nebulae and aurora with a radiant halo of light behind the car. Colours: violet, cyan, magenta, and gold. Effects: crackling lightning, prismatic energy trails, floating embers, shafts of divine light, ethereal glowing wheels, and tire smoke turning into glowing storm clouds. Mood: legendary, awe-inspiring, the ultimate rarity.",
};

/** Most art styles that can be added to one prompt. */
export const MAX_ART_STYLES = 3;

/**
 * The full AI art prompt for a tier. The tier's own prompt (scene, time of day, colours, effects
 * and mood) is always included in full. Art styles, if any are chosen (up to MAX_ART_STYLES), lead
 * the prompt as its top priority, are repeated in a final check, and decide how everything is drawn;
 * several are blended into one look. The tier still decides what is shown: the scene, time of day,
 * colours and effects.
 */
export function tierArtPrompt(tier: FullArtTier, styleIds: string[] = []): string {
  const styles = styleIds
    .map((id) => ART_STYLES.find((st) => st.id === id))
    .filter((st): st is (typeof ART_STYLES)[number] => Boolean(st))
    .slice(0, MAX_ART_STYLES);
  const look = TIER_LOOKS[tier] ?? TIER_LOOKS.bronze;
  if (styles.length === 0) return `${BASE} ${look} ${ENDING}`;

  const label = tierInfo(tier).label;
  const lead =
    styles.length === 1
      ? `ART STYLE (the most important instruction): render the entire image as ${styles[0].text}`
      : `ART STYLE (the most important instruction): render the entire image in one cohesive look that blends these styles: ${styles.map((st, i) => `(${i + 1}) ${st.text}`).join(" ")}`;
  const rule = `The art style decides how everything is drawn, including the car, the background, the lighting, and the smoke. The ${label} tier below decides what is shown: its scene, time of day, colours, and effects, drawn in that art style.`;
  const check = "Final check: the whole image, including the car, must clearly look like the art style described at the start.";
  return `${lead} ${rule} ${BASE_STYLED} ${look} ${check} ${ENDING}`;
}

// ── Card data ───────────────────────────────────────────────────────────────

export interface FullArtStats {
  drift: string;
  accel: string;
  grip: string;
  steer: string;
}

export interface FullArtCardData {
  id?: string;
  name: string;
  /** Ability / chassis type line. */
  ability: string;
  /** Effect / flavour text. */
  effect: string;
  tier: FullArtTier;
  stats: FullArtStats;
  imageUrl: string;
  /** 100 = fill the card; up to 300. */
  imageZoom: number;
  /** Focal point, 0-100 (50 = centred). */
  imageX: number;
  imageY: number;
  driver: string;
  team: string;
  /** Distinguishes standard RC drift car cards from Crew Advantage, Debuff Hazard, UK Track, and Maintenance Consumable cards. */
  cardType?: "car" | "crew" | "debuff" | "track" | "maintenance";
  /** If cardType is "crew" | "debuff" | "track", the definition ID (e.g. "crew-01-...", "debuff-01-...", "track-01-..."). */
  crewCardId?: string;
  /** Emoji/icon for Crew, Debuff, Track, or Maintenance cards. */
  crewIcon?: string;
  /** Target fault type if cardType === "maintenance" */
  targetFault?: MechanicalFaultType;
  /** Battles reduced from maintenance cooldown if cardType === "maintenance" */
  repairBattles?: number;
  /** Total battles before car breaks down */
  maxBattles?: number;
  /** Battles remaining before breakdown (counts down to 0) */
  battlesRemaining?: number;
  /** Active mechanical fault when durability reaches 0 */
  fault?: MechanicalFault | null;
  updatedAt?: number;
}

export function emptyFullArtCard(): FullArtCardData {
  return {
    name: "",
    ability: "",
    effect: "",
    tier: "bronze",
    stats: { drift: "", accel: "", grip: "", steer: "" },
    imageUrl: "",
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: "",
    team: "",
  };
}

/**
 * A card name that isn't already used by another saved card, so several versions of the same car
 * (e.g. one per tier) can each be saved. A free name is returned as typed; a taken one gets the
 * suffix added, "Silvia (Gold)", then "Silvia (Gold 2)" and so on, kept within the name limit.
 */
export function uniqueCardName(name: string, suffix: string, existing: string[], max = 40): string {
  const base = name.replace(/\s+/g, " ").trim();
  if (!base) return base;
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const fit = (label: string) => {
    const tail = ` (${label})`;
    return base.slice(0, max - tail.length).trimEnd() + tail;
  };
  let candidate = fit(suffix);
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = fit(`${suffix} ${n}`);
  return candidate;
}

const clampStr = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Coerce anything the client sends into a safe, well-formed full art card. */
export function sanitizeFullArtCard(input: Partial<FullArtCardData> | null | undefined): FullArtCardData {
  const i = input ?? {};
  const stats = i.stats ?? ({} as Partial<FullArtStats>);
  const url = typeof i.imageUrl === "string" ? i.imageUrl.trim() : "";
  const resolvedTier: FullArtTier =
    (i.tier as string) === "god"
      ? "legend"
      : FULL_ART_TIERS.some((t) => t.id === i.tier)
        ? (i.tier as FullArtTier)
        : "bronze";
  return {
    id: typeof i.id === "string" && /^[a-z0-9-]{8,64}$/i.test(i.id) ? i.id : undefined,
    name: clampStr(i.name, 40),
    ability: clampStr(i.ability, 48),
    effect: clampStr(i.effect, 160),
    // Cards saved when the top tier was called "god" are now legend cards.
    tier: resolvedTier,
    stats:
      resolvedTier === "mythic"
        ? { drift: "25", accel: "25", grip: "25", steer: "25" }
        : {
            drift: clampStr(stats.drift, 3),
            accel: clampStr(stats.accel, 3),
            grip: clampStr(stats.grip, 3),
            steer: clampStr(stats.steer, 3),
          },
    imageUrl:
      (/^https:\/\/\S+$/i.test(url) && url.length <= 600) || url.startsWith("data:image/svg+xml;utf8,")
        ? url
        : "",
    imageZoom: clampNum(i.imageZoom, 100, 300, 100),
    imageX: clampNum(i.imageX, 0, 100, 50),
    imageY: clampNum(i.imageY, 0, 100, 50),
    driver: clampStr(i.driver, 30),
    team: clampStr(i.team, 30),
    ...(i.cardType === "crew" || i.cardType === "debuff" || i.cardType === "track"
      ? { cardType: i.cardType }
      : {}),
    ...(typeof i.crewCardId === "string" && i.crewCardId ? { crewCardId: clampStr(i.crewCardId, 64) } : {}),
    ...(typeof i.crewIcon === "string" && i.crewIcon ? { crewIcon: clampStr(i.crewIcon, 16) } : {}),
    ...(typeof i.maxBattles === "number" ? { maxBattles: clampNum(i.maxBattles, 1, 99, 6) } : {}),
    ...(typeof i.battlesRemaining === "number" ? { battlesRemaining: clampNum(i.battlesRemaining, 0, 99, 6) } : {}),
    ...(i.fault ? { fault: i.fault } : {}),
  };
}
