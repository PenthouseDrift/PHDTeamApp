const SUMUP_API = "https://api.sumup.com/v0.1";

interface CreateCheckoutParams {
  memberId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
}

interface CheckoutResponse {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  status: string;
  hosted_checkout_url?: string;
}

export async function createCheckout(
  params: CreateCheckoutParams
): Promise<CheckoutResponse> {
  const response = await fetch(`${SUMUP_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUMUP_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkout_reference: `membership_${params.memberId}_${Date.now()}`,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      merchant_code: process.env.SUMUP_MERCHANT_CODE,
      redirect_url: params.returnUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`SumUp API error: ${response.status}`);
  }

  return response.json();
}
