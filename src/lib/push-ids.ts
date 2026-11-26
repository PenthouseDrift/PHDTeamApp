import { createHash } from "node:crypto";

/**
 * The id a push subscription is stored under: a hash of its whole endpoint, so every device gets its own.
 *
 * It used to be the first 32 characters of the endpoint's base64, but every device on the same push service (Chrome, Safari,
 * Firefox) has an endpoint that starts with the same web address, so those 32 characters were identical for everyone on that
 * service. Everyone's device was stored as one subscription, the last one saved, and a notification meant for one member went to
 * that device. A hash is 43 characters long, which is also how an old id is told from a good one.
 */
export function subscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url");
}

/** An id made the old way (32 characters). It can belong to many members at once, so it must never be used to reach one of them. */
export function isLegacySubscriptionId(id: string): boolean {
  return id.length === 32;
}
