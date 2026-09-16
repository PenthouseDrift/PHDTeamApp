"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { randomUUID } from "crypto";

export interface AdminNote {
  id: string;
  title: string;
  /** Sanitized HTML body from the WYSIWYG editor. */
  html: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Very small server-side HTML sanitizer for note bodies. The editor only emits
 * a handful of formatting tags; this strips anything dangerous (script/style/
 * iframe tags, on* event handlers, and javascript: URLs) as defence in depth.
 * Note content is only ever shown to admins/mods.
 */
function sanitizeNoteHtml(input: string): string {
  let html = String(input || "");
  // Drop whole dangerous elements including their content.
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");
  // Strip inline event handlers: on*="..." / on*='...' / on*=value
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Neutralise javascript: and data: URLs in href/src.
  html = html.replace(/(href|src)\s*=\s*"(\s*(javascript|data):[^"]*)"/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*'(\s*(javascript|data):[^']*)'/gi, "$1='#'");
  // Cap length to keep notes reasonable.
  return html.slice(0, 100_000);
}

export async function getNotes(): Promise<AdminNote[]> {
  try {
    const ids = await redis.lrange("admin:notes:list", 0, -1);
    if (!ids || ids.length === 0) return [];

    const pipeline = redis.pipeline();
    ids.forEach((id) => pipeline.hgetall(`note:${id}`));
    const results = await pipeline.exec();

    const notes = (results || [])
      .map((r: any) => {
        if (!r || !r.id) return null;
        return {
          id: r.id as string,
          title: (r.title as string) || "Untitled",
          html: (r.html as string) || "",
          authorId: (r.authorId as string) || "",
          authorName: (r.authorName as string) || "Admin",
          createdAt: Number(r.createdAt) || 0,
          updatedAt: Number(r.updatedAt) || 0,
        } as AdminNote;
      })
      .filter(Boolean) as AdminNote[];

    // Newest first.
    notes.sort((a, b) => b.createdAt - a.createdAt);
    return notes;
  } catch (error) {
    console.error("getNotes error:", error);
    return [];
  }
}

export async function createNote(
  title: string,
  html: string
): Promise<ActionResult<AdminNote>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized" };
    }

    const cleanTitle = (title || "").trim().slice(0, 200) || "Untitled";
    const cleanHtml = sanitizeNoteHtml(html);
    if (!cleanHtml.trim()) {
      return { success: false, error: "Note is empty" };
    }

    const id = randomUUID();
    const now = Date.now();
    const authorName = ((await redis.hget(`member:${session.user.id}`, "name")) as string) || "Admin";

    const note: AdminNote = {
      id,
      title: cleanTitle,
      html: cleanHtml,
      authorId: session.user.id,
      authorName,
      createdAt: now,
      updatedAt: now,
    };

    await redis
      .multi()
      .hset(`note:${id}`, { ...note })
      .lpush("admin:notes:list", id)
      .exec();

    revalidatePath("/admin/notes");
    return { success: true, data: note };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create note",
    };
  }
}

export async function updateNote(
  id: string,
  title: string,
  html: string
): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized" };
    }

    const existing = await redis.hgetall(`note:${id}`);
    if (!existing || !(existing as any).id) {
      return { success: false, error: "Note not found" };
    }

    const cleanTitle = (title || "").trim().slice(0, 200) || "Untitled";
    const cleanHtml = sanitizeNoteHtml(html);
    if (!cleanHtml.trim()) {
      return { success: false, error: "Note is empty" };
    }

    await redis.hset(`note:${id}`, {
      title: cleanTitle,
      html: cleanHtml,
      updatedAt: Date.now(),
    });

    revalidatePath("/admin/notes");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update note",
    };
  }
}

export async function deleteNote(id: string): Promise<ActionResult<null>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized" };
    }

    await redis.multi().del(`note:${id}`).lrem("admin:notes:list", 0, id).exec();

    revalidatePath("/admin/notes");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete note",
    };
  }
}
