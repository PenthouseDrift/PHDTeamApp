"use server";

import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { getListingById } from "@/actions/marketplace";

/**
 * Start a SumUp Click & Collect checkout for a marketplace listing.
 *
 * Eligibility: the listing must be `status === "available"` AND `atTrack` (the
 * item is physically at the Penthouse Drift track and can be handed over on
 * collection). For now a single unit is purchased per checkout.
 *
 * This mirrors the robust membership/wallet pattern (NOT the old shop flow):
 *   1. create the SumUp checkout
 *   2. persist item metadata at `checkout:<id>` so the webhook/cron finalizer
 *      can credit the right listing (SumUp has no metadata channel of its own)
 *   3. register the checkout in the durable reconciliation index
 *   4. redirect the buyer to the hosted checkout
 * The sale is only recorded once payment is confirmed server-side.
 */
export async function createMarketplaceCheckout(
  listingId: string,
  variantId?: string,
  customReturnUrl?: string
): Promise<ActionResult<{ url: string; checkoutId: string; amount: number; currency: string; email?: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "You must be logged in to buy" };
    }
    const buyerId = session.user.id;

    const listing = await getListingById(listingId);
    if (!listing) return { success: false, error: "Listing not found" };
    if (listing.isDraft) return { success: false, error: "This item isn't available" };

    // Reserved items are being held for a buyer — block purchase. For a plain
    // listing that's the listing flag; for a variant the chosen variant's flag
    // is checked below alongside its stock.
    if (!listing.hasVariations && listing.reserved) {
      return { success: false, error: "This item is currently reserved" };
    }

    // Eligibility: available AND physically at the track for collection.
    if (listing.status !== "available") {
      return { success: false, error: "This item has sold" };
    }
    if (!listing.atTrack) {
      return { success: false, error: "This item isn't available for Click & Collect" };
    }

    // Resolve price + stock, variant-aware.
    let unitPrice: number;
    let itemLabel = listing.title;
    let resolvedVariantId: string | undefined;

    if (listing.hasVariations) {
      if (!variantId) return { success: false, error: "Please choose an option first" };
      const variant = listing.variants.find((v) => v.id === variantId);
      if (!variant) return { success: false, error: "That option isn't available" };
      if (variant.quantity - variant.soldCount <= 0) {
        return { success: false, error: "That option has sold out" };
      }
      if (variant.reserved) {
        return { success: false, error: "That option is currently reserved" };
      }
      unitPrice = variant.price;
      itemLabel = `${listing.title} — ${variant.name}`;
      resolvedVariantId = variant.id;
    } else {
      const remaining = listing.quantity - listing.soldCount;
      if (remaining <= 0) return { success: false, error: "This item has sold" };
      unitPrice = listing.price;
    }

    if (!(unitPrice > 0)) {
      // Free / "offers" listings can't be taken online — arrange in person.
      return { success: false, error: "This item can't be bought online" };
    }

    const currency = "GBP";
    const amount = Math.round(unitPrice * 100) / 100;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    // Return to a dedicated success page that finalizes the payment on arrival
    // (reads the SumUp status and records the sale immediately), so recording
    // no longer depends solely on the webhook. This is what fixes the
    // "paid then locked the phone" gap.
    const returnUrl = customReturnUrl || `${baseUrl}/marketplace/purchase/success`;

    const buyerName = (await redis.hget(`member:${buyerId}`, "name")) as string | null;
    const buyerEmail = (await redis.hget(`member:${buyerId}`, "email")) as string | null;

    const { createCheckout } = await import("@/lib/sumup");
    const checkout = await createCheckout({
      memberId: buyerId,
      amount,
      currency,
      description: `Penthouse Drift - ${itemLabel}`,
      returnUrl,
    });

    // Persist everything the finalizer needs. SumUp can't carry metadata, so
    // this Redis record is the source of truth that maps the paid checkout back
    // to the listing/variant, the buyer, and the exact amount charged.
    await redis.set(
      `checkout:${checkout.id}`,
      JSON.stringify({
        memberId: buyerId,
        itemType: "marketplace",
        listingId: listing.listingId,
        variantId: resolvedVariantId,
        itemLabel,
        quantity: 1,
        amount,
        currency,
        buyerName: buyerName || undefined,
        checkoutReference: checkout.checkout_reference,
        createdAt: Date.now(),
      }),
      { ex: 86400 * 30 }
    );

    // Per-user fallback so the success page can find THIS checkout on return
    // even if SumUp doesn't echo a checkout id in the redirect query (mirrors
    // the membership flow). Short TTL — it's only needed for the return hop.
    await redis.set(`pending_checkout:${buyerId}`, checkout.id, { ex: 3600 });

    const { registerPendingCheckout } = await import("@/lib/pending-checkouts");
    await registerPendingCheckout(checkout.id);

    const redirectUrl = checkout.hosted_checkout_url || `https://pay.sumup.com/b2c/Q${checkout.id}`;
    // Return the checkout id + amount/currency too, so the embedded Card Widget
    // flow can mount against this checkout. The hosted-redirect flow just uses url.
    return {
      success: true,
      data: { url: redirectUrl, checkoutId: checkout.id, amount, currency, email: buyerEmail || undefined },
    };
  } catch (error) {
    console.error("createMarketplaceCheckout error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start checkout",
    };
  }
}
