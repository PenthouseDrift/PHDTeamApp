"use server";

import { redis } from "@/lib/redis";
import {
  PART_CATEGORIES,
  PART_KEYS,
  type PartCategory,
  type PartKey,
  type PartValues,
} from "@/lib/rc-parts-data";
import type { ActionResult } from "@/types";

const communityPartsKey = (categoryKey: PartKey) => `rcparts:community:${categoryKey}`;

const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Record a single custom brand and model into the shared community pool for that category.
 */
export async function recordCommunityPart(
  categoryKey: PartKey,
  brandArg: string,
  modelArg: string
): Promise<ActionResult<void>> {
  try {
    if (!PART_KEYS.includes(categoryKey)) {
      return { success: false, error: "Invalid part category" };
    }

    const brand = cleanText(brandArg, 32);
    const model = cleanText(modelArg, 40);

    if (!brand || !model) {
      return { success: false, error: "Brand and model are required" };
    }

    // Ignore placeholder values
    if (brand.toLowerCase() === "__other__" || model.toLowerCase() === "__other__") {
      return { success: false, error: "Invalid brand or model" };
    }

    await redis.sadd(communityPartsKey(categoryKey), `${brand}:::${model}`);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record community part",
    };
  }
}

/**
 * Parses user-selected or typed parts and records any custom brands/models
 * to the shared community Redis set so other members can select them in future.
 */
export async function recordCommunityParts(parts?: Partial<PartValues>): Promise<void> {
  if (!parts) return;
  try {
    for (const key of PART_KEYS) {
      const rawVal = parts[key];
      if (!rawVal || typeof rawVal !== "string") continue;
      const val = cleanText(rawVal, 80);
      if (!val) continue;

      // Find matching category to see if it's already in static catalog
      const cat = PART_CATEGORIES.find((c) => c.key === key);
      if (!cat) continue;

      // Normalize alternative spellings (e.g. Accuvance -> Acuvance)
      const normalizedVal = val.replace(/^accuvance\s+/i, "Acuvance ");

      // Check if it starts with an existing brand in the catalog
      let foundBrand = "";
      let foundModel = "";

      for (const brand of Object.keys(cat.catalog)) {
        if (normalizedVal.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
          foundBrand = brand;
          foundModel = normalizedVal.slice(brand.length + 1).trim();
          break;
        }
      }

      if (!foundBrand) {
        // Brand is custom. Split on first space if possible.
        const spaceIdx = normalizedVal.indexOf(" ");
        if (spaceIdx > 1) {
          foundBrand = normalizedVal.slice(0, spaceIdx).trim();
          foundModel = normalizedVal.slice(spaceIdx + 1).trim();
        } else {
          foundBrand = normalizedVal;
          foundModel = "Custom";
        }
      }

      if (foundBrand && foundModel) {
        // If it's already in the static catalog, no need to add to Redis set
        const existingModels = cat.catalog[foundBrand];
        if (existingModels && existingModels.some((m) => m.toLowerCase() === foundModel.toLowerCase())) {
          continue;
        }

        await redis.sadd(communityPartsKey(key), `${foundBrand}:::${foundModel}`);
      }
    }
  } catch (error) {
    console.error("[custom-parts] recordCommunityParts error:", error);
  }
}

/**
 * Returns PART_CATEGORIES merged with any community-contributed brands and models from Redis,
 * with brands and models sorted alphabetically.
 */
export async function getMergedPartCategories(): Promise<PartCategory[]> {
  try {
    const categories: PartCategory[] = PART_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      catalog: Object.fromEntries(
        Object.entries(c.catalog).map(([brand, models]) => [brand, [...models]])
      ),
    }));

    const communityPicks = await Promise.all(
      categories.map(async (cat) => {
        const members = await redis.smembers(communityPartsKey(cat.key)).catch(() => [] as string[]);
        return { key: cat.key, members };
      })
    );

    for (const { key, members } of communityPicks) {
      const cat = categories.find((c) => c.key === key);
      if (!cat || !members) continue;

      for (const item of members) {
        if (typeof item !== "string" || !item.includes(":::")) continue;
        const [brand, model] = item.split(":::");
        const cleanBrand = brand?.trim();
        const cleanModel = model?.trim();
        if (!cleanBrand || !cleanModel) continue;

        if (!cat.catalog[cleanBrand]) {
          cat.catalog[cleanBrand] = [];
        }
        if (!cat.catalog[cleanBrand].some((m) => m.toLowerCase() === cleanModel.toLowerCase())) {
          cat.catalog[cleanBrand].push(cleanModel);
        }
      }

      // Sort models for each brand alphabetically
      for (const brand of Object.keys(cat.catalog)) {
        cat.catalog[brand].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }
    }

    return categories;
  } catch (error) {
    console.error("[custom-parts] getMergedPartCategories failed, falling back to static catalog:", error);
    return PART_CATEGORIES;
  }
}
