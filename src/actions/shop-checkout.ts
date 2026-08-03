"use server";

import { createCheckout } from "@/lib/sumup";
import { createOrder, OrderItem } from "@/actions/orders";
import type { ActionResult } from "@/types";
import { auth } from "@/lib/auth";

export async function processShopCheckout(
  items: OrderItem[],
  totalAmount: number,
  returnUrl: string
): Promise<ActionResult<{ checkoutUrl: string }>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }
    const userId = session.user.id;

    if (items.length === 0 || totalAmount <= 0) {
      return { success: false, error: "Invalid cart" };
    }

    // 1. Create pending order
    const orderRes = await createOrder(userId, items, totalAmount, "shop");
    if (!orderRes.success || !orderRes.data) {
      return { success: false, error: "Failed to create order record" };
    }
    const orderId = orderRes.data.id;

    // 2. Add checkout reference to order for tracking
    // We don't have a way to inject custom metadata into SumUp easily, so we just use the orderId in the description
    // Wait, createOrder takes checkoutReference, but we generate it in createCheckout.
    // Instead, we can pass the returnUrl with the orderId appended so the callback knows the orderId.

    const fullReturnUrl = `${returnUrl}?orderId=${orderId}`;

    // 3. Create SumUp checkout
    const sumupRes = await createCheckout({
      memberId: userId,
      amount: totalAmount,
      currency: "GBP",
      description: `Store Order: ${orderId.slice(0, 8)}`,
      returnUrl: fullReturnUrl,
    });

    if (!sumupRes.hosted_checkout_url) {
      return { success: false, error: "Failed to generate payment link" };
    }

    // Return the checkout URL for redirect
    return { success: true, data: { checkoutUrl: sumupRes.hosted_checkout_url } };
  } catch (error: any) {
    console.error("Shop checkout error:", error);
    return { success: false, error: error.message || "Checkout failed" };
  }
}
