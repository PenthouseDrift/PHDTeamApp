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
  { brand: "Yokomo", model: "MD 1.0", internalRatio: 2.6 },
  { brand: "Yokomo", model: "MD 2.0", internalRatio: 2.6 },
  { brand: "Yokomo", model: "DPR (Standard)", internalRatio: 2.6 },
  { brand: "Yokomo", model: "DPR (FCD 1.8)", internalRatio: 1.8 },
  { brand: "Yokomo", model: "GR86 / Supra Body Kit", internalRatio: 2.6 },

  // MST
  { brand: "MST", model: "RMX 2.0 / 2.0S", internalRatio: 2.6, notes: "40T/13T internal" },
  { brand: "MST", model: "RMX 2.5 / 2.5S", internalRatio: 2.6 },
  { brand: "MST", model: "RMX 3.0", internalRatio: 2.6 },
  { brand: "MST", model: "RRX 2.0", internalRatio: 2.6 },
  { brand: "MST", model: "FXX 2.0 / FXX-D", internalRatio: 2.6, notes: "4WD" },
  { brand: "MST", model: "MRX GT", internalRatio: 2.6 },
  { brand: "MST", model: "XXX-D", internalRatio: 2.6, notes: "4WD" },
  { brand: "MST", model: "TCR-M", internalRatio: 2.6 },

  // Reve D
  { brand: "Reve D", model: "RDX", internalRatio: 2.6 },
  { brand: "Reve D", model: "MC-1", internalRatio: 2.6 },
  { brand: "Reve D", model: "M7-TA", internalRatio: 2.6 },

  // Team AD (Addiction)
  { brand: "Team AD", model: "AD-2", internalRatio: 2.6 },
  { brand: "Team AD", model: "AD RWD", internalRatio: 2.6 },

  // Rhino Racing
  { brand: "Rhino Racing", model: "RX-2", internalRatio: 2.6 },
  { brand: "Rhino Racing", model: "RX-3", internalRatio: 2.6 },

  // Overdose
  { brand: "Overdose", model: "GALM Ver.2 / 2+", internalRatio: 2.6 },
  { brand: "Overdose", model: "Vacula II", internalRatio: 2.6 },
  { brand: "Overdose", model: "XEX", internalRatio: 2.6 },
  { brand: "Overdose", model: "WELD", internalRatio: 2.6 },
  { brand: "Overdose", model: "OD2892 Divall", internalRatio: 2.6 },

  // D-Like
  { brand: "D-Like", model: "DL-01", internalRatio: 2.6 },
  { brand: "D-Like", model: "DL-02", internalRatio: 2.6 },
  { brand: "D-Like", model: "RE-R HYBRID", internalRatio: 2.6 },

  // Usukani
  { brand: "Usukani", model: "PDS", internalRatio: 2.6 },
  { brand: "Usukani", model: "PDSH", internalRatio: 2.6 },
  { brand: "Usukani", model: "D3T", internalRatio: 2.6 },

  // Wrap-Up Next
  { brand: "Wrap-Up Next", model: "VX-Dock", internalRatio: 2.6 },
  { brand: "Wrap-Up Next", model: "VX-Dock 2.0", internalRatio: 2.6 },
  { brand: "Wrap-Up Next", model: "FR-D V5", internalRatio: 2.6 },

  // RC Art
  { brand: "RC Art", model: "ART-J7", internalRatio: 2.6 },
  { brand: "RC Art", model: "SSR", internalRatio: 2.6 },

  // Sakura / 3Racing
  { brand: "3Racing", model: "Sakura D5", internalRatio: 1.9, notes: "Belt drive" },
  { brand: "3Racing", model: "Sakura D5S", internalRatio: 1.9, notes: "Belt drive" },
  { brand: "3Racing", model: "Sakura XI Sport", internalRatio: 2.0, notes: "Belt drive 4WD" },

  // R31 House
  { brand: "R31 House", model: "GRK Global Standard", internalRatio: 2.6 },
  { brand: "R31 House", model: "GRK5", internalRatio: 2.6 },

  // ReveD / Acuvance
  { brand: "Acuvance", model: "Xarvis XX", internalRatio: 2.6 },

  // ShibataRacing
  { brand: "Shibata Racing", model: "DR-03", internalRatio: 2.6 },

  // Awesomatix
  { brand: "Awesomatix", model: "A800R", internalRatio: 2.0, notes: "Belt drive" },
];

export const brands = [...new Set(chassisPresets.map(c => c.brand))].sort();
