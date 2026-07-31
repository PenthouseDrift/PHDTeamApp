"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMemberCars } from "@/actions/cars";
import { getCarCalibrations, saveAdvisedCalibration } from "@/actions/calibration";
import type { CarProfile, CalibrationSetup } from "@/types";

interface TuningChange {
  section: string;
  field: string;
  label: string;
  currentValue: string;
  recommendedValue: string;
  reason: string;
  priority: "high" | "medium" | "low";
  direction: "increase" | "decrease" | "change" | "info";
}

const BEGINNER_BASELINE_SETUP: CalibrationSetup = {
  calibrationId: "new_beginner",
  carId: "",
  userId: "",
  name: "✨ Beginner Baseline Setup (From Scratch)",
  frontCamber: 6,
  rearCamber: 2,
  frontToe: 1,
  rearToe: 0,
  frontCaster: 7,
  ackermann: 50,
  steeringAngle: 45,
  frontRideHeight: 6,
  rearRideHeight: 6.5,
  frontSpringRate: "Soft Linear",
  rearSpringRate: "Medium Progressive",
  frontOilWeight: "150cSt",
  rearOilWeight: "100cSt",
  frontOilBrand: "Standard RC",
  rearOilBrand: "Standard RC",
  frontPistonHoles: 3,
  rearPistonHoles: 3,
  frontPistonHoleSize: "1.2mm",
  rearPistonHoleSize: "1.2mm",
  frontShockLength: 55,
  rearShockLength: 55,
  frontShockBrand: "Stock",
  rearShockBrand: "Stock",
  frontORings: "Silicone",
  rearORings: "Silicone",
  frontDroop: 2,
  rearDroop: 3,
  motorTurns: 10.5,
  motorTiming: 30,
  motorPlacement: "High Rear",
  spurGear: 84,
  pinionGear: 22,
  finalDriveRatio: 9.8,
  gyroGain: 65,
  throttleExpo: 0,
  steeringExpo: 0,
  boost: 0,
  turbo: 0,
  frontTrackWidth: 198,
  rearTrackWidth: 198,
  wheelbase: 257,
  batteryPosition: "Rear",
  totalWeight: 1450,
  frontTyres: "Hard Plastic P-Tile",
  rearTyres: "Hard Plastic P-Tile",
  customParams: [],
  createdAt: Date.now(),
};

// ─── Surface types ────────────────────────────────────────────────────────────
const SURFACES = [
  { id: "PHD Track (P-Tile)", label: "PHD Track", icon: "🏆", desc: "Penthouse Drift P-tile plastic", featured: true },
  { id: "Polished Concrete", label: "Polished Concrete", icon: "🏗️", desc: "Very low grip, smooth", featured: false },
  { id: "Carpet", label: "Carpet", icon: "🟫", desc: "High grip, consistent", featured: false },
  { id: "Asphalt/Tarmac", label: "Asphalt / Tarmac", icon: "🛣️", desc: "Medium grip, outdoor", featured: false },
  { id: "Polished Tiles/Marble", label: "Polished Tiles", icon: "🔲", desc: "Extremely low grip", featured: false },
  { id: "Gym Floor/Hardwood", label: "Gym / Hardwood", icon: "🏀", desc: "Low-medium grip, variable", featured: false },
  { id: "Foam/EVA Tiles", label: "Foam / EVA Tiles", icon: "🟩", desc: "High grip, soft surface", featured: false },
  { id: "RCP (Racing Combination Products)", label: "RCP Track", icon: "🔵", desc: "Very high grip plastic", featured: false },
  { id: "Painted Concrete", label: "Painted Concrete", icon: "🎨", desc: "Low grip, inconsistent", featured: false },
];

