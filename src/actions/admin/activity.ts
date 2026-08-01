"use server";

import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";
import { revalidatePath } from "next/cache";

export const getRecentActivity = unstable_cache(
  async () => {
    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    
    return (records || []).map(str => {
      try {
        return typeof str === "string" ? JSON.parse(str) : str;
      } catch {
        return null;
      }
    }).filter(Boolean);
  },
  ["global-activity-log"],
  {
    revalidate: 3600, // Cache for 1 hour by default, will be revalidated on demand
    tags: ["activity-log"],
  }
);

export async function refreshActivityLog() {
  revalidatePath("/admin/activity");
  return { success: true };
}

export async function deleteActivity(id: string) {
  try {
    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    
    let targetObjOrStr: any = null;
    
    for (const item of records) {
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          if (parsed.id === id) {
            targetObjOrStr = item;
            break;
          }
        } catch { }
      } else if (typeof item === "object" && item !== null) {
        // Upstash auto-parses JSON
        if ((item as any).id === id) {
          targetObjOrStr = item;
          break;
        }
      }
    }

    if (targetObjOrStr) {
      await redis.zrem("activity:log", targetObjOrStr);
      revalidatePath("/admin/activity");
      return { success: true };
    }

    return { success: false, error: "Activity not found" };
  } catch (error) {
    console.error("[Activity Logger] Failed to delete activity:", error);
    return { success: false, error: "Internal server error" };
  }
}
