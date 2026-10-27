/**
 * RC drift electronics members can pick on the card pack "Parts" step: motor, ESC, gyro, servo and
 * controller. Each part is a brand plus a model. The lists cover popular drift gear, and every part
 * also has an "Other" option for anything not listed, so nobody is stuck.
 */

export type PartKey = "motor" | "esc" | "gyro" | "servo" | "controller";

export interface PartCategory {
  key: PartKey;
  label: string;
  /** Brand -> models. */
  catalog: Record<string, string[]>;
}

export const PART_CATEGORIES: PartCategory[] = [
  {
    key: "motor",
    label: "Motor",
    catalog: {
      Acuvance: ["Luce"],
      Hobbywing: ["XeRun V10 G3", "XeRun V10 G4", "XeRun Justock 3650 SD G2", "XeRun Justock 3650 SD G3"],
      Reedy: ["Sonic 540-FT"],
      Tekin: ["Redline Gen3"],
    },
  },
  {
    key: "esc",
    label: "ESC",
    catalog: {
      Acuvance: ["Xarvis XX", "Xarvis"],
      Hobbywing: ["XeRun D10", "XeRun XR10 Justock", "XeRun XR10 Pro G2", "XeRun XR10 Pro G3", "XeRun XR10 Pro Legacy"],
      Muchmore: ["Fleta ZX V2"],
      Reedy: ["Blackbox 410R"],
      SkyRC: ["Toro TS120"],
      Tekin: ["RSX", "RSX Pro"],
    },
  },
  {
    key: "gyro",
    label: "Gyro",
    catalog: {
      Futaba: ["GYC480", "GYD550", "GYD560"],
      "Power HD": ["G1"],
      "Reve D": ["REVOX"],
      Yokomo: ["DP-302", "DP-302 V4", "YG-302"],
    },
  },
  {
    key: "servo",
    label: "Servo",
    catalog: {
      "Reve D": ["RS-ST", "RS-ST Pro"],
      Savox: ["SC-1258TG"],
      Yokomo: ["SP-02D V2"],
    },
  },
  {
    key: "controller",
    label: "Controller",
    catalog: {
      Flysky: ["Noble NB4", "GT5"],
      Futaba: ["3PV", "4PM", "4PM Plus", "4PV", "4PX", "7PX", "7PXR"],
      Radiolink: ["RC4GS V3", "RC6GS V3"],
      Sanwa: ["Exzes ZZ", "M12S", "M17", "MT-44", "MT-S"],
      Spektrum: ["DX5 Pro", "DX5 Rugged", "DX6R"],
    },
  },
];

export const PART_KEYS: PartKey[] = PART_CATEGORIES.map((c) => c.key);

export type PartValues = Record<PartKey, string>;

export const emptyParts = (): PartValues => ({ motor: "", esc: "", gyro: "", servo: "", controller: "" });

/** The longest line the card's effect text can hold. */
export const PARTS_LINE_MAX = 160;

/** The brand/model parts as one card line, e.g. "Hobbywing XeRun V10 G4 · Acuvance Xarvis XX · Futaba 4PM". */
export function composeParts(parts: PartValues): string {
  return PART_KEYS.map((k) => parts[k].replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Split a saved "Brand Model" value back into the picker's brand, model and custom text. */
export function splitPart(category: PartCategory, value: string): { brand: string; model: string; custom: string } {
  const v = value.trim();
  if (!v) return { brand: "", model: "", custom: "" };
  for (const [brand, models] of Object.entries(category.catalog)) {
    if (v.startsWith(`${brand} `)) {
      const rest = v.slice(brand.length + 1);
      return models.includes(rest) ? { brand, model: rest, custom: "" } : { brand, model: OTHER, custom: rest };
    }
  }
  return { brand: OTHER, model: "", custom: v };
}

/** The value used by the pickers for "Other / not listed". */
export const OTHER = "__other__";