// ─── Tuning goals ─────────────────────────────────────────────────────────────
const TUNING_GOALS = [
  { id: "more_grip", label: "More Grip", description: "Better traction & surface adhesion", icon: "🔥", color: "from-orange-500/20 to-red-500/20 border-orange-500/40" },
  { id: "better_handling", label: "Better Handling", description: "Improved balance & predictability", icon: "🎯", color: "from-blue-500/20 to-cyan-500/20 border-blue-500/40" },
  { id: "more_speed", label: "More Speed", description: "Faster straight-line performance", icon: "⚡", color: "from-yellow-500/20 to-amber-500/20 border-yellow-500/40" },
  { id: "better_cornering", label: "Better Cornering", description: "Higher-speed corner performance", icon: "🔄", color: "from-purple-500/20 to-violet-500/20 border-purple-500/40" },
  { id: "better_exit_speed", label: "Better Exit Speed", description: "Faster acceleration out of corners", icon: "🚀", color: "from-green-500/20 to-emerald-500/20 border-green-500/40" },
  { id: "better_entry_speed", label: "Better Entry Speed", description: "Faster transition into corners", icon: "🏎️", color: "from-pink-500/20 to-rose-500/20 border-pink-500/40" },
  { id: "more_drift_angle", label: "More Drift Angle", description: "More aggressive, wider slides", icon: "🌊", color: "from-indigo-500/20 to-blue-600/20 border-indigo-500/40" },
  { id: "more_stability", label: "More Stability", description: "Smoother, more consistent slides", icon: "🎛️", color: "from-teal-500/20 to-cyan-600/20 border-teal-500/40" },
  { id: "custom", label: "Custom", description: "Type your own prompt", icon: "✍️", color: "from-zinc-500/20 to-zinc-600/20 border-zinc-500/40" },
];

