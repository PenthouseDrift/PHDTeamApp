"use client";

import { useState } from "react";
import { createWalletCheckout } from "@/actions/wallet";
import { createMembershipCheckout } from "@/actions/membership";
import { EmbeddedCheckout } from "@/components/marketplace/EmbeddedCheckout";

/**
 * One checkout flow for the whole new experience (Home's buy options and the
 * Passes page share it). Handles hosted-redirect vs the embedded SumUp widget
 * (NEXT_PUBLIC_SUMUP_EMBEDDED), and always returns the member to Home, which
 * verifies the payment and then asks them to check in.
 */

const EMBEDDED = process.env.NEXT_PUBLIC_SUMUP_EMBEDDED === "true";

export type Product = "membership" | "daypass" | "rental";

interface EmbeddedState {
  checkoutId: string;
  amount: number;
  currency: string;
  email?: string;
  label: string;
}

function labelFor(product: Product, qty: number): string {
  if (product === "membership") return "Membership";
  const one = product === "daypass" ? "Day pass" : "Rental hour";
  const many = product === "daypass" ? "day passes" : "rental hours";
  return qty === 1 ? one : `${qty} ${many}`;
}

export function useCheckoutFlow(userId: string) {
  const [busy, setBusy] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<EmbeddedState | null>(null);

  async function start(product: Product, quantity = 1) {
    setError(null);
    setBusy(product);
    try {
      // Always come back to Home: it verifies payment, then prompts check-in.
      const returnUrl = `${window.location.origin}/dashboard2`;
      const res =
        product === "membership"
          ? await createMembershipCheckout(userId, returnUrl)
          : await createWalletCheckout(userId, product, quantity, returnUrl);

      if (!res.success) {
        setError(res.error || "We couldn't start the payment. Please try again.");
        return;
      }
      if (EMBEDDED) {
        setEmbedded({
          checkoutId: res.data.checkoutId,
          amount: res.data.amount,
          currency: res.data.currency,
          email: res.data.email,
          label: labelFor(product, quantity),
        });
      } else {
        window.location.href = res.data.url;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment checkout error");
    } finally {
      setBusy(null);
    }
  }

  /** Render this once in the component using the hook (null unless embedded). */
  const overlay = embedded ? (
    <EmbeddedCheckout
      checkoutId={embedded.checkoutId}
      amount={embedded.amount}
      currency={embedded.currency}
      email={embedded.email}
      onCancel={() => setEmbedded(null)}
      label={embedded.label}
      successTitle="Payment received"
      successBody={(_ref, auto) =>
        auto
          ? "You're all set, and you've been checked in automatically. Enjoy your session."
          : "You're all set. Tap below to check in for today."
      }
      doneHref="/dashboard2"
      doneLabel="Check in now"
      autoDoneLabel="Continue"
    />
  ) : null;

  return { start, busy, error, overlay };
}
