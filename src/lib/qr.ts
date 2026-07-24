import QRCode from "qrcode";
import crypto from "crypto";

export async function generateQRCode(
  memberId: string,
  type: "membership" | "day_pass" | "rental" = "membership",
  nonce?: string
): Promise<string> {
  const payloadObject: Record<string, unknown> = {
    memberId,
    type,
    version: 2,
  };

  if (type === "day_pass" || type === "rental") {
    payloadObject.nonce = nonce || crypto.randomUUID();
    payloadObject.timestamp = Date.now();
  }

  const payload = JSON.stringify(payloadObject);
  const dataUrl = await QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return dataUrl;
}

export async function generateQRCodeBuffer(
  memberId: string,
  type: "membership" | "day_pass" | "rental" = "membership",
  nonce?: string
): Promise<Buffer> {
  const payloadObject: Record<string, unknown> = {
    memberId,
    type,
    version: 2,
  };

  if (type === "day_pass" || type === "rental") {
    payloadObject.nonce = nonce || crypto.randomUUID();
    payloadObject.timestamp = Date.now();
  }

  const payload = JSON.stringify(payloadObject);
  return QRCode.toBuffer(payload, { width: 300, margin: 2 });
}
