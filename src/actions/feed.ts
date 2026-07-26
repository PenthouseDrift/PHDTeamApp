"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createNotification } from "./notifications";
import type { ActionResult } from "@/types";

export interface ReportedPost {
  reportId: string;
  postId: string;
  postUserId: string;
  postUserName: string;
  postUserImage: string | null;
  postText: string;
  postImages: string[];
  postCreatedAt: number;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: number;
}

export interface FeedPost {
  postId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  text: string;
  images: string[];
  likes: number;
  commentCount: number;
  createdAt: number;
}

export interface FeedComment {
  commentId: string;
  postId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  text: string;
  likes: number;
  createdAt: number;
}

export async function createPost(
  userId: string,
  text: string,
  images: string[] = []
): Promise<ActionResult<FeedPost>> {
  if (!text.trim() && images.length === 0) {
    return { success: false, error: "Post must have text or an image" };
  }
  if (text.length > 2000) {
    return { success: false, error: "Text must be under 2000 characters" };
  }

  const member = await redis.hgetall(`member:${userId}`);
  const userName = (member?.nickname as string)?.trim() || (member?.name as string) || "Unknown";
  const userImage = (member?.customAvatar as string) || (member?.image as string) || null;

  const postId = crypto.randomUUID();
  const post: FeedPost = {
    postId,
    userId,
    userName,
    userImage,
    text: text.trim(),
    images,
    likes: 0,
    commentCount: 0,
    createdAt: Date.now(),
  };

  await redis.hset(`feed:post:${postId}`, {
    ...post,
    images: JSON.stringify(images),
  });
  await redis.lpush("feed:posts", postId);

  revalidatePath("/newsfeed");
  return { success: true, data: post };
}

export async function getFeedPosts(limit = 30): Promise<FeedPost[]> {
  const postIds = await redis.lrange("feed:posts", 0, limit - 1);
  if (!postIds || postIds.length === 0) return [];

  const postPromises = postIds.map(async (id) => {
    const data = await redis.hgetall(`feed:post:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      const images = Array.isArray(data.images)
        ? data.images
        : typeof data.images === "string"
        ? JSON.parse(data.images || "[]")
        : [];
      return {
        postId: (data.postId as string) || (id as string),
        userId: data.userId as string,
        userName: (data.userName as string) || "Unknown",
        userImage: (data.userImage as string) || null,
        text: (data.text as string) || "",
        images,
        likes: Number(data.likes) || 0,
        commentCount: Number(data.commentCount) || 0,
        createdAt: Number(data.createdAt),
      };
    }
    return null;
  });

  const results = await Promise.all(postPromises);
  return results.filter((p): p is FeedPost => p !== null);
}

export async function togglePostLike(
  postId: string,
  userId: string
): Promise<ActionResult<{ liked: boolean; newCount: number }>> {
  try {
    const likesKey = `feed:post:${postId}:likes`;
    const isMember = await redis.sismember(likesKey, userId);
    const postData = await redis.hgetall(`feed:post:${postId}`);
    if (!postData) return { success: false, error: "Post not found" };

    let newCount: number;
    let liked: boolean;

    if (isMember) {
      await redis.srem(likesKey, userId);
      newCount = Math.max(0, Number(postData.likes) - 1);
      liked = false;
    } else {
      await redis.sadd(likesKey, userId);
      newCount = Number(postData.likes) + 1;
      liked = true;

      const member = await redis.hgetall(`member:${userId}`);
      const userName = (member?.nickname as string)?.trim() || (member?.name as string) || "Someone";
      await createNotification({
        userId: postData.userId as string,
        type: "like",
        fromUserId: userId,
        fromUserName: userName,
        postId: postId,
        targetType: "post",
        url: "/newsfeed",
        message: `${userName} liked your post`,
      });
    }

    await redis.hset(`feed:post:${postId}`, { likes: newCount });
    return { success: true, data: { liked, newCount } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function hasUserLikedPost(postId: string, userId: string): Promise<boolean> {
  const result = await redis.sismember(`feed:post:${postId}:likes`, userId);
  return result === 1;
}

export async function addFeedComment(
  postId: string,
  userId: string,
  text: string
): Promise<ActionResult<FeedComment>> {
  if (!text.trim() || text.length > 500) {
    return { success: false, error: "Comment must be 1-500 characters" };
  }

  const member = await redis.hgetall(`member:${userId}`);
  const userName = (member?.nickname as string)?.trim() || (member?.name as string) || "Unknown";
  const userImage = (member?.customAvatar as string) || (member?.image as string) || null;

  const commentId = crypto.randomUUID();
  const comment: FeedComment = {
    commentId,
    postId,
    userId,
    userName,
    userImage,
    text: text.trim(),
    likes: 0,
    createdAt: Date.now(),
  };

  await redis.hset(`feed:comment:${commentId}`, comment as unknown as Record<string, unknown>);
  await redis.rpush(`feed:post:${postId}:comments`, commentId);

  // Increment comment count
  const postData = await redis.hgetall(`feed:post:${postId}`);
  if (postData) {
    await redis.hset(`feed:post:${postId}`, { commentCount: Number(postData.commentCount || 0) + 1 });
  }

  // Notify post author
  if (postData?.userId && postData.userId !== userId) {
    await createNotification({
      userId: postData.userId as string,
      type: "comment",
      fromUserId: userId,
      fromUserName: userName,
      postId: postId,
      targetType: "post",
      url: "/newsfeed",
      message: `${userName} commented: "${text.trim().slice(0, 80)}"`,
    });
  }

  revalidatePath("/newsfeed");
  return { success: true, data: comment };
}

export async function getFeedComments(postId: string): Promise<FeedComment[]> {
  const ids = await redis.lrange(`feed:post:${postId}:comments`, 0, -1);
  if (!ids || ids.length === 0) return [];

  const commentPromises = ids.map(async (id) => {
    const data = await redis.hgetall(`feed:comment:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      return {
        commentId: (data.commentId as string) || (id as string),
        postId: (data.postId as string) || postId,
        userId: data.userId as string,
        userName: (data.userName as string) || "Unknown",
        userImage: (data.userImage as string) || null,
        text: (data.text as string) || "",
        likes: Number(data.likes) || 0,
        createdAt: Number(data.createdAt),
      };
    }
    return null;
  });

  const results = await Promise.all(commentPromises);
  return results.filter((c): c is FeedComment => c !== null);
}

