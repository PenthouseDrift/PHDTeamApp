import { cache } from "react";
import { redirect } from "next/navigation";
import { redis } from "@/lib/redis";

/**
 * The signed-in member's profile hash (`member:<id>`), read at most ONCE per
 * server request however many layouts / pages / components ask for it. Use this
 * instead of calling `redis.hgetall(\`member:${id}\`)` directly in request code.
 */
export const getMemberHash = cache(async (userId: string): Promise<Record<string, unknown> | null> => {
  if (!userId) return null;
  return (await redis.hgetall(`member:${userId}`)) as Record<string, unknown> | null;
});

/**
 * Which member experience a user is on: the new one (new shell, navigation and
 * flows) or the "classic" app. The new experience is the DEFAULT for everyone;
 * a member who switches back in Profile has `dashboardVersion: "classic"`
 * stored on their member record. Anything else (absent, "new") means new.
 *
 * The source of truth stays in Redis (not the JWT, which is only refreshed at
 * sign-in) so the choice follows the member across devices. React `cache()`
 * memoises the read for the duration of one server request, so the layout and
 * the page it wraps share a single HGET instead of one each.
 */
export const getDashboardVersion = cache(async (userId: string): Promise<"classic" | "new"> => {
  if (!userId) return "new";
  try {
    // Reads the whole profile once per request; the page it wraps reuses it
    // via getMemberHash instead of fetching the same record again.
    const member = await getMemberHash(userId);
    return member?.dashboardVersion === "classic" ? "classic" : "new";
  } catch {
    // Never break a page over a preference lookup: use the default experience.
    return "new";
  }
});

/**
 * Call at the top of a CLASSIC page that has a new-experience equivalent. If the
 * member has opted in to the new experience they are sent to `to` instead.
 * (redirect() throws, so don't call this inside a try/catch.)
 */
export async function redirectIfNewDashboard(userId: string, to: string): Promise<void> {
  if ((await getDashboardVersion(userId)) === "new") {
    redirect(to);
  }
}
