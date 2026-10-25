import { redis } from "@/lib/redis";
import { unstable_cache } from "next/cache";

/**
 * Cheap member directory.
 *
 * Why this exists: finding every member used to mean SCANning the whole
 * keyspace (a command per ~200 keys of EVERYTHING in the database) and then
 * reading each profile one at a time. On a metered Redis plan that is the
 * single most expensive thing the app did.
 *
 * Instead:
 *   - `members:index` is a set of every member id (maintained at sign-up).
 *   - It is back-filled ONCE from a SCAN the first time it's needed
 *     (`members:index:ready` marks that it has been).
 *   - `getMemberRoster` reads one profile hash per member and is cached, so a
 *     busy day costs one rebuild per cache window, not one per page view.
 */

const INDEX_KEY = "members:index";
const READY_KEY = "members:index:ready";

export interface RosterEntry {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  image: string | null;
  role: "admin" | "moderator" | "member" | "asbo-rc";
  createdAt: number;
}

/** Record a member id in the index (idempotent). Call when a profile is created. */
export async function addToMemberIndex(memberId: string): Promise<void> {
  await redis.sadd(INDEX_KEY, memberId);
}

/** Every member id. Builds the index from a one-off SCAN if it doesn't exist yet. */
export async function getMemberIds(): Promise<string[]> {
  const [ready, ids] = await Promise.all([redis.get(READY_KEY), redis.smembers(INDEX_KEY)]);
  if (ready) return (ids as string[]).map(String);

  // One-time back-fill. Sign-ups since this shipped are already in the set;
  // SADD just adds whoever is missing.
  const found = new Set<string>((ids as string[]).map(String));
  let cursor = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: "member:*", count: 500 });
    cursor = Number(next);
    for (const key of keys as string[]) {
      const parts = String(key).split(":");
      // member:<id> only; skip sub-keys like member:<id>:cars
      if (parts.length === 2 && parts[1]) found.add(parts[1]);
    }
  } while (cursor !== 0);

  const all = [...found];
  for (let i = 0; i < all.length; i += 500) {
    await redis.sadd(INDEX_KEY, ...(all.slice(i, i + 500) as [string, ...string[]]));
  }
  await redis.set(READY_KEY, "1");
  return all;
}

async function buildRoster(): Promise<RosterEntry[]> {
  const ids = await getMemberIds();
  if (ids.length === 0) return [];

  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.hgetall(`member:${id}`));
  const rows = (await pipeline.exec()) as Array<Record<string, unknown> | null>;

  const roster: RosterEntry[] = [];
  rows.forEach((row, i) => {
    if (!row || !row.email) return;
    roster.push({
      id: ids[i],
      name: String(row.name || "Unknown"),
      nickname: row.nickname ? String(row.nickname) : null,
      email: String(row.email),
      image: row.customAvatar ? String(row.customAvatar) : row.image ? String(row.image) : null,
      role: (row.role as RosterEntry["role"]) || "member",
      createdAt: Number(row.createdAt) || 0,
    });
  });
  roster.sort((a, b) => a.name.localeCompare(b.name));
  return roster;
}

/**
 * Name / email / role for every member. Cached for 10 minutes and cleared by
 * `bustMemberRoster()` on sign-up and profile / role changes. Does NOT include
 * wallet or membership: those change at the door, so anything that needs them
 * reads that one member live.
 */
export const getMemberRoster = unstable_cache(buildRoster, ["member-roster"], {
  revalidate: 600,
  tags: ["member-roster"],
});
