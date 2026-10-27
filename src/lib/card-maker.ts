/**
 * Card maker: data shape, themes and colour helpers. Pure (no server imports) so
 * the editor, the card renderer and the server actions all share one definition.
 */

export interface CardTheme {
  /** The metal colour: bezel, name plate, stat labels. */
  accent: string;
  /** The card body behind everything. */
  body: string;
  /** Text printed on the name plate. */
  text: string;
}

export interface CardStats {
  drift: string;
  accel: string;
  grip: string;
  steer: string;
}

/**
 * What the header badge shows:
 * full       the full PENTHOUSE PHD DRIFT logo
 * mark       a compact medallion with just the gold P
 * mark-text  the P next to a short line of text (e.g. PENTHOUSE DRIFT)
 * team       an uploaded team logo
 * team-mark  the P beside an uploaded team logo (co-branded)
 */
export type HeaderStyle = "full" | "mark" | "mark-text" | "team" | "team-mark";
export const HEADER_STYLES: Array<{ value: HeaderStyle; label: string; hint: string }> = [
  { value: "full", label: "Full logo", hint: "Penthouse PHD Drift" },
  { value: "mark", label: "P medallion", hint: "Compact, just the P" },
  { value: "mark-text", label: "P + text", hint: "P with a short title" },
  { value: "team", label: "Team logo", hint: "Upload another team" },
  { value: "team-mark", label: "Team + P", hint: "Team beside the P" },
];
export type MedallionPos = "centre" | "left" | "right";
export type MedallionShape = "hex" | "round";
export type MedallionSize = "small" | "medium" | "large";
export const MEDALLION_POSITIONS: Array<[MedallionPos, string]> = [["left", "Top left"], ["centre", "Centre"], ["right", "Top right"]];
export const MEDALLION_SHAPES: Array<[MedallionShape, string]> = [["hex", "Hexagon"], ["round", "Round"]];
export const MEDALLION_SIZES: Array<[MedallionSize, string]> = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];

export const DEFAULT_HEADER_TEXT = "PENTHOUSE DRIFT";

export interface CardData {
  id?: string;
  name: string;
  /** Ability / chassis type line. */
  ability: string;
  /** Effect / flavour text. */
  effect: string;
  tier: string;
  spec: string;
  stats: CardStats;
  imageUrl: string;
  /** 100 = fill the window; up to 300. */
  imageZoom: number;
  /** Focal point, 0-100 (50 = centred). */
  imageX: number;
  imageY: number;
  /** Text printed over the picture. */
  driver: string;
  team: string;
  /** Colour of the driver / team overlay text. */
  overlayColour: string;
  theme: CardTheme;
  /** Header badge face: plain white, or the card body colour (needs the light-lettered logo). */
  logoStyle: "white" | "body" | "custom";
  /** Badge face colour when logoStyle is "custom". */
  logoCustomColour: string;
  headerStyle: HeaderStyle;
  /** "P medallion" options: where it sits, its shape and its size. */
  medallionPos: MedallionPos;
  medallionShape: MedallionShape;
  medallionSize: MedallionSize;
  /** With the medallion in a corner, show the uploaded team logo in the opposite corner. */
  medallionTeam: boolean;
  /** Title shown beside the P in the "P + text" header (blank = PENTHOUSE DRIFT). */
  headerText: string;
  /** Uploaded team logo for the "Team logo" headers. */
  headerImageUrl: string;
  /** Lettering of the header logo: the black original or the white version. */
  logoTone: "black" | "white";
  /** Optional outline wrapped around the logo lettering. */
  logoOutline: boolean;
  logoOutlineColour: string;
  /** Soft light/dark shading across the card background. Off = one flat body colour. */
  backgroundShading: boolean;
  /** Hexagon pattern inside the header badge(s). The strip behind the header always keeps its pattern. */
  hexPattern: boolean;
  updatedAt?: number;
}

