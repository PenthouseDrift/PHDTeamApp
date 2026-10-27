import { randomUUID } from "crypto";
import { put } from "@vercel/blob";

/**
 * Server-side AI card art, shared by the admin card maker and the member card packs. Sends a
 * reference photo of the car plus a prompt to Gemini, saves the picture it returns to Vercel Blob
 * and returns its https URL (a card's image must be an https URL, never a data URI).
 *
 * Callers are responsible for checking who is allowed to call it. Problems that are safe to show a
 * person are thrown as CardArtError; anything else is an unexpected failure.
 */

/** An error whose message can be shown to the member or admin as it is. */
export class CardArtError extends Error {}

const MODEL = "gemini-2.5-flash-image";
// Gemini has no 6:5, so the original card asks for the closest ratio (5:4); full art cards fill the whole
// 63 x 88 card, so they ask for portrait (3:4, the closest to 63:88).
export const ART_ASPECT_RATIOS = ["5:4", "3:4"] as const;
export type ArtAspectRatio = (typeof ART_ASPECT_RATIOS)[number];

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
// Only our own Blob store may be fetched as a reference, so this can't be pointed at other hosts.
const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;

/** True when the URL is an https link into our Vercel Blob store. */
export function isBlobUrl(value: unknown): value is string {
  try {
    const u = new URL(String(value ?? ""));
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export async function generateArtImage(input: {
  referenceUrl: string;
  prompt: string;
  aspectRatio: ArtAspectRatio;
  /** Blob folder for the saved picture. */
  folder?: string;
}): Promise<{ imageUrl: string }> {
  if (!isBlobUrl(input.referenceUrl)) {
    throw new CardArtError("The reference photo must be uploaded through the app");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new CardArtError("GEMINI_API_KEY is not configured");

  // Fetch the reference photo.
  const refRes = await fetch(input.referenceUrl, { cache: "no-store" });
  if (!refRes.ok) throw new CardArtError("Could not load the reference photo");
  const mimeType = (refRes.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) throw new CardArtError("The reference photo must be a JPEG, PNG or WebP");
  const refBytes = Buffer.from(await refRes.arrayBuffer());
  if (refBytes.length > MAX_REFERENCE_BYTES) throw new CardArtError("The reference photo is too large");

  // Generate.
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }, { inlineData: { mimeType, data: refBytes.toString("base64") } }],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: { aspectRatio: input.aspectRatio },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const note = parts.map((p) => p.text).filter(Boolean).join(" ").slice(0, 200);
    throw new CardArtError(
      note ? `Gemini didn't return an image: ${note}` : "Gemini didn't return an image. Try again or adjust the prompt."
    );
  }

  // Save to Blob.
  const outMime = imagePart.inlineData.mimeType ?? "image/png";
  const ext = outMime === "image/jpeg" ? "jpg" : outMime === "image/webp" ? "webp" : "png";
  const blob = await put(`${input.folder ?? "card-art"}/ai-${randomUUID()}.${ext}`, Buffer.from(imagePart.inlineData.data, "base64"), {
    access: "public",
    contentType: outMime,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return { imageUrl: blob.url };
}
