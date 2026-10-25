import type { Membership } from "@/types";

export function isMembershipActive(membership: Membership): boolean {
  return membership.expiresAt > Date.now();
}

export function getRemainingDays(membership: Membership): number {
  const remaining = membership.expiresAt - Date.now();
  return Math.max(0, Math.floor(remaining / (1000 * 60 * 60 * 24)));
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * How much of a membership is left, for a progress bar. The "total" is the
 * longer of the purchased window, what's actually left (an early renewal can
 * stack past one period), and the standard period, so the bar never exceeds
 * 100% and a fresh 28-day membership starts full.
 */
export function getMembershipProgress(membership: Membership, standardDays = 28) {
  const remainingMs = Math.max(0, membership.expiresAt - Date.now());
  const totalMs = Math.max(membership.expiresAt - membership.purchasedAt, remainingMs, standardDays * DAY_MS);
  return {
    percentLeft: Math.min(100, Math.max(0, Math.round((remainingMs / totalMs) * 100))),
    totalDays: Math.round(totalMs / DAY_MS),
  };
}
