"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { ART_PROMPT_MAX } from "@/lib/card-maker";
import type { ActionResult } from "@/types";

export interface AdminCustomPrompt {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
}

const INDEX = "admin:custom_prompts:index";
const promptKey = (id: string) => `admin:custom_prompt:${id}`;

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

function parsePrompt(raw: unknown): AdminCustomPrompt | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const v = value as Partial<AdminCustomPrompt>;
    if (!v.id || !v.title || !v.prompt) return null;
    return {
      id: String(v.id),
      title: String(v.title).trim().slice(0, 80),
      prompt: String(v.prompt).trim().slice(0, ART_PROMPT_MAX),
      createdAt: Number(v.createdAt) || Date.now(),
      updatedAt: Number(v.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

/** List all saved admin custom prompts, most recently updated first. */
export async function listAdminCustomPrompts(): Promise<AdminCustomPrompt[]> {
  try {
    if (!(await requireAdmin())) return [];
    const ids = (await redis.zrange(INDEX, 0, -1, { rev: true })) as string[];
    if (!ids || ids.length === 0) return [];
    const rows = await redis.mget(...ids.map((id) => promptKey(String(id))));
    return rows.map(parsePrompt).filter((p): p is AdminCustomPrompt => p !== null);
  } catch (error) {
    console.error("[custom-prompts] list failed:", error);
    return [];
  }
}

/** Save or update an admin custom prompt. */
export async function saveAdminCustomPrompt(input: {
  id?: string;
  title: string;
  prompt: string;
}): Promise<ActionResult<AdminCustomPrompt>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can save custom prompts" };
    }

    const title = typeof input?.title === "string" ? input.title.trim().slice(0, 80) : "";
    if (!title) {
      return { success: false, error: "Give the prompt a title / name" };
    }

    const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) {
      return { success: false, error: "Prompt cannot be empty" };
    }
    if (prompt.length > ART_PROMPT_MAX) {
      return { success: false, error: `Prompt is too long (max ${ART_PROMPT_MAX} characters)` };
    }

    const id = input.id && /^[a-z0-9-]{8,64}$/i.test(input.id) ? input.id : randomUUID();
    const now = Date.now();

    // Check if existing to preserve createdAt
    let createdAt = now;
    if (input.id) {
      try {
        const existing = await redis.get(promptKey(id));
        const parsed = parsePrompt(existing);
        if (parsed) createdAt = parsed.createdAt;
      } catch {}
    }

    const saved: AdminCustomPrompt = {
      id,
      title,
      prompt,
      createdAt,
      updatedAt: now,
    };

    await redis.set(promptKey(id), JSON.stringify(saved));
    await redis.zadd(INDEX, { score: now, member: id });

    revalidatePath("/admin/card-maker");
    return { success: true, data: saved };
  } catch (error) {
    console.error("[custom-prompts] save failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not save custom prompt",
    };
  }
}

/** Delete an admin custom prompt by ID. */
export async function deleteAdminCustomPrompt(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (!(await requireAdmin())) {
      return { success: false, error: "Only admins can delete custom prompts" };
    }
    if (!id || typeof id !== "string") {
      return { success: false, error: "Invalid prompt ID" };
    }

    await redis.del(promptKey(id));
    await redis.zrem(INDEX, id);

    revalidatePath("/admin/card-maker");
    return { success: true, data: { id } };
  } catch (error) {
    console.error("[custom-prompts] delete failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not delete custom prompt",
    };
  }
}

