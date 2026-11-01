/**
 * The style library: reusable custom looks (an art prompt plus a card frame) that packs can use.
 * Pure (no server imports) so the roll, the admin pages and the storage layer share one definition.
 *
 * A style on its own is never pulled. A pack decides which styles it uses, on which rarities, and
 * how often (see pack-config.ts). The card's rarity is rolled first and stays as rolled; a style
 * only changes how the card is drawn and framed.
 */

import { ART_PROMPT_MAX } from "@/lib/card-maker";
import {
  FRAME_EFFECTS,
  FULL_ART_TIERS,
  clampColor,
  clampHexColor,
  customStyleArtPrompt,
  tierArtPrompt,
  type FrameEffect,
  type FullArtCardData,
  type FullArtTier,
} from "@/lib/full-art-card";

export const PACK_STYLE_NAME_MAX = 60;
export const PACK_STYLE_DESCRIPTION_MAX = 200;

export const ALL_TIERS: FullArtTier[] = FULL_ART_TIERS.map((t) => t.id);

/** The optional card colour overrides a style can carry (same fields the card maker uses). */
export const PACK_STYLE_COLOUR_FIELDS = [
  "customBorderColor",
  "customStatLabelColor",
  "customStatValueColor",
  "customBottomBarBgColor",
  "customBottomBarBorderColor",
] as const;

export type PackStyleColourField = (typeof PACK_STYLE_COLOUR_FIELDS)[number];
export type PackStyleColours = Partial<Record<PackStyleColourField, string>>;

/**
 * - "full":  the prompt is sent to the image model exactly as written (e.g. a prompt saved from the card maker).
 * - "style": the prompt is an art style description, applied on top of the rolled rarity's own scene.
 */
export type PackStylePromptMode = "full" | "style";

/** "tier" leaves the effect to the card's rarity, exactly as a normal card of that rarity. */
export type StyleFrameEffect = "tier" | FrameEffect;
export const STYLE_FRAME_EFFECTS: StyleFrameEffect[] = ["tier", ...FRAME_EFFECTS];

/** How the card's frame looks: colours, the effect around the border, and the glint and sparkles. */
export interface StyleFrame {
  colours: PackStyleColours;
  effect: StyleFrameEffect;
  /** Glint and sparkles over the picture. Only used when `effect` is not "tier". */
  shine: boolean;
  /** Tints the flames this colour (hex). Only used when `effect` is "flames". */
  flameColour?: string;
}

export interface PackStyle {
  id: string;
  name: string;
  description: string;
  /** Saved admin prompt this was copied from, for reference only. The prompt text below is what is used. */
  sourcePromptId?: string;
  prompt: string;
  promptMode: PackStylePromptMode;
  frame: StyleFrame;
  /** Optional example picture shown in previews, so the tile isn't a "?". */
  sampleImageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

/** A dark card back with a big "?" for cards that haven't been drawn yet. */
export const QUESTION_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'><rect width='300' height='420' fill='#0b0b0d'/><text x='150' y='250' text-anchor='middle' font-size='220' font-weight='900' font-family='sans-serif' fill='rgba(255,255,255,0.4)'>?</text></svg>"
  );

export const ID_PATTERN = /^[a-z0-9-]{8,64}$/i;

const clampStr = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keep only known, de-duplicated rarities, in rarity order. */
export function cleanTiers(v: unknown): FullArtTier[] {
  const list = Array.isArray(v) ? v : [];
  return ALL_TIERS.filter((t) => list.includes(t));
}

export function cleanColours(v: unknown): PackStyleColours {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: PackStyleColours = {};
  for (const field of PACK_STYLE_COLOUR_FIELDS) {
    const colour = clampColor(src[field]);
    if (colour) out[field] = colour;
  }
  return out;
}

export function cleanFrame(v: unknown): StyleFrame {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const effect = STYLE_FRAME_EFFECTS.includes(src.effect as StyleFrameEffect) ? (src.effect as StyleFrameEffect) : "tier";
  const flameColour = clampHexColor(src.flameColour);
  return {
    colours: cleanColours(src.colours),
    effect,
    shine: src.shine === true,
    ...(effect === "flames" && flameColour ? { flameColour } : {}),
  };
}