export async function deletePost(postId: string, userId: string, isAdminOrMod: boolean): Promise<ActionResult<null>> {
  const postData = await redis.hgetall(`feed:post:${postId}`);
  if (!postData) return { success: false, error: "Post not found" };
  if (postData.userId !== userId && !isAdminOrMod) {
    return { success: false, error: "Not authorized" };
  }

  await redis.del(`feed:post:${postId}`);
  await redis.lrem("feed:posts", 1, postId);
  revalidatePath("/newsfeed");
  revalidatePath("/admin/feedback");
  return { success: true, data: null };
}

export async function reportPost(
  postId: string,
  reason: string
): Promise<ActionResult<ReportedPost>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "You must be logged in to report posts" };
    }

    if (!reason || !reason.trim()) {
      return { success: false, error: "Please provide a reason for your report" };
    }

    const postData = await redis.hgetall(`feed:post:${postId}`);
    if (!postData || Object.keys(postData).length === 0) {
      return { success: false, error: "Post not found" };
    }

    const reportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const images = Array.isArray(postData.images)
      ? postData.images
      : typeof postData.images === "string"
      ? JSON.parse(postData.images || "[]")
      : [];

    const report: ReportedPost = {
      reportId,
      postId,
      postUserId: postData.userId as string,
      postUserName: (postData.userName as string) || "Unknown User",
      postUserImage: (postData.userImage as string) || null,
      postText: (postData.text as string) || "",
      postImages: images,
      postCreatedAt: Number(postData.createdAt) || Date.now(),
      reporterId: session.user.id,
      reporterName: session.user.name || "Member",
      reporterEmail: session.user.email || "",
      reason: reason.trim(),
      status: "open",
      createdAt: Date.now(),
    };

    await redis.hset(`feedback:reported_post:${reportId}`, {
      ...report,
      postImages: JSON.stringify(images),
    });
    await redis.lpush("feedback:reported_posts_list", reportId);

    revalidatePath("/admin/feedback");

    return { success: true, data: report };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to report post",
    };
  }
}

export async function getReportedPostsList(): Promise<ActionResult<ReportedPost[]>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    const ids = await redis.lrange("feedback:reported_posts_list", 0, -1);
    if (!ids || ids.length === 0) {
      return { success: true, data: [] };
    }

    const reports: ReportedPost[] = [];
    for (const id of ids) {
      const data = await redis.hgetall(`feedback:reported_post:${id}`);
      if (data && Object.keys(data).length > 0) {
        const postImages = Array.isArray(data.postImages)
          ? data.postImages
          : typeof data.postImages === "string"
          ? JSON.parse(data.postImages || "[]")
          : [];

        reports.push({
          reportId: data.reportId as string,
          postId: data.postId as string,
          postUserId: data.postUserId as string,
          postUserName: (data.postUserName as string) || "Unknown",
          postUserImage: (data.postUserImage as string) || null,
          postText: (data.postText as string) || "",
          postImages,
          postCreatedAt: Number(data.postCreatedAt) || 0,
          reporterId: data.reporterId as string,
          reporterName: (data.reporterName as string) || "Member",
          reporterEmail: (data.reporterEmail as string) || "",
          reason: data.reason as string,
          status: (data.status as "open" | "resolved") || "open",
          createdAt: Number(data.createdAt) || Date.now(),
        });
      }
    }

    return { success: true, data: reports };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch reported posts",
    };
  }
}

export async function dismissPostReport(reportId: string): Promise<ActionResult<boolean>> {
  try {
    const session = await auth();
    if (!session?.user || (session.user.role !== "admin" && session.user.role !== "moderator")) {
      return { success: false, error: "Unauthorized access" };
    }

    await redis.del(`feedback:reported_post:${reportId}`);
    await redis.lrem("feedback:reported_posts_list", 1, reportId);

    revalidatePath("/admin/feedback");
    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to dismiss report",
    };
  }
}
