"use server";

import { redis } from "@/lib/redis";
import { shellSubmissionSchema } from "@/lib/validators";
import { createNotification } from "./notifications";
import type { ShellEntry, ActionResult } from "@/types";

export async function toggleVote(shellId: string, userId: string): Promise<ActionResult<{ voted: boolean; newCount: number }>> {
  try {
    const shellData = await redis.hgetall(`shell:${shellId}`);
    if (!shellData || Object.keys(shellData).length === 0) {
      return { success: false, error: "Shell entry not found" };
    }
    if (shellData.userId === userId) {
      return { success: false, error: "Cannot vote on your own entry" };
    }

    const votersKey = `shell:${shellId}:voters`;
    const isMember = await redis.sismember(votersKey, userId);

    let newCount: number;
    let voted: boolean;

    if (isMember) {
      await redis.srem(votersKey, userId);
      newCount = Math.max(0, Number(shellData.voteCount) - 1);
      voted = false;
    } else {
      await redis.sadd(votersKey, userId);
      newCount = Number(shellData.voteCount) + 1;
      voted = true;

      // Notify shell owner
      const member = await redis.hgetall(`member:${userId}`);
      const userName = (member?.name as string) || "Someone";
      await createNotification({
        userId: shellData.userId as string,
        type: "like",
        fromUserId: userId,
        fromUserName: userName,
        shellId,
        message: `${userName} liked your shell`,
      });
    }

    await redis.hset(`shell:${shellId}`, { voteCount: newCount });
    await redis.zadd("shells:leaderboard", { score: newCount, member: shellId });

    return { success: true, data: { voted, newCount } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Vote failed" };
  }
}

export async function hasUserVoted(shellId: string, userId: string): Promise<boolean> {
  const result = await redis.sismember(`shell:${shellId}:voters`, userId);
  return result === 1;
}

export async function submitShell(
  userId: string,
  data: { imageUrl: string; description?: string }
): Promise<ActionResult<ShellEntry>> {
  const parsed = shellSubmissionSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
  }

  const shellId = crypto.randomUUID();
  const now = Date.now();

  const entry: ShellEntry = {
    shellId,
    userId,
    imageUrl: parsed.data.imageUrl,
    description: parsed.data.description || "",
    voteCount: 0,
    createdAt: now,
  };

  await redis.hset(`shell:${shellId}`, entry as unknown as Record<string, unknown>);
  // Use negative timestamp for descending order (newest first)
  await redis.zadd("shells:all", { score: -now, member: shellId });
  await redis.zadd("shells:leaderboard", { score: 0, member: shellId });

  return { success: true, data: entry };
}

export async function getShowcaseEntries(limit = 50): Promise<ShellEntry[]> {
  const shellIds = await redis.zrange("shells:all", 0, limit - 1);

  if (!shellIds || shellIds.length === 0) return [];

  const entries: ShellEntry[] = [];
  for (const shellId of shellIds) {
    const data = await redis.hgetall(`shell:${shellId as string}`);
    if (data && Object.keys(data).length > 0) {
      entries.push({
        shellId: data.shellId as string,
        userId: data.userId as string,
        imageUrl: data.imageUrl as string,
        description: (data.description as string) || "",
        voteCount: Number(data.voteCount) || 0,
        createdAt: Number(data.createdAt),
      });
    }
  }

  return entries;
}

export async function getLeaderboard(limit = 50): Promise<ShellEntry[]> {
  // Get from leaderboard sorted set (highest score = most votes)
  const shellIds = await redis.zrange("shells:leaderboard", 0, limit - 1, { rev: true });

  if (!shellIds || shellIds.length === 0) return [];

  const entries: ShellEntry[] = [];
  for (const shellId of shellIds) {
    const data = await redis.hgetall(`shell:${shellId as string}`);
    if (data && Object.keys(data).length > 0) {
      entries.push({
        shellId: data.shellId as string,
        userId: data.userId as string,
        imageUrl: data.imageUrl as string,
        description: (data.description as string) || "",
        voteCount: Number(data.voteCount) || 0,
        createdAt: Number(data.createdAt),
      });
    }
  }

  // Secondary sort for ties: earlier submission ranks higher
  entries.sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return a.createdAt - b.createdAt;
  });

  return entries;
}
