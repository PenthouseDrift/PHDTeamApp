import QRCode from "qrcode";

export async function generateQRCode(memberId: string): Promise<string> {
  const payload = JSON.stringify({ memberId, version: 1 });
  const dataUrl = await QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return dataUrl;
}

export async function generateQRCodeBuffer(memberId: string): Promise<Buffer> {
  const payload = JSON.stringify({ memberId, version: 1 });
  return QRCode.toBuffer(payload, { width: 300, margin: 2 });
}
