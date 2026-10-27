"use server";

import { auth } from "@/lib/auth";
import { ART_PROMPT_MAX } from "@/lib/card-maker";
import { ART_ASPECT_RATIOS, CardArtError, generateArtImage, isBlobUrl, type ArtAspectRatio } from "@/lib/card-art-generate";
import type { ActionResult } from "@/types";

/**
 * AI card art for the admin card maker. The Gemini call itself lives in lib/card-art-generate.ts
 * (shared with the member card packs); this just checks the caller is an admin and the input is sane.
 */

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function generateCardArt(input: {
  referenceUrl: string;
  prompt: string;
  /** "5:4" (the original card's picture window, the default) or "3:4" (full art). */
  aspectRatio?: string;
}): Promise<ActionResult<{ imageUrl: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can generate card art" };

    const aspectRatio: ArtAspectRatio = ART_ASPECT_RATIOS.find((r) => r === input?.aspectRatio) ?? "5:4";

    const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) return { success: false, error: "Pick a style or write a prompt first" };
    if (prompt.length > ART_PROMPT_MAX) {
      return { success: false, error: `Prompt is too long (max ${ART_PROMPT_MAX} characters)` };
    }
    if (!isBlobUrl(input?.referenceUrl)) {
      return { success: false, error: "Add a reference photo of the car first (it must be uploaded through the card maker)" };
    }

    const { imageUrl } = await generateArtImage({ referenceUrl: input.referenceUrl, prompt, aspectRatio });
    return { success: true, data: { imageUrl } };
  } catch (error) {
    console.error("[card-art] generation failed:", error);
    if (error instanceof CardArtError) return { success: false, error: error.message };
    return { success: false, error: error instanceof Error ? error.message : "Could not generate the art" };
  }
}
