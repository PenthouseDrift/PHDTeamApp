"use server";

import { redis } from "@/lib/redis";
import type { ActionResult } from "@/types";

function getCurrentWeek(): { year: number; week: number } {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((now.getTime() - jan1.getTime()) / 86400000);
  const weekNumber = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return { year: now.getFullYear(), week: weekNumber };
}

export async function selectWeeklyWinner(shellId: string): Promise<ActionResult<{ selected: boolean }>> {
  try {
    const { year, week } = getCurrentWeek();
    const winnerKey = `shells:winner:${year}:${week}`;

    // Check if this entry is already the winner
    const currentWinner = await redis.get(winnerKey);
    if (currentWinner === shellId) {
      return { success: false, error: "This entry is already the winner for the current week" };
    }

    // If different winner exists, remove old winner badge
    if (currentWinner) {
      await redis.hdel(`shell:${currentWinner as string}`, "winnerWeek", "winnerYear");
    }

    // Set new winner
    await redis.set(winnerKey, shellId);
    await redis.hset(`shell:${shellId}`, { winnerWeek: week, winnerYear: year });

    // Add to winners index sorted set (score = year*100 + week for ordering)
    const score = year * 100 + week;
    await redis.zadd("shells:winners", { score, member: shellId });

    return { success: true, data: { selected: true } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to select winner" };
  }
}

export async function getWeeklyWinners(limit = 20): Promise<Array<{ shellId: string; week: number; year: number }>> {
  const shellIds = await redis.zrange("shells:winners", 0, limit - 1, { rev: true });

  const winners: Array<{ shellId: string; week: number; year: number }> = [];
  for (const shellId of shellIds) {
    const data = await redis.hgetall(`shell:${shellId as string}`);
    if (data) {
      winners.push({
        shellId: shellId as string,
        week: Number(data.winnerWeek) || 0,
        year: Number(data.winnerYear) || 0,
      });
    }
  }
  return winners;
}

export { getCurrentWeek };
