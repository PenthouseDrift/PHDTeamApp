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

export async function createOrExtendRentalSession(
  userId: string,
  memberName: string
): Promise<ActionResult<{ session: RentalSession; isExtension: boolean }>> {
  try {
    const activeIds = await redis.smembers("rentals:active");
    let existingRentalId: string | null = null;
    let existingData: Record<string, unknown> | null = null;

    if (activeIds && activeIds.length > 0) {
      for (const id of activeIds) {
        const data = await redis.hgetall(`rental:${id}`);
        if (data && data.userId === userId && data.status !== "completed") {
          existingRentalId = id as string;
          existingData = data as Record<string, unknown>;
          break;
        }
      }
    }

    // If an active session already exists for this member, extend it by +1 hour!
    if (existingRentalId && existingData) {
      const now = Date.now();
      const currentEndsAt = Number(existingData.sessionEndsAt) || Number(existingData.graceEndsAt) || now;
      const baseTime = Math.max(now, currentEndsAt);
      const newEndsAt = baseTime + ONE_HOUR;
      const timerStartedAt = existingData.timerStartedAt ? Number(existingData.timerStartedAt) : now;

      const updatedSession: RentalSession = {
        rentalId: existingRentalId,
        userId,
        memberName: (existingData.memberName as string) || memberName,
        scannedAt: Number(existingData.scannedAt) || now,
        graceEndsAt: Number(existingData.graceEndsAt) || now,
        timerStartedAt,
        sessionEndsAt: newEndsAt,
        status: "active",
      };

      await redis.hset(`rental:${existingRentalId}`, {
        status: "active",
        timerStartedAt,
        sessionEndsAt: newEndsAt,
      });

      revalidatePath("/admin/check-in");
      revalidatePath("/admin/members");
      return { success: true, data: { session: updatedSession, isExtension: true } };
    }

    // Otherwise create a fresh rental session
    const createRes = await createRentalSession(userId, memberName);
    if (!createRes.success) return { success: false, error: createRes.error };

    return { success: true, data: { session: createRes.data, isExtension: false } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create or extend rental session",
    };
  }
}

export async function extendRentalSessionManual(
  rentalId: string,
  method: "cash" | "wallet"
): Promise<ActionResult<RentalSession>> {
  try {
    const existing = await redis.hgetall(`rental:${rentalId}`);
    if (!existing || Object.keys(existing).length === 0) {
      return { success: false, error: "Rental session not found" };
    }

    const userId = existing.userId as string;
    const memberName = (existing.memberName as string) || "Member";

    if (method === "wallet") {
      const { redeemRentalHour } = await import("@/actions/wallet");
      const redeemRes = await redeemRentalHour(userId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error };
      }
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const currentEndsAt = Number(existing.sessionEndsAt) || Number(existing.graceEndsAt) || now;
    const baseTime = Math.max(now, currentEndsAt);
    const newEndsAt = baseTime + ONE_HOUR;
    const timerStartedAt = existing.timerStartedAt ? Number(existing.timerStartedAt) : now;

    const updatedSession: RentalSession = {
      rentalId,
      userId,
      memberName,
      scannedAt: Number(existing.scannedAt) || now,
      graceEndsAt: Number(existing.graceEndsAt) || now,
      timerStartedAt,
      sessionEndsAt: newEndsAt,
      status: "active",
    };

    await redis.hset(`rental:${rentalId}`, {
      status: "active",
      timerStartedAt,
      sessionEndsAt: newEndsAt,
    });
    await redis.sadd("rentals:active", rentalId);

    // Record check-in / extension log entry
    const entry = JSON.stringify({
      userId,
      adminId: "admin",
      timestamp: now,
      method: method === "wallet" ? "rental_wallet" : "rental_cash",
      memberName: `${memberName} (Extended +1 Hr - ${method === "cash" ? "Paid Cash/Card" : "Wallet Pass"})`,
    });

    await redis.rpush(`checkins:${today}`, entry);
    await redis.set(`checkin:dedup:${userId}`, "1", { ex: 86400 });

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    revalidatePath("/dashboard");
    return { success: true, data: updatedSession };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extend rental session",
    };
  }
}

