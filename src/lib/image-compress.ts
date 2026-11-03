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
