"use server";

import { redis } from "@/lib/redis";
import { calibrationSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import type { CalibrationSetup, ActionResult } from "@/types";

const MAX_CALIBRATIONS_PER_CAR = 20;

export async function createCalibration(
  carId: string,
  userId: string,
  data: Record<string, unknown>
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
    frontCamber: parsed.data.frontCamber,
    rearCamber: parsed.data.rearCamber,
    frontToe: parsed.data.frontToe,
    rearToe: parsed.data.rearToe,
    frontCaster: parsed.data.frontCaster,
    ackermann: parsed.data.ackermann,
    steeringAngle: parsed.data.steeringAngle,
    frontRideHeight: parsed.data.frontRideHeight,
    rearRideHeight: parsed.data.rearRideHeight,
    frontSpringRate: parsed.data.frontSpringRate,
    rearSpringRate: parsed.data.rearSpringRate,
    frontOilWeight: parsed.data.frontOilWeight,
    rearOilWeight: parsed.data.rearOilWeight,
    frontOilBrand: parsed.data.frontOilBrand,
    rearOilBrand: parsed.data.rearOilBrand,
    frontPistonHoles: parsed.data.frontPistonHoles,
    rearPistonHoles: parsed.data.rearPistonHoles,
    frontPistonHoleSize: parsed.data.frontPistonHoleSize,
    rearPistonHoleSize: parsed.data.rearPistonHoleSize,
    frontShockLength: parsed.data.frontShockLength,
    rearShockLength: parsed.data.rearShockLength,
    frontShockBrand: parsed.data.frontShockBrand,
    rearShockBrand: parsed.data.rearShockBrand,
    frontORings: parsed.data.frontORings,
    rearORings: parsed.data.rearORings,
    frontDroop: parsed.data.frontDroop,
    rearDroop: parsed.data.rearDroop,
    gyroGain: parsed.data.gyroGain,
    motorTurns: parsed.data.motorTurns,
    motorTiming: parsed.data.motorTiming,
    motorPlacement: parsed.data.motorPlacement,
    throttleExpo: parsed.data.throttleExpo,
    steeringExpo: parsed.data.steeringExpo,
    boost: parsed.data.boost,
    turbo: parsed.data.turbo,
    frontTrackWidth: parsed.data.frontTrackWidth,
    rearTrackWidth: parsed.data.rearTrackWidth,
    wheelbase: parsed.data.wheelbase,
    batteryPosition: parsed.data.batteryPosition,
    totalWeight: parsed.data.totalWeight,
    frontTyres: parsed.data.frontTyres,
    rearTyres: parsed.data.rearTyres,
    customParams: parsed.data.customParams || [],
    createdAt: Date.now(),
  };

  await redis.hset(`calibration:${calibrationId}`, {
    ...calibration,
    customParams: JSON.stringify(calibration.customParams),
  });
  await redis.sadd(`car:${carId}:calibrations`, calibrationId);

  revalidatePath(`/cars/${carId}`);
  return { success: true, data: calibration };
}

/**
 * Save a full CalibrationSetup (produced by the Tuning Advisor) directly to
 * Redis without passing through calibrationSchema.safeParse(). This preserves
 * every field from the original calibration that the advisor didn't change,
 * since the zod schema strips unknown/extra keys on parse.
 */
