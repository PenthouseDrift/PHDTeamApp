"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  PART_KEYS,
  composeParts,
  emptyParts,
  type PartValues,
} from "@/lib/rc-parts-data";
import {
  sanitizeParts,
  sanitizeSpecSheet,
  type CarSpecSheet,
} from "@/lib/spec-sheets";
import { getMemberCars, updateCarParts } from "@/actions/cars";
import { recordCommunityParts } from "@/actions/custom-parts";
import type { ActionResult } from "@/types";

const MAX_SPEC_SHEETS = 25;
const specSheetsKey = (userId: string) => `member:${userId}:specsheets`;

const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const norm = (v?: string | null) => (v ? v.trim().toLowerCase() : "");

function getCarIdentityKey(s: {
  carId?: string | null;
  carName?: string | null;
  name?: string | null;
  id?: string;
}): string {
  if (s.carId && s.carId.trim()) return `car:${s.carId.trim()}`;
  if (s.carName && s.carName.trim()) return `name:${norm(s.carName)}`;
  if (s.name && s.name.trim()) return `name:${norm(s.name)}`;
  return `id:${s.id || randomUUID()}`;
}

async function loadRawSpecSheets(userId: string): Promise<CarSpecSheet[]> {
  const raw = (await redis.hgetall(specSheetsKey(userId))) ?? {};
  const list: CarSpecSheet[] = [];
  for (const val of Object.values(raw)) {
    const parsed = sanitizeSpecSheet(val);
    if (parsed) list.push(parsed);
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

/**
 * Load unique spec sheets for a member, newest first.
 * Consolidates duplicate variations for the same car build into one canonical spec sheet,
 * and backfills from garage cars so returning members already have clickable spec sheets.
 */
export async function getMemberSpecSheets(userIdArg?: string): Promise<CarSpecSheet[]> {
  try {
    const session = await auth();
    const userId = userIdArg || session?.user?.id;
    if (!userId) return [];

    const existing = await loadRawSpecSheets(userId);

    // 1. Group and deduplicate existing spec sheets by car identity
    const groups = new Map<string, CarSpecSheet[]>();
    for (const sheet of existing) {
      const key = getCarIdentityKey(sheet);
      const group = groups.get(key) || [];
      group.push(sheet);
      groups.set(key, group);
    }

    const dedupedList: CarSpecSheet[] = [];
    const redundantIdsToDelete: string[] = [];
    const canonicalUpdates: Record<string, string> = {};

    for (const group of groups.values()) {
      group.sort((a, b) => b.updatedAt - a.updatedAt);
      const canonical = { ...group[0] };

      // Merge non-empty part values across all variations so no hardware choice is lost
      const mergedParts: PartValues = { ...emptyParts() };
      for (const k of PART_KEYS) {
        for (const item of group) {
          if (item.parts?.[k]?.trim()) {
            mergedParts[k] = item.parts[k].trim();
            break;
          }
        }
      }
      canonical.parts = mergedParts;

      if (group.length > 1) {
        // Collect duplicate IDs to remove from Redis
        for (const dup of group.slice(1)) {
          redundantIdsToDelete.push(dup.id);
        }
        canonicalUpdates[canonical.id] = JSON.stringify(canonical);
      }

      dedupedList.push(canonical);
    }

    // Clean up duplicate entries in Redis in the background
    if (redundantIdsToDelete.length > 0) {
      await redis.hdel(specSheetsKey(userId), ...redundantIdsToDelete).catch(() => {});
    }
    if (Object.keys(canonicalUpdates).length > 0) {
      await redis.hset(specSheetsKey(userId), canonicalUpdates).catch(() => {});
    }

    // 2. Backfill from garage cars that don't have a spec sheet yet
    const seenCarIds = new Set(dedupedList.map((s) => s.carId).filter(Boolean));
    const seenNames = new Set(dedupedList.map((s) => norm(s.carName || s.name)).filter(Boolean));
    const carsRes = await getMemberCars(userId);

    if (carsRes.success) {
      const newCarSheets: CarSpecSheet[] = [];
      for (const car of carsRes.data) {
        if (seenCarIds.has(car.carId) || seenNames.has(norm(car.name))) continue;
        const candidate: CarSpecSheet = {
          id: randomUUID(),
          name: car.name,
          driver: session?.user?.name?.trim() ?? "",
          team: "",
          carId: car.carId,
          carName: car.name,
          chassis: car.chassis ?? car.name,
          photoUrl: car.images[0] ?? "",
          parts: car.parts ? { ...emptyParts(), ...car.parts } : emptyParts(),
          updatedAt: car.createdAt,
        };
        seenCarIds.add(car.carId);
        seenNames.add(norm(car.name));
        newCarSheets.push(candidate);
        dedupedList.push(candidate);
      }

      if (newCarSheets.length > 0) {
        const toSave: Record<string, string> = {};
        for (const item of newCarSheets) {
          toSave[item.id] = JSON.stringify(item);
        }
        await redis.hset(specSheetsKey(userId), toSave).catch(() => {});
      }
    }

    dedupedList.sort((a, b) => b.updatedAt - a.updatedAt);
    return dedupedList.slice(0, MAX_SPEC_SHEETS);
  } catch (error) {
    console.error("[spec-sheets] getMemberSpecSheets failed:", error);
    return [];
  }
}

export interface SaveSpecSheetInput {
  id?: string;
  name?: string;
  driver?: string;
  team?: string;
  carId?: string | null;
  carName?: string;
  chassis?: string;
  photoUrl?: string;
  parts?: Partial<PartValues>;
}

/**
 * Save or update a spec sheet for a member uniquely.
 * If a spec sheet already exists for this car (matched by id, carId, or normalized car/setup name),
 * it updates that spec sheet in-place without creating duplicate variations.
 */
export async function saveSpecSheet(
  input: SaveSpecSheetInput,
  userIdOverride?: string
): Promise<ActionResult<{ sheet: CarSpecSheet; sheets: CarSpecSheet[] }>> {
  try {
    const session = await auth();
    const userId = userIdOverride || session?.user?.id;
    if (!userId) return { success: false, error: "Please sign in to save a spec sheet." };

    const existing = await loadRawSpecSheets(userId);
    const parts = sanitizeParts(input.parts);
    const carName = cleanText(input.carName, 50);
    const chassis = cleanText(input.chassis, 48);
    const driver = cleanText(input.driver, 30);
    const team = cleanText(input.team, 30);
    const carId = typeof input.carId === "string" && input.carId ? cleanText(input.carId, 64) : null;
    const rawPhoto = cleanText(input.photoUrl, 600);
    const photoUrl = /^https:\/\/\S+$/i.test(rawPhoto) ? rawPhoto : "";
    const defaultName = carName || chassis || (composeParts(parts) ? composeParts(parts).slice(0, 40) : "Car Spec Sheet");
    const name = cleanText(input.name, 60) || defaultName;

    // Match existing sheet uniquely:
    // 1. By input.id
    // 2. By carId
    // 3. By normalized carName or sheet name
    const matched =
      (input.id ? existing.find((s) => s.id === input.id) : null) ??
      (carId ? existing.find((s) => s.carId === carId) : null) ??
      (carName
        ? existing.find(
            (s) =>
              (s.carName && norm(s.carName) === norm(carName)) ||
              (s.name && norm(s.name) === norm(carName))
          )
        : null) ??
      (name ? existing.find((s) => norm(s.name) === norm(name)) : null);

    // Merge parts so non-empty fields are preserved
    const finalParts: PartValues = {
      motor: parts.motor?.trim() || matched?.parts?.motor || "",
      esc: parts.esc?.trim() || matched?.parts?.esc || "",
      gyro: parts.gyro?.trim() || matched?.parts?.gyro || "",
      servo: parts.servo?.trim() || matched?.parts?.servo || "",
      controller: parts.controller?.trim() || matched?.parts?.controller || "",
    };

    const sheet: CarSpecSheet = {
      id: matched?.id ?? randomUUID(),
      name: name || matched?.name || defaultName,
      driver: driver || matched?.driver || "",
      team: team || matched?.team || "",
      carId: carId || matched?.carId || null,
      carName: carName || matched?.carName || name,
      chassis: chassis || matched?.chassis || "",
      photoUrl: photoUrl || matched?.photoUrl || "",
      parts: finalParts,
      updatedAt: Date.now(),
    };

    await redis.hset(specSheetsKey(userId), { [sheet.id]: JSON.stringify(sheet) });

    // If this sheet is tied to a garage car, update the car's parts directly in Redis as well
    if (sheet.carId) {
      await updateCarParts(sheet.carId, userId, sheet.parts, sheet.chassis).catch(() => {});
    }

    // Record any new community parts
    await recordCommunityParts(sheet.parts).catch(() => {});

    // Trim oldest if above limit
    const updatedList = [sheet, ...existing.filter((s) => s.id !== sheet.id)].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    if (updatedList.length > MAX_SPEC_SHEETS) {
      const overflow = updatedList.slice(MAX_SPEC_SHEETS);
      for (const old of overflow) {
        await redis.hdel(specSheetsKey(userId), old.id).catch(() => {});
      }
    }

    revalidatePath("/cards/new");
    revalidatePath("/cars");
    return {
      success: true,
      data: { sheet, sheets: updatedList.slice(0, MAX_SPEC_SHEETS) },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not save spec sheet",
    };
  }
}

export async function deleteSpecSheet(
  specId: string
): Promise<ActionResult<{ sheets: CarSpecSheet[] }>> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Please sign in." };

    const cleanId = cleanText(specId, 64);
    if (cleanId) {
      await redis.hdel(specSheetsKey(userId), cleanId);
    }
    const sheets = await loadRawSpecSheets(userId);
    revalidatePath("/cards/new");
    revalidatePath("/cars");
    return { success: true, data: { sheets } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not delete spec sheet",
    };
  }
}