const PRIORITY_CONFIG = {
  high: { label: "High Impact", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  medium: { label: "Medium Impact", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  low: { label: "Fine Tune", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const DIRECTION_ICON = { increase: "↑", decrease: "↓", change: "⇄", info: "ℹ" };
const DIRECTION_COLOR = { increase: "text-green-400", decrease: "text-blue-400", change: "text-amber-400", info: "text-zinc-400" };

function parseNumeric(val: string): number {
  const m = val.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function applyChanges(base: CalibrationSetup, changes: TuningChange[]): CalibrationSetup {
  const next: CalibrationSetup = {
    ...base,
    customParams: Array.isArray(base.customParams) ? [...base.customParams] : [],
  };

  for (const c of changes) {
    if (!c.field) continue;
    const key = c.field as keyof CalibrationSetup;
    const recVal = c.recommendedValue;

    if (recVal === undefined || recVal === null) continue;

    const existingVal = base[key];

    if (typeof existingVal === "number") {
      (next as unknown as Record<string, unknown>)[key] = parseNumeric(recVal);
    } else if (typeof existingVal === "string") {
      (next as unknown as Record<string, unknown>)[key] = recVal;
    } else {
      const num = parseNumeric(recVal);
      if (!isNaN(num) && /^-?\d+(\.\d+)?/.test(recVal.trim())) {
        (next as unknown as Record<string, unknown>)[key] = num;
      } else {
        (next as unknown as Record<string, unknown>)[key] = recVal;
      }
    }
  }

  return next;
}

export default function TuningAdvisorClient() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramCarId = searchParams.get("carId");
  const paramCalId = searchParams.get("calibrationId");
  const paramMode = searchParams.get("mode");

  const [cars, setCars] = useState<CarProfile[]>([]);
  const [selectedCarId, setSelectedCarId] = useState("");
  const [calibrations, setCalibrations] = useState<CalibrationSetup[]>([]);
  const [selectedCalibrationId, setSelectedCalibrationId] = useState("");
  const [selectedSurface, setSelectedSurface] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoalText, setCustomGoalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCals, setLoadingCals] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [changes, setChanges] = useState<TuningChange[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Save-calibration state
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSavePanel, setShowSavePanel] = useState(false);

  // Load cars
  useEffect(() => {
    if (!session?.user?.id) return;
    getMemberCars(session.user.id).then((r) => {
      if (r.success) {
        setCars(r.data);
        if (paramCarId && r.data.some((c) => c.carId === paramCarId)) {
          setSelectedCarId(paramCarId);
        } else if (r.data.length > 0 && !selectedCarId) {
          setSelectedCarId(r.data[0].carId);
        }
      }
      setLoading(false);
    });
  }, [session?.user?.id, paramCarId]);

  // Load calibrations when car changes
  useEffect(() => {
    if (!selectedCarId) return;
    setLoadingCals(true);
    setCalibrations([]);
    setSelectedCalibrationId("");
    setChanges([]);
    setSaveSuccess(false);

    getCarCalibrations(selectedCarId).then((cals) => {
      setCalibrations(cals);
      if (paramMode === "beginner" || paramCalId === "new_beginner") {
        setSelectedCalibrationId("new_beginner");
      } else if (paramCalId && cals.some((c) => c.calibrationId === paramCalId)) {
        setSelectedCalibrationId(paramCalId);
      } else if (cals.length > 0) {
        setSelectedCalibrationId(cals[0].calibrationId);
      } else {
        setSelectedCalibrationId("new_beginner");
      }
      setLoadingCals(false);
    });
  }, [selectedCarId, paramCalId, paramMode]);

  // Reset results when key inputs change
  useEffect(() => {
    setChanges([]);
    setSaveSuccess(false);
    setShowSavePanel(false);
  }, [selectedCalibrationId, selectedSurface, selectedGoals.join(",")]);

  function toggleGoal(id: string) {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  const isBeginnerMode = selectedCalibrationId === "new_beginner";

  async function generateAdvice() {
    let calibration = calibrations.find((c) => c.calibrationId === selectedCalibrationId);
    if (isBeginnerMode) {
      calibration = { ...BEGINNER_BASELINE_SETUP, carId: selectedCarId };
    }

    const car = cars.find((c) => c.carId === selectedCarId);
    if (!calibration || !car || selectedGoals.length === 0 || !selectedSurface) return;

    setGenerating(true);
    setError(null);
    setChanges([]);
    setSaveSuccess(false);
    setShowSavePanel(false);

    const goalLabels = selectedGoals.map((id) => {
      if (id === "custom") return `Custom Prompt: ${customGoalText}`;
      return TUNING_GOALS.find((g) => g.id === id)?.label ?? id;
    });

    try {
      const res = await fetch("/api/tuning-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calibration,
          carName: car.name,
          goals: goalLabels,
          surface: selectedSurface,
          isBeginnerMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setChanges(data.changes ?? []);

      // Pre-fill save name
      const surfaceShort = SURFACES.find((s) => s.id === selectedSurface)?.label ?? selectedSurface;
      if (isBeginnerMode) {
        setSaveName(`${car.name} — Beginner Baseline (${surfaceShort})`);
      } else {
        setSaveName(`${calibration.name} — ${surfaceShort} (Advised)`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function saveNewCalibration() {
    if (!session?.user?.id) return;
    let base = calibrations.find((c) => c.calibrationId === selectedCalibrationId);
    if (isBeginnerMode) {
      base = { ...BEGINNER_BASELINE_SETUP, carId: selectedCarId };
    }

    if (!base || changes.length === 0) return;

    setSaving(true);
    setSaveError(null);

    const updated = applyChanges(base, changes);
    const { calibrationId: _id, carId: _car, userId: _user, createdAt: _ts, name: _name, ...setup } = updated;
    void _id; void _car; void _user; void _ts; void _name;

    const result = await saveAdvisedCalibration(
      selectedCarId,
      session.user.id,
      setup,
      saveName.trim() || (isBeginnerMode ? "Beginner Baseline Setup" : `${base.name} (Advised)`)
    );

    if (result.success) {
      setSaveSuccess(true);
      setSaving(false);
      setShowSavePanel(false);
      getCarCalibrations(selectedCarId).then(setCalibrations);
    } else {
      setSaveError(result.error ?? "Failed to save");
      setSaving(false);
    }
  }

  function reset() {
    setChanges([]);
    setSelectedGoals([]);
    setSelectedSurface("");
    setError(null);
    setSaveSuccess(false);
    setShowSavePanel(false);
  }

  const grouped = changes.reduce<Record<string, TuningChange[]>>((acc, change) => {
    if (!acc[change.section]) acc[change.section] = [];
    acc[change.section].push(change);
    return acc;
  }, {});

  const selectedCalibration = isBeginnerMode
    ? BEGINNER_BASELINE_SETUP
    : calibrations.find((c) => c.calibrationId === selectedCalibrationId);
  const selectedCar = cars.find((c) => c.carId === selectedCarId);
  const selectedSurfaceInfo = SURFACES.find((s) => s.id === selectedSurface);

  const canGenerate = !!selectedCalibrationId && !!selectedSurface && selectedGoals.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-zinc-500">Loading your cars...</p>
        </div>
      </div>
    );
  }

  if (cars.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="text-5xl mb-4">🏎️</div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No Cars Found</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Add a car to your garage to use the Tuning Advisor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Step 1: Car + Calibration ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-5">
        <StepHeader n={1} title="Select Car & Calibration" sub="Choose an existing setup or generate a new beginner setup from scratch" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Car</label>
            <select
              value={selectedCarId}
              onChange={(e) => setSelectedCarId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">— Select a car —</option>
              {cars.map((car) => (
                <option key={car.carId} value={car.carId}>{car.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Calibration Setup</label>
            {loadingCals ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <div className="w-4 h-4 rounded-full border border-amber-500 border-t-transparent animate-spin" />
                <span className="text-sm text-zinc-500">Loading...</span>
              </div>
            ) : (
              <select
                value={selectedCalibrationId}
                onChange={(e) => setSelectedCalibrationId(e.target.value)}
                disabled={!selectedCarId}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
              >
                <option value="new_beginner">✨ Create Beginner Baseline Setup (From Scratch)</option>
                {calibrations.map((cal) => (
                  <option key={cal.calibrationId} value={cal.calibrationId}>{cal.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {isBeginnerMode ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-1">
            <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🔰</span> Beginner Tuning Guide from Scratch
            </h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Gemini AI will generate a complete, easy-to-drive starting setup for your chassis on your chosen track surface with step-by-step guidance on initial camber, toe, gyro gain, and oil weights.
            </p>
          </div>
        ) : selectedCalibration ? (
          <div className="rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50 p-4">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Current Setup Snapshot</p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-xs">
              {[
                { label: "F.Camber", value: `${selectedCalibration.frontCamber ?? 0}°` },
                { label: "R.Camber", value: `${selectedCalibration.rearCamber ?? 0}°` },
                { label: "Gyro", value: `${selectedCalibration.gyroGain ?? 0}%` },
                { label: "Spur/Pinion", value: selectedCalibration.spurGear && selectedCalibration.pinionGear ? `${selectedCalibration.spurGear}T/${selectedCalibration.pinionGear}T` : "Not set" },
                { label: "FDR", value: selectedCalibration.finalDriveRatio ? `${selectedCalibration.finalDriveRatio}` : "Not set" },
                { label: "Boost", value: `${selectedCalibration.boost ?? 0}%` },
                { label: "F.Droop", value: `${selectedCalibration.frontDroop ?? 0}mm` },
                { label: "R.Droop", value: `${selectedCalibration.rearDroop ?? 0}mm` },
              ].map((p) => (
                <div key={p.label} className="rounded-lg bg-white dark:bg-zinc-900 px-2 py-1.5 text-center border border-zinc-200 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-500">{p.label}</p>
                  <p className="font-semibold text-zinc-700 dark:text-zinc-200">{p.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Step 2: Surface Type ───────────────────────────────────────────── */}
      <div className={`rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 transition-opacity ${!selectedCalibrationId ? "opacity-40 pointer-events-none" : ""}`}>
        <StepHeader n={2} title="Track Surface" sub="Surface type significantly affects the optimal setup" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SURFACES.map((s) => {
            const isActive = selectedSurface === s.id;
            const isFeatured = s.featured;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSurface(s.id)}
                className={`relative rounded-xl border-2 p-3 text-left transition-all duration-150 ${
                  isActive
                    ? "border-amber-500 bg-amber-500/20 dark:bg-amber-500/30 ring-2 ring-amber-500/50 shadow-md shadow-amber-500/10"
                    : isFeatured
                    ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5 hover:border-amber-500/70"
                    : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {isFeatured && !isActive && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold text-amber-500 bg-amber-500/15 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none">
                    OUR TRACK
                  </span>
                )}
                {isActive && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                    <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <span className="text-lg mb-1 block">{s.icon}</span>
                <p className={`text-xs font-bold leading-tight ${isActive ? "text-zinc-900 dark:text-zinc-100" : isFeatured ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>{s.label}</p>
                <p className={`text-[10px] mt-0.5 leading-tight ${isActive ? "text-zinc-600 dark:text-zinc-300 font-medium" : isFeatured ? "text-amber-600 dark:text-amber-500/80" : "text-zinc-500"}`}>{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 3: Goals ─────────────────────────────────────────────────── */}
      <div className={`rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 transition-opacity ${(!selectedCalibrationId || !selectedSurface) ? "opacity-40 pointer-events-none" : ""}`}>
        <StepHeader n={3} title="What Do You Want to Achieve?" sub="Select one or more tuning goals" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TUNING_GOALS.map((goal) => {
            const isActive = selectedGoals.includes(goal.id);
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => toggleGoal(goal.id)}
                className={`relative rounded-xl border-2 p-3 text-left transition-all duration-200 ${
                  isActive
                    ? "border-amber-500 bg-amber-500/20 dark:bg-amber-500/30 ring-2 ring-amber-500/50 shadow-md shadow-amber-500/10"
                    : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {isActive && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                    <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <span className="text-xl mb-1.5 block">{goal.icon}</span>
                <p className={`text-xs font-bold leading-tight ${isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>{goal.label}</p>
                <p className={`text-[10px] mt-0.5 leading-tight ${isActive ? "text-zinc-600 dark:text-zinc-300 font-medium" : "text-zinc-500"}`}>{goal.description}</p>
              </button>
            );
          })}
        </div>

        {selectedGoals.includes("custom") && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
              What specific issue are you facing, or what do you want to achieve?
            </label>
            <textarea
              value={customGoalText}
              onChange={(e) => setCustomGoalText(e.target.value)}
              placeholder="e.g. The rear end kicks out too fast on corner entry, and I'm struggling to catch it before it spins..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={3}
            />
          </div>
        )}

        {selectedGoals.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500">Selected:</span>
            {selectedGoals.map((id) => {
              const goal = TUNING_GOALS.find((g) => g.id === id)!;
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 text-xs font-bold">
                  {goal.icon} {goal.label}
                  <button onClick={() => toggleGoal(id)} className="ml-0.5 hover:text-amber-800 dark:hover:text-amber-200">×</button>
                </span>
              );
            })}
          </div>
        )}

        {/* Generate Button */}
        <div className="pt-2">
          <button
            onClick={generateAdvice}
            disabled={
              generating ||
              selectedGoals.length === 0 ||
              !selectedSurface ||
              (selectedGoals.includes("custom") && !customGoalText.trim())
            }
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 px-4 text-sm font-bold text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
          {generating ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
              <span>Analyzing & Generating Setup...</span>
            </>
          ) : (
            <>
              <span>✨</span>
              <span>{isBeginnerMode ? "Generate Beginner Baseline Setup" : "Generate Tuning Recommendations"}</span>
            </>
          )}
        </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-600 dark:text-red-400 font-semibold flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* ── Step 4: Results ────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>🎯</span> {isBeginnerMode ? "Beginner Baseline Setup Recommendations" : "Recommended Tuning Adjustments"}
              </h2>
              <p className="text-xs text-zinc-500">
                {changes.length} adjustments for <span className="font-semibold text-amber-600 dark:text-amber-400">{selectedCar?.name}</span> on <span className="font-semibold text-amber-600 dark:text-amber-400">{selectedSurfaceInfo?.label}</span>
              </p>
            </div>

            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
            >
              Start Over
            </button>
          </div>

          {/* Grouped Recommendations */}
          <div className="space-y-4">
            {Object.entries(grouped).map(([section, items]) => (
              <div key={section} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                  {section}
                </h3>
                <div className="space-y-3">
                  {items.map((change, i) => {
                    const pri = PRIORITY_CONFIG[change.priority] ?? PRIORITY_CONFIG.low;
                    const dirIcon = DIRECTION_ICON[change.direction] ?? "•";
                    const dirColor = DIRECTION_COLOR[change.direction] ?? "text-zinc-400";
                    return (
                      <div key={i} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{change.label}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${pri.color}`}>
                            {pri.label}
                          </span>
                        </div>

                        {/* Value change preview */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 line-through bg-zinc-200 dark:bg-zinc-700/60 px-2 py-0.5 rounded">{change.currentValue}</span>
                          <span className={`font-bold text-base ${dirColor}`}>{dirIcon}</span>
                          <span className="font-extrabold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">
                            {change.recommendedValue}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium">
                          {change.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 p-5 space-y-4">
            {!showSavePanel && !saveSuccess && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Save as New Calibration Setup</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Add these AI recommendations as a saved setup profile for {selectedCar?.name}</p>
                </div>
                <button
                  onClick={() => setShowSavePanel(true)}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-extrabold text-black hover:bg-amber-400 transition-all shadow-md shrink-0"
                >
                  💾 Save New Calibration Setup
                </button>
              </div>
            )}

            {showSavePanel && !saveSuccess && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  Setup Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Baseline PHD Track Setup"
                    className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={saveNewCalibration}
                    disabled={saving}
                    className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm shrink-0"
                  >
                    {saving ? "Saving..." : "Confirm Save"}
                  </button>
                  <button
                    onClick={() => setShowSavePanel(false)}
                    className="rounded-xl bg-zinc-200 dark:bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
                {saveError && <p className="text-xs text-red-500 font-semibold">{saveError}</p>}
              </div>
            )}

            {saveSuccess && (
              <div className="rounded-xl bg-green-500/15 border border-green-500/30 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-500 text-lg">✓</span>
                  <div>
                    <p className="text-xs font-bold text-green-700 dark:text-green-300">Calibration Saved Successfully!</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">You can view and select it in your car's setup garage.</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/cars/${selectedCarId}`)}
                  className="rounded-xl bg-green-500 text-black text-xs font-extrabold px-3 py-1.5 hover:bg-green-400 transition-colors"
                >
                  View Car Garage →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black font-extrabold text-xs shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <p className="text-xs text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}
