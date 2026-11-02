import { generateArtImage } from "@/lib/card-art-generate";
import {
  rollStatsAndRarity,
  rollStyleIds,
  type MemberCard,
  type Rng,
  type StoredMemberCard,
} from "@/lib/card-roll";
import { tierArtPrompt, type FullArtCardData, type FullArtTier } from "@/lib/full-art-card";
import { applyVariant, rollPackCard } from "@/lib/pack-config";
import { entryAvailable, type PackRuntime } from "@/lib/pack-config-store";
import { frameFieldsFor, stylePrompt, type PackStyle } from "@/lib/pack-styles";

/**
 * Rolling and drawing one card for a pack. Shared by the Standard Pack and custom packs so both roll
 * the same way. Not a server action file: these helpers are never callable from the browser.
 */

/** One rolled card: its rarity and stats, and what is on it. */
export interface DrawnSlot {
  tier: FullArtTier;
  styleIds: string[];
  stats: MemberCard["stats"];
  imageUrl: string;
  /** The custom style this card took, if any. */
  style: PackStyle | null;
  /** The fixed set card that took this card's place, if any. Nothing is drawn for these. */
  fixed: (FullArtCardData & { id: string }) | null;
}

/** Draw the art with the image model. It sometimes returns no picture, so it is tried once more with the same roll. */
export async function drawArt(referenceUrl: string, prompt: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { imageUrl } = await generateArtImage({ referenceUrl, prompt, aspectRatio: "3:4", folder: "member-cards" });
      return imageUrl;
    } catch (error) {
      lastError = error;
      console.error(`[pack-draw] art attempt ${attempt + 1} failed:`, error);
    }
  }
  throw lastError;
}

const statsAreSet = (s: FullArtCardData["stats"]) => [s.drift, s.accel, s.grip, s.steer].every((v) => Number.isFinite(Number.parseInt(v, 10)));

/**
 * Roll one card for a pack and, unless a fixed set card took its place, draw it from the reference photo.
 *
 * With no runtime this is exactly the roll the Standard Pack has always made: stats (which set the
 * rarity), then random art styles. With a runtime the rarity is rolled by the pack's rules and the
 * rarity's entries are checked: a style changes the prompt and frame, a set card replaces the card.
 */
export async function rollAndDrawSlot(input: {
  referenceUrl: string;
  rng: Rng;
  runtime: PackRuntime | null;
}): Promise<DrawnSlot> {
  const { referenceUrl, rng, runtime } = input;

  if (!runtime) {
    const { stats, tier } = rollStatsAndRarity(rng);
    const styleIds = rollStyleIds(rng);
    const imageUrl = await drawArt(referenceUrl, tierArtPrompt(tier, styleIds));
    return { tier, styleIds, stats, imageUrl, style: null, fixed: null };
  }

  const roll = rollPackCard(runtime.config, rng, entryAvailable(runtime));
  const entry = roll.entry;

  if (entry?.kind === "card") {
    const saved = runtime.cards.get(entry.refId);
    // This pack's changes to the set card (rolled stats for the rarity, a style's frame, a redrawn picture).
    const fixed = saved ? applyVariant(saved, entry.variant, runtime.styles, roll.tier, rng) : undefined;
    if (fixed) {
      return {
        tier: fixed.tier,
        styleIds: [],
        stats: statsAreSet(fixed.stats) ? fixed.stats : roll.stats,
        imageUrl: fixed.imageUrl,
        style: null,
        fixed,
      };
    }
  }

  const style = entry?.kind === "style" ? (runtime.styles.get(entry.refId) ?? null) : null;
  const styleIds = style ? [] : rollStyleIds(rng);
  const prompt = style ? stylePrompt(style, roll.tier) : tierArtPrompt(roll.tier, styleIds);
  const imageUrl = await drawArt(referenceUrl, prompt);
  return { tier: roll.tier, styleIds, stats: roll.stats, imageUrl, style, fixed: null };
}

/**
 * Fields to spread over a freshly built card after its own details, so a card that took a custom
 * style gets that style's frame and name, and a card that was replaced by a fixed set card becomes
 * that card. A normal card gets nothing changed, except that old style fields are cleared.
 */
export function slotOverrides(drawn: Pick<DrawnSlot, "style" | "fixed">): Partial<StoredMemberCard> {
  const { fixed, style } = drawn;
  if (fixed) {
    return {
      name: fixed.name,
      ability: fixed.ability,
      effect: fixed.effect,
      tier: fixed.tier,
      imageUrl: fixed.imageUrl,
      imageZoom: fixed.imageZoom,
      imageX: fixed.imageX,
      imageY: fixed.imageY,
      driver: fixed.driver,
      team: fixed.team,
      styleIds: [],
      setCardId: fixed.id,
      packStyleId: undefined,
      packStyleName: undefined,
      customBorderColor: fixed.customBorderColor,
      customStatLabelColor: fixed.customStatLabelColor,
      customStatValueColor: fixed.customStatValueColor,
      customBottomBarBgColor: fixed.customBottomBarBgColor,
      customBottomBarBorderColor: fixed.customBottomBarBorderColor,
      customFrameEffect: fixed.customFrameEffect,
      customFrameShine: fixed.customFrameShine,
      customFlameColor: fixed.customFlameColor,
    };
  }
  return {
    setCardId: undefined,
    packStyleId: style?.id,
    packStyleName: style?.name,
    ...frameFieldsFor(style?.frame),
  };
}
