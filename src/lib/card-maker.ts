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
  logoStyle: "white" | "body";
  /** Lettering of the header logo: the black original or the white version. */
  logoTone: "black" | "white";
  /** Optional outline wrapped around the logo lettering. */
  logoOutline: boolean;
  logoOutlineColour: string;
  /** Soft light/dark shading across the card background. Off = one flat body colour. */
  backgroundShading: boolean;
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

export const DEFAULT_THEME = THEME_PRESETS[0].theme;
export const DEFAULT_OVERLAY_COLOUR = "#ffffff";
export const DEFAULT_LOGO_OUTLINE = "#000000";

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
    logoTone: "white",
    logoOutline: false,
    logoOutlineColour: DEFAULT_LOGO_OUTLINE,
    backgroundShading: true,
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
    logoStyle: i.logoStyle === "white" ? "white" : "body",
    // Cards saved before the tone existed paired white lettering with the dark badge and black with the white one.
    logoTone: i.logoTone === "black" || i.logoTone === "white" ? i.logoTone : i.logoStyle === "white" ? "black" : "white",
    logoOutline: i.logoOutline === true,
    logoOutlineColour: isHexColour(i.logoOutlineColour) ? i.logoOutlineColour : DEFAULT_LOGO_OUTLINE,
    backgroundShading: i.backgroundShading !== false,
  };
}
