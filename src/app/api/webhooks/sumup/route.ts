import { NextResponse } from "next/server";
import { after } from "next/server";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";
import { getCheckoutStatus } from "@/lib/sumup";

/**
 * SumUp Checkouts webhook (the `return_url` subscriber).
 *
 * SumUp's real webhook payload is intentionally minimal — it only tells us a
 * checkout CHANGED, not what it changed to:
 *   { "event_type": "CHECKOUT_STATUS_CHANGED", "id": "<checkout-id>" }
 * It does NOT include status / amount / reference. So we must take the id, ask
 * the SumUp API for the authoritative status, and finalize only if it's PAID.
 *
 * We also keep backward-compatibility with a richer payload (some SumUp setups
 * send status/checkout_id inline): if a usable status is present we trust it,
 * otherwise we fetch. Either way the finalizer is idempotent.
 *
 * SumUp expects a fast 2xx and RETRIES on any non-2xx (1m, 5m, 20m, 2h). So we
 * ack immediately and do the work in after(); a thrown error inside after()
 * won't turn the response non-2xx (avoiding duplicate retries for work that may
 * have partially succeeded — the finalizer's idempotency covers genuine retries).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // SumUp always sends JSON; a non-JSON body is not something to retry on.
    return NextResponse.json({ received: true });
  }

  // The checkout id can arrive as `id` (standard CHECKOUT_STATUS_CHANGED) or
  // `checkout_id` (richer payloads). Reference is only present in rich payloads.
  const checkoutId = String(body.checkout_id || body.id || "");
  const inlineStatus = String(body.status || "").toUpperCase();
  const inlineRef = typeof body.checkout_reference === "string" ? body.checkout_reference : "";

  if (!checkoutId && !inlineRef) {
    // Nothing actionable — ack so SumUp doesn't retry a payload we can't use.
    return NextResponse.json({ received: true });
  }

  after(async () => {
    try {
      // Resolve the authoritative status. Prefer an inline PAID/SUCCESSFUL
      // status when present; otherwise (the normal CHECKOUT_STATUS_CHANGED
      // case) fetch it from SumUp using the id.
      let status = inlineStatus;
      let reference = inlineRef;
      let amount = Number(body.amount) || 0;
      let currency = typeof body.currency === "string" ? body.currency : "GBP";

      if (status !== "PAID" && status !== "SUCCESSFUL" && checkoutId) {
        const checkout = await getCheckoutStatus(checkoutId);
        if (checkout) {
          status = (checkout.status || "").toUpperCase();
          reference = checkout.checkout_reference || reference;
          amount = Number(checkout.amount) || amount;
          currency = checkout.currency || currency;
        }
      }

      if (status !== "PAID" && status !== "SUCCESSFUL") {
        // Not a completed payment (PENDING/FAILED/etc.) — ignore this event.
        return;
      }

      await processSuccessfulPaymentReference(reference, checkoutId, amount, currency);

      const { revalidatePath } = await import("next/cache");
      revalidatePath("/dashboard");
      revalidatePath("/wallet");
      revalidatePath("/cards");
      revalidatePath("/membership");
      revalidatePath("/orders");
      revalidatePath("/admin/members");
      revalidatePath("/admin/activity");
      revalidatePath("/admin/click-collect");
    } catch (e) {
      console.error("SumUp webhook async processing error:", e);
    }
  });

  // Fast, empty 2xx so SumUp marks delivery successful.
  return NextResponse.json({ received: true });
}
