"use server";

import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";
import { revalidatePath, updateTag } from "next/cache";

export const getRecentActivity = unstable_cache(
  async () => {
    const records = await redis.zrange("activity:log", 0, 1999, { rev: true });
    
    const parsed = (records || []).map(str => {
      try {
        return typeof str === "string" ? JSON.parse(str) : str;
      } catch {
        return null;
      }
    }).filter(Boolean);

    const checkinsByMemberDate = new Map<string, any[]>();
    for (const item of parsed) {
      if (item.type === "checkin") {
        const date = new Date(item.timestamp).toISOString().split("T")[0];
        const key = `${item.memberId}_${date}`;
        if (!checkinsByMemberDate.has(key)) {
          checkinsByMemberDate.set(key, []);
        }
        checkinsByMemberDate.get(key)!.push(item);
      }
    }

    const itemsToHide = new Set<string>();
    for (const checkins of checkinsByMemberDate.values()) {
      if (checkins.length > 1) {
        checkins.sort((a, b) => (b.description?.length || 0) - (a.description?.length || 0));
        for (let i = 1; i < checkins.length; i++) {
          itemsToHide.add(checkins[i].id);
        }
      }
    }

    return parsed.filter((item: any) => !itemsToHide.has(item.id));
  },
  ["global-activity-log"],
  {
    revalidate: 3600, // Cache for 1 hour by default, will be revalidated on demand
    tags: ["activity-log"],
  }
);

export async function refreshActivityLog() {
  // Bust the unstable_cache data entry (keyed/tagged "activity-log"). A plain
  // revalidatePath does NOT invalidate the cached data, so the tag must be used.
  // updateTag (Next 16) blocks until the data is fresh, giving read-your-own-writes
  // so the admin sees the latest activity immediately after clicking Refresh.
  updateTag("activity-log");
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
      updateTag("activity-log");
      revalidatePath("/admin/activity");
      return { success: true };
    }

    return { success: false, error: "Activity not found" };
  } catch (error) {
    console.error("[Activity Logger] Failed to delete activity:", error);
    return { success: false, error: "Internal server error" };
  }
}