export const THEME_PRESETS: Array<{ name: string; theme: CardTheme }> = [
  { name: "Gold", theme: { accent: "#c9a13b", body: "#141414", text: "#111111" } },
  { name: "Silver", theme: { accent: "#aeb4bf", body: "#121418", text: "#0f1115" } },
  { name: "Rose gold", theme: { accent: "#d58a7c", body: "#160d0d", text: "#1a0d0b" } },
  { name: "Red", theme: { accent: "#d4352f", body: "#150909", text: "#1a0a0a" } },
  { name: "Orange", theme: { accent: "#e8741f", body: "#150c06", text: "#1a0d05" } },
  { name: "Green", theme: { accent: "#2fa866", body: "#08150e", text: "#08140d" } },
  { name: "Blue", theme: { accent: "#2f7fd4", body: "#070d18", text: "#08101c" } },
  { name: "Purple", theme: { accent: "#8b4fd4", body: "#100818", text: "#120a1c" } },
];

// ── AI art prompts ──────────────────────────────────────────────────────────

/** Longest prompt the AI art generator accepts. */
export const ART_PROMPT_MAX = 3000;

/**
 * One-click prompts for the AI art generator. Clicking a button drops the text into
 * the prompt box so it can still be tweaked before generating.
 */
/**
 * Wording that marks a prompt as "no background". applyArtOptions looks for it so the Day/Night
 * and style options don't bring a scene back into the picture.
 */
export const PLAIN_BACKGROUND_PHRASE = "plain, solid, uniform dark-grey backdrop";

