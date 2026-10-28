"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { composeParts, emptyParts, type PartValues } from "@/lib/rc-parts-data";
import {
  parsePartsFromDescription,
  sanitizeParts,
  sanitizeSpecSheet,
  type CarSpecSheet,
} from "@/lib/spec-sheets";
import { memberCardKey, memberCardsIndexKey, parseStoredCard } from "@/lib/member-card-store";
import { getMemberCars } from "@/actions/cars";
import type { ActionResult } from "@/types";

const MAX_SPEC_SHEETS = 25;
const specSheetsKey = (userId: string) => `member:${userId}:specsheets`;

const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

function fingerprint(s: {
  carId: string | null;
  carName: string;
  chassis: string;
  parts: PartValues;
}): string {
  const norm = (v: string) => v.trim().toLowerCase();
  return [s.carId ?? "", norm(s.carName), norm(s.chassis), norm(composeParts(s.parts))].join("|");
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
 * Load all spec sheets for a member, newest first. Also backfills from their existing
 * garage cars and previously opened cards so returning members already have clickable
 * spec sheets for cars/cards they created earlier.
 */
export async function getMemberSpecSheets(userIdArg?: string): Promise<CarSpecSheet[]> {
  try {
    const session = await auth();
    const userId = userIdArg || session?.user?.id;
    if (!userId) return [];

    const existing = await loadRawSpecSheets(userId);
    const seenFingerprints = new Set(existing.map(fingerprint));
    const seenCarIds = new Set(existing.map((s) => s.carId).filter(Boolean));
    const additions: CarSpecSheet[] = [];

    // 1. Backfill from earlier non-bonus member cards (which have driver, team, chassis, parts & referenceUrl)
    const cardIds = (await redis.zrange(memberCardsIndexKey(userId), 0, 30, { rev: true })) as string[];
    if (cardIds && cardIds.length > 0) {
      const rows = await redis.mget(...cardIds.map((id) => memberCardKey(String(id))));
      for (const row of rows) {
        const card = parseStoredCard(row);
        if (!card || card.bonus || card.archived || card.userId !== userId) continue;
        const parts = parsePartsFromDescription(card.effect);
        const chassis = card.ability || card.name;
        const candidate: CarSpecSheet = {
          id: randomUUID(),
          name: card.name || chassis || "Saved Car Setup",
          driver: card.driver,
          team: card.team,
          carId: null,
          carName: card.name,
          chassis,
          photoUrl: card.referenceUrl || "",
          parts,
          updatedAt: card.createdAt,
        };
        const fp = fingerprint(candidate);
        if (!seenFingerprints.has(fp)) {
          seenFingerprints.add(fp);
          additions.push(candidate);
        }
      }
    }

    // 2. Backfill from garage cars that don't have a spec sheet yet
    const carsRes = await getMemberCars(userId);
    if (carsRes.success) {
      for (const car of carsRes.data) {
        if (seenCarIds.has(car.carId)) continue;
        const candidate: CarSpecSheet = {
          id: randomUUID(),
          name: car.name,
          driver: session?.user?.name?.trim() ?? "",
          team: "",
          carId: car.carId,
          carName: car.name,
          chassis: car.chassis ?? car.name,
          photoUrl: car.images[0] ?? "",
          parts: emptyParts(),
          updatedAt: car.createdAt,
        };
        const fp = fingerprint(candidate);
        if (!seenFingerprints.has(fp)) {
          seenFingerprints.add(fp);
          seenCarIds.add(car.carId);
          additions.push(candidate);
        }
      }
    }

    if (additions.length > 0) {
      const toSave: Record<string, string> = {};
      for (const item of additions.slice(0, MAX_SPEC_SHEETS)) {
        toSave[item.id] = JSON.stringify(item);
      }
      if (Object.keys(toSave).length > 0) {
        await redis.hset(specSheetsKey(userId), toSave).catch(() => {});
      }
    }

    const combined = [...existing, ...additions].sort((a, b) => b.updatedAt - a.updatedAt);
    return combined.slice(0, MAX_SPEC_SHEETS);
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
 * Save or update a spec sheet for a member. If an identical setup (same car, chassis and parts)
 * already exists and no explicit `id` was passed, it updates that spec sheet; otherwise it creates
 * a new spec sheet so the member can keep multiple spec sheets.
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

    const candidateFp = fingerprint({ carId, carName, chassis, parts });
    const matched =
      (input.id ? existing.find((s) => s.id === input.id) : null) ??
      existing.find((s) => fingerprint(s) === candidateFp);

    const sheet: CarSpecSheet = {
      id: matched?.id ?? randomUUID(),
      name,
      driver: driver || matched?.driver || "",
      team: team || matched?.team || "",
      carId,
      carName: carName || matched?.carName || "",
      chassis: chassis || matched?.chassis || "",
      photoUrl: photoUrl || matched?.photoUrl || "",
      parts,
      updatedAt: Date.now(),
    };

    await redis.hset(specSheetsKey(userId), { [sheet.id]: JSON.stringify(sheet) });

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

