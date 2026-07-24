"use server";

import { redis } from "@/lib/redis";
import { calibrationSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import type { CalibrationSetup, ActionResult } from "@/types";

export async function updateCalibration(
  calibrationId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<ActionResult<CalibrationSetup>> {
  // Verify ownership
  const existing = await redis.hgetall(`calibration:${calibrationId}`);
  if (!existing || existing.userId !== userId) {
    return { success: false, error: "Calibration not found or access denied" };
  }

  const parsed = calibrationSchema.safeParse(data);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message || "Validation failed" };
  }

  const carId = existing.carId as string;

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
    createdAt: Number(existing.createdAt),
  };

  await redis.hset(`calibration:${calibrationId}`, {
    ...calibration,
    customParams: JSON.stringify(calibration.customParams),
  });

  revalidatePath(`/cars/${carId}`);
  return { success: true, data: calibration };
}

export async function getCalibration(
  calibrationId: string,
  userId: string
): Promise<ActionResult<CalibrationSetup>> {
  const data = await redis.hgetall(`calibration:${calibrationId}`);
  if (!data || data.userId !== userId) {
    return { success: false, error: "Calibration not found" };
  }

  const customParams = Array.isArray(data.customParams)
    ? data.customParams
    : JSON.parse((data.customParams as string) || "[]");

  return {
    success: true,
    data: {
      calibrationId: (data.calibrationId as string) || calibrationId,
      carId: data.carId as string,
      userId: data.userId as string,
      name: (data.name as string) || "",
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
      customParams,
      createdAt: Number(data.createdAt),
    },
  };
}