export async function saveAdvisedCalibration(
  carId: string,
  userId: string,
  setup: Omit<CalibrationSetup, "calibrationId" | "carId" | "userId" | "createdAt" | "name">,
  name: string
): Promise<ActionResult<CalibrationSetup>> {
  // Verify ownership
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

  if (!name.trim()) {
    return { success: false, error: "Calibration name is required" };
  }

  const calibrationId = crypto.randomUUID();
  const calibration: CalibrationSetup = {
    calibrationId,
    carId,
    userId,
    createdAt: Date.now(),
    name: name.trim(),
    // Spread all fields from the advised setup — nothing stripped
    frontCamber: setup.frontCamber ?? 0,
    rearCamber: setup.rearCamber ?? 0,
    frontToe: setup.frontToe ?? 0,
    rearToe: setup.rearToe ?? 0,
    frontCaster: setup.frontCaster ?? 0,
    ackermann: setup.ackermann ?? 0,
    steeringAngle: setup.steeringAngle ?? 0,
    frontRideHeight: setup.frontRideHeight ?? 0,
    rearRideHeight: setup.rearRideHeight ?? 0,
    frontSpringRate: setup.frontSpringRate ?? "",
    rearSpringRate: setup.rearSpringRate ?? "",
    frontOilWeight: setup.frontOilWeight ?? "",
    rearOilWeight: setup.rearOilWeight ?? "",
    frontOilBrand: setup.frontOilBrand ?? "",
    rearOilBrand: setup.rearOilBrand ?? "",
    frontPistonHoles: setup.frontPistonHoles ?? 0,
    rearPistonHoles: setup.rearPistonHoles ?? 0,
    frontPistonHoleSize: setup.frontPistonHoleSize ?? "",
    rearPistonHoleSize: setup.rearPistonHoleSize ?? "",
    frontShockLength: setup.frontShockLength ?? 0,
    rearShockLength: setup.rearShockLength ?? 0,
    frontShockBrand: setup.frontShockBrand ?? "",
    rearShockBrand: setup.rearShockBrand ?? "",
    frontORings: setup.frontORings ?? "",
    rearORings: setup.rearORings ?? "",
    frontDroop: setup.frontDroop ?? 0,
    rearDroop: setup.rearDroop ?? 0,
    gyroGain: setup.gyroGain ?? 0,
    motorTurns: setup.motorTurns ?? 0,
    motorTiming: setup.motorTiming ?? 0,
    motorPlacement: setup.motorPlacement ?? "",
    throttleExpo: setup.throttleExpo ?? 0,
    steeringExpo: setup.steeringExpo ?? 0,
    boost: setup.boost ?? 0,
    turbo: setup.turbo ?? 0,
    frontTrackWidth: setup.frontTrackWidth ?? 0,
    rearTrackWidth: setup.rearTrackWidth ?? 0,
    wheelbase: setup.wheelbase ?? 0,
    batteryPosition: setup.batteryPosition ?? "",
    totalWeight: setup.totalWeight ?? 0,
    frontTyres: setup.frontTyres ?? "",
    rearTyres: setup.rearTyres ?? "",
    customParams: setup.customParams ?? [],
  };

  await redis.hset(`calibration:${calibrationId}`, {
    ...calibration,
    customParams: JSON.stringify(calibration.customParams),
  });
  await redis.sadd(`car:${carId}:calibrations`, calibrationId);

  revalidatePath(`/cars/${carId}`);
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
        calibrationId: (data.calibrationId as string) || (id as string),
        carId: (data.carId as string) || carId,
        userId: data.userId as string,
        name: (data.name as string) || "Untitled",
        frontCamber: Number(data.frontCamber) || 0,
        rearCamber: Number(data.rearCamber) || 0,
        frontToe: Number(data.frontToe) || 0,
        rearToe: Number(data.rearToe) || 0,
        frontCaster: Number(data.frontCaster) || 0,
        ackermann: Number(data.ackermann) || 0,
        steeringAngle: Number(data.steeringAngle) || 0,
        frontRideHeight: Number(data.frontRideHeight) || 0,
        rearRideHeight: Number(data.rearRideHeight) || 0,
        frontSpringRate: (data.frontSpringRate as string) || "",
        rearSpringRate: (data.rearSpringRate as string) || "",
        frontOilWeight: (data.frontOilWeight as string) || "",
        rearOilWeight: (data.rearOilWeight as string) || "",
        frontOilBrand: (data.frontOilBrand as string) || "",
        rearOilBrand: (data.rearOilBrand as string) || "",
        frontPistonHoles: Number(data.frontPistonHoles) || 0,
        rearPistonHoles: Number(data.rearPistonHoles) || 0,
        frontPistonHoleSize: (data.frontPistonHoleSize as string) || "",
        rearPistonHoleSize: (data.rearPistonHoleSize as string) || "",
        frontShockLength: Number(data.frontShockLength) || 0,
        rearShockLength: Number(data.rearShockLength) || 0,
        frontShockBrand: (data.frontShockBrand as string) || "",
        rearShockBrand: (data.rearShockBrand as string) || "",
        frontORings: (data.frontORings as string) || "",
        rearORings: (data.rearORings as string) || "",
        frontDroop: Number(data.frontDroop) || 0,
        rearDroop: Number(data.rearDroop) || 0,
        gyroGain: Number(data.gyroGain) || 0,
        motorTurns: Number(data.motorTurns) || 0,
        motorTiming: Number(data.motorTiming) || 0,
        motorPlacement: (data.motorPlacement as string) || "",
        throttleExpo: Number(data.throttleExpo) || 0,
        steeringExpo: Number(data.steeringExpo) || 0,
        boost: Number(data.boost) || 0,
        turbo: Number(data.turbo) || 0,
        frontTrackWidth: Number(data.frontTrackWidth) || 0,
        rearTrackWidth: Number(data.rearTrackWidth) || 0,
        wheelbase: Number(data.wheelbase) || 0,
        batteryPosition: (data.batteryPosition as string) || "",
        totalWeight: Number(data.totalWeight) || 0,
        frontTyres: (data.frontTyres as string) || "",
        rearTyres: (data.rearTyres as string) || "",
        customParams: parseCustomParams(data.customParams),
        createdAt: Number(data.createdAt),
      });
    }
  }

  return calibrations.sort((a, b) => b.createdAt - a.createdAt);
}

function parseCustomParams(value: unknown): { name: string; value: string }[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

export async function deleteCalibration(
  calibrationId: string,
  userId: string
): Promise<ActionResult<null>> {
  const data = await redis.hgetall(`calibration:${calibrationId}`);
  if (!data || data.userId !== userId) {
    return { success: false, error: "Calibration not found or access denied" };
  }

  const carId = data.carId as string;
  await redis.del(`calibration:${calibrationId}`);
  await redis.srem(`car:${carId}:calibrations`, calibrationId);

  revalidatePath(`/cars/${carId}`);
  return { success: true, data: null };
}

export async function shareCalibration(
  calibrationId: string,
  userId: string
): Promise<ActionResult<{ shareId: string; shareUrl: string }>> {
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
