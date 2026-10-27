/**
 * Remembers the answers from the last card pack on this device (browser localStorage), so opening
 * the next pack starts filled in. It is keyed by member id so two people sharing a device don't see
 * each other's answers, and nothing sensitive is kept: just names, the chosen car and the parts.
 * Everything read back is checked, because localStorage can hold anything.
 */

import { PART_KEYS, emptyParts, type PartValues } from "@/lib/rc-parts-data";

export interface RememberedPack {
  driver: string;
  team: string;
  /** Garage car id, or null for "a different car". */
  carId: string | null;
  chassis: string;
  photoUrl: string;
  parts: PartValues;
}

const keyFor = (userId: string) => `phd:card-pack:v1:${userId}`;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The stored text for this member on this device, or null. Browser only. */
export function readRememberedPack(userId: string): string | null {
  try {
    return window.localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

/** Turn stored text into checked answers, or null when there's nothing usable. */
export function parseRememberedPack(raw: string | null): RememberedPack | null {
  try {
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return null;

    const savedParts = (data.parts && typeof data.parts === "object" ? data.parts : {}) as Record<string, unknown>;
    const parts = emptyParts();
    for (const k of PART_KEYS) parts[k] = text(savedParts[k], 64);

    const photoUrl = text(data.photoUrl, 600);
    return {
      driver: text(data.driver, 30),
      team: text(data.team, 30),
      carId: typeof data.carId === "string" && data.carId ? data.carId : null,
      chassis: text(data.chassis, 48),
      photoUrl: /^https:\/\/\S+$/i.test(photoUrl) ? photoUrl : "",
      parts,
    };
  } catch {
    return null;
  }
}

export function saveRememberedPack(userId: string, pack: RememberedPack): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(pack));
  } catch {
    // Storage can be full or blocked (private browsing). Remembering is a nicety, so carry on.
  }
}
