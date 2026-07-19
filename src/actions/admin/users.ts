"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { Member, ActionResult } from "@/types";

export async function getAllUsers(): Promise<Member[]> {
  try {
    const membersMap = new Map<string, Member>();
    let cursor = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "member:*",
        count: 100,
      });
      cursor = Number(newCursor);

      for (const key of keys) {
        const keyStr = key as string;
        // Skip sub-keys like member:userId:cars
        if (keyStr.split(":").length > 2) continue;

        const userId = keyStr.replace("member:", "");
        if (membersMap.has(userId)) continue;

        const data = await redis.hgetall(keyStr);
        if (data && Object.keys(data).length > 0 && data.email) {
          membersMap.set(userId, {
            id: userId,
            email: (data.email as string) || "",
            name: (data.name as string) || "Unknown",
            image: (data.customAvatar as string) || (data.image as string) || null,
            role: (data.role as "admin" | "member") || "member",
            qrCode: null,
            createdAt: Number(data.createdAt) || 0,
          });
        }
      }
    } while (cursor !== 0);

    const members = Array.from(membersMap.values());
    members.sort((a, b) => a.name.localeCompare(b.name));
    return members;
  } catch (error) {
    console.error("getAllUsers error:", error);
    return [];
  }
}

export async function toggleAdminRole(
  userId: string,
  makeAdmin: boolean
): Promise<ActionResult<{ role: "admin" | "member" }>> {
  try {
    const newRole = makeAdmin ? "admin" : "member";
    await redis.hset(`member:${userId}`, { role: newRole });
    revalidatePath("/admin/users");
    return { success: true, data: { role: newRole } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update role",
    };
  }
}
