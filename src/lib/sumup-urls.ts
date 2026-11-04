/**
 * Where a buyer pays for a SumUp checkout on SumUp's own page (the page Apple Pay and Google Pay open). SumUp returns it
 * as `hosted_checkout_url` when a checkout is created. If that is ever missing, it is built the same way SumUp builds it:
 * https://checkout.sumup.com/pay/c-<checkout id> (checked against SumUp for every recent checkout).
 *
 * The old fallback, https://pay.sumup.com/b2c/Q<checkout id>, is not a real address and gives a 404. That is the page
 * Apple Pay opened for anyone whose checkout didn't pass the real address along.
 */
export function hostedCheckoutUrl(checkoutId: string, hostedUrl?: string | null): string {
  if (hostedUrl) return hostedUrl;
  return checkoutId ? `https://checkout.sumup.com/pay/c-${checkoutId}` : "";
}
