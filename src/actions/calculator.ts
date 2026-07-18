"use server";

import { redis } from "@/lib/redis";
import { gearRatioSchema } from "@/lib/validators";
import type { ActionResult, CarProfile } from "@/types";

export async function saveGearRatio(
  carId: string,
  userId: string,
  data: { spur: number; pinion: number; ratio: number }
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
      JSON.stringify({ spur: data.spur, pinion: data.pinion, ratio: data.ratio })
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
