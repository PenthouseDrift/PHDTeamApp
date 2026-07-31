"use server";

import { cache } from "react";

import { redis } from "@/lib/redis";
import { sendPushNotification, type PushSubscriptionData } from "@/lib/push";
import type { ActionResult } from "@/types";

export interface AppNotification {
  notificationId: string;
  userId: string;
  type: "like" | "comment" | "reply" | "comment_like" | "global" | "event_reminder";
  fromUserId: string;
  fromUserName: string;
  shellId?: string;
  postId?: string;
  targetType?: "post" | "shell";
  url?: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export interface GlobalNotificationEntry {
  id: string;
  title: string;
  message: string;
  url: string;
  adminId: string;
  recipientCount: number;
  createdAt: number;
}

/**
 * Creates an in-app notification and sends a push notification to a specific user.
 * Strictly enforces:
 * 1. No self-notifications (fromUserId === userId)
 * 2. Deduplication check (only notifies ONCE per distinct user action)
 */
export async function createNotification(params: {
  userId: string;
  type: AppNotification["type"];
  fromUserId: string;
  fromUserName: string;
  shellId?: string;
  postId?: string;
  targetType?: "post" | "shell";
  url?: string;
  message: string;
  dedupKey?: string;
}): Promise<boolean> {
  try {
    // 1. Strict self-notification guard: NEVER notify yourself
    if (!params.userId || params.userId === params.fromUserId) {
      return false;
    }

    // 2. Action deduplication check: Prevent rapid misclick spam (15s for comments/replies, 60s for likes)
    const ttl = (params.type === "comment" || params.type === "reply") ? 15 : 60;
    const windowBucket = Math.floor(Date.now() / (ttl * 1000));
    const dedupKey = params.dedupKey || `notification:dedup:${params.type}:${params.fromUserId}:${params.shellId || params.postId || "global"}:${params.userId}:${windowBucket}`;
    const alreadyNotified = await redis.get(dedupKey);

    if (alreadyNotified) {
      return false; // Skip rapid duplicate notification
    }

    // Mark action as notified for short TTL window
    await redis.set(dedupKey, "1", { ex: ttl });

    const notificationId = crypto.randomUUID();
    const now = Date.now();
    const notification: AppNotification = {
      notificationId,
      userId: params.userId,
      type: params.type,
      fromUserId: params.fromUserId,
      fromUserName: params.fromUserName,
      shellId: params.shellId || params.postId || "",
      postId: params.postId || "",
      targetType: params.targetType || (params.postId ? "post" : "shell"),
      url: params.url || (params.postId ? "/newsfeed" : params.shellId ? `/showcase?open=${params.shellId}` : "/newsfeed"),
      message: params.message,
      read: false,
      createdAt: now,
    };

    // Store in-app notification in Redis with 7 day retention TTL
    await redis.hset(`notification:${notificationId}`, notification as unknown as Record<string, unknown>);
    await redis.expire(`notification:${notificationId}`, 7 * 86400);
    await redis.lpush(`notifications:${params.userId}`, notificationId);
    await redis.ltrim(`notifications:${params.userId}`, 0, 99);
    await redis.incr(`notifications:${params.userId}:unread`);

    // Send Web Push Notification (fire and forget)
    sendPushToUser(params.userId, {
      title: getNotificationTitle(params.type),
      body: params.message,
      url: params.shellId ? `/showcase?open=${params.shellId}` : "/notifications",
    }).catch(() => {});

    return true;
  } catch (error) {
    console.error("Notification error:", error);
    return false;
  }
}

/**
 * Send a Global Notification to ALL members in the system.
 * Triggered via the Admin Area.
 */
export async function sendGlobalNotification(
  params: { title: string; message: string; url?: string },
  adminId: string
): Promise<ActionResult<{ count: number }>> {
  try {
    if (!params.title.trim() || !params.message.trim()) {
      return { success: false, error: "Title and message are required" };
    }

    // Scan all member:* keys
    let cursor = 0;
    const memberIds = new Set<string>();

    do {
      const [newCursor, keys] = await redis.scan(cursor, {
        match: "member:*",
        count: 200,
      });
      cursor = Number(newCursor);

      for (const key of keys) {
        const keyStr = key as string;
        const parts = keyStr.split(":");
        if (parts.length === 2 && parts[1]) {
          memberIds.add(parts[1]);
        }
      }
    } while (cursor !== 0);

    const targetUserIds = Array.from(memberIds);
    if (targetUserIds.length === 0) {
      return { success: false, error: "No members found to notify" };
    }

    const adminMember = await redis.hgetall(`member:${adminId}`);
    const adminName = (adminMember?.nickname as string)?.trim() || (adminMember?.name as string) || "Track Admin";
    const targetUrl = params.url?.trim() || "/notifications";

    // Send in-app notifications to all target users in parallel
    const notificationPipeline = redis.pipeline();
    for (const uid of targetUserIds) {
      const notificationId = crypto.randomUUID();
      const notification: AppNotification = {
        notificationId,
        userId: uid,
        type: "global",
        fromUserId: adminId,
        fromUserName: adminName,
        shellId: "",
        message: `${params.title.trim()}: ${params.message.trim()}`,
        read: false,
        createdAt: Date.now(),
      };

      notificationPipeline.hset(`notification:${notificationId}`, notification as unknown as Record<string, unknown>);
      notificationPipeline.expire(`notification:${notificationId}`, 7 * 86400);
      notificationPipeline.lpush(`notifications:${uid}`, notificationId);
      notificationPipeline.ltrim(`notifications:${uid}`, 0, 99);
      notificationPipeline.incr(`notifications:${uid}:unread`);
    }

    if (targetUserIds.length > 0) {
      await notificationPipeline.exec();
    }

    // Deliver Web Push: Deduplicate subscription endpoints across ALL members & global set
    // so each browser device endpoint receives EXACTLY 1 Web Push notification!
    const uniqueSubIds = new Set<string>();
    const subsPipeline = redis.pipeline();
    
    for (const uid of targetUserIds) {
      subsPipeline.smembers(`push:user:${uid}:subscriptions`);
    }
    
    if (targetUserIds.length > 0) {
      const allSubs = await subsPipeline.exec();
      for (const subIds of allSubs) {
        if (Array.isArray(subIds)) {
          for (const sId of subIds) {
            uniqueSubIds.add(sId as string);
          }
        }
      }
    }

    const globalSubIds = await redis.smembers("push:all:subscriptions");
    for (const sId of globalSubIds) {
      uniqueSubIds.add(sId);
    }

    const sentEndpoints = new Set<string>();
    const pushPromises = Array.from(uniqueSubIds).map(async (subId) => {
      const subData = await redis.get(`push:subscription:${subId}`);
      if (!subData) {
        await redis.srem("push:all:subscriptions", subId);
        return;
      }

      const subscription: PushSubscriptionData =
        typeof subData === "string" ? JSON.parse(subData) : (subData as unknown as PushSubscriptionData);

      if (subscription?.endpoint && !sentEndpoints.has(subscription.endpoint)) {
        sentEndpoints.add(subscription.endpoint);
        await sendPushNotification(
          subscription,
          {
            title: `📢 ${params.title.trim()}`,
            body: params.message.trim(),
            url: targetUrl,
          },
          subId
        );
      }
    });

    await Promise.all(pushPromises);

    // Save global notification audit record
    const recordId = crypto.randomUUID();
    const globalRecord: GlobalNotificationEntry = {
      id: recordId,
      title: params.title.trim(),
      message: params.message.trim(),
      url: targetUrl,
      adminId,
      recipientCount: targetUserIds.length,
      createdAt: Date.now(),
    };

    await redis.hset(`global:notification:${recordId}`, globalRecord as unknown as Record<string, unknown>);
    await redis.lpush("global:notifications", recordId);

    return { success: true, data: { count: targetUserIds.length } };
  } catch (error) {
    console.error("sendGlobalNotification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to send global notification" };
  }
}

/**
 * Send a Test Local Notification ONLY to the requesting Admin's registered device.
 */
export async function sendTestNotificationToAdmin(
  params: { title?: string; message?: string; url?: string },
  adminId: string
): Promise<ActionResult<{ success: boolean }>> {
  try {
    if (!adminId) {
      return { success: false, error: "Unauthorized" };
    }

    const title = params.title?.trim() || "🧪 Test Local Alert";
    const message = params.message?.trim() || "This is a test notification sent only to your admin device.";
    const targetUrl = params.url?.trim() || "/notifications";

    // Create in-app notification for the admin
    const notificationId = crypto.randomUUID();
    const notification: AppNotification = {
      notificationId,
      userId: adminId,
      type: "global",
      fromUserId: adminId,
      fromUserName: "Admin Test",
      shellId: "",
      message: `[TEST ALERT] ${title}: ${message}`,
      read: false,
      createdAt: Date.now(),
    };

    await redis.hset(`notification:${notificationId}`, notification as unknown as Record<string, unknown>);
    await redis.expire(`notification:${notificationId}`, 7 * 86400);
    await redis.lpush(`notifications:${adminId}`, notificationId);
    await redis.ltrim(`notifications:${adminId}`, 0, 99);
    await redis.incr(`notifications:${adminId}:unread`);

    // Dispatch Push Notification to the admin's device subscriptions only
    await sendPushToUser(adminId, {
      title: `🧪 ${title}`,
      body: message,
      url: targetUrl,
    });

    return { success: true, data: { success: true } };
  } catch (error) {
    console.error("sendTestNotificationToAdmin error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to send test notification" };
  }
}

/**
 * Get history of Global Notifications sent by admins.
 */
export async function getGlobalNotificationsHistory(limit = 20): Promise<GlobalNotificationEntry[]> {
  try {
    const ids = await redis.lrange("global:notifications", 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const promises = ids.map(async (id) => {
      const data = await redis.hgetall(`global:notification:${id as string}`);
      if (data && Object.keys(data).length > 0) {
        return {
          id: (data.id as string) || (id as string),
          title: (data.title as string) || "",
          message: (data.message as string) || "",
          url: (data.url as string) || "",
          adminId: (data.adminId as string) || "",
          recipientCount: Number(data.recipientCount) || 0,
          createdAt: Number(data.createdAt),
        };
      }
      return null;
    });

    const results = await Promise.all(promises);
    return results.filter((g): g is GlobalNotificationEntry => g !== null);
  } catch (error) {
    console.error("getGlobalNotificationsHistory error:", error);
    return [];
  }
}

/**
 * Daily Upcoming Track Event Push Reminders.
 * Notifies all members once per day for any event occurring today or tomorrow.
 */
export async function sendDailyEventReminders(): Promise<{ sentCount: number }> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const eventIds = await redis.lrange("events:all", 0, -1);

    if (!eventIds || eventIds.length === 0) {
      return { sentCount: 0 };
    }

    let sentTotal = 0;

    for (const eventId of eventIds) {
      const eventData = await redis.hgetall(`event:${eventId as string}`);
      if (!eventData || eventData.status === "cancelled") continue;

      const eventDate = (eventData.date as string) || "";
      const eventTitle = (eventData.title as string) || "Track Event";

      // Check if event is today or tomorrow
      if (eventDate !== todayStr) continue;

      // Deduplication check: Send only ONCE per event per day
      const reminderDedupKey = `event:reminder:sent:${eventId}:${todayStr}`;
      const alreadySentToday = await redis.get(reminderDedupKey);

      if (alreadySentToday) continue;

      // Mark event reminder as sent for today (24 hours)
      await redis.set(reminderDedupKey, "1", { ex: 86400 });

      // Send to all members
      const globalRes = await sendGlobalNotification(
        {
          title: "🏎️ Upcoming Track Event Today!",
          message: `Join us today for ${eventTitle} at ${eventData.time || "the track"}!`,
          url: "/newsfeed",
        },
        "system"
      );

      if (globalRes.success) {
        sentTotal += globalRes.data.count;
      }
    }

    return { sentCount: sentTotal };
  } catch (error) {
    console.error("sendDailyEventReminders error:", error);
    return { sentCount: 0 };
  }
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url: string }) {
  try {
    const subIds = await redis.smembers(`push:user:${userId}:subscriptions`);
    if (!subIds || subIds.length === 0) return;

    const sentEndpoints = new Set<string>();

    for (const subId of subIds) {
      const subData = await redis.get(`push:subscription:${subId}`);
      if (!subData) {
        await redis.srem(`push:user:${userId}:subscriptions`, subId);
        continue;
      }

      const subscription: PushSubscriptionData =
        typeof subData === "string" ? JSON.parse(subData) : (subData as unknown as PushSubscriptionData);

      if (subscription?.endpoint && !sentEndpoints.has(subscription.endpoint)) {
        sentEndpoints.add(subscription.endpoint);
        await sendPushNotification(subscription, payload, subId);
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
    case "global": return "📢 Track Announcement";
    case "event_reminder": return "🏎️ Event Reminder";
    default: return "🔔 Notification";
  }
}

export async function getNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  try {
    const ids = await redis.lrange(`notifications:${userId}`, 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const promises = ids.map(async (id): Promise<AppNotification | null> => {
      const data = await redis.hgetall(`notification:${id as string}`);
      if (data && Object.keys(data).length > 0) {
        return {
          notificationId: (data.notificationId as string) || (id as string),
          userId: data.userId as string,
          type: data.type as AppNotification["type"],
          fromUserId: (data.fromUserId as string) || "",
          fromUserName: (data.fromUserName as string) || "Someone",
          shellId: (data.shellId as string) || "",
          postId: (data.postId as string) || "",
          targetType: (data.targetType as "post" | "shell") || (data.postId ? "post" : "shell"),
          url: (data.url as string) || (data.postId ? "/newsfeed" : data.shellId ? `/showcase?open=${data.shellId}` : "/newsfeed"),
          message: (data.message as string) || "",
          read: String(data.read) === "true",
          createdAt: Number(data.createdAt),
        };
      }
      return null;
    });

    const results = await Promise.all(promises);
    const sevenDaysAgo = Date.now() - 7 * 86400 * 1000;
    return results.filter((n): n is AppNotification => n !== null && n.createdAt >= sevenDaysAgo);
  } catch (error) {
    console.error("getNotifications error:", error);
    return [];
  }
}

export const getUnreadCount = cache(async function(userId: string): Promise<number> {
  try {
    const count = await redis.get(`notifications:${userId}:unread`);
    return Number(count) || 0;
  } catch {
    return 0;
  }
});

export async function markAllRead(userId: string): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    const ids = await redis.lrange(`notifications:${userId}`, 0, 29);
    if (ids && ids.length > 0) {
      await Promise.all(
        ids.map((id) => redis.hset(`notification:${id as string}`, { read: "true" }))
      );
    }
    await redis.set(`notifications:${userId}:unread`, 0);
    revalidatePath("/");
  } catch (error) {
    console.error("markAllRead error:", error);
  }
}

