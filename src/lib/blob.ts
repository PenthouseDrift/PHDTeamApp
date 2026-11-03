import { del } from "@vercel/blob";

// Uploads no longer go through here. Every picture a person uploads goes through /api/upload-image, which shrinks it and
// saves it as a WebP before it is stored (see src/lib/upload-client.ts). Only deleting is left.

export async function deleteImage(url: string): Promise<void> {
  await del(url);
}
