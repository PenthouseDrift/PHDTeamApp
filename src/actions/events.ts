"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export interface TrackEvent {
  eventId: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // legacy / display fallback
  openTime?: string;  // HH:MM — gates open
  closeTime?: string; // HH:MM — gates close
  imageUrl?: string;
  status: "upcoming" | "cancelled";
  createdBy: string;
  createdAt: number;
}

export interface EventTemplate {
  templateId: string;
  title: string;
  description: string;
  time: string;
  openTime?: string;
  closeTime?: string;
  imageUrl?: string;
  createdBy: string;
  createdAt: number;
}

export async function createEvent(
  data: { title: string; description: string; date: string; time: string; openTime?: string; closeTime?: string; imageUrl?: string },
  adminId: string
): Promise<ActionResult<TrackEvent>> {
  if (!data.title.trim() || !data.date || !data.time) {
    return { success: false, error: "Title, date, and time are required" };
  }

  const eventId = crypto.randomUUID();
  const event: TrackEvent = {
    eventId,
    title: data.title.trim(),
    description: data.description.trim(),
    date: data.date,
    time: data.time,
    openTime: data.openTime || "",
    closeTime: data.closeTime || "",
    imageUrl: data.imageUrl || "",
    status: "upcoming",
    createdBy: adminId,
    createdAt: Date.now(),
  };

  await redis.hset(`event:${eventId}`, event as unknown as Record<string, unknown>);
  await redis.lpush("events:all", eventId);

  revalidatePath("/newsfeed");
  revalidatePath("/admin/events");
  return { success: true, data: event };
}

export async function updateEvent(
  eventId: string,
  data: { title: string; description: string; date: string; time: string; openTime?: string; closeTime?: string; imageUrl?: string }
): Promise<ActionResult<null>> {
  if (!data.title.trim() || !data.date || !data.time) {
    return { success: false, error: "Title, date, and time are required" };
  }

  await redis.hset(`event:${eventId}`, {
    title: data.title.trim(),
    description: data.description.trim(),
    date: data.date,
    time: data.time,
    openTime: data.openTime || "",
    closeTime: data.closeTime || "",
    imageUrl: data.imageUrl || "",
  } as Record<string, unknown>);

  revalidatePath("/newsfeed");
  revalidatePath("/admin/events");
  return { success: true, data: null };
}

export async function getUpcomingEvents(): Promise<TrackEvent[]> {
  const ids = await redis.lrange("events:all", 0, -1);
  if (!ids || ids.length === 0) return [];

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const today = `${year}-${month}-${day}`;

  const promises = ids.map(async (id) => {
    const data = await redis.hgetall(`event:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      const event: TrackEvent = {
        eventId: (data.eventId as string) || (id as string),
        title: (data.title as string) || "",
        description: (data.description as string) || "",
        date: (data.date as string) || "",
        time: (data.time as string) || "",
        openTime: (data.openTime as string) || "",
        closeTime: (data.closeTime as string) || "",
        imageUrl: (data.imageUrl as string) || "",
        status: (data.status as "upcoming" | "cancelled") || "upcoming",
        createdBy: (data.createdBy as string) || "",
        createdAt: Number(data.createdAt),
      };
      if (event.date >= today) {
        return event;
      }
    }
    return null;
  });

  const results = await Promise.all(promises);
  const events = results.filter((e): e is TrackEvent => e !== null);

  // Sort by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

export async function cancelEvent(eventId: string): Promise<ActionResult<null>> {
  await redis.hset(`event:${eventId}`, { status: "cancelled" });
  revalidatePath("/newsfeed");
  revalidatePath("/admin/events");
  return { success: true, data: null };
}

export async function uncancelEvent(eventId: string): Promise<ActionResult<null>> {
  await redis.hset(`event:${eventId}`, { status: "upcoming" });
  revalidatePath("/newsfeed");
  revalidatePath("/admin/events");
  return { success: true, data: null };
}

export async function deleteEvent(eventId: string): Promise<ActionResult<null>> {
  await redis.del(`event:${eventId}`);
  await redis.lrem("events:all", 1, eventId);
  revalidatePath("/newsfeed");
  revalidatePath("/admin/events");
  return { success: true, data: null };
}

/* =========================================================================
   Event Templates Server Actions
   ========================================================================= */

export async function saveEventTemplate(
  data: { title: string; description: string; time: string; openTime?: string; closeTime?: string; imageUrl?: string },
  adminId: string
): Promise<ActionResult<EventTemplate>> {
  try {
    if (!data.title.trim()) {
      return { success: false, error: "Template title is required" };
    }

    const templateId = crypto.randomUUID();
    const template: EventTemplate = {
      templateId,
      title: data.title.trim(),
      description: data.description.trim(),
      time: data.time || "18:00",
      openTime: data.openTime || "",
      closeTime: data.closeTime || "",
      imageUrl: data.imageUrl || "",
      createdBy: adminId,
      createdAt: Date.now(),
    };

    await redis.hset(`event:template:${templateId}`, template as unknown as Record<string, unknown>);
    await redis.lpush("events:templates", templateId);

    revalidatePath("/admin/events");
    return { success: true, data: template };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to save event template" };
  }
}

export async function saveExistingEventAsTemplate(
  eventId: string,
  adminId: string
): Promise<ActionResult<EventTemplate>> {
  try {
    const data = await redis.hgetall(`event:${eventId}`);
    if (!data || Object.keys(data).length === 0) {
      return { success: false, error: "Event not found" };
    }

    return saveEventTemplate(
      {
        title: (data.title as string) || "Track Event",
        description: (data.description as string) || "",
        time: (data.time as string) || "18:00",
        openTime: (data.openTime as string) || "",
        closeTime: (data.closeTime as string) || "",
        imageUrl: (data.imageUrl as string) || "",
      },
      adminId
    );
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to save event as template" };
  }
}

export async function getEventTemplates(): Promise<EventTemplate[]> {
  try {
    const ids = await redis.lrange("events:templates", 0, -1);
    if (!ids || ids.length === 0) return [];

    const promises = ids.map(async (id): Promise<EventTemplate | null> => {
      const data = await redis.hgetall(`event:template:${id as string}`);
      if (data && Object.keys(data).length > 0) {
        return {
          templateId: (data.templateId as string) || (id as string),
          title: (data.title as string) || "",
          description: (data.description as string) || "",
          time: (data.time as string) || "18:00",
          openTime: (data.openTime as string) || "",
          closeTime: (data.closeTime as string) || "",
          imageUrl: (data.imageUrl as string) || "",
          createdBy: (data.createdBy as string) || "",
          createdAt: Number(data.createdAt),
        };
      }
      return null;
    });

    const results = await Promise.all(promises);
    return results.filter((t): t is EventTemplate => t !== null);
  } catch (error) {
    console.error("getEventTemplates error:", error);
    return [];
  }
}

export async function deleteEventTemplate(templateId: string): Promise<ActionResult<null>> {
  try {
    await redis.del(`event:template:${templateId}`);
    await redis.lrem("events:templates", 1, templateId);
    revalidatePath("/admin/events");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete template" };
  }
}
