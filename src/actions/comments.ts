"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import { createNotification } from "./notifications";

export interface Comment {
  commentId: string;
  shellId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  text: string;
  likes: number;
  replyTo?: string;
  createdAt: number;
}

export async function addComment(
  shellId: string,
  userId: string,
  text: string,
  replyTo?: string
): Promise<ActionResult<Comment>> {
  if (!text.trim() || text.trim().length > 500) {
    return { success: false, error: "Comment must be between 1 and 500 characters" };
  }

  // Get user info
  const member = await redis.hgetall(`member:${userId}`);
  const userName = (member?.name as string) || "Unknown";
  const userImage = (member?.customAvatar as string) || (member?.image as string) || null;

  const commentId = crypto.randomUUID();
  const comment: Comment = {
    commentId,
    shellId,
    userId,
    userName,
    userImage,
    text: text.trim(),
    likes: 0,
    replyTo: replyTo || "",
    createdAt: Date.now(),
  };

  await redis.hset(`comment:${commentId}`, comment as unknown as Record<string, unknown>);
  await redis.rpush(`shell:${shellId}:comments`, commentId);

  // Notifications — skip if interacting with own shell
  const shellData = await redis.hgetall(`shell:${shellId}`);
  const shellOwnerId = shellData?.userId as string;

  if (replyTo) {
    // Notify the person being replied to (skip if replying to yourself)
    const replyToComment = await redis.hgetall(`comment:${replyTo}`);
    if (replyToComment?.userId && replyToComment.userId !== userId) {
      await createNotification({
        userId: replyToComment.userId as string,
        type: "reply",
        fromUserId: userId,
        fromUserName: userName,
        shellId,
        message: `${userName} replied: "${text.trim().slice(0, 80)}"`,
      });
    }
  }

  // Notify the shell owner about the comment (skip if it's your own shell)
  if (shellOwnerId && shellOwnerId !== userId) {
    await createNotification({
      userId: shellOwnerId,
      type: "comment",
      fromUserId: userId,
      fromUserName: userName,
      shellId,
      message: `${userName} commented: "${text.trim().slice(0, 80)}"`,
    });
  }

  // Notify other commenters on this shell (skip yourself and shell owner who was already notified)
  const allCommentIds = await redis.lrange(`shell:${shellId}:comments`, 0, -1);
  const notifiedUsers = new Set([userId, shellOwnerId]);
  for (const cId of allCommentIds) {
    if (cId === commentId) continue;
    const cData = await redis.hgetall(`comment:${cId as string}`);
    if (cData?.userId && !notifiedUsers.has(cData.userId as string)) {
      notifiedUsers.add(cData.userId as string);
      await createNotification({
        userId: cData.userId as string,
        type: "comment",
        fromUserId: userId,
        fromUserName: userName,
        shellId,
        message: `${userName} also commented on a shell you interacted with`,
      });
    }
  }

  revalidatePath("/showcase");
  return { success: true, data: comment };
}

export async function getComments(shellId: string): Promise<Comment[]> {
  const commentIds = await redis.lrange(`shell:${shellId}:comments`, 0, -1);
  if (!commentIds || commentIds.length === 0) return [];

  const comments: Comment[] = [];
  for (const id of commentIds) {
    const data = await redis.hgetall(`comment:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      comments.push({
        commentId: (data.commentId as string) || (id as string),
        shellId: (data.shellId as string) || shellId,
        userId: data.userId as string,
        userName: (data.userName as string) || "Unknown",
        userImage: (data.userImage as string) || null,
        text: (data.text as string) || "",
        likes: Number(data.likes) || 0,
        createdAt: Number(data.createdAt),
      });
    }
  }

  return comments;
}

export async function toggleCommentLike(
  commentId: string,
  userId: string
): Promise<ActionResult<{ liked: boolean; newCount: number }>> {
  try {
    const likesKey = `comment:${commentId}:likes`;
    const isMember = await redis.sismember(likesKey, userId);

    let newCount: number;
    let liked: boolean;

    const commentData = await redis.hgetall(`comment:${commentId}`);
    if (!commentData) return { success: false, error: "Comment not found" };

    if (isMember) {
      await redis.srem(likesKey, userId);
      newCount = Math.max(0, Number(commentData.likes) - 1);
      liked = false;
    } else {
      await redis.sadd(likesKey, userId);
      newCount = Number(commentData.likes) + 1;
      liked = true;

      // Notify comment author
      const member = await redis.hgetall(`member:${userId}`);
      const userName = (member?.name as string) || "Someone";
      await createNotification({
        userId: commentData.userId as string,
        type: "comment_like",
        fromUserId: userId,
        fromUserName: userName,
        shellId: (commentData.shellId as string) || "",
        message: `${userName} liked your comment`,
      });
    }

    await redis.hset(`comment:${commentId}`, { likes: newCount });

    return { success: true, data: { liked, newCount } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function hasUserLikedComment(commentId: string, userId: string): Promise<boolean> {
  const result = await redis.sismember(`comment:${commentId}:likes`, userId);
  return result === 1;
}

export async function getCommentCount(shellId: string): Promise<number> {
  return await redis.llen(`shell:${shellId}:comments`);
}
