export interface ChassisPreset {
  brand: string;
  model: string;
  internalRatio: number;
  notes?: string;
}

export const chassisPresets: ChassisPreset[] = [

  // ─── Yokomo ──────────────────────────────────────────────────────────────────
  // YD-2 Classic Series
  { brand: "Yokomo", model: "YD-2", internalRatio: 2.6, notes: "Original 4-gear RWD" },
  { brand: "Yokomo", model: "YD-2G", internalRatio: 2.6, notes: "With gyro" },
  { brand: "Yokomo", model: "YD-2 Plus", internalRatio: 2.6 },
  { brand: "Yokomo", model: "YD-2 EX", internalRatio: 2.6 },

  // YD-2 E-Series (LCG)
  { brand: "Yokomo", model: "YD-2E", internalRatio: 2.6, notes: "LCG low centre gravity" },
  { brand: "Yokomo", model: "YD-2EG", internalRatio: 2.6, notes: "LCG with gyro" },
  { brand: "Yokomo", model: "YD-2ES", internalRatio: 2.6, notes: "LCG S-spec" },
  { brand: "Yokomo", model: "YD-2E Plus", internalRatio: 2.6, notes: "LCG Plus" },
  { brand: "Yokomo", model: "YD-2EXII", internalRatio: 2.6, notes: "LCG EX Mk2" },
  { brand: "Yokomo", model: "YD-2EX Final", internalRatio: 2.6, notes: "LCG EX Final Version" },

  // YD-2 S-Series (VRM / laydown 4-gear)
  { brand: "Yokomo", model: "YD-2S", internalRatio: 2.6, notes: "High motor mount" },
  { brand: "Yokomo", model: "YD-2SG", internalRatio: 2.6, notes: "High motor mount with gyro" },
  { brand: "Yokomo", model: "YD-2SS", internalRatio: 2.6, notes: "High motor SS-spec" },
  { brand: "Yokomo", model: "YD-2S Plus", internalRatio: 2.6, notes: "High motor Plus" },
  { brand: "Yokomo", model: "YD-2SX", internalRatio: 2.6, notes: "High motor SX" },
  { brand: "Yokomo", model: "YD-2SX II", internalRatio: 2.6, notes: "High motor SX Mk2" },
  { brand: "Yokomo", model: "YD-2SX III", internalRatio: 2.6, notes: "High motor SX Mk3" },
  { brand: "Yokomo", model: "YD-2SXIII FO", internalRatio: 2.6, notes: "Full Option pre-built" },

  // YD-2 with FCD gears
  { brand: "Yokomo", model: "YD-2 (FCD 1.8)", internalRatio: 1.8, notes: "FCD 1.8 reduction gear" },
  { brand: "Yokomo", model: "YD-2 (FCD 2.0)", internalRatio: 2.0, notes: "FCD 2.0 reduction gear" },

  // YD-2 Z & R Series
  { brand: "Yokomo", model: "YD-2Z", internalRatio: 2.6, notes: "Mid-range versatile" },
  { brand: "Yokomo", model: "YD-2R", internalRatio: 2.6, notes: "Rear motor 3-gear — high grip" },
  { brand: "Yokomo", model: "YD-2RX", internalRatio: 2.6, notes: "Rear motor RX — high grip" },
  { brand: "Yokomo", model: "YD-2RX Full Option", internalRatio: 2.6, notes: "Rear motor FO pre-built" },

  // RD Series (Rookie Drift)
  { brand: "Yokomo", model: "RD 1.0", internalRatio: 2.6, notes: "Beginner — YD-2Z based" },
  { brand: "Yokomo", model: "RD 2.0", internalRatio: 2.6, notes: "Beginner — updated gearbox" },

  // SD Series (Super Drift)
  { brand: "Yokomo", model: "SD 2.0", internalRatio: 2.6, notes: "High performance competition" },
  { brand: "Yokomo", model: "SD 3.0", internalRatio: 2.6, notes: "Double-deck graphite — competition" },

  // MD Series (Master Drift / Flagship)
  { brand: "Yokomo", model: "MD 1.0", internalRatio: 2.6, notes: "Flagship — aluminium/graphite" },
  { brand: "Yokomo", model: "MD 2.0", internalRatio: 2.6, notes: "Flagship Mk2" },
  { brand: "Yokomo", model: "MD 3.0", internalRatio: 2.6, notes: "Flagship — rear belt drive" },

  // DPR Series
  { brand: "Yokomo", model: "DPR (Standard)", internalRatio: 2.6 },
  { brand: "Yokomo", model: "DPR (FCD 1.8)", internalRatio: 1.8, notes: "FCD 1.8 gear" },

  // ─── MST ─────────────────────────────────────────────────────────────────────
  // RMX Series
  { brand: "MST", model: "RMX-D", internalRatio: 2.6, notes: "Original RMX platform" },
  { brand: "MST", model: "RMX 2.0", internalRatio: 3.08, notes: "Kit spec 40T/13T" },
  { brand: "MST", model: "RMX 2.0 RTR", internalRatio: 2.12, notes: "RTR spec" },
  { brand: "MST", model: "RMX 2.0S", internalRatio: 3.08, notes: "S-spec kit" },
  { brand: "MST", model: "RMX 2.5", internalRatio: 3.0, notes: "Refined transmission" },
  { brand: "MST", model: "RMX 2.5S", internalRatio: 3.0, notes: "2.5 S-spec" },
  { brand: "MST", model: "RMX 3.0", internalRatio: 2.6, notes: "High-end KMW competition" },
  { brand: "MST", model: "RMX 3.0 KMW", internalRatio: 2.6, notes: "Limited KMW edition" },
  { brand: "MST", model: "RMX 4", internalRatio: 2.6, notes: "Modular subframe — adj. wheelbase" },
  { brand: "MST", model: "RMX 4 S PRO", internalRatio: 2.6, notes: "Pro spec — modular subframe" },
  { brand: "MST", model: "RMX EX", internalRatio: 2.6, notes: "High-performance EX variant" },
  { brand: "MST", model: "RMX-M", internalRatio: 2.6, notes: "M-chassis short wheelbase drift" },

  // FXX Series
  { brand: "MST", model: "FXX-D", internalRatio: 2.6, notes: "Front motor 4WD" },
  { brand: "MST", model: "FXX-D VIP", internalRatio: 2.6, notes: "Front motor VIP 4WD" },
  { brand: "MST", model: "FXX 2.0", internalRatio: 2.6, notes: "Front motor 4WD Mk2" },
  { brand: "MST", model: "FXX 2.0S", internalRatio: 2.6, notes: "Front motor S-spec" },
  { brand: "MST", model: "FXX 2.0 KMW", internalRatio: 2.6, notes: "Front motor KMW limited edition" },

  // RRX Series
  { brand: "MST", model: "RRX 2.0", internalRatio: 2.6, notes: "Rear motor pendulum feel" },

  // XXX / Older
  { brand: "MST", model: "XXX-D", internalRatio: 2.6, notes: "Classic 4WD drift platform" },
  { brand: "MST", model: "MRX GT", internalRatio: 2.6, notes: "High-end RWD" },
  { brand: "MST", model: "TCR-M", internalRatio: 2.6, notes: "Touring/drift" },

  // ─── Reve D ──────────────────────────────────────────────────────────────────
  { brand: "Reve D", model: "RDX", internalRatio: 2.6, notes: "4-gear graphite composite" },
  { brand: "Reve D", model: "MC-1", internalRatio: 2.6, notes: "Carbon conversion — YD-2 based" },
  { brand: "Reve D", model: "M7-TA", internalRatio: 2.6, notes: "Competition spec" },
  { brand: "Reve D", model: "RM-01", internalRatio: 2.6, notes: "Competition RWD" },

  // ─── Overdose ────────────────────────────────────────────────────────────────
  { brand: "Overdose", model: "GALM Ver.2", internalRatio: 2.6, notes: "Belt drive flagship" },
  { brand: "Overdose", model: "GALM Ver.2 Anti+", internalRatio: 2.6, notes: "Lightweight / rigid iteration" },
  { brand: "Overdose", model: "GALM Ver.3", internalRatio: 2.6, notes: "Current flagship — CNC precision" },
  { brand: "Overdose", model: "Vacula II", internalRatio: 2.6, notes: "Legacy rear midship motor" },
  { brand: "Overdose", model: "Vacula IIRS", internalRatio: 2.6, notes: "Shockless spec" },
  { brand: "Overdose", model: "Vacula IIAD", internalRatio: 2.6, notes: "AD tuned spec" },
  { brand: "Overdose", model: "XEX", internalRatio: 2.6, notes: "Legacy highly adjustable" },
  { brand: "Overdose", model: "WELD", internalRatio: 2.6, notes: "Competition grade" },
  { brand: "Overdose", model: "Divall", internalRatio: 2.6, notes: "Legacy centre motor layout" },

  // ─── 3Racing / Sakura ────────────────────────────────────────────────────────
  { brand: "3Racing", model: "Sakura D5", internalRatio: 3.0, notes: "Belt drive" },
  { brand: "3Racing", model: "Sakura D5S", internalRatio: 3.0, notes: "Belt drive S-spec" },
  { brand: "3Racing", model: "Sakura D5MR", internalRatio: 2.6, notes: "Gear drive" },
  { brand: "3Racing", model: "Sakura D6 (Idler 2.6)", internalRatio: 2.6, notes: "Idler gear — large track" },
  { brand: "3Racing", model: "Sakura D6 (Belt 2.71)", internalRatio: 2.71, notes: "Belt drive — medium track" },
  { brand: "3Racing", model: "Sakura D6 (Bevel 3.0)", internalRatio: 3.0, notes: "Bevel gear — small/slippy" },
  { brand: "3Racing", model: "Sakura D6 Sport", internalRatio: 2.71, notes: "Sport kit — belt drive" },
  { brand: "3Racing", model: "Sakura XI Sport", internalRatio: 2.0, notes: "Belt drive 4WD" },

  // ─── Wrap-Up Next ────────────────────────────────────────────────────────────
  { brand: "Wrap-Up Next", model: "VX-Dock", internalRatio: 2.6, notes: "Modular front-end system" },
  { brand: "Wrap-Up Next", model: "VX-Dock 2.0", internalRatio: 2.6, notes: "Modular front-end Mk2" },
  { brand: "Wrap-Up Next", model: "VX-Dock Zero", internalRatio: 2.6, notes: "Latest VX modular iteration" },
  { brand: "Wrap-Up Next", model: "FR-D", internalRatio: 2.6, notes: "Front motor RWD — classic" },
  { brand: "Wrap-Up Next", model: "FR-D V5", internalRatio: 2.6, notes: "Front motor V5" },
  { brand: "Wrap-Up Next", model: "FR-D7 Core", internalRatio: 2.6, notes: "Front motor — adj. wheelbase" },

  // ─── RC Art ──────────────────────────────────────────────────────────────────
  { brand: "RC Art", model: "ART-J7", internalRatio: 2.6 },
  { brand: "RC Art", model: "SSR", internalRatio: 2.6, notes: "Competition spec" },
  { brand: "RC Art", model: "SSR-X", internalRatio: 2.6, notes: "Extended competition spec" },

  // ─── D-Like ──────────────────────────────────────────────────────────────────
  { brand: "D-Like", model: "DL-01", internalRatio: 2.6 },
  { brand: "D-Like", model: "DL-02", internalRatio: 2.6 },
  { brand: "D-Like", model: "RE-R Hybrid", internalRatio: 2.6, notes: "Modular pulley system" },
  { brand: "D-Like", model: "RE-R Hybrid (Belt)", internalRatio: 2.6, notes: "Belt pulley config" },

  // ─── Usukani ─────────────────────────────────────────────────────────────────
  { brand: "Usukani", model: "PDS", internalRatio: 2.6, notes: "Check manual — proprietary ratio" },
  { brand: "Usukani", model: "PDSH", internalRatio: 2.6, notes: "H-spec — check manual" },
  { brand: "Usukani", model: "PDSL", internalRatio: 2.6, notes: "L-spec — check manual" },
  { brand: "Usukani", model: "D3T", internalRatio: 2.6, notes: "Drift Tricycle — check manual" },
  { brand: "Usukani", model: "NGE", internalRatio: 2.888, notes: "NGE platform" },
  { brand: "Usukani", model: "NGE-SE", internalRatio: 2.888, notes: "NGE Special Edition" },
  { brand: "Usukani", model: "NGE-PRO", internalRatio: 2.888, notes: "NGE Pro competition" },

  // ─── Team AD (Addiction) ─────────────────────────────────────────────────────
  { brand: "Team AD", model: "AD-2", internalRatio: 2.6, notes: "Standard RWD" },
  { brand: "Team AD", model: "AD RWD", internalRatio: 2.6, notes: "RWD competition" },
  { brand: "Team AD", model: "RX-01", internalRatio: 2.6, notes: "Triple-reduction gearbox — check manual" },

  // ─── Rhino Racing ────────────────────────────────────────────────────────────
  { brand: "Rhino Racing", model: "RX-2", internalRatio: 2.6 },
  { brand: "Rhino Racing", model: "RX-3", internalRatio: 2.6 },
  { brand: "Rhino Racing", model: "RX-4", internalRatio: 2.6, notes: "Competition spec" },

  // ─── R31 House ───────────────────────────────────────────────────────────────
  { brand: "R31 House", model: "GRK Global Standard", internalRatio: 2.4375, notes: "39T/16T gear setup" },
  { brand: "R31 House", model: "GRK4", internalRatio: 2.6, notes: "4th gen GRK — check gear set" },
  { brand: "R31 House", model: "GRK5", internalRatio: 2.6, notes: "Current gen — check gear set" },
  { brand: "R31 House", model: "GRK5 RWD", internalRatio: 2.6, notes: "RWD spec" },

  // ─── Shibata Racing ──────────────────────────────────────────────────────────
  { brand: "Shibata Racing", model: "DR-03", internalRatio: 2.6 },
  { brand: "Shibata Racing", model: "DR-03D", internalRatio: 2.6, notes: "D-spec" },

  // ─── Acuvance ────────────────────────────────────────────────────────────────
  { brand: "Acuvance", model: "Xarvis XX", internalRatio: 2.6, notes: "ESC — no mechanical ratio" },

  // ─── Awesomatix ──────────────────────────────────────────────────────────────
  { brand: "Awesomatix", model: "A800R", internalRatio: 1.9, notes: "Belt drive — onroad/drift" },
  { brand: "Awesomatix", model: "A800MMX", internalRatio: 1.9, notes: "Mid motor belt drive" },

  // ─── Yokomo (body kit reference) ─────────────────────────────────────────────
  { brand: "Yokomo", model: "GR86 / Supra Body Kit", internalRatio: 2.6, notes: "Body kit only — YD-2 based" },
];

export const brands = [...new Set(chassisPresets.map(c => c.brand))].sort();
