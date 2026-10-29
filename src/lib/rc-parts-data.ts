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
      Acuvance: [
        "Fledge",
        "Fledge 10.5T",
        "Fledge 13.5T",
        "Fledge (with Fan)",
        "Agile",
        "Luxon BS Dual",
        "Luxon KG",
        "Luce",
      ],
      Hobbywing: [
        "XeRun D10",
        "XeRun V10 G3",
        "XeRun V10 G4",
        "XeRun Justock 3650 SD G2",
        "XeRun Justock 3650 SD G3",
      ],
      OMG: [
        "Predator D-Run",
        "Predator D-Run V2",
        "D-Run 10.5T",
        "D-Run 13.5T",
        "OMG-Epic",
        "Blitz 540",
      ],
      Reedy: ["Sonic 540-FT"],
      Tekin: ["Redline Gen3"],
      Yokomo: [
        "Racing Performer DX-1 Type-R",
        "Racing Performer DX-1 Type-T",
        "Racing Performer M4",
        "Zero 2 Brushless",
        "Zero-S Drift Spec",
        "D1 Series Brushless",
      ],
    },
  },
  {
    key: "esc",
    label: "ESC",
    catalog: {
      Acuvance: [
        "Xarvis XX",
        "Xarvis",
        "RAD",
        "Tachyon PK",
        "Tachyon Airia",
        "Ne-St",
      ],
      Futaba: ["MC970CR", "MC971CR", "MC402CR"],
      Hobbywing: [
        "XeRun XD10 Pro",
        "XeRun XD10",
        "XeRun XR10 Justock",
        "XeRun XR10 Pro G2",
        "XeRun XR10 Pro G3",
        "XeRun XR10 Pro Legacy",
      ],
      Muchmore: ["Fleta ZX V2"],
      OMG: [
        "Polaris DR-120AX",
        "Polaris DR-160AX",
        "Polaris DR-60AX",
        "OMG-ESC 120A",
      ],
      Reedy: ["Blackbox 410R"],
      Sanwa: [
        "Super Vortex Gen2 PRO",
        "Super Vortex PLUS Type-D",
        "Super Vortex Gen2",
        "Super Vortex Stock",
        "SV-Plus Zero",
      ],
      SkyRC: ["Toro TS120"],
      Tekin: ["RSX", "RSX Pro"],
      Yokomo: [
        "BL-PRO4",
        "BL-PRO4D (Drift Spec)",
        "BL-RS4",
        "BL-RS4D (Drift Spec)",
        "BL-SP4",
        "Racing Performer RPX II",
        "Racing Performer RPX 3",
        "BL-EP6",
      ],
    },
  },
  {
    key: "gyro",
    label: "Gyro",
    catalog: {
      Futaba: ["GYD550", "GYD560", "GYC480", "GYC470", "GY450"],
      OMG: [
        "OMG V4 Gyro",
        "OMG V3 Gyro",
        "OMG D2 Gyro",
        "OMG-G4 Drift Gyro",
        "OMG Gyro",
      ],
      Onisinki: ["Onisinki Gyro"],
      Overdose: ["DAIS"],
      "Power HD": ["G1"],
      "Reve D": ["REVOX"],
      Sanwa: ["SGS-02", "SGS-01D", "SGS-01C"],
      Yokomo: ["DP-302 V4", "DP-302", "YG-302", "RPG-302"],
    },
  },
  {
    key: "servo",
    label: "Servo",
    catalog: {
      Futaba: [
        "HPS-CT700",
        "HPS-CT701",
        "HPS-CT702",
        "HPS-CD700 (Drift Spec)",
        "CT700",
        "CT701",
        "CT702",
        "CT500",
        "S9570SV",
        "BLS571SV",
        "BLS551",
      ],
      OMG: [
        "Predator LP-BF07S",
        "D1-LP-BF07S",
        "D2-LP-BF07S",
        "D3-LP-BF07S",
        "OMG-ST-30BF",
        "HD-T90 Low Profile",
        "LP-BF07S High Speed Drift Servo",
      ],
      "Power HD": ["S15", "GTS-3", "GTS-5", "GTS-7", "Storm-7", "R12"],
      "Reve D": ["RS-ST", "RS-ST Pro"],
      Sanwa: [
        "PGS-LH",
        "PGS-LH II",
        "PGS-CL",
        "PGS-CL II",
        "PGS-CX",
        "PGS-HR",
        "SRG-BLS",
        "SDX-801",
        "ERB-871",
      ],
      Savox: ["SC-1258TG", "SC-1251MG", "SB-2263MG", "SB-2292SG"],
      Yokomo: [
        "SP-03D",
        "SP-03D V2",
        "SP-02D",
        "SP-02D V2",
        "BL-LHV",
        "BL-LHV Drift Spec",
      ],
    },
  },
  {
    key: "controller",
    label: "Controller",
    catalog: {
      Flysky: ["Noble NB4", "Noble NB4 Pro", "Noble NB4+", "GT5", "GT3C"],
      Futaba: [
        "10PX",
        "7PXR",
        "7PX",
        "4PM Plus",
        "4PM",
        "4PV",
        "4PX",
        "4PLS",
        "3PV",
        "3PL",
      ],
      Radiolink: ["RC4GS V3", "RC6GS V3", "RC8X"],
      Sanwa: [
        "M17",
        "M12S",
        "M12S-RS",
        "M12",
        "MT-5",
        "MT-44",
        "MT-S",
        "MT-4S",
        "MT-4",
        "MX-6",
        "Exzes ZZ",
      ],
      Spektrum: ["DX5 Pro", "DX5 Rugged", "DX6R", "DX3"],
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
  return PART_KEYS.map((k) => parts[k]?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Split a saved "Brand Model" value back into the picker's brand, model and custom text. */
export function splitPart(category: PartCategory, value: string): { brand: string; model: string; custom: string } {
  const v = value.trim();
  if (!v) return { brand: "", model: "", custom: "" };

  // Common aliases so alternative spellings map directly to the canonical catalog brand
  const normalizedValue = v.replace(/^accuvance\s+/i, "Acuvance ");

  for (const [brand, models] of Object.entries(category.catalog)) {
    if (normalizedValue.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
      const rest = normalizedValue.slice(brand.length + 1).trim();
      const matched = models.find((m) => m.toLowerCase() === rest.toLowerCase());
      return matched ? { brand, model: matched, custom: "" } : { brand, model: OTHER, custom: rest };
    }
  }
  return { brand: OTHER, model: "", custom: v };
}

/** The value used by the pickers for "Other / not listed". */
export const OTHER = "__other__";
