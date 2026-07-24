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

export async function updateNickname(
  userId: string,
  nickname: string
): Promise<ActionResult<string>> {
  try {
    const trimmed = nickname.trim();
    await redis.hset(`member:${userId}`, { nickname: trimmed });
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/wallet");
    revalidatePath("/admin/members");
    revalidatePath("/admin/scanner");
    return { success: true, data: trimmed };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update nickname",
    };
  }
}
