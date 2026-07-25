"use server";

import { redis } from "@/lib/redis";
import { generateQRCode } from "@/lib/qr";
import type { ActionResult } from "@/types";

export async function getOrCreateQRCode(memberId: string): Promise<ActionResult<string>> {
  try {
    const qrDataUrl = await generateQRCode(memberId, "membership");
    return { success: true, data: qrDataUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate QR code",
    };
  }
}

export async function getOrGeneratePassNonce(
  memberId: string,
  type: "day_pass" | "rental"
): Promise<string> {
  const key = `qr:nonce:${type}:${memberId}`;
  let nonce = (await redis.get(key)) as string | null;
  if (!nonce) {
    nonce = globalThis.crypto.randomUUID();
    await redis.set(key, nonce, { ex: 86400 * 30 });
  }
  return nonce;
}
