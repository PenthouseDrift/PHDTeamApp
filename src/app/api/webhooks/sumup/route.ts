import { NextResponse } from "next/server";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { event_type, id, checkout_id, status, checkout_reference, amount, currency } = body;
    const checkoutId = checkout_id || id;

    // Only process successful payments (SumUp sends "PAID", "SUCCESSFUL", or event_type "checkout.completed")
    const isPaid = status === "PAID" || status === "SUCCESSFUL" || event_type === "checkout.completed";

    if (!isPaid) {
      return NextResponse.json({ received: true });
    }

    if (!checkoutId && !checkout_reference) {
      return NextResponse.json(
        { error: "Invalid checkout payload: missing ID or reference" },
        { status: 400 }
      );
    }

    const result = await processSuccessfulPaymentReference(
      checkout_reference || "",
      checkoutId || "",
      Number(amount) || 0,
      currency || "GBP"
    );

    // Revalidate the app-facing pages so the purchasing member sees their new
    // membership/wallet balance immediately instead of waiting for the cache.
    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/dashboard");
      revalidatePath("/wallet");
      revalidatePath("/membership");
      revalidatePath("/admin/members");
      revalidatePath("/admin/activity");
    } catch (e) {
      console.error("SumUp webhook revalidation error:", e);
    }

    return NextResponse.json({
      received: true,
      processed: true,
      itemType: result.itemType,
      memberId: result.memberId,
    });
  } catch (error) {
    console.error("SumUp webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
