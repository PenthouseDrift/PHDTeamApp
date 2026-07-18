"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { Member, ActionResult } from "@/types";

export async function getAllUsers(): Promise<Member[]> {
  try {
    // Scan for all member keys
    let cursor = 0;
    const members: Member[] = [];

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "member:*",
        count: 100,
      });
      cursor = Number(newCursor);

      for (const key of keys) {
        const data = await redis.hgetall(key);
        if (data && Object.keys(data).length > 0 && data.email) {
          members.push({
            id: (data.id as string) || "",
            email: (data.email as string) || "",
            name: (data.name as string) || "Unknown",
            image: (data.image as string) || null,
            role: (data.role as "admin" | "member") || "member",
            qrCode: null,
            createdAt: Number(data.createdAt) || 0,
          });
        }
      }
    } while (cursor !== 0);

    // Sort by name
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