/**
 * Manually delete a single notification for a user.
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<ActionResult<{ success: boolean }>> {
  try {
    if (!userId || !notificationId) {
      return { success: false, error: "Invalid request" };
    }

    const { revalidatePath } = await import("next/cache");
    await redis.lrem(`notifications:${userId}`, 0, notificationId);
    await redis.del(`notification:${notificationId}`);

    revalidatePath("/");
    return { success: true, data: { success: true } };
  } catch (error) {
    console.error("deleteNotification error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete notification" };
  }
}

/**
 * Manually clear ALL notifications for a user.
 */
export async function clearAllNotifications(userId: string): Promise<ActionResult<{ success: boolean }>> {
  try {
    if (!userId) {
      return { success: false, error: "Invalid user ID" };
    }

    const { revalidatePath } = await import("next/cache");
    const ids = await redis.lrange(`notifications:${userId}`, 0, -1);

    if (ids && ids.length > 0) {
      const delPromises = ids.map((id) => redis.del(`notification:${id as string}`));
      await Promise.all(delPromises);
    }

    await redis.del(`notifications:${userId}`);
    await redis.set(`notifications:${userId}:unread`, 0);

    revalidatePath("/");
    return { success: true, data: { success: true } };
  } catch (error) {
    console.error("clearAllNotifications error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to clear notifications" };
  }
}