export interface ArtPreset {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

export const ART_PRESETS: ArtPreset[] = [
  {
    id: "v1",
    label: "V1",
    hint: "Car only, plain backdrop",
    prompt:
      `A stylized, semi-realistic digital illustration of the customized RC drift car from the reference image, captured in a dynamic, sideways drift entry with high-steering lock. Preserve the exact body shell, paint finish, livery decals, wheel rims, and stance of the car in the reference photo. Render the car with realistic proportions, metallic paint reflections, glowing headlights, and crisp lighting, blended with subtle graphic-novel brushwork and clean edge definition—similar to modern racing game key art. Include bright sparks, stylized motion lines, and thick kinetic tire smoke billowing around the spinning wheels. Isolate the car on a ${PLAIN_BACKGROUND_PHRASE} with no background elements at all: no environment, scenery, buildings, fencing, streetlamps, bokeh or ground texture, only a soft contact shadow under the tires. Framed in a 6:5 horizontal aspect ratio with no other cars, no borders, and no text.`,
  },
  {
    id: "v1-background",
    label: "V1 + background",
    hint: "Detailed night scene",
    prompt:
      'A stylized, semi-realistic digital illustration of a single customized RC drift car, set against a moody, out-of-focus nighttime urban industrial drift environment with wet, reflective asphalt, industrial fencing, and soft bokeh streetlamps.\nThe image is framed in a 6:5 horizontal aspect ratio (designed to fit a 300x250px trading card art window) with a shallow depth of field so the background remains atmospheric and uncluttered, keeping full focus on the car.\nThe illustration features only one car—preserving the exact body shell, paint finish, livery decals, wheel rims, and stance of the drift car in the reference image, but capturing it in a dynamic, sideways "drift" entry with high-steering lock. The car should be rendered with realistic proportions, metallic paint reflections, glowing headlights, and crisp lighting, blended with subtle graphic-novel brushwork and clean edge definition—similar to modern racing game key art.\nTo enhance the action, show stylized motion lines, bright sparks, and thick kinetic tire smoke billowing directly beneath and around the spinning wheels, casting subtle reflections onto the wet tarmac. There must be no other cars, no spectators, no trading card borders, no frames, and no text—artwork only.',
  },
];

/** Time-of-day and art-style options. Each one adds a sentence to the end of the prompt. */
export const ART_TIMES: Array<{ id: string; label: string; text: string; plainText: string }> = [
  {
    id: "day",
    label: "Day",
    text: "Set the scene in bright daytime instead of night: natural sunlight, clear sky, crisp shadows and daylight reflections on the asphalt, with no streetlamp glow or night-time bokeh.",
    // Used when the prompt asks for no background: the time of day shows up as light on the car only.
    plainText: "Light the car as if in bright daytime: warm sunlit highlights, crisp shadows and clean daylight reflections on the bodywork.",
  },
  {
    id: "night",
    label: "Night",
    text: "Set the scene at night: dark sky, wet reflective asphalt, glowing headlights and soft streetlamp bokeh.",
    plainText: "Light the car as if at night: glowing headlights, cool rim lighting and moody reflections on the bodywork.",
  },
];

export const ART_STYLES: Array<{ id: string; label: string; text: string }> = [
  {
    id: "cartoon",
    label: "Cartoon",
    text: "a bold cartoon illustration, clearly hand-drawn and not a photograph: thick black outlines, flat cel-shaded blocks of colour with no photographic textures or gradients, exaggerated proportions and motion, and playful stylised smoke and sparks drawn as cartoon shapes, while keeping the car's body shape, livery and wheels recognisable.",
  },
  {
    id: "realistic",
    label: "Realistic",
    text: "a photorealistic photograph: true-to-life materials and paint, accurate reflections, natural lighting, a real camera's depth of field and fine photographic detail, with no illustrated, painted or stylised effects.",
  },
  {
    id: "futuristic",
    label: "Futuristic",
    text: "a futuristic sci-fi concept-art render, clearly stylised and not a plain photo: neon accent lighting, holographic glow and light strips, glossy sleek surfaces and a cyberpunk atmosphere, while keeping the car's body shape and livery recognisable.",
  },
  {
    id: "line-art",
    label: "Line art",
    text: "pure ink line art, clearly drawn and not a photograph: clean confident black outlines, flat fills in just one or two accent colours, no gradients, no realistic shading and no photographic texture, with the scene suggested by simple drawn lines.",
  },
  {
    id: "graphic",
    label: "Graphic",
    text: "bold flat graphic design art, clearly vector artwork and not a photograph: solid colour shapes with hard edges, halftone dots, a high-contrast limited palette, no photographic gradients and a poster-like composition.",
  },
  {
    id: "graffiti",
    label: "Graffiti",
    text: "a spray-painted street art mural, clearly painted on a wall and not a photograph: visible spray-paint texture, drips and splatter, stencil edges, vivid wild-style colours and a gritty painted-wall energy, with no readable lettering.",
  },
  {
    id: "anime",
    label: "Anime",
    text: "a Japanese anime and manga drift illustration in the style of a classic street racing anime, clearly hand-drawn and not a photograph: cel shading, bold ink outlines, dramatic speed lines, exaggerated motion and stylised tire smoke, while keeping the car's body shape, livery and wheels recognisable.",
  },
  {
    id: "panning",
    label: "Panning shot",
    text: "a drift photographer's panning shot: the car razor sharp while the background streaks into strong horizontal motion blur, with glowing light trails and sparks, as if shot with a real camera at a drift event.",
  },
  {
    id: "fpv",
    label: "FPV cam",
    text: "a first-person-view RC camera feed: a wide-angle fisheye lens mounted very low on the car, strong lens distortion at the edges, a grainy video-feed look with visible scanlines, and the drift seen from just above the ground.",
  },
  {
    id: "pixel-art",
    label: "Pixel art",
    text: "16-bit pixel art in the style of a classic arcade racing game, clearly made of large visible square pixels and not a photograph: a limited colour palette, dithered shading, and pixelated smoke and sparks, while keeping the car's shape and livery recognisable.",
  },
  {
    id: "holo-foil",
    label: "Holo foil",
    text: "a holographic foil trading card finish applied over the whole artwork: a strong rainbow prismatic sheen, shimmering metallic highlights, sparkle glints and iridescent reflections across the image and the bodywork.",
  },
  {
    id: "chassis-diagram",
    label: "Chassis tech diagram",
    text: "a technical RC chassis diagram, clearly a drawn schematic and not a photograph: white and light-blue exploded-view and cutaway linework on a deep blue grid, with the car body ghosted over the chassis, gyro, servo, motor and shocks, while keeping the car's shape recognisable and with no readable lettering.",
  },
  {
    id: "tilt-shift",
    label: "Tilt-shift miniature",
    text: "a macro tilt-shift miniature photograph: the car looks like a tiny scale RC model on a diorama, with a very shallow depth of field, strong blur at the top and bottom of the frame, and toy-like saturated colour.",
  },
  {
    id: "tuner-mag",
    label: "Tuner magazine",
    text: "a glossy 2000s JDM tuner magazine cover shot: hard on-camera flash, oversaturated colour, glossy specular highlights, strong lens flare and gleaming chrome wheels, while keeping the car's body shape and livery recognisable.",
  },
  {
    id: "meet-flyer",
    label: "Drift meet flyer",
    text: "a grassroots drift-meet flyer, clearly printed artwork and not a photograph: bold two-tone halftone, tyre-mark and checkered-flag graphics, a rough photocopy texture and punchy contrast, with no readable lettering.",
  },
  {
    id: "sticker-bomb",
    label: "Sticker-bomb street",
    text: "a JDM street-car sticker-bomb collage: layered stickers, decals and tag marks plastered around the scene (not over the car's own livery), bold colours and a playful, cluttered street-culture energy, with no readable lettering.",
  },
];

const ART_OPTIONS_MARKER = "Style options (these override any conflicting style, lighting or time-of-day wording above): ";

/** The prompt without the style-options sentence that applyArtOptions adds. */
export function stripArtOptions(prompt: string): string {
  const at = prompt.indexOf(ART_OPTIONS_MARKER);
  return (at === -1 ? prompt : prompt.slice(0, at)).trimEnd();
}

/**
 * Put the chosen time of day and art style at the end of the prompt, replacing any earlier
 * choice. With nothing chosen the prompt is returned without the block.
 */
export function applyArtOptions(prompt: string, timeId: string | null, styleId: string | null): string {
  const base = stripArtOptions(prompt);
  const time = ART_TIMES.find((t) => t.id === timeId);
  const parts = [time && (base.includes(PLAIN_BACKGROUND_PHRASE) ? time.plainText : time.text), ART_STYLES.find((s) => s.id === styleId) && `Render the image as ${ART_STYLES.find((s) => s.id === styleId)!.text}`].filter(Boolean);
  if (parts.length === 0) return base;
  // A prompt with no background keeps it that way whatever style or time of day is picked.
  if (base.includes(PLAIN_BACKGROUND_PHRASE)) {
    parts.push(`Keep the ${PLAIN_BACKGROUND_PHRASE} with no scenery or environment.`);
  }
  const block = `${ART_OPTIONS_MARKER}${parts.join(" ")}`;
  return base ? `${base}\n\n${block}` : block;
}

export const DEFAULT_THEME = THEME_PRESETS[0].theme;
export const DEFAULT_OVERLAY_COLOUR = "#ffffff";
export const DEFAULT_LOGO_OUTLINE = "#000000";
export const DEFAULT_BADGE_COLOUR = "#2b2b2b";

export function emptyCard(): CardData {
  return {
    name: "",
    ability: "",
    effect: "",
    tier: "",
    spec: "",
    stats: { drift: "", accel: "", grip: "", steer: "" },
    imageUrl: "",
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: "",
    team: "",
    overlayColour: DEFAULT_OVERLAY_COLOUR,
    theme: { ...DEFAULT_THEME },
    logoStyle: "body",
    logoCustomColour: DEFAULT_BADGE_COLOUR,
    headerStyle: "full",
    medallionPos: "centre",
    medallionShape: "hex",
    medallionSize: "medium",
    medallionTeam: false,
    headerText: "",
    headerImageUrl: "",
    logoTone: "white",
    logoOutline: false,
    logoOutlineColour: DEFAULT_LOGO_OUTLINE,
    backgroundShading: true,
    hexPattern: true,
  };
}

// ── Colour helpers ──────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColour = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
}