export async function extendMemberRentalByUserId(
  userId: string,
  memberName: string,
  method: "cash" | "wallet"
): Promise<ActionResult<RentalSession>> {
  try {
    const activeIds = await redis.smembers("rentals:active");
    let existingRentalId: string | null = null;

    if (activeIds && activeIds.length > 0) {
      for (const id of activeIds) {
        const data = await redis.hgetall(`rental:${id}`);
        if (data && data.userId === userId) {
          existingRentalId = id as string;
          break;
        }
      }
    }

    if (existingRentalId) {
      return extendRentalSessionManual(existingRentalId, method);
    }

    if (method === "wallet") {
      const { redeemRentalHour } = await import("@/actions/wallet");
      const redeemRes = await redeemRentalHour(userId);
      if (!redeemRes.success) {
        return { success: false, error: redeemRes.error };
      }
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const rentalId = `rental_${crypto.randomUUID()}`;
    const newEndsAt = now + ONE_HOUR;

    const session: RentalSession = {
      rentalId,
      userId,
      memberName,
      scannedAt: now,
      graceEndsAt: now + FIFTEEN_MINUTES,
      timerStartedAt: now,
      sessionEndsAt: newEndsAt,
      status: "active",
    };

    await redis.hset(`rental:${rentalId}`, { ...session } as Record<string, unknown>);
    await redis.sadd("rentals:active", rentalId);

    const entry = JSON.stringify({
      userId,
      adminId: "admin",
      timestamp: now,
      method: method === "cash" ? "rental_cash" : "rental_wallet",
      memberName: `${memberName} (+1 Hr Rental - ${method === "cash" ? "Paid Cash/Card" : "Wallet Pass"})`,
    });

    await redis.rpush(`checkins:${today}`, entry);

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    revalidatePath("/dashboard");
    return { success: true, data: session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extend rental for member",
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

export async function adjustRentalTime(
  rentalId: string,
  minutes: number
): Promise<ActionResult<RentalSession>> {
  try {
    const existing = await redis.hgetall(`rental:${rentalId}`);
    if (!existing || Object.keys(existing).length === 0) {
      return { success: false, error: "Rental session not found" };
    }

    const deltaMs = minutes * 60 * 1000;
    const isGrace = existing.status === "grace";
    
    let newGraceEndsAt = Number(existing.graceEndsAt) || 0;
    let newSessionEndsAt = Number(existing.sessionEndsAt) || 0;

    if (isGrace) {
      newGraceEndsAt += deltaMs;
      await redis.hset(`rental:${rentalId}`, { graceEndsAt: newGraceEndsAt });
    } else {
      if (newSessionEndsAt) {
         newSessionEndsAt += deltaMs;
         await redis.hset(`rental:${rentalId}`, { sessionEndsAt: newSessionEndsAt });
      }
    }

    const updatedSession: RentalSession = {
      rentalId,
      userId: existing.userId as string,
      memberName: (existing.memberName as string) || "Member",
      scannedAt: Number(existing.scannedAt),
      graceEndsAt: newGraceEndsAt,
      timerStartedAt: existing.timerStartedAt ? Number(existing.timerStartedAt) : null,
      sessionEndsAt: newSessionEndsAt || null,
      status: existing.status as "grace" | "active" | "completed",
    };

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: updatedSession };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to adjust rental time",
    };
  }
}

export async function setRentalTime(
  rentalId: string,
  minutes: number
): Promise<ActionResult<RentalSession>> {
  try {
    const existing = await redis.hgetall(`rental:${rentalId}`);
    if (!existing || Object.keys(existing).length === 0) {
      return { success: false, error: "Rental session not found" };
    }

    const now = Date.now();
    const newEndMs = now + (minutes * 60 * 1000);
    const isGrace = existing.status === "grace";
    
    let newGraceEndsAt = Number(existing.graceEndsAt) || 0;
    let newSessionEndsAt = Number(existing.sessionEndsAt) || 0;

    if (isGrace) {
      newGraceEndsAt = newEndMs;
      await redis.hset(`rental:${rentalId}`, { graceEndsAt: newGraceEndsAt });
    } else {
      newSessionEndsAt = newEndMs;
      await redis.hset(`rental:${rentalId}`, { sessionEndsAt: newSessionEndsAt });
    }

    const updatedSession: RentalSession = {
      rentalId,
      userId: existing.userId as string,
      memberName: (existing.memberName as string) || "Member",
      scannedAt: Number(existing.scannedAt),
      graceEndsAt: newGraceEndsAt,
      timerStartedAt: existing.timerStartedAt ? Number(existing.timerStartedAt) : null,
      sessionEndsAt: newSessionEndsAt || null,
      status: existing.status as "grace" | "active" | "completed",
    };

    revalidatePath("/admin/check-in");
    revalidatePath("/admin/members");
    return { success: true, data: updatedSession };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to set rental time",
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
