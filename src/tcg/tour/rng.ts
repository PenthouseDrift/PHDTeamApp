/**
 * A small seeded random number generator, so the same seed always gives the same Round.
 * It is not for security: the seed itself is a secret kept on the server (see actions.ts).
 */

export type Rng = () => number;

/** Turn any string into a 32-bit seed (xmur3). */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A generator in [0, 1) from a seed string (mulberry32). */
export function makeRng(seed: string): Rng {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Whole number from min to max, both included. */
export function between(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}
