import { auth } from "@/lib/auth";

export interface StaffUser {
  id: string;
  name: string | null;
  role: "admin" | "moderator";
}

/**
 * Server-side staff gate for server actions. Returns the signed-in admin or
 * moderator, or null. "use server" exports are callable by any signed-in
 * client, so staff-only actions must check this rather than trusting a
 * client-supplied adminId.
 */
export async function requireStaff(): Promise<StaffUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "admin" && user.role !== "moderator")) return null;
  return { id: user.id, name: user.name ?? null, role: user.role };
}
