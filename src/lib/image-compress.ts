/** A problem with an uploaded picture that is safe to show the person who uploaded it. */
export class ImageUploadError extends Error {}

/** Pictures with more pixels than this are refused, so a tiny file can't expand into a huge image in memory. */
const MAX_INPUT_PIXELS = 100_000_000;

/**
 * Prepare a picture someone uploaded for storage: check it really is a JPEG, PNG or WebP (by reading it, not by trusting its
 * name or type), turn it the right way up using its camera orientation, shrink it to fit inside `maxWidth` x `maxWidth`, and
 * save it as a WebP. Saving as WebP also drops the camera details, including where a photo was taken.
 * Throws ImageUploadError for anything that can't be read.
 */
export async function optimizeUpload(
  input: Buffer,
  options: { maxWidth?: number; quality?: number } = {}
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { maxWidth = 1600, quality = 80 } = options;
  // Outside the try on purpose: if sharp itself can't load, that is a server problem (reported as a failed upload and
  // logged), not "that image couldn't be read".
  const sharp = (await import("sharp")).default;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      throw new ImageUploadError("Please upload a JPEG, PNG or WebP image.");
    }
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    console.error("[image-compress] could not read an uploaded picture:", error);
    throw new ImageUploadError("That image couldn't be read. Try a different photo.");
  }
}

/**
 * Shrink a picture to a card-sized WebP. Card art is shown at about 900 pixels wide at most, and a WebP of that size is
 * roughly 60 to 100 KB where the raw PNG the image model returns is about 2 MB, so every picture we keep goes through here.
 *
 * `sharp` is imported with a plain `import()` on purpose. Next.js and Vercel decide which files a server function needs by
 * reading its imports, so an import hidden behind `new Function(...)` is never found, `sharp` is left out of the deployed
 * function, and every picture was silently saved as a full-size PNG instead.
 *
 * Returns null (after logging why) if the picture can't be converted, so the caller can still keep the original.
 */
export async function compressToWebp(
  input: Buffer,
  options: { width?: number; quality?: number } = {}
): Promise<{ buffer: Buffer; mime: "image/webp" } | null> {
  const { width = 900, quality = 82 } = options;
  try {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer();
    return { buffer, mime: "image/webp" };
  } catch (error) {
    console.error("[image-compress] could not convert a picture to WebP, keeping the original:", error);
    return null;
  }
}
