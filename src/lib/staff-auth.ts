import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export interface StaffUser {
  id: string;
  name: string | null;
  role: "admin" | "moderator";
}

/**
 * Server-side staff gate for server actions. Returns the signed-in admin or
 * moderator, or null. Verifies the live role in Redis (`member:<id>.role`) so
 * a demoted moderator with a cached JWT session cannot perform staff actions.
 */
export async function requireStaff(): Promise<StaffUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;

  const liveRole = (await redis.hget(`member:${user.id}`, "role")) as string | null;
  const effectiveRole = liveRole || user.role;
  if (effectiveRole !== "admin" && effectiveRole !== "moderator") return null;

  return { id: user.id, name: user.name ?? null, role: effectiveRole };
}
