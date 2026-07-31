"use server";

import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

function calcCurrentWeek(): { year: number; week: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNumber };
}

export async function getCurrentWeek(): Promise<{ year: number; week: number }> {
  return calcCurrentWeek();
}

export async function selectWeeklyWinner(shellId: string): Promise<ActionResult<{ selected: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return { success: false, error: "Unauthorized: Only admins can select weekly winners" };
    }

    const adminUserId = session.user.id;
    const adminName = session.user.name || "Admin";
    
    // Only allow selection on Saturday (6) or Sunday (0)
    const currentDate = new Date();
    const currentDay = currentDate.getDay();
    if (currentDay !== 0 && currentDay !== 6) {
      return { success: false, error: "Winners can only be selected on Saturday or Sunday." };
    }

    const now = currentDate.getTime();

    const { year, week } = calcCurrentWeek();
    const winnerKey = `shells:winner:${year}:${week}`;

    // Check if this entry is already the winner for the current week
    const currentWinner = await redis.get(winnerKey);
    if (currentWinner === shellId) {
      return { success: false, error: "This entry is already the winner for the current week" };
    }

    // Set new winner for current week
    await redis.set(winnerKey, shellId);

    // Save winner metadata on the shell hash
    await redis.hset(`shell:${shellId}`, {
      winnerWeek: week,
      winnerYear: year,
      selectedByUserId: adminUserId,
      selectedByName: adminName,
      selectedAt: now,
    });

    // Save metadata key for this specific week selection
    await redis.hset(`shells:winner:${year}:${week}:meta`, {
      shellId,
      selectedByUserId: adminUserId,
      selectedByName: adminName,
      selectedAt: now,
    });

    // Add to winners index sorted set (score = year*100 + week for ordering)
    const score = year * 100 + week;
    await redis.zadd("shells:winners", { score, member: shellId });

    revalidatePath("/admin/showcase-winners");
    revalidatePath("/showcase");
    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return { success: true, data: { selected: true } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to select winner" };
  }
}

export async function getCurrentWeekWinnerInfo(): Promise<{
  shellId: string | null;
  selectedByName: string | null;
  selectedByUserId: string | null;
  selectedAt: number | null;
}> {
  const { year, week } = calcCurrentWeek();
  const shellId = (await redis.get(`shells:winner:${year}:${week}`)) as string | null;
  if (!shellId) {
    return { shellId: null, selectedByName: null, selectedByUserId: null, selectedAt: null };
  }

  const meta = await redis.hgetall(`shells:winner:${year}:${week}:meta`);
  const shellData = await redis.hgetall(`shell:${shellId}`);

  const selectedByName = (meta?.selectedByName as string) || (shellData?.selectedByName as string) || null;
  const selectedByUserId = (meta?.selectedByUserId as string) || (shellData?.selectedByUserId as string) || null;
  const selectedAt = Number(meta?.selectedAt || shellData?.selectedAt) || null;

  return { shellId, selectedByName, selectedByUserId, selectedAt };
}

export async function getWeeklyWinners(limit = 50): Promise<Array<{
  shellId: string;
  week: number;
  year: number;
  imageUrl?: string;
  description?: string;
  userId?: string;
  userName?: string;
  selectedByName?: string;
  selectedByUserId?: string;
  selectedAt?: number;
}>> {
  try {
    const shellIds = await redis.zrange("shells:winners", 0, limit - 1, { rev: true });
    if (!shellIds || shellIds.length === 0) return [];

    const winnersMap = new Map<string, { week: number; year: number }>();

    // Scan all shells:winner:*:* keys in Redis to ensure authoritative week/year values
    const keys = await redis.keys("shells:winner:*:*");
    for (const key of keys) {
      if (key.endsWith(":meta")) continue;
      const parts = key.split(":");
      if (parts.length === 4) {
        const yr = Number(parts[2]);
        const wk = Number(parts[3]);
        const sId = (await redis.get(key)) as string;
        if (sId && yr > 0 && wk > 0) {
          winnersMap.set(sId, { year: yr, week: wk });
        }
      }
    }

    const winners: Array<{
      shellId: string;
      week: number;
      year: number;
      imageUrl?: string;
      description?: string;
      userId?: string;
      userName?: string;
      selectedByName?: string;
      selectedByUserId?: string;
      selectedAt?: number;
    }> = [];

    for (const shellId of shellIds) {
      const idStr = shellId as string;
      const data = await redis.hgetall(`shell:${idStr}`);

      let week = Number(data?.winnerWeek) || 0;
      let year = Number(data?.winnerYear) || 0;

      // Recover from shells:winner:YYYY:WW mapping if missing on shell hash
      if ((!week || !year) && winnersMap.has(idStr)) {
        const recovered = winnersMap.get(idStr)!;
        week = recovered.week;
        year = recovered.year;

        // Auto-heal missing hash fields in Redis
        if (data && Object.keys(data).length > 0) {
          await redis.hset(`shell:${idStr}`, { winnerWeek: week, winnerYear: year });
        }
      }

      let userName: string | undefined;
      const userId = data?.userId as string;
      if (userId) {
        const member = await redis.hgetall(`member:${userId}`);
        userName = (member?.name as string) || undefined;
      }

      if (week > 0 && year > 0) {
        winners.push({
          shellId: idStr,
          week,
          year,
          imageUrl: (data?.imageUrl as string) || undefined,
          description: (data?.description as string) || undefined,
          userId,
          userName,
          selectedByName: (data?.selectedByName as string) || undefined,
          selectedByUserId: (data?.selectedByUserId as string) || undefined,
          selectedAt: Number(data?.selectedAt) || undefined,
        });
      }
    }

    return winners.sort((a, b) => b.year * 100 + b.week - (a.year * 100 + a.week));
  } catch (error) {
    console.error("getWeeklyWinners error:", error);
    return [];
  }
}
