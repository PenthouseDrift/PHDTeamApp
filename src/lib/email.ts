import { Resend } from "resend";

/**
 * Email sending via Resend. Server-only. Requires:
 *   - RESEND_API_KEY — your Resend API key
 *   - EMAIL_FROM     — a verified sender, e.g. "Penthouse Drift <orders@penthousedrift.com>"
 *
 * Sending is best-effort: callers (e.g. the payment finalizer) must NOT fail
 * the surrounding operation if an email can't be sent. `sendEmail` therefore
 * returns a boolean and never throws.
 */

const FALLBACK_FROM = "Penthouse Drift <onboarding@resend.dev>";

let client: Resend | null = null;
function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback; derived from html if omitted. */
  text?: string;
}

/** Send an email. Returns true on success, false on any failure (never throws). */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", params.to);
    return false;
  }
  if (!params.to) {
    console.warn("[email] No recipient — skipping email");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || FALLBACK_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || stripHtml(params.html),
    });
    if (error) {
      console.error("[email] Resend returned an error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return false;
  }
}

/** Crude HTML → text fallback for the plain-text part. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Templates ───────────────────────────────────────────────────────────────

export interface OrderConfirmationLine {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderConfirmationParams {
  buyerName: string;
  orderId: string;
  items: OrderConfirmationLine[];
  totalAmount: number;
  currency: string;
}

function formatMoney(amount: number, currency: string): string {
  const symbol = currency.toUpperCase() === "GBP" ? "£" : `${currency.toUpperCase()} `;
  return `${symbol}${amount.toFixed(2)}`;
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the Click & Collect order confirmation email. Includes the order ID and
 * instructions to speak to a staff member at Penthouse Drift to collect.
 */
export function renderOrderConfirmation(params: OrderConfirmationParams): {
  subject: string;
  html: string;
} {
  const shortId = params.orderId.slice(0, 8).toUpperCase();
  const rows = params.items
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eeeeee;color:#111827;font-size:14px;font-family:Arial,Helvetica,sans-serif;">
            ${escapeHtml(i.name)}${i.quantity > 1 ? ` <span style="color:#6b7280;">&times; ${i.quantity}</span>` : ""}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eeeeee;color:#111827;font-size:14px;text-align:right;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;">
            ${formatMoney(i.price * i.quantity, params.currency)}
          </td>
        </tr>`
    )
    .join("");

  // Email-client-safe: table-based layout, solid colours (no CSS gradients,
  // which Outlook/Hotmail strip), light background with amber brand accent.
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#f59e0b;padding:22px 28px;">
              <h1 style="margin:0;color:#111827;font-size:20px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Penthouse Drift</h1>
              <p style="margin:4px 0 0;color:#111827;font-size:13px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Click &amp; Collect order confirmed</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 20px;color:#111827;font-size:15px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
                Thanks ${escapeHtml(params.buyerName)}, your payment was successful and your order is reserved.
              </p>

              <!-- Order reference -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 4px;color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-family:Arial,Helvetica,sans-serif;">Order reference</p>
                    <p style="margin:0;color:#b45309;font-size:24px;font-weight:bold;letter-spacing:0.06em;font-family:Arial,Helvetica,sans-serif;">${shortId}</p>
                  </td>
                </tr>
              </table>

              <!-- Items -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
                ${rows}
                <tr>
                  <td style="padding:14px 0 0;color:#111827;font-weight:bold;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Total paid</td>
                  <td style="padding:14px 0 0;color:#111827;font-weight:bold;font-size:15px;text-align:right;font-family:Arial,Helvetica,sans-serif;">
                    ${formatMoney(params.totalAmount, params.currency)}
                  </td>
                </tr>
              </table>

              <!-- How to collect -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-top:24px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 6px;color:#b45309;font-size:14px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">How to collect</p>
                    <p style="margin:0;color:#374151;font-size:14px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
                      Speak to a member of staff at Penthouse Drift and quote your order reference
                      <strong style="color:#111827;">${shortId}</strong> to collect your order.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;">
                If you have any questions, just ask a staff member at the track. This is an automated
                confirmation &mdash; please keep it for your records.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `Your Penthouse Drift order ${shortId} is confirmed`, html };
}
