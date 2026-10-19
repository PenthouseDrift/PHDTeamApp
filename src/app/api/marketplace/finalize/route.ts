import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";

/**
 * Finalize a marketplace checkout from the embedded SumUp Card Widget's success
 * callback. The callback runs in the browser, so this endpoint NEVER trusts the
 * client's claim that payment succeeded — it independently:
 *   1. requires an authenticated buyer,
 *   2. confirms the checkout belongs to that buyer (checkout:<id> metadata),
 *   3. asks the SumUp API for the real status and only finalizes if PAID.
 *
 * It's a fast, happy-path trigger that mirrors the webhook; both call the same
 * idempotent finalizer, so whichever lands first wins and the other is a no-op.
 * This does NOT replace the webhook — the browser can die after the charge but
 * before this call, which the server-to-server webhook still covers.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let checkoutId = "";
  try {
    const body = await request.json();
    checkoutId = String(body?.checkoutId || "");
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkoutId) {
    return NextResponse.json({ error: "Missing checkoutId" }, { status: 400 });
  }

  // Confirm the checkout belongs to this buyer before doing anything.
  const metaRaw = await redis.get(`checkout:${checkoutId}`);
  if (!metaRaw) {
    return NextResponse.json({ status: "unknown" });
  }
  const meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : (metaRaw as Record<string, unknown>);
  if (meta.memberId !== session.user.id) {
    // Not this user's checkout — refuse without leaking whether it exists.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const checkout = await getCheckoutStatus(checkoutId);
    const statusUpper = (checkout?.status || "").toUpperCase();

    if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
      await processSuccessfulPaymentReference(
        checkout.checkout_reference || "",
        checkout.id || checkoutId,
        Number(checkout.amount) || 0,
        checkout.currency || "GBP"
      );
      // Clear the per-user pointer now this checkout is handled.
      await redis.del(`pending_checkout:${session.user.id}`);
      return NextResponse.json({
        status: "paid",
        orderRef: (checkout.id || checkoutId).slice(0, 8).toUpperCase(),
      });
    }

    return NextResponse.json({ status: statusUpper.toLowerCase() || "pending" });
  } catch (e) {
    console.error("Marketplace finalize error:", e);
    return NextResponse.json({ error: "Failed to finalize" }, { status: 500 });
  }
}
