"use server";

import { redis } from "@/lib/redis";
import { gearRatioSchema } from "@/lib/validators";
import type { ActionResult, CarProfile } from "@/types";

export async function saveGearRatio(
  carId: string,
  userId: string,
  data: { spur: number; pinion: number; ratio: number; fdr?: number; internalRatio?: number }
): Promise<ActionResult<boolean>> {
  
  try {
    // Verify car ownership
    const car = await redis.hgetall(`car:${carId}`);
    if (!car || car.userId !== userId) {
      return { success: false, error: "Car profile not found" };
    }

    const parsed = gearRatioSchema.safeParse({ spur: data.spur, pinion: data.pinion });
    if (!parsed.success) {
      return { success: false, error: "Invalid gear ratio values" };
    }

    await redis.rpush(
      `car:${carId}:ratios`,
      JSON.stringify({
        spur: data.spur,
        pinion: data.pinion,
        ratio: data.ratio,
        fdr: data.fdr,
        internalRatio: data.internalRatio,
      })
    );

    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save gear ratio",
    };
  }
}

export async function getMemberCarsForSelect(
  userId: string
): Promise<ActionResult<Pick<CarProfile, "carId" | "name">[]>> {
  try {
    const carIds = await redis.smembers(`member:${userId}:cars`);

    if (carIds.length === 0) {
      return { success: true, data: [] };
    }

    const cars: Pick<CarProfile, "carId" | "name">[] = [];
    for (const carId of carIds) {
      const carData = await redis.hgetall(`car:${carId}`);
      if (carData && Object.keys(carData).length > 0) {
        cars.push({
          carId: carData.carId as string,
          name: carData.name as string,
        });
      }
    }

    return { success: true, data: cars };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load cars",
    };
  }
}

export async function removeGearRatio(
  carId: string,
  userId: string,
  index: number
): Promise<ActionResult<null>> {
  try {
    const car = await redis.hgetall(`car:${carId}`);
    if (!car || car.userId !== userId) {
      return { success: false, error: "Car not found or access denied" };
    }

    const entries = await redis.lrange(`car:${carId}:ratios`, 0, -1);
    if (index < 0 || index >= entries.length) {
      return { success: false, error: "Gear ratio not found" };
    }

    const placeholder = "__REMOVED__";
    await redis.lset(`car:${carId}:ratios`, index, placeholder);
    await redis.lrem(`car:${carId}:ratios`, 1, placeholder);

    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/cars/${carId}`);
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove gear ratio",
    };
  }
}
