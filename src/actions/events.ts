"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export interface TrackEvent {
  eventId: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string;
  imageUrl?: string;
  status: "upcoming" | "cancelled";
  createdBy: string;
  createdAt: number;
}

export async function createEvent(
  data: { title: string; description: string; date: string; time: string; imageUrl?: string },
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

export async function getUpcomingEvents(): Promise<TrackEvent[]> {
  const ids = await redis.lrange("events:all", 0, -1);
  if (!ids || ids.length === 0) return [];

  const today = new Date().toISOString().split("T")[0];
  const events: TrackEvent[] = [];

  for (const id of ids) {
    const data = await redis.hgetall(`event:${id as string}`);
    if (data && Object.keys(data).length > 0) {
      const event: TrackEvent = {
        eventId: (data.eventId as string) || (id as string),
        title: (data.title as string) || "",
        description: (data.description as string) || "",
        date: (data.date as string) || "",
        time: (data.time as string) || "",
        imageUrl: (data.imageUrl as string) || "",
        status: (data.status as "upcoming" | "cancelled") || "upcoming",
        createdBy: (data.createdBy as string) || "",
        createdAt: Number(data.createdAt),
      };
      // Include future events and today's events
      if (event.date >= today) {
        events.push(event);
      }
    }
  }

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
