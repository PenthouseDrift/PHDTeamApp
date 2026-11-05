/**
 * Colours for a Tandem Tour track. Every track name gets its own tint, picked from a hash of the name, so the same track
 * always looks the same and different tracks feel different. Pure code.
 */

export interface Theme {
  /** Hue (0 to 360) the scenery is tinted with. */
  hue: number;
  grass: string;
  grassDark: string;
  road: string;
  roadDark: string;
  line: string;
  skyTop: string;
  skyBottom: string;
  hillFar: string;
  hillNear: string;
  tree: string;
  treeDark: string;
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function themeFor(trackName: string): Theme {
  const hue = hashString(trackName) % 360;
  const glow = 14 + (hue % 30);
  return {
    hue,
    grass: `hsl(${hue}, 30%, 25%)`,
    grassDark: `hsl(${hue}, 32%, 20%)`,
    road: "#2d2e35",
    roadDark: "#292a30",
    line: "rgba(255,255,255,0.7)",
    skyTop: "hsl(238, 46%, 15%)",
    skyBottom: `hsl(${glow}, 88%, 58%)`,
    hillFar: "hsl(258, 26%, 27%)",
    hillNear: `hsl(${hue}, 28%, 17%)`,
    tree: `hsl(${hue}, 38%, 22%)`,
    treeDark: `hsl(${hue}, 40%, 15%)`,
  };
}
