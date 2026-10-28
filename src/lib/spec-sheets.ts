import { PART_CATEGORIES, PART_KEYS, composeParts, emptyParts, type PartKey, type PartValues } from "@/lib/rc-parts-data";

export interface CarSpecSheet {
  id: string;
  /** Display name for this spec sheet (e.g. car name or chassis). */
  name: string;
  driver: string;
  team: string;
  carId: string | null;
  carName: string;
  chassis: string;
  photoUrl: string;
  parts: PartValues;
  updatedAt: number;
}

const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function sanitizeParts(raw: unknown): PartValues {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = emptyParts();
  for (const k of PART_KEYS) {
    out[k] = cleanText(src[k], 64);
  }
  return out;
}

/**
 * Best-effort parser that turns a composed parts line (e.g. "Hobbywing XeRun D10 · Reve D REVOX")
 * back into individual PartValues so earlier cards can be used as spec sheets too.
 */
export function parsePartsFromDescription(description: string): PartValues {
  const out = emptyParts();
  if (!description || typeof description !== "string") return out;

  const segments = description
    .split(/\s*(?:·|\||—)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const unassigned: string[] = [];

  for (const seg of segments) {
    const lower = seg.toLowerCase();
    let matchedKey: PartKey | null = null;

    for (const cat of PART_CATEGORIES) {
      if (out[cat.key]) continue;
      for (const [brand, models] of Object.entries(cat.catalog)) {
        for (const model of models) {
          const full = `${brand} ${model}`.toLowerCase();
          if (lower === full || lower === model.toLowerCase()) {
            matchedKey = cat.key;
            break;
          }
        }
        if (matchedKey) break;
      }
      if (matchedKey) break;
    }

    if (!matchedKey) {
      if (!out.gyro && /gyro|revox|dp-302|gyd|gyc/i.test(seg)) matchedKey = "gyro";
      else if (!out.servo && /servo|rs-st|sc-1258|sp-02/i.test(seg)) matchedKey = "servo";
      else if (!out.controller && /futaba|sanwa|flysky|nb4|spektrum|radiolink|4pm|7px|10px|m17|mt-44/i.test(seg))
        matchedKey = "controller";
      else if (!out.esc && /esc|xarvis|xd10|xr10|fleta|blackbox|toro|rsx/i.test(seg)) matchedKey = "esc";
      else if (!out.motor && /motor|d10|v10|justock|luce|sonic|redline/i.test(seg)) matchedKey = "motor";
    }

    if (matchedKey && !out[matchedKey]) {
      out[matchedKey] = cleanText(seg, 64);
    } else {
      unassigned.push(seg);
    }
  }

  for (const seg of unassigned) {
    const emptyKey = PART_KEYS.find((k) => !out[k]);
    if (emptyKey) out[emptyKey] = cleanText(seg, 64);
  }

  return out;
}

export function specSheetSummary(sheet: Pick<CarSpecSheet, "chassis" | "parts">): string {
  const partsLine = composeParts(sheet.parts);
  if (sheet.chassis && partsLine) return `${sheet.chassis} · ${partsLine}`;
  return sheet.chassis || partsLine || "No parts listed yet";
}

export function sanitizeSpecSheet(raw: unknown): CarSpecSheet | null {
  try {
    const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") return null;
    const id = cleanText(obj.id, 64);
    if (!id) return null;
    const carName = cleanText(obj.carName, 50);
    const chassis = cleanText(obj.chassis, 48);
    const name = cleanText(obj.name, 60) || carName || chassis || "Car Spec Sheet";
    const photoUrl = cleanText(obj.photoUrl, 600);
    return {
      id,
      name,
      driver: cleanText(obj.driver, 30),
      team: cleanText(obj.team, 30),
      carId: typeof obj.carId === "string" && obj.carId ? cleanText(obj.carId, 64) : null,
      carName,
      chassis,
      photoUrl: /^https:\/\/\S+$/i.test(photoUrl) ? photoUrl : "",
      parts: sanitizeParts(obj.parts),
      updatedAt: Number(obj.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

