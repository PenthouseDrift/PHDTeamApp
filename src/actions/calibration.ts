"use server";

import { redis } from "@/lib/redis";
import { calibrationSchema } from "@/lib/validators";
import type { CalibrationSetup, ActionResult } from "@/types";

const MAX_CALIBRATIONS_PER_CAR = 20;

export async function createCalibration(
  carId: string,
  userId: string,
  data: {
    name: string;
    camber: number;
    toe: number;
    caster: number;
    boost: number;
    customParams?: { name: string; value: string }[];
  }
): Promise<ActionResult<CalibrationSetup>> {
  // Verify car ownership
  const isMember = await redis.sismember(`member:${userId}:cars`, carId);
  if (!isMember) {
    return { success: false, error: "Car not found or access denied" };
  }

  // Enforce limit
  const count = await redis.scard(`car:${carId}:calibrations`);
  if (count >= MAX_CALIBRATIONS_PER_CAR) {
    return {
      success: false,
      error: `Maximum of ${MAX_CALIBRATIONS_PER_CAR} calibrations per car`,
    };
  }

  const parsed = calibrationSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: firstIssue?.message || "Validation failed",
      field: firstIssue?.path[0]?.toString(),
    };
  }

  const calibrationId = crypto.randomUUID();
  const calibration: CalibrationSetup = {
    calibrationId,
    carId,
    userId,
    name: parsed.data.name,
    camber: parsed.data.camber,
    toe: parsed.data.toe,
    caster: parsed.data.caster,
    boost: parsed.data.boost,
    customParams: parsed.data.customParams || [],
    createdAt: Date.now(),
  };

  await redis.hset(`calibration:${calibrationId}`, {
    ...calibration,
    customParams: JSON.stringify(calibration.customParams),
  });
  await redis.sadd(`car:${carId}:calibrations`, calibrationId);

  return { success: true, data: calibration };
}

export async function getCarCalibrations(
  carId: string
): Promise<CalibrationSetup[]> {
  const ids = await redis.smembers(`car:${carId}:calibrations`);
  if (ids.length === 0) return [];

  const calibrations: CalibrationSetup[] = [];
  for (const id of ids) {
    const data = await redis.hgetall(`calibration:${id}`);
    if (data && Object.keys(data).length > 0) {
      calibrations.push({
        calibrationId: data.calibrationId as string,
        carId: data.carId as string,
        userId: data.userId as string,
        name: data.name as string,
        camber: Number(data.camber),
        toe: Number(data.toe),
        caster: Number(data.caster),
        boost: Number(data.boost),
        customParams: JSON.parse((data.customParams as string) || "[]"),
        createdAt: Number(data.createdAt),
      });
    }
  }

  return calibrations.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCalibration(
  calibrationId: string,
  userId: string
): Promise<ActionResult<null>> {
  const data = await redis.hgetall(`calibration:${calibrationId}`);
  if (!data || data.userId !== userId) {
    return { success: false, error: "Calibration not found or access denied" };
  }

  await redis.del(`calibration:${calibrationId}`);
  await redis.srem(`car:${data.carId as string}:calibrations`, calibrationId);

  return { success: true, data: null };
}

export async function shareCalibration(
  calibrationId: string,
  userId: string
): Promise<ActionResult<{ shareId: string; shareUrl: string }>> {
  // Verify ownership
  const calData = await redis.hgetall(`calibration:${calibrationId}`);
  if (!calData || calData.userId !== userId) {
    return { success: false, error: "Calibration not found or access denied" };
  }

  const shareId = crypto.randomUUID();
  await redis.hset(`share:${shareId}`, {
    shareId,
    calibrationId,
    userId,
    createdAt: Date.now(),
    active: "true",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${baseUrl}/share/${shareId}`;

  return { success: true, data: { shareId, shareUrl } };
}

export async function revokeShare(
  shareId: string,
  userId: string
): Promise<ActionResult<null>> {
  const shareData = await redis.hgetall(`share:${shareId}`);
  if (!shareData || shareData.userId !== userId) {
    return { success: false, error: "Share not found or access denied" };
  }

  await redis.hset(`share:${shareId}`, { active: "false" });
  return { success: true, data: null };
}
