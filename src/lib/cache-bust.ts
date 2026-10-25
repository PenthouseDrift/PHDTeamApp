import { revalidateTag } from "next/cache";

/**
 * Cache invalidation helpers. revalidateTag only works inside a request/action/
 * route-handler context, and some callers (payment finalizer during a page
 * render, cron) can run outside one, so these never throw: worst case the
 * cache simply expires on its own TTL.
 */
function bust(tag: string) {
  try {
    revalidateTag(tag, "max");
  } catch {
    // outside a request context; the TTL will catch up
  }
}

/** Name / email / role directory changed (sign-up, rename, role change). */
export function bustMemberRoster() {
  bust("member-roster");
}

/** Anything the admin Members list shows: membership, wallet, discounts, role. */
export function bustAdminMembers() {
  bust("admin-members");
}

/** The set of outstanding unpaid check-ins changed. */
export function bustUnpaid() {
  bust("unpaid-checkins");
}
