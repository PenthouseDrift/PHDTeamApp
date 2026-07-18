import type { Membership } from "@/types";

export function isMembershipActive(membership: Membership): boolean {
  return membership.expiresAt > Date.now();
}

export function getRemainingDays(membership: Membership): number {
  const remaining = membership.expiresAt - Date.now();
  return Math.max(0, Math.floor(remaining / (1000 * 60 * 60 * 24)));
}
