import { getMemberRoster } from "@/lib/member-roster";

/**
 * Admins are auto checked in whenever there's an event today, so they say nothing about turnout.
 * Use this for any "how many people checked in" number. Lists of who is checked in should still show
 * everyone; only the counts leave admins out.
 */
export async function excludeAdminCheckIns<T extends { userId: string }>(entries: T[]): Promise<T[]> {
  if (entries.length === 0) return entries;
  const roster = await getMemberRoster();
  const adminIds = new Set(roster.filter((m) => m.role === "admin").map((m) => m.id));
  if (adminIds.size === 0) return entries;
  return entries.filter((e) => !adminIds.has(e.userId));
}

/** Description written on the activity entry created by the admin auto check-in. */
export const ADMIN_AUTO_CHECKIN_DESCRIPTION = "Auto checked in for today's event (Admin)";

/** True for the activity-log entry made when an admin is auto checked in (also matches older entries). */
export function isAdminAutoCheckInActivity(item: { type?: string; description?: string }): boolean {
  return item.type === "checkin" && (item.description ?? "").startsWith(ADMIN_AUTO_CHECKIN_DESCRIPTION);
}
