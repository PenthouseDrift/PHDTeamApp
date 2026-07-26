"use server";

import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import type { FlaggedIncident } from "@/lib/moderation";

export interface UserFeedback {
  feedbackId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  category: "General Feedback" | "Bug Report" | "Feature Request";
  comment: string;
  images: string[];
  status: "open" | "reviewed" | "resolved";
  createdAt: number;
}

export async function submitFeedback(data: {
  category: "General Feedback" | "Bug Report" | "Feature Request";
  comment: string;
  images: string[];
}): Promise<ActionResult<UserFeedback>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in to submit feedback" };
    }

    if (!data.comment || !data.comment.trim()) {
      return { success: false, error: "Comment cannot be empty" };
    }

    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const avatar = (await redis.hget(`member:${session.user.id}`, "customAvatar")) as string | null;

    const feedback: UserFeedback = {
      feedbackId,
      userId: session.user.id,
      userName: session.user.name || "Member",
      userEmail: session.user.email || "",
      userAvatar: avatar || session.user.image || undefined,
      category: data.category,
      comment: data.comment.trim(),
      images: data.images || [],
      status: "open",
      createdAt: Date.now(),
    };

    await redis.hset(`feedback:${feedbackId}`, feedback as unknown as Record<string, unknown>);
    await redis.lpush("feedback:list", feedbackId);

    revalidatePath("/admin/feedback");

    return { success: true, data: feedback };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit feedback",
    };
  }
}

export async function getFeedbackList(): Promise<ActionResult<UserFeedback[]>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    const ids = await redis.lrange("feedback:list", 0, -1);
    if (!ids || ids.length === 0) {
      return { success: true, data: [] };
    }

    const feedbackList: UserFeedback[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(`feedback:${id}`);
      if (data && Object.keys(data).length > 0) {
        feedbackList.push({
          feedbackId: data.feedbackId as string,
          userId: data.userId as string,
          userName: data.userName as string,
          userEmail: data.userEmail as string,
          userAvatar: (data.userAvatar as string) || undefined,
          category: (data.category as UserFeedback["category"]) || "General Feedback",
          comment: data.comment as string,
          images: Array.isArray(data.images) ? data.images : typeof data.images === "string" ? JSON.parse(data.images) : [],
          status: (data.status as UserFeedback["status"]) || "open",
          createdAt: Number(data.createdAt) || Date.now(),
        });
      }
    }

    return { success: true, data: feedbackList };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch feedback list",
    };
  }
}

export async function getFlaggedContentList(): Promise<ActionResult<FlaggedIncident[]>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    const ids = await redis.lrange("feedback:flagged_list", 0, -1);
    if (!ids || ids.length === 0) {
      return { success: true, data: [] };
    }

    const incidents: FlaggedIncident[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(`feedback:flagged:${id}`);
      if (data && Object.keys(data).length > 0) {
        incidents.push({
          flaggedId: data.flaggedId as string,
          userId: data.userId as string,
          userName: data.userName as string,
          userEmail: data.userEmail as string,
          imageUrl: data.imageUrl as string,
          context: data.context as string,
          reason: data.reason as string,
          createdAt: Number(data.createdAt) || Date.now(),
        });
      }
    }

    return { success: true, data: incidents };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch flagged incidents",
    };
  }
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: "open" | "reviewed" | "resolved"
): Promise<ActionResult<boolean>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    await redis.hset(`feedback:${feedbackId}`, { status });
    revalidatePath("/admin/feedback");

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}

export async function deleteFlaggedIncident(flaggedId: string): Promise<ActionResult<boolean>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    await redis.del(`feedback:flagged:${flaggedId}`);
    await redis.lrem("feedback:flagged_list", 1, flaggedId);
    revalidatePath("/admin/feedback");

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete incident",
    };
  }
}
