import { redis } from "@/lib/redis";

// Durable index of SumUp checkouts that have been created but not yet confirmed
// as processed. The payment webhook and the customer-return fallback are both
// best-effort: a webhook can silently fail inside `after()`, and an Apple Pay
// buyer often never returns to the site. This set lets a scheduled
// reconciliation sweep (see /api/cron/reconcile-payments) find any checkout that
// was PAID at SumUp but never credited in the app, and finalize it.
//
// Score = creation time (ms). Members are checkout IDs. Entries are removed once
// the payment is finalized, and are pruned by age during reconciliation so a
// checkout that was abandoned (never paid) does not linger forever.
const PENDING_CHECKOUTS_KEY = "checkouts:pending";

/** Register a freshly created checkout so reconciliation can later verify it. */
export async function registerPendingCheckout(checkoutId: string): Promise<void> {
  if (!checkoutId) return;
  try {
    await redis.zadd(PENDING_CHECKOUTS_KEY, {
      score: Date.now(),
      member: checkoutId,
    });
  } catch (e) {
    // Non-fatal: the webhook / return fallback are still the primary paths.
    console.error("[pending-checkouts] failed to register:", checkoutId, e);
  }
}

/** Remove a checkout from the pending index once it has been finalized. */
export async function clearPendingCheckout(checkoutId: string): Promise<void> {
  if (!checkoutId) return;
  try {
    await redis.zrem(PENDING_CHECKOUTS_KEY, checkoutId);
  } catch (e) {
    console.error("[pending-checkouts] failed to clear:", checkoutId, e);
  }
}

/**
 * Return the checkout IDs created within the given age window (default: last
 * 7 days), newest first. Checkouts older than the window are dropped from the
 * index and NOT returned — a checkout left unpaid for a week is treated as
 * abandoned (SumUp checkouts expire well before then).
 */
export async function getPendingCheckoutIds(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<string[]> {
  const cutoff = Date.now() - maxAgeMs;
  try {
    // Prune anything older than the window first.
    await redis.zremrangebyscore(PENDING_CHECKOUTS_KEY, 0, cutoff);
    // Return remaining IDs, newest first.
    const ids = await redis.zrange<string[]>(PENDING_CHECKOUTS_KEY, 0, -1, {
      rev: true,
    });
    return (ids || []).map((id) => String(id));
  } catch (e) {
    console.error("[pending-checkouts] failed to read index:", e);
    return [];
  }
}