/** Blend `a` towards `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}
/** Perceived brightness 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
export const lighten = (hex: string, t: number) => mix(hex, "#ffffff", t);
export const darken = (hex: string, t: number) => mix(hex, "#000000", t);

// ── Validation (used by the save action) ───────────────────────────────────

const clampStr = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Coerce anything the client sends into a safe, well-formed card. */
export function sanitizeCard(input: Partial<CardData> | null | undefined): CardData {
  const i = input ?? {};
  const theme = i.theme ?? ({} as Partial<CardTheme>);
  const stats = i.stats ?? ({} as Partial<CardStats>);
  const url = typeof i.imageUrl === "string" ? i.imageUrl.trim() : "";
  const headerUrl = typeof i.headerImageUrl === "string" ? i.headerImageUrl.trim() : "";
  return {
    id: typeof i.id === "string" && /^[a-z0-9-]{8,64}$/i.test(i.id) ? i.id : undefined,
    name: clampStr(i.name, 40),
    ability: clampStr(i.ability, 48),
    effect: clampStr(i.effect, 220),
    tier: clampStr(i.tier, 4),
    spec: clampStr(i.spec, 10),
    stats: {
      drift: clampStr(stats.drift, 3),
      accel: clampStr(stats.accel, 3),
      grip: clampStr(stats.grip, 3),
      steer: clampStr(stats.steer, 3),
    },
    imageUrl: /^https:\/\/\S+$/i.test(url) && url.length <= 600 ? url : "",
    imageZoom: clampNum(i.imageZoom, 100, 300, 100),
    imageX: clampNum(i.imageX, 0, 100, 50),
    imageY: clampNum(i.imageY, 0, 100, 50),
    driver: clampStr(i.driver, 30),
    team: clampStr(i.team, 30),
    overlayColour: isHexColour(i.overlayColour) ? i.overlayColour : DEFAULT_OVERLAY_COLOUR,
    theme: {
      accent: isHexColour(theme.accent) ? theme.accent : DEFAULT_THEME.accent,
      body: isHexColour(theme.body) ? theme.body : DEFAULT_THEME.body,
      text: isHexColour(theme.text) ? theme.text : DEFAULT_THEME.text,
    },
    logoStyle: i.logoStyle === "white" || i.logoStyle === "custom" ? i.logoStyle : "body",
    logoCustomColour: isHexColour(i.logoCustomColour) ? i.logoCustomColour : DEFAULT_BADGE_COLOUR,
    // Cards saved before the tone existed paired white lettering with the dark badge and black with the white one.
    logoTone: i.logoTone === "black" || i.logoTone === "white" ? i.logoTone : i.logoStyle === "white" ? "black" : "white",
    headerStyle: HEADER_STYLES.some((h) => h.value === i.headerStyle) ? (i.headerStyle as HeaderStyle) : "full",
    medallionPos: MEDALLION_POSITIONS.some(([v]) => v === i.medallionPos) ? (i.medallionPos as MedallionPos) : "centre",
    medallionShape: MEDALLION_SHAPES.some(([v]) => v === i.medallionShape) ? (i.medallionShape as MedallionShape) : "hex",
    medallionSize: MEDALLION_SIZES.some(([v]) => v === i.medallionSize) ? (i.medallionSize as MedallionSize) : "medium",
    medallionTeam: i.medallionTeam === true,
    headerText: clampStr(i.headerText, 24),
    headerImageUrl: /^https:\/\/\S+$/i.test(headerUrl) && headerUrl.length <= 600 ? headerUrl : "",
    logoOutline: i.logoOutline === true,
    logoOutlineColour: isHexColour(i.logoOutlineColour) ? i.logoOutlineColour : DEFAULT_LOGO_OUTLINE,
    backgroundShading: i.backgroundShading !== false,
    hexPattern: i.hexPattern !== false,
  };
}