/** The prompt keeps its line breaks (saved prompts are multi-line); only its length is capped. */
function cleanPrompt(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, ART_PROMPT_MAX) : "";
}

function cleanSampleUrl(v: unknown): string | undefined {
  const url = typeof v === "string" ? v.trim() : "";
  return /^https:\/\/\S+$/i.test(url) && url.length <= 600 ? url : undefined;
}

/** Coerce anything read from Redis or sent by the browser into a well-formed style, or null if it is not one. */
export function sanitizePackStyle(input: unknown): PackStyle | null {
  try {
    const value = typeof input === "string" ? JSON.parse(input) : input;
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (typeof v.id !== "string" || !ID_PATTERN.test(v.id)) return null;
    const name = clampStr(v.name, PACK_STYLE_NAME_MAX);
    if (!name) return null;
    // Styles saved by the first version of this page kept their colours at the top level.
    const frameSource = v.frame && typeof v.frame === "object" ? v.frame : { colours: v.colours };
    const sampleImageUrl = cleanSampleUrl(v.sampleImageUrl);
    return {
      id: v.id,
      name,
      description: clampStr(v.description, PACK_STYLE_DESCRIPTION_MAX),
      ...(typeof v.sourcePromptId === "string" && ID_PATTERN.test(v.sourcePromptId) ? { sourcePromptId: v.sourcePromptId } : {}),
      prompt: cleanPrompt(v.prompt),
      promptMode: v.promptMode === "style" ? "style" : "full",
      frame: cleanFrame(frameSource),
      ...(sampleImageUrl ? { sampleImageUrl } : {}),
      createdAt: Number(v.createdAt) || Date.now(),
      updatedAt: Number(v.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

/** True when the style would actually change how a card looks. */
export function styleChangesCard(style: Pick<PackStyle, "prompt" | "frame">): boolean {
  return style.prompt.trim().length > 0 || Object.keys(style.frame.colours).length > 0 || style.frame.effect !== "tier";
}

type FrameCardFields = Pick<
  FullArtCardData,
  PackStyleColourField | "customFrameEffect" | "customFrameShine" | "customFlameColor"
>;

/** The card fields a style sets. Every key is present, so spreading them also clears an older style's look. */
export function frameFieldsFor(frame: StyleFrame | undefined): FrameCardFields {
  const colours = frame?.colours;
  const custom = frame && frame.effect !== "tier";
  return {
    customBorderColor: colours?.customBorderColor,
    customStatLabelColor: colours?.customStatLabelColor,
    customStatValueColor: colours?.customStatValueColor,
    customBottomBarBgColor: colours?.customBottomBarBgColor,
    customBottomBarBorderColor: colours?.customBottomBarBorderColor,
    customFrameEffect: custom ? (frame.effect as FrameEffect) : undefined,
    customFrameShine: custom ? frame.shine : undefined,
    customFlameColor: custom && frame.effect === "flames" ? frame.flameColour : undefined,
  };
}

/** A sample card showing a style's frame (and sample picture, if it has one) at a rarity. */
export function styleToPreviewCard(style: PackStyle, tier: FullArtTier): FullArtCardData {
  return {
    name: style.name,
    ability: "Chassis · Sample",
    effect: "Preview of this style.",
    tier,
    stats: { drift: "20", accel: "18", grip: "21", steer: "19" },
    imageUrl: style.sampleImageUrl ?? "",
    imageZoom: 100,
    imageX: 50,
    imageY: 50,
    driver: "Driver",
    team: "Team",
    ...frameFieldsFor(style.frame),
  };
}

/**
 * The art prompt for a card that took this style at a rarity. A style with only a frame (no prompt)
 * keeps the rarity's normal prompt. "style" mode adds the text to the rarity's scene; "full" sends it as written.
 */
export function stylePrompt(style: Pick<PackStyle, "prompt" | "promptMode">, tier: FullArtTier): string {
  if (!style.prompt.trim()) return tierArtPrompt(tier);
  return style.promptMode === "style" ? customStyleArtPrompt(tier, style.prompt) : style.prompt;
}
