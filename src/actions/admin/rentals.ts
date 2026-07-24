"use server";

import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { RentalSession, ActionResult } from "@/types";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export async function createRentalSession(
  userId: string,
  memberName: string
): Promise<ActionResult<RentalSession>> {
  try {
    const now = Date.now();
    const rentalId = `rental_${crypto.randomUUID()}`;

    const session: RentalSession = {
      rentalId,
      userId,
      memberName,
      scannedAt: now,
      graceEndsAt: now + FIFTEEN_MINUTES,
      timerStartedAt: null,
      sessionEndsAt: null,
      status: "grace",
    };

    await redis.hset(`rental:${rentalId}`, { ...session } as Record<string, unknown>);
    await redis.sadd("rentals:active", rentalId);

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create rental session",
    };
  }
}

export async function getActiveRentals(): Promise<RentalSession[]> {
  try {
    const ids = await redis.smembers("rentals:active");
    if (!ids || ids.length === 0) return [];

    const now = Date.now();
    const sessions: RentalSession[] = [];

    for (const id of ids) {
      const data = await redis.hgetall(`rental:${id}`);
      if (!data || Object.keys(data).length === 0) continue;

      let status = (data.status as "grace" | "active" | "completed") || "grace";
      let graceEndsAt = Number(data.graceEndsAt);
      let timerStartedAt = data.timerStartedAt ? Number(data.timerStartedAt) : null;
      let sessionEndsAt = data.sessionEndsAt ? Number(data.sessionEndsAt) : null;

      // Auto-start timer if 15-minute grace period has passed and it's still in grace
      if (status === "grace" && now >= graceEndsAt) {
        status = "active";
        timerStartedAt = graceEndsAt;
        sessionEndsAt = graceEndsAt + ONE_HOUR;

        await redis.hset(`rental:${id}`, {
          status: "active",
          timerStartedAt,
          sessionEndsAt,
        });
      }

      sessions.push({
        rentalId: (data.rentalId as string) || (id as string),
        userId: data.userId as string,
        memberName: (data.memberName as string) || "Member",
        scannedAt: Number(data.scannedAt),
        graceEndsAt,
        timerStartedAt,
        sessionEndsAt,
        status,
      });
    }

    return sessions.sort((a, b) => b.scannedAt - a.scannedAt);
  } catch (error) {
    console.error("getActiveRentals error:", error);
    return [];
  }
}

export async function startRentalTimer(
  rentalId: string
): Promise<ActionResult<RentalSession>> {
  try {
    const now = Date.now();
    const sessionEndsAt = now + ONE_HOUR;

    const existing = await redis.hgetall(`rental:${rentalId}`);
    if (!existing || Object.keys(existing).length === 0) {
      return { success: false, error: "Rental session not found" };
    }

    const updated: RentalSession = {
      rentalId,
      userId: existing.userId as string,
      memberName: existing.memberName as string,
      scannedAt: Number(existing.scannedAt),
      graceEndsAt: Number(existing.graceEndsAt),
      timerStartedAt: now,
      sessionEndsAt,
      status: "active",
    };

    await redis.hset(`rental:${rentalId}`, { ...updated } as Record<string, unknown>);

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start rental timer",
    };
  }
}

export async function completeRental(
  rentalId: string
): Promise<ActionResult<null>> {
  try {
    await redis.hset(`rental:${rentalId}`, { status: "completed" });
    await redis.srem("rentals:active", rentalId);

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to complete rental",
    };
  }
}
