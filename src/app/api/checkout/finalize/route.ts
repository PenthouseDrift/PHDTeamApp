import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCheckoutStatus } from "@/lib/sumup";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";

/**
 * Generic checkout finalizer, called by the embedded SumUp widget's success
 * callback for ANY purchase type (marketplace, membership, daypass, rental).
 *
 * The callback runs in the browser, so this never trusts the client's claim of
 * success. It:
 *   1. requires an authenticated buyer,
 *   2. confirms the checkout belongs to that buyer (checkout:<id> metadata),
 *   3. asks the SumUp API for the real status and only finalizes if PAID.
 *
 * It mirrors the webhook; both call the same idempotent finalizer, so whichever
 * lands first wins and the other is a no-op. This does NOT replace the webhook:
 * the browser can die after the charge but before this runs, which the
 * server-to-server webhook still covers.
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const checkout = await getCheckoutStatus(checkoutId);
    const statusUpper = (checkout?.status || "").toUpperCase();

    if (checkout && (statusUpper === "PAID" || statusUpper === "SUCCESSFUL")) {
      const result = await processSuccessfulPaymentReference(
        checkout.checkout_reference || "",
        checkout.id || checkoutId,
        Number(checkout.amount) || 0,
        checkout.currency || "GBP"
      );
      // Did the buyer's auto check-in setting check them in with this pass?
      let autoCheckedIn = Boolean(result.autoCheckedIn);
      if (!autoCheckedIn && !result.guestName && (result.itemType === "daypass" || result.itemType === "rental")) {
        const { autoCheckInApplied } = await import("@/lib/auto-checkin");
        autoCheckedIn = await autoCheckInApplied(session.user.id, result.itemType === "daypass" ? "day_pass" : "rental");
      }
      // Clear whichever per-user pointer applies.
      await redis.del(`pending_checkout:${session.user.id}`);
      await redis.del(`pending_wallet_checkout:${session.user.id}`);
      return NextResponse.json({
        status: "paid",
        itemType: typeof meta.itemType === "string" ? meta.itemType : undefined,
        ref: (checkout.id || checkoutId).slice(0, 8).toUpperCase(),
        autoCheckedIn,
      });
    }

    return NextResponse.json({ status: statusUpper.toLowerCase() || "pending" });
  } catch (e) {
    console.error("Checkout finalize error:", e);
    return NextResponse.json({ error: "Failed to finalize" }, { status: 500 });
  }
}
