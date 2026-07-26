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
  const [setupName, setSetupName] = useState(`${car.name} — AI Baseline Setup`);
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
          goals: ["AI Setup Calibration", "Easy Handling & Drift Control"],
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

  const steps = [
    { n: 1, label: "Name Setup" },
    { n: 2, label: "Track Surface" },
    { n: 3, label: "AI Recommendations" },
  ];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        {steps.map((s) => {
          const isActive = step === s.n;
          const isDone = step > s.n;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
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
              1. Name Your New AI Setup Calibration
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
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!setupName.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-extrabold transition-all shadow-md shadow-purple-500/20 disabled:opacity-50"
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
                      ? "border-purple-500 bg-purple-500/15 dark:bg-purple-500/20 ring-2 ring-purple-500/30 shadow-md"
                      : s.featured
                      ? "border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-indigo-500/5 hover:border-purple-500/60"
                      : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{s.icon}</span>
                    {s.featured && (
                      <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded-full">
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
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-extrabold hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Generating AI Calibration Setup...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Generate AI Calibration Setup</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review Generated Setup & Save */}
      {step === 3 && changes.length > 0 && (() => {
        // Build the merged setup from base + AI changes
        const base = { ...DEFAULT_BEGINNER_SETUP, carId: car.carId };
        const merged = applyChanges(base, changes);

        // Build a lookup of AI-touched fields
        const aiFields = new Map(changes.map((c) => [c.field, c]));

        const sections: { title: string; icon: string; rows: { field: string; label: string; value: string; isAI: boolean; reason?: string }[] }[] = [
          {
            title: "Steering & Alignment", icon: "🎯",
            rows: [
              { field: "frontCamber", label: "Front Camber", value: `${merged.frontCamber}°` },
              { field: "rearCamber", label: "Rear Camber", value: `${merged.rearCamber}°` },
              { field: "frontToe", label: "Front Toe", value: `${merged.frontToe}°` },
              { field: "rearToe", label: "Rear Toe", value: `${merged.rearToe}°` },
              { field: "frontCaster", label: "Front Caster", value: `${merged.frontCaster}°` },
              { field: "ackermann", label: "Ackermann", value: `${merged.ackermann}%` },
              { field: "steeringAngle", label: "Steering Angle", value: `${merged.steeringAngle}°` },
            ].map(r => ({ ...r, isAI: aiFields.has(r.field), reason: aiFields.get(r.field)?.reason })),
          },
          {
            title: "Suspension & Shocks", icon: "🔩",
            rows: [
              { field: "frontRideHeight", label: "Front Ride Height", value: `${merged.frontRideHeight}mm` },
              { field: "rearRideHeight", label: "Rear Ride Height", value: `${merged.rearRideHeight}mm` },
              { field: "frontSpringRate", label: "Front Spring", value: merged.frontSpringRate || "—" },
              { field: "rearSpringRate", label: "Rear Spring", value: merged.rearSpringRate || "—" },
              { field: "frontOilWeight", label: "Front Oil Weight", value: merged.frontOilWeight || "—" },
              { field: "rearOilWeight", label: "Rear Oil Weight", value: merged.rearOilWeight || "—" },
              { field: "frontOilBrand", label: "Front Oil Brand", value: merged.frontOilBrand || "—" },
              { field: "rearOilBrand", label: "Rear Oil Brand", value: merged.rearOilBrand || "—" },
              { field: "frontPistonHoles", label: "Front Piston Holes", value: `${merged.frontPistonHoles}` },
              { field: "rearPistonHoles", label: "Rear Piston Holes", value: `${merged.rearPistonHoles}` },
              { field: "frontPistonHoleSize", label: "Front Hole Size", value: merged.frontPistonHoleSize || "—" },
              { field: "rearPistonHoleSize", label: "Rear Hole Size", value: merged.rearPistonHoleSize || "—" },
              { field: "frontShockLength", label: "Front Shock Length", value: `${merged.frontShockLength}mm` },
              { field: "rearShockLength", label: "Rear Shock Length", value: `${merged.rearShockLength}mm` },
              { field: "frontShockBrand", label: "Front Shock Brand", value: merged.frontShockBrand || "—" },
              { field: "rearShockBrand", label: "Rear Shock Brand", value: merged.rearShockBrand || "—" },
              { field: "frontORings", label: "Front O-Rings", value: merged.frontORings || "—" },
              { field: "rearORings", label: "Rear O-Rings", value: merged.rearORings || "—" },
              { field: "frontDroop", label: "Front Droop", value: `${merged.frontDroop}mm` },
              { field: "rearDroop", label: "Rear Droop", value: `${merged.rearDroop}mm` },
            ].map(r => ({ ...r, isAI: aiFields.has(r.field), reason: aiFields.get(r.field)?.reason })),
          },
          {
            title: "Electronics & Drivetrain", icon: "⚡",
            rows: [
              { field: "motorTurns", label: "Motor Turns", value: `${merged.motorTurns}T` },
              { field: "motorTiming", label: "Motor Timing", value: `${merged.motorTiming}°` },
              { field: "motorPlacement", label: "Motor Placement", value: merged.motorPlacement || "—" },
              { field: "spurGear", label: "Spur Gear", value: `${merged.spurGear}T` },
              { field: "pinionGear", label: "Pinion Gear", value: `${merged.pinionGear}T` },
              { field: "finalDriveRatio", label: "Final Drive Ratio", value: `${merged.finalDriveRatio}` },
              { field: "gyroGain", label: "Gyro Gain", value: `${merged.gyroGain}%` },
              { field: "throttleExpo", label: "Throttle Expo", value: `${merged.throttleExpo}%` },
              { field: "steeringExpo", label: "Steering Expo", value: `${merged.steeringExpo}%` },
              { field: "boost", label: "Boost", value: `${merged.boost}%` },
              { field: "turbo", label: "Turbo", value: `${merged.turbo}%` },
            ].map(r => ({ ...r, isAI: aiFields.has(r.field), reason: aiFields.get(r.field)?.reason })),
          },
          {
            title: "Geometry & Weight", icon: "📐",
            rows: [
              { field: "frontTrackWidth", label: "Front Track Width", value: `${merged.frontTrackWidth}mm` },
              { field: "rearTrackWidth", label: "Rear Track Width", value: `${merged.rearTrackWidth}mm` },
              { field: "wheelbase", label: "Wheelbase", value: `${merged.wheelbase}mm` },
              { field: "batteryPosition", label: "Battery Position", value: merged.batteryPosition || "—" },
              { field: "totalWeight", label: "Total Weight", value: `${merged.totalWeight}g` },
            ].map(r => ({ ...r, isAI: aiFields.has(r.field), reason: aiFields.get(r.field)?.reason })),
          },
          {
            title: "Tyres", icon: "🛞",
            rows: [
              { field: "frontTyres", label: "Front Tyres", value: merged.frontTyres || "—" },
              { field: "rearTyres", label: "Rear Tyres", value: merged.rearTyres || "—" },
            ].map(r => ({ ...r, isAI: aiFields.has(r.field), reason: aiFields.get(r.field)?.reason })),
          },
        ];

        return (
          <div className="space-y-6">
            <div className="rounded-2xl bg-purple-500/10 border border-purple-500/30 p-5 space-y-2">
              <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                <span>✨</span> AI Setup Calibration — {car.name}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Complete starting baseline for <strong>{selectedSurface}</strong>. Fields highlighted in <span className="text-purple-600 dark:text-purple-400 font-bold">purple</span> were specifically recommended by AI for this surface.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/30 rounded-full px-2 py-0.5">
                  ✨ AI Recommended
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-2 py-0.5">
                  Baseline Default
                </span>
              </div>
            </div>

            {/* Grouped sections */}
            {sections.map((sec) => (
              <div key={sec.title} className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-base">{sec.icon}</span>
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">{sec.title}</h4>
                  <span className="ml-auto text-[10px] text-zinc-400">{sec.rows.filter(r => r.isAI).length} AI fields</span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {sec.rows.map((row) => (
                    <div
                      key={row.field}
                      className={`flex items-start justify-between gap-3 px-4 py-2.5 ${
                        row.isAI ? "bg-purple-50/50 dark:bg-purple-500/5" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${row.isAI ? "text-purple-700 dark:text-purple-300" : "text-zinc-700 dark:text-zinc-300"}`}>
                            {row.label}
                          </span>
                          {row.isAI && (
                            <span className="text-[9px] font-bold text-purple-500 bg-purple-500/10 border border-purple-500/20 rounded-full px-1.5 py-px shrink-0">
                              ✨ AI
                            </span>
                          )}
                        </div>
                        {row.isAI && row.reason && (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug line-clamp-2">{row.reason}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-md ${
                        row.isAI
                          ? "text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20"
                          : "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                      }`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

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
                className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-extrabold transition-all shadow-lg shadow-purple-500/20 text-center"
              >
                {saving ? "Saving Setup..." : "💾 Save Calibration to Car Garage"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
