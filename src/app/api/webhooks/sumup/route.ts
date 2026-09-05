import { NextResponse } from "next/server";
import { after } from "next/server";
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

    // Acknowledge SumUp IMMEDIATELY, then finalize the payment after the
    // response is sent. SumUp's callback has a short timeout; doing the Redis
    // writes, pricing lookups, logging, and revalidation inline (plus any cold
    // start) can exceed it and surface as "callback timed out". The work below
    // is idempotent, so if SumUp retries the callback nothing is double-applied.
    after(async () => {
      try {
        await processSuccessfulPaymentReference(
          checkout_reference || "",
          checkoutId || "",
          Number(amount) || 0,
          currency || "GBP"
        );

        const { revalidatePath } = await import("next/cache");
        revalidatePath("/dashboard");
        revalidatePath("/wallet");
        revalidatePath("/membership");
        revalidatePath("/admin/members");
        revalidatePath("/admin/activity");
      } catch (e) {
        console.error("SumUp webhook async processing error:", e);
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("SumUp webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
