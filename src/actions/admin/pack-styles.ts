"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { isBlobUrl } from "@/lib/card-art-generate";
import {
  ID_PATTERN,
  cleanFrame,
  sanitizePackStyle,
  styleChangesCard,
  type PackStyle,
  type PackStylePromptMode,
  type StyleFrame,
} from "@/lib/pack-styles";
import { MAX_PACK_STYLES, PACK_STYLES_INDEX, loadPackStyle, loadPackStyles, packStyleKey } from "@/lib/pack-styles-store";
import { loadAllPackConfigs, savePackConfig } from "@/lib/pack-config-store";
import type { ActionResult } from "@/types";

/**
 * The style library: reusable custom looks (an art prompt and a card frame). A style does nothing on
 * its own; packs choose which styles they use and how often (see driftclash-packs.ts).
 */

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function revalidate() {
  revalidatePath("/admin/driftclash/packs");
}

export async function listPackStyles(): Promise<PackStyle[]> {
  try {
    if (!(await requireAdmin())) return [];
    return await loadPackStyles();
  } catch (error) {
    console.error("[pack-styles] list failed:", error);
    return [];
  }
}

export interface PackStyleInput {
  id?: string;
  name: string;
  description?: string;
  sourcePromptId?: string;
  prompt: string;
  promptMode: PackStylePromptMode;
  frame: StyleFrame;
  sampleImageUrl?: string;
}

/** Create a style, or update the one with this id. */
export async function savePackStyle(input: PackStyleInput): Promise<ActionResult<PackStyle>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can manage styles" };

    const name = typeof input?.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
    if (!name) return { success: false, error: "Give the style a name", field: "name" };

    const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
    const frame = cleanFrame(input?.frame);
    if (!styleChangesCard({ prompt, frame })) {
      return {
        success: false,
        error: "Add a prompt, a card colour or a frame effect, otherwise the style changes nothing",
        field: "prompt",
      };
    }
    if (input.sampleImageUrl && !isBlobUrl(input.sampleImageUrl)) {
      return { success: false, error: "Upload the sample picture again", field: "sampleImageUrl" };
    }

    const existing = input.id && ID_PATTERN.test(input.id) ? await loadPackStyle(input.id) : null;
    if (input.id && !existing) return { success: false, error: "That style no longer exists" };
    if (!existing && (await redis.zcard(PACK_STYLES_INDEX)) >= MAX_PACK_STYLES) {
      return { success: false, error: `You can keep up to ${MAX_PACK_STYLES} styles` };
    }

    const now = Date.now();
    const saved = sanitizePackStyle({
      id: existing?.id ?? randomUUID(),
      name,
      description: input.description,
      sourcePromptId: input.sourcePromptId,
      prompt,
      promptMode: input.promptMode,
      frame,
      sampleImageUrl: input.sampleImageUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    if (!saved) return { success: false, error: "Could not save the style" };

    await redis.set(packStyleKey(saved.id), JSON.stringify(saved));
    await redis.zadd(PACK_STYLES_INDEX, { score: now, member: saved.id });

    revalidate();
    return { success: true, data: saved };
  } catch (error) {
    console.error("[pack-styles] save failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not save the style" };
  }
}

/** Delete a style and take it out of every pack that used it. Cards already pulled with it keep their look. */
export async function deletePackStyle(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) return { success: false, error: "Only admins can manage styles" };
    if (typeof id !== "string" || !ID_PATTERN.test(id)) return { success: false, error: "Invalid style" };

    await redis.del(packStyleKey(id));
    await redis.zrem(PACK_STYLES_INDEX, id);

    const configs = await loadAllPackConfigs();
    for (const config of Object.values(configs)) {
      let changed = false;
      for (const tier of Object.keys(config.rarities) as Array<keyof typeof config.rarities>) {
        const kept = config.rarities[tier].filter((e) => !(e.kind === "style" && e.refId === id));
        if (kept.length !== config.rarities[tier].length) {
          config.rarities[tier] = kept;
          changed = true;
        }
      }
      if (changed) await savePackConfig(config);
    }

    revalidate();
    return { success: true, data: { id } };
  } catch (error) {
    console.error("[pack-styles] delete failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not delete the style" };
  }
}
