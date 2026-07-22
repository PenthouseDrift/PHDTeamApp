export interface ChassisPreset {
  brand: string;
  model: string;
  internalRatio: number;
  notes?: string;
}

export const chassisPresets: ChassisPreset[] = [
  // Yokomo
  { brand: "Yokomo", model: "YD-2 Series (Standard)", internalRatio: 2.6, notes: "4-gear transmission" },
  { brand: "Yokomo", model: "YD-2 (FCD 1.8)", internalRatio: 1.8, notes: "With FCD 1.8 gear" },
  { brand: "Yokomo", model: "YD-2 (FCD 2.0)", internalRatio: 2.0, notes: "With FCD 2.0 gear" },
  { brand: "Yokomo", model: "RD 2.0", internalRatio: 2.6 },
  { brand: "Yokomo", model: "SD 2.0", internalRatio: 2.6 },
  { brand: "Yokomo", model: "DPR (Standard)", internalRatio: 2.6 },
  { brand: "Yokomo", model: "DPR (FCD 1.8)", internalRatio: 1.8 },

  // MST
  { brand: "MST", model: "RMX 2.0 / 2.0S", internalRatio: 2.6, notes: "40T/13T internal gears" },
  { brand: "MST", model: "RMX 2.5 / 2.5S", internalRatio: 2.6 },
  { brand: "MST", model: "RRX 2.0", internalRatio: 2.6 },
  { brand: "MST", model: "FXX 2.0", internalRatio: 2.6, notes: "4WD" },
  { brand: "MST", model: "MRX GT", internalRatio: 2.6 },

  // Reve D
  { brand: "Reve D", model: "RDX", internalRatio: 2.6 },
  { brand: "Reve D", model: "MC-1", internalRatio: 2.6 },

  // Team AD (Addiction)
  { brand: "Team AD", model: "AD-2", internalRatio: 2.6 },

  // Rhino Racing
  { brand: "Rhino Racing", model: "RX-2", internalRatio: 2.6 },

  // Overdose
  { brand: "Overdose", model: "GALM Ver.2 / 2+", internalRatio: 2.6 },
  { brand: "Overdose", model: "Vacula II", internalRatio: 2.6 },
  { brand: "Overdose", model: "XEX", internalRatio: 2.6 },

  // Others
  { brand: "Usukani", model: "PDS / PDSH", internalRatio: 2.6 },
  { brand: "Wrap-Up Next", model: "VX-Dock", internalRatio: 2.6 },
  { brand: "RC Art", model: "ART-J / SSR", internalRatio: 2.6 },
  { brand: "Sakura", model: "D5 / D5S", internalRatio: 1.9, notes: "Belt drive" },
  { brand: "3Racing", model: "Sakura D5S", internalRatio: 1.9, notes: "Belt drive" },
];

export const brands = [...new Set(chassisPresets.map(c => c.brand))];
