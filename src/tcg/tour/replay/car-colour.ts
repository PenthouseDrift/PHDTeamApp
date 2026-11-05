/**
 * Works out a body colour for the member's car from its card picture, so the car on the road matches the card they chose.
 * Browser only. If the picture can't be read (it won't load, or the host doesn't allow reading it) the caller keeps the
 * rarity colour from `tierColour`.
 */

export const TIER_COLOUR: Record<string, string> = {
  bronze: "#c2410c",
  silver: "#94a3b8",
  gold: "#f59e0b",
  legend: "#a855f7",
  mythic: "#ef4444",
};

export function tierColour(tier: string | undefined): string {
  return (tier && TIER_COLOUR[tier]) || "#f59e0b";
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** The main colour of the car in the picture as "#rrggbb", or null when it can't be read. */
export function carColourFromImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!url || typeof document === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        // The car sits in the middle of the card picture, so look there and ignore the edges.
        const sw = img.naturalWidth * 0.6;
        const sh = img.naturalHeight * 0.6;
        ctx.drawImage(img, img.naturalWidth * 0.2, img.naturalHeight * 0.25, sw, sh, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Vote for a hue, weighting strong colours, so a red car on a grey road comes out red.
        const buckets = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lumSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          lumSum += l;
          const d = max - min;
          const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
          if (s < 0.4 || l < 0.18 || l > 0.82) continue;
          let hue: number;
          if (max === r) hue = ((g - b) / d + 6) % 6;
          else if (max === g) hue = (b - r) / d + 2;
          else hue = (r - g) / d + 4;
          const bucket = buckets[Math.floor((hue / 6) * 24) % 24];
          const wgt = s * (1 - Math.abs(2 * l - 1));
          bucket.weight += wgt;
          bucket.r += data[i] * wgt;
          bucket.g += data[i + 1] * wgt;
          bucket.b += data[i + 2] * wgt;
        }
        const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
        const pixels = size * size;
        if (best.weight > pixels * 0.06) {
          return resolve(`#${toHex(best.r / best.weight)}${toHex(best.g / best.weight)}${toHex(best.b / best.weight)}`);
        }
        // No strong colour: a black, white or grey car.
        const lum = lumSum / pixels;
        resolve(lum < 0.3 ? "#1f2430" : lum > 0.62 ? "#e5e7eb" : "#8b93a1");
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
