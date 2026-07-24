"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAdvisedCalibration } from "@/actions/calibration";
import type { CarProfile, CalibrationSetup } from "@/types";

interface BeginnerAIWizardProps {
  car: CarProfile;
  userId: string;
}

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

const SURFACES = [
  { id: "PHD Track (P-Tile)", label: "PHD Track (P-Tile)", icon: "🏆", desc: "Penthouse Drift club P-tile plastic track", featured: true },
  { id: "Polished Concrete", label: "Polished Concrete", icon: "🏗️", desc: "Very low grip, smooth indoor surface", featured: false },
  { id: "Carpet", label: "Carpet", icon: "🟫", desc: "High grip, consistent indoor carpet", featured: false },
  { id: "Asphalt/Tarmac", label: "Asphalt / Tarmac", icon: "🛣️", desc: "Medium grip, outdoor track surface", featured: false },
  { id: "Polished Tiles/Marble", label: "Polished Tiles", icon: "🔲", desc: "Extremely low grip tiles", featured: false },
  { id: "Gym Floor/Hardwood", label: "Gym / Hardwood", icon: "🏀", desc: "Low-medium grip wooden floor", featured: false },
];

const DEFAULT_BEGINNER_SETUP: CalibrationSetup = {
  calibrationId: "new_beginner",
  carId: "",
  userId: "",
  name: "Beginner Baseline Setup",
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
    } else {
      (next as unknown as Record<string, unknown>)[key] = recVal;
    }
  }

  return next;
}

export function BeginnerAIWizard({ car, userId }: BeginnerAIWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setupName, setSetupName] = useState(`${car.name} — Beginner PHD Track Baseline`);
  const [selectedSurface, setSelectedSurface] = useState("PHD Track (P-Tile)");
  const [generating, setGenerating] = useState(false);
  const [changes, setChanges] = useState<TuningChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/tuning-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calibration: { ...DEFAULT_BEGINNER_SETUP, carId: car.carId },
          carName: car.name,
          goals: ["Beginner Baseline Setup", "Easy Handling & Drift Control"],
          surface: selectedSurface,
          isBeginnerMode: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setChanges(data.changes ?? []);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate baseline setup");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!setupName.trim()) {
      setError("Please enter a name for your calibration setup.");
      return;
    }

    setSaving(true);
    setError(null);

    const base = { ...DEFAULT_BEGINNER_SETUP, carId: car.carId };
    const updated = applyChanges(base, changes);
    const { calibrationId: _id, carId: _car, userId: _user, createdAt: _ts, name: _name, ...setup } = updated;
    void _id; void _car; void _user; void _ts; void _name;

    const result = await saveAdvisedCalibration(car.carId, userId, setup, setupName.trim());

    if (result.success) {
      router.push(`/cars/${car.carId}`);
    } else {
      setError(result.error ?? "Failed to save calibration setup");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step Indicators */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
        {[
          { n: 1, label: "Name Setup" },
          { n: 2, label: "Track Surface" },
          { n: 3, label: "Review & Save" },
        ].map((s) => {
          const isActive = step === s.n;
          const isDone = step > s.n;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? "bg-amber-500 text-black shadow-sm"
                    : isDone
                    ? "bg-green-500 text-white"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                }`}
              >
                {isDone ? "✓" : s.n}
              </span>
              <span
                className={`text-xs font-bold ${
                  isActive
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Name Setup */}
      {step === 1 && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              1. Name Your New Calibration Setup
            </h2>
            <p className="text-xs text-zinc-500">
              Give your new setup a clear name so you can identify it in your car's garage.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Car Chassis
            </label>
            <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
              🏎️ {car.name}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Calibration Name
            </label>
            <input
              type="text"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              placeholder="e.g. My First PHD Track Setup"
              required
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!setupName.trim()}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold transition-colors shadow-md disabled:opacity-50"
          >
            Next: Select Track Surface →
          </button>
        </div>
      )}

      {/* Step 2: Select Surface & Generate */}
      {step === 2 && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              2. Select Your Track Surface
            </h2>
            <p className="text-xs text-zinc-500">
              Where will you be driving {car.name}? Gemini AI will tailor initial camber, toe, and oil weights for this surface.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SURFACES.map((s) => {
              const isActive = selectedSurface === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSurface(s.id)}
                  className={`rounded-xl border-2 p-3.5 text-left transition-all ${
                    isActive
                      ? "border-amber-500 bg-amber-500/20 dark:bg-amber-500/25 ring-2 ring-amber-500/40 shadow-md"
                      : s.featured
                      ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5 hover:border-amber-500"
                      : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{s.icon}</span>
                    {s.featured && (
                      <span className="text-[9px] font-bold text-amber-500 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                        CLUB TRACK
                      </span>
                    )}
                  </div>
                  <h4 className={`text-xs font-bold ${isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-800 dark:text-zinc-200"}`}>
                    {s.label}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{s.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-extrabold hover:from-amber-400 hover:to-orange-400 shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  <span>Generating AI Baseline Setup...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Generate Baseline Setup with AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review Generated Setup & Save */}
      {step === 3 && changes.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-2">
            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <span>🔰</span> AI Beginner Setup Summary
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Below is the starting baseline setup generated for <strong>{car.name}</strong> on <strong>{selectedSurface}</strong>. These settings provide maximum stability and smooth drift control to help you start practicing right away!
            </p>
          </div>

          {/* Parameters list */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 border-b border-zinc-200 dark:border-zinc-800 pb-2">
              Recommended Starting Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {changes.map((c, i) => (
                <div key={i} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.label}</span>
                    <span className="text-xs font-extrabold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded">
                      {c.recommendedValue}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {c.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200"
            >
              ← Change Surface
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold transition-colors shadow-lg shadow-amber-500/20 text-center"
            >
              {saving ? "Saving Setup..." : "💾 Save Calibration to Car Garage"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
