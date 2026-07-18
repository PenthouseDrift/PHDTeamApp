"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export async function updateProfileAvatar(
  userId: string,
  avatarUrl: string
): Promise<ActionResult<null>> {
  try {
    await redis.hset(`member:${userId}`, { customAvatar: avatarUrl });
    revalidatePath("/profile");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update avatar",
    };
  }
}
