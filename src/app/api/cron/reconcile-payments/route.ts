import { NextResponse } from "next/server";
import { getPendingCheckoutIds, clearPendingCheckout } from "@/lib/pending-checkouts";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";

/**
 * Reconciliation safety net for SumUp payments.
 *
 * The payment webhook and the customer-return fallback are both best-effort: a
 * webhook can silently fail inside `after()`, and an Apple Pay buyer frequently
 * never returns to the site. Either failure leaves a payment that was taken at
 * SumUp but never credited in the app (no wallet pass, no activity log entry).
 *
 * This route sweeps the durable `checkouts:pending` index, asks SumUp for the
 * real status of each outstanding checkout, and finalizes any that are PAID but
 * not yet processed. `processSuccessfulPaymentReference` is idempotent (guarded
 * by `payment:processed:<id>`), so finalizing a checkout the webhook already
 * handled is a no-op. Successfully processed and failed/expired checkouts are
 * removed from the index so it stays small.
 *
 * Intended to run on a schedule (e.g. every few minutes) via the same external
 * cron mechanism used by the other /api/cron/* routes, authenticated with
 * CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pendingIds = await getPendingCheckoutIds();

    let reconciled = 0;
    let stillPending = 0;
    let cleared = 0;
    const errors: string[] = [];

    for (const checkoutId of pendingIds) {
      try {
        const checkout = await getCheckoutStatus(checkoutId);

        // Could not fetch (transient SumUp/API issue, or missing key): leave it
        // in the index to retry on the next sweep.
        if (!checkout) {
          stillPending++;
          continue;
        }

        const status = (checkout.status || "").toUpperCase();

        if (status === "PAID" || status === "SUCCESSFUL") {
          // Finalize. Idempotent: if the webhook already handled it, this is a
          // no-op and simply clears the index entry.
          await processSuccessfulPaymentReference(
            checkout.checkout_reference || "",
            checkout.id || checkoutId,
            Number(checkout.amount) || 0,
            checkout.currency || "GBP"
          );
          reconciled++;
          // processSuccessfulPaymentReference clears the index on success, but
          // clear defensively in case metadata was missing.
          await clearPendingCheckout(checkoutId);
        } else if (status === "FAILED" || status === "EXPIRED") {
          // Terminal non-paid state: stop tracking it.
          await clearPendingCheckout(checkoutId);
          cleared++;
        } else {
          // PENDING / still open: leave for a later sweep.
          stillPending++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${checkoutId}: ${msg}`);
        console.error("[reconcile-payments] failed for", checkoutId, e);
        // Leave it in the index so the next sweep retries.
      }
    }

    // Revalidate the views that reflect credited payments so a reconciled
    // purchase shows up without waiting for cache expiry.
    if (reconciled > 0) {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/dashboard");
      revalidatePath("/wallet");
      revalidatePath("/cards");
      revalidatePath("/membership");
      revalidatePath("/admin/members");
      revalidatePath("/admin/activity");
    }

    return NextResponse.json({
      scanned: pendingIds.length,
      reconciled,
      stillPending,
      cleared,
      errors,
    });
  } catch (error) {
    console.error("Cron reconcile-payments error:", error);
    return NextResponse.json(
      { error: "Failed to reconcile payments" },
      { status: 500 }
    );
  }
}
