const SUMUP_API = "https://api.sumup.com/v0.1";

interface CreateCheckoutParams {
  memberId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
}

export interface CheckoutResponse {
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
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey) {
    throw new Error("Missing SUMUP_API_KEY environment variable");
  }
  if (!merchantCode) {
    throw new Error("Missing SUMUP_MERCHANT_CODE environment variable");
  }

  // Clean member ID reference for SumUp reference constraint
  const cleanId = params.memberId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const checkoutRef = `phd_${cleanId}_${Date.now()}`;

  const payload: Record<string, unknown> = {
    checkout_reference: checkoutRef,
    amount: Number(params.amount.toFixed(2)),
    currency: params.currency.toUpperCase(),
    description: params.description.slice(0, 255),
    merchant_code: merchantCode,
    redirect_url: params.returnUrl,
    hosted_checkout: {
      enabled: true,
    },
  };

  const response = await fetch(`${SUMUP_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("SumUp createCheckout API Error:", response.status, errorText);
    throw new Error(`SumUp API Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

export async function getCheckoutStatus(
  checkoutId: string
): Promise<CheckoutResponse | null> {
  try {
    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) return null;

    const response = await fetch(`${SUMUP_API}/checkouts/${checkoutId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (err) {
    console.error("getCheckoutStatus error:", err);
    return null;
  }
}
