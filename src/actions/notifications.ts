"use server";

import { redis } from "@/lib/redis";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";

export interface AppNotification {
  notificationId: string;
  userId: string;
  type: "like" | "comment" | "reply" | "comment_like";
  fromUserId: string;
  fromUserName: string;
  shellId: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export async function createNotification(params: {
  userId: string;
  type: AppNotification["type"];
  fromUserId: string;
  fromUserName: string;
  shellId: string;
  message: string;
}): Promise<void> {
  // Don't notify yourself
  if (params.userId === params.fromUserId) return;

  const notificationId = crypto.randomUUID();
  const notification: AppNotification = {
    notificationId,
    ...params,
    read: false,
    createdAt: Date.now(),
  };

  // Store notification
  await redis.hset(`notification:${notificationId}`, notification as unknown as Record<string, unknown>);
  // Add to user's notification list (newest first)
  await redis.lpush(`notifications:${params.userId}`, notificationId);
  // Increment unread count
  await redis.incr(`notifications:${params.userId}:unread`);

  // Send push notification
  await sendPushToUser(params.userId, {
    title: getNotificationTitle(params.type),
    body: params.message,
    url: `/showcase?open=${params.shellId}`,
  });
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url: string }) {
  try {
    const subIds = await redis.smembers(`push:user:${userId}:subscriptions`);
    for (const subId of subIds) {
      const subData = await redis.get(`push:subscription:${subId}`);
      if (subData) {
        const subscription: PushSubscriptionData =
          typeof subData === "string" ? JSON.parse(subData) : subData as unknown as PushSubscriptionData;
        await sendPushNotification(subscription, payload);
      }
    }
  } catch (error) {
    console.error("Push to user failed:", error);
  }
}

function getNotificationTitle(type: AppNotification["type"]): string {
  switch (type) {
    case "like": return "👍 New Like";
    case "comment": return "💬 New Comment";
    case "reply": return "↩️ New Reply";
    case "comment_like": return "👍 Comment Liked";
    default: return "🔔 Notification";
  }
}

export async function getNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  const ids = await redis.lrange(`notifications:${userId}`, 0, limit - 1);
  if (!ids || ids.length === 0) return [];

  const notifications: AppNotification[] = [];
  for (const id of ids) {
    const data = await redis.hgetall(`notification:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      notifications.push({
        notificationId: (data.notificationId as string) || (id as string),
        userId: data.userId as string,
        type: data.type as AppNotification["type"],
        fromUserId: data.fromUserId as string,
        fromUserName: (data.fromUserName as string) || "Someone",
        shellId: data.shellId as string,
        message: (data.message as string) || "",
        read: String(data.read) === "true",
        createdAt: Number(data.createdAt),
      });
    }
  }

  return notifications;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const count = await redis.get(`notifications:${userId}:unread`);
  return Number(count) || 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const ids = await redis.lrange(`notifications:${userId}`, 0, 29);
  for (const id of ids) {
    await redis.hset(`notification:${id as string}`, { read: "true" });
  }
  await redis.set(`notifications:${userId}:unread`, 0);
}
