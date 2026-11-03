/**
 * Browser side of picture uploads. Every picture goes to /api/upload-image, which checks it, shrinks it and saves it as a
 * WebP before anything is stored. This file only makes big phone photos small enough to send (the hosting limit for a
 * request is 4.5 MB), so the server never has to be trusted with the original.
 */

/** Photos under this size are sent as they are; the server shrinks them. */
const SEND_AS_IS_BELOW = 500 * 1024;
/** What the server will accept in one request (a little under the 4.5 MB hosting limit). */
const MAX_SEND_BYTES = 4.4 * 1024 * 1024;

/** Draw a picture onto a canvas no wider than `maxSide` and save it. Returns null if the browser can't. */
async function downscale(file: File, maxSide: number, quality: number): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const toBlob = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
    // Some browsers (Safari on iPhone) can't save WebP from a canvas and quietly hand back a PNG instead. A PNG of a photo is
    // huge, so the result is checked and a JPEG is used when WebP didn't happen.
    let blob = await toBlob("image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", Math.max(quality, 0.82));
    if (!blob) return null;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], file.name.replace(/\.[^/.]+$/, "") + "." + ext, { type: blob.type });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Upload a picture. It is made smaller in the browser first if it is big, then the server reads it, shrinks it to fit
 * `maxWidth` pixels and stores it as a WebP. Resolves to the stored picture's address; throws an Error with a message
 * that can be shown to the person.
 */
export async function uploadOptimizedImage(file: File, options: { maxWidth?: number; quality?: number } = {}): Promise<{ url: string }> {
  const { maxWidth = 1600, quality = 0.8 } = options;

  let toSend: File = file;
  if (file.size >= SEND_AS_IS_BELOW) {
    // Leave some extra resolution for the server to work from; it makes the final, smaller copy.
    const small = await downscale(file, Math.round(maxWidth * 1.25), quality);
    if (small && small.size < file.size) toSend = small;
  }
  if (toSend.size > MAX_SEND_BYTES) throw new Error("That picture is too large to upload. Try a smaller photo.");

  const form = new FormData();
  form.append("file", toSend);
  form.append("maxWidth", String(maxWidth));

  const res = await fetch("/api/upload-image", { method: "POST", body: form });
  let body: { url?: string; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON: fall through to the generic message */
  }
  if (!res.ok || !body.url) throw new Error(body.error || "The upload didn't work. Please try again.");
  return { url: body.url };
}
