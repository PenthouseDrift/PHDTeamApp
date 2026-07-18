"use server";

import { redis } from "@/lib/redis";
import { deleteImage } from "@/lib/blob";
import { carProfileSchema } from "@/lib/validators";
import type { CarProfile, ActionResult } from "@/types";

const MAX_CARS_PER_MEMBER = 20;

export async function createCar(
  userId: string,
  data: { name: string; images: string[] }
): Promise<ActionResult<CarProfile>> {
  try {
    const parsed = carProfileSchema.safeParse(data);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return {
        success: false,
        error: firstIssue?.message ?? "Invalid car data",
        field: firstIssue?.path[0]?.toString(),
      };
    }

    // Enforce 20 car limit
    const currentCount = await redis.scard(`member:${userId}:cars`);
    if (currentCount >= MAX_CARS_PER_MEMBER) {
      return {
        success: false,
        error: `Maximum of ${MAX_CARS_PER_MEMBER} cars allowed per member`,
      };
    }

    const carId = crypto.randomUUID();
    const car: CarProfile = {
      carId,
      userId,
      name: parsed.data.name,
      images: parsed.data.images,
      createdAt: Date.now(),
    };

    await redis.hset(`car:${carId}`, {
      carId: car.carId,
      userId: car.userId,
      name: car.name,
      images: JSON.stringify(car.images),
      createdAt: car.createdAt,
    });

    await redis.sadd(`member:${userId}:cars`, carId);
    await redis.sadd("memberships:all", userId);

    return { success: true, data: car };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create car",
    };
  }
}

export async function updateCar(
  carId: string,
  userId: string,
  data: { name: string; images: string[] }
): Promise<ActionResult<CarProfile>> {
  try {
    // Verify ownership
    const isMember = await redis.sismember(`member:${userId}:cars`, carId);
    if (!isMember) {
      return { success: false, error: "Car not found or access denied" };
    }

    const parsed = carProfileSchema.safeParse(data);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return {
        success: false,
        error: firstIssue?.message ?? "Invalid car data",
        field: firstIssue?.path[0]?.toString(),
      };
    }

    const updatedCar: CarProfile = {
      carId,
      userId,
      name: parsed.data.name,
      images: parsed.data.images,
      createdAt: Date.now(),
    };

    await redis.hset(`car:${carId}`, {
      carId: updatedCar.carId,
      userId: updatedCar.userId,
      name: updatedCar.name,
      images: JSON.stringify(updatedCar.images),
      createdAt: updatedCar.createdAt,
    });

    return { success: true, data: updatedCar };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update car",
    };
  }
}

export async function deleteCar(
  carId: string,
  userId: string
): Promise<ActionResult<null>> {
  try {
    // Verify ownership
    const isMember = await redis.sismember(`member:${userId}:cars`, carId);
    if (!isMember) {
      return { success: false, error: "Car not found or access denied" };
    }

    // Get all calibration IDs for this car
    const calibrationIds = await redis.smembers(
      `car:${carId}:calibrations`
    );

    // Delete each calibration hash
    for (const calibrationId of calibrationIds) {
      await redis.del(`calibration:${calibrationId}`);
    }

    // Delete the calibrations set
    if (calibrationIds.length > 0) {
      await redis.del(`car:${carId}:calibrations`);
    }

    // Get car images and delete from Vercel Blob
    const carData = await redis.hgetall(`car:${carId}`);
    if (carData && carData.images) {
      const images: string[] = JSON.parse(carData.images as string);
      for (const imageUrl of images) {
        try {
          await deleteImage(imageUrl);
        } catch {
          // Continue even if image deletion fails
        }
      }
    }

    // Delete car hash
    await redis.del(`car:${carId}`);

    // Remove from member's car set
    await redis.srem(`member:${userId}:cars`, carId);

    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete car",
    };
  }
}

export async function getMemberCars(
  userId: string
): Promise<ActionResult<CarProfile[]>> {
  try {
    const carIds = await redis.smembers(`member:${userId}:cars`);

    if (carIds.length === 0) {
      return { success: true, data: [] };
    }

    const cars: CarProfile[] = [];
    for (const carId of carIds) {
      const carData = await redis.hgetall(`car:${carId}`);
      if (carData && Object.keys(carData).length > 0) {
        cars.push({
          carId: carData.carId as string,
          userId: carData.userId as string,
          name: carData.name as string,
          images: JSON.parse(carData.images as string),
          createdAt: Number(carData.createdAt),
        });
      }
    }

    // Sort by newest first
    cars.sort((a, b) => b.createdAt - a.createdAt);

    return { success: true, data: cars };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load cars",
    };
  }
}

export async function getCar(
  carId: string,
  userId: string
): Promise<ActionResult<CarProfile>> {
  try {
    // Verify ownership
    const isMember = await redis.sismember(`member:${userId}:cars`, carId);
    if (!isMember) {
      return { success: false, error: "Car not found or access denied" };
    }

    const carData = await redis.hgetall(`car:${carId}`);
    if (!carData || Object.keys(carData).length === 0) {
      return { success: false, error: "Car not found" };
    }

    const car: CarProfile = {
      carId: carData.carId as string,
      userId: carData.userId as string,
      name: carData.name as string,
      images: JSON.parse(carData.images as string),
      createdAt: Number(carData.createdAt),
    };

    return { success: true, data: car };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load car",
    };
  }
}

export async function getCarCalibrationCount(
  carId: string
): Promise<number> {
  try {
    return await redis.scard(`car:${carId}:calibrations`);
  } catch {
    return 0;
  }
}
