import { redis } from "@/lib/redis";
import { sanitizePackStyle, type PackStyle } from "@/lib/pack-styles";

/**
 * Where custom pack styles live in Redis (shared by the admin actions and the pack roll):
 *
 *   admin:pack_style:<id>     one JSON string per style
 *   admin:pack_styles:index   sorted set of style ids, scored by last edit
 *
 * Reading needs no admin session because the pack roll runs as the member opening the pack.
 */
export const PACK_STYLES_INDEX = "admin:pack_styles:index";
export const packStyleKey = (id: string) => `admin:pack_style:${id}`;

/** Most styles kept; keeps the pack roll's read to one small request. */
export const MAX_PACK_STYLES = 100;

/** Every saved style, most recently edited first. Throws if Redis cannot be read. */
export async function loadPackStyles(): Promise<PackStyle[]> {
  const ids = (await redis.zrange(PACK_STYLES_INDEX, 0, MAX_PACK_STYLES - 1, { rev: true })) as string[];
  if (!ids || ids.length === 0) return [];
  const rows = await redis.mget(...ids.map((id) => packStyleKey(String(id))));
  return rows.map(sanitizePackStyle).filter((s): s is PackStyle => s !== null);
}

export async function loadPackStyle(id: string): Promise<PackStyle | null> {
  return sanitizePackStyle(await redis.get(packStyleKey(id)));
}
