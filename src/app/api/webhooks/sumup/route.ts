import { NextResponse } from "next/server";
import { processSuccessfulPaymentReference } from "@/lib/membership-activation";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { event_type, id: checkoutId, status, checkout_reference } = body;

    // Only process successful payments
    if (status !== "PAID" && event_type !== "checkout.completed") {
      return NextResponse.json({ received: true });
    }

    if (!checkout_reference || typeof checkout_reference !== "string") {
      return NextResponse.json(
        { error: "Invalid checkout reference" },
        { status: 400 }
      );
    }

    const result = await processSuccessfulPaymentReference(checkout_reference, checkoutId);

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
