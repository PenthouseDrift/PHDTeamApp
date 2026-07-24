"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getMemberCars } from "@/actions/cars";
import { getCarCalibrations } from "@/actions/calibration";
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

const TUNING_GOALS = [
  {
    id: "more_grip",
    label: "More Grip",
    description: "Better traction & surface adhesion",
    icon: "🔥",
    color: "from-orange-500/20 to-red-500/20 border-orange-500/40",
    activeColor: "from-orange-500 to-red-500",
  },
  {
    id: "better_handling",
    label: "Better Handling",
    description: "Improved balance & predictability",
    icon: "🎯",
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/40",
    activeColor: "from-blue-500 to-cyan-500",
  },
  {
    id: "more_speed",
    label: "More Speed",
    description: "Faster straight-line performance",
    icon: "⚡",
    color: "from-yellow-500/20 to-amber-500/20 border-yellow-500/40",
    activeColor: "from-yellow-500 to-amber-500",
  },
  {
    id: "better_cornering",
    label: "Better Cornering",
    description: "Higher-speed corner performance",
    icon: "🔄",
    color: "from-purple-500/20 to-violet-500/20 border-purple-500/40",
    activeColor: "from-purple-500 to-violet-500",
  },
  {
    id: "better_exit_speed",
    label: "Better Exit Speed",
    description: "Faster acceleration out of corners",
    icon: "🚀",
    color: "from-green-500/20 to-emerald-500/20 border-green-500/40",
    activeColor: "from-green-500 to-emerald-500",
  },
  {
    id: "better_entry_speed",
    label: "Better Entry Speed",
    description: "Faster transition into corners",
    icon: "🏎️",
    color: "from-pink-500/20 to-rose-500/20 border-pink-500/40",
    activeColor: "from-pink-500 to-rose-500",
  },
  {
    id: "more_drift_angle",
    label: "More Drift Angle",
    description: "More aggressive, wider slides",
    icon: "🌊",
    color: "from-indigo-500/20 to-blue-600/20 border-indigo-500/40",
    activeColor: "from-indigo-500 to-blue-600",
  },
  {
    id: "more_stability",
    label: "More Stability",
    description: "Smoother, more consistent slides",
    icon: "🎛️",
    color: "from-teal-500/20 to-cyan-600/20 border-teal-500/40",
    activeColor: "from-teal-500 to-cyan-600",
  },
];

const PRIORITY_CONFIG = {
  high: { label: "High Impact", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  medium: { label: "Medium Impact", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  low: { label: "Fine Tune", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const DIRECTION_ICON = {
  increase: "↑",
  decrease: "↓",
  change: "⇄",
  info: "ℹ",
};

const DIRECTION_COLOR = {
  increase: "text-green-400",
  decrease: "text-blue-400",
  change: "text-amber-400",
  info: "text-zinc-400",
};

export default function TuningAdvisorClient() {
  const { data: session } = useSession();

  const [cars, setCars] = useState<CarProfile[]>([]);
  const [selectedCarId, setSelectedCarId] = useState("");
  const [calibrations, setCalibrations] = useState<CalibrationSetup[]>([]);
  const [selectedCalibrationId, setSelectedCalibrationId] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCals, setLoadingCals] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [changes, setChanges] = useState<TuningChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Load cars
  useEffect(() => {
    if (!session?.user?.id) return;
    getMemberCars(session.user.id).then((r) => {
      if (r.success) setCars(r.data);
      setLoading(false);
    });
  }, [session?.user?.id]);

  // Load calibrations when car changes
  useEffect(() => {
    if (!selectedCarId) return;
    setLoadingCals(true);
    setCalibrations([]);
    setSelectedCalibrationId("");
    getCarCalibrations(selectedCarId).then((cals) => {
      setCalibrations(cals);
      if (cals.length > 0) setSelectedCalibrationId(cals[0].calibrationId);
      setLoadingCals(false);
    });
  }, [selectedCarId]);

  function toggleGoal(id: string) {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  async function generateAdvice() {
    const calibration = calibrations.find((c) => c.calibrationId === selectedCalibrationId);
    const car = cars.find((c) => c.carId === selectedCarId);
    if (!calibration || !car || selectedGoals.length === 0) return;

    setGenerating(true);
    setError(null);
    setChanges([]);

    const goalLabels = selectedGoals.map(
      (id) => TUNING_GOALS.find((g) => g.id === id)?.label ?? id
    );

    try {
      const res = await fetch("/api/tuning-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibration, carName: car.name, goals: goalLabels }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setChanges(data.changes ?? []);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setStep(1);
    setChanges([]);
    setSelectedGoals([]);
    setError(null);
  }

  // Group changes by section
  const grouped = changes.reduce<Record<string, TuningChange[]>>((acc, change) => {
    if (!acc[change.section]) acc[change.section] = [];
    acc[change.section].push(change);
    return acc;
  }, {});

  const selectedCalibration = calibrations.find((c) => c.calibrationId === selectedCalibrationId);
  const selectedCar = cars.find((c) => c.carId === selectedCarId);

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
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="text-5xl mb-4">🏎️</div>
        <h2 className="text-lg font-bold text-zinc-100">No Cars Found</h2>
        <p className="text-sm text-zinc-400 mt-2">Add a car with calibrations to use the Tuning Advisor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Car + Calibration Selection */}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black font-bold text-xs shrink-0">1</div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Select Car & Calibration</h2>
            <p className="text-xs text-zinc-500">Choose which setup you want advice on</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Car selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Car</label>
            <select
              value={selectedCarId}
              onChange={(e) => setSelectedCarId(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">— Select a car —</option>
              {cars.map((car) => (
                <option key={car.carId} value={car.carId}>
                  {car.name}
                </option>
              ))}
            </select>
          </div>

          {/* Calibration selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Calibration Setup</label>
            {loadingCals ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                <div className="w-4 h-4 rounded-full border border-amber-500 border-t-transparent animate-spin" />
                <span className="text-sm text-zinc-500">Loading...</span>
              </div>
            ) : (
              <select
                value={selectedCalibrationId}
                onChange={(e) => setSelectedCalibrationId(e.target.value)}
                disabled={!selectedCarId || calibrations.length === 0}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
              >
                {calibrations.length === 0 ? (
                  <option value="">No calibrations found</option>
                ) : (
                  calibrations.map((cal) => (
                    <option key={cal.calibrationId} value={cal.calibrationId}>
                      {cal.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>
        </div>

        {/* Current calibration mini-summary */}
        {selectedCalibration && (
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Current Setup Snapshot</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              {[
                { label: "F.Camber", value: `${selectedCalibration.frontCamber}°` },
                { label: "R.Camber", value: `${selectedCalibration.rearCamber}°` },
                { label: "Gyro", value: `${selectedCalibration.gyroGain}%` },
                { label: "Boost", value: `${selectedCalibration.boost}%` },
                { label: "F.Droop", value: `${selectedCalibration.frontDroop}mm` },
                { label: "R.Droop", value: `${selectedCalibration.rearDroop}mm` },
              ].map((p) => (
                <div key={p.label} className="rounded-lg bg-zinc-900 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-zinc-500">{p.label}</p>
                  <p className="font-semibold text-zinc-200">{p.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Goal Selection */}
      <div className={`rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-5 transition-opacity ${!selectedCalibrationId ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black font-bold text-xs shrink-0">2</div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">What Do You Want to Achieve?</h2>
            <p className="text-xs text-zinc-500">Select one or more tuning goals</p>
          </div>
        </div>

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
                    ? `border-amber-500 bg-gradient-to-br ${goal.color} ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/10`
                    : `border-zinc-700 bg-zinc-800/50 hover:border-zinc-600`
                }`}
              >
                {isActive && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <span className="text-xl mb-1.5 block">{goal.icon}</span>
                <p className={`text-xs font-bold leading-tight ${isActive ? "text-zinc-100" : "text-zinc-300"}`}>{goal.label}</p>
                <p className={`text-[10px] mt-0.5 leading-tight ${isActive ? "text-zinc-400" : "text-zinc-500"}`}>{goal.description}</p>
              </button>
            );
          })}
        </div>

        {selectedGoals.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">Selected:</span>
            {selectedGoals.map((id) => {
              const goal = TUNING_GOALS.find((g) => g.id === id)!;
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 text-xs font-medium">
                  {goal.icon} {goal.label}
                  <button onClick={() => toggleGoal(id)} className="ml-0.5 hover:text-amber-200">×</button>
                </span>
              );
            })}
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={generateAdvice}
          disabled={selectedGoals.length === 0 || generating}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 px-4 text-sm font-bold text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
              Analysing with Gemini AI...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              Generate Tuning Advice
            </>
          )}
        </button>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* Step 3: Results */}
      {changes.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-500 text-black font-bold text-xs shrink-0">✓</div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  Tuning Recommendations
                </h2>
                <p className="text-xs text-zinc-500">
                  {selectedCar?.name} · {selectedCalibration?.name} · {changes.length} changes suggested
                </p>
              </div>
            </div>
            <button
              onClick={reset}
              className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              Start Over
            </button>
          </div>

          {/* Goal tags */}
          <div className="flex flex-wrap gap-2">
            {selectedGoals.map((id) => {
              const goal = TUNING_GOALS.find((g) => g.id === id)!;
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-1 text-xs font-medium">
                  {goal.icon} {goal.label}
                </span>
              );
            })}
          </div>

          {/* Changes grouped by section */}
          <div className="space-y-4">
            {Object.entries(grouped).map(([section, sectionChanges]) => (
              <div key={section}>
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">{section}</p>
                <div className="space-y-2">
                  {sectionChanges
                    .sort((a, b) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return order[a.priority] - order[b.priority];
                    })
                    .map((change, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-base font-bold ${DIRECTION_COLOR[change.direction]}`}>
                              {DIRECTION_ICON[change.direction]}
                            </span>
                            <span className="text-sm font-semibold text-zinc-100 truncate">{change.label}</span>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_CONFIG[change.priority].color}`}>
                            {PRIORITY_CONFIG[change.priority].label}
                          </span>
                        </div>

                        {/* Value change */}
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 border border-zinc-700">
                            <p className="text-[10px] text-zinc-500 mb-0.5">Current</p>
                            <p className="font-mono font-semibold text-zinc-300">{change.currentValue}</p>
                          </div>
                          <div className="text-zinc-600 shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                          </div>
                          <div className="flex-1 rounded-lg bg-amber-500/10 px-3 py-2 border border-amber-500/30">
                            <p className="text-[10px] text-amber-500/80 mb-0.5">Recommended</p>
                            <p className="font-mono font-semibold text-amber-300">{change.recommendedValue}</p>
                          </div>
                        </div>

                        {/* Reason */}
                        <p className="text-xs text-zinc-400 leading-relaxed">{change.reason}</p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Copy to clipboard */}
          <CopyButton changes={changes} car={selectedCar} calibration={selectedCalibration} goals={selectedGoals} />

          {/* Disclaimer */}
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            ⚠️ These are AI-generated suggestions based on your calibration data. Always test changes incrementally and in a safe environment. Individual car behaviour varies.
          </p>
        </div>
      )}
    </div>
  );
}

function CopyButton({
  changes,
  car,
  calibration,
  goals,
}: {
  changes: TuningChange[];
  car?: CarProfile;
  calibration?: CalibrationSetup;
  goals: string[];
}) {
  const [copied, setCopied] = useState(false);

  function copyText() {
    const goalLabels = goals.map(
      (id) => TUNING_GOALS.find((g) => g.id === id)?.label ?? id
    );

    const lines: string[] = [
      `TUNING ADVISOR — ${car?.name ?? "Car"} · ${calibration?.name ?? "Calibration"}`,
      `Goals: ${goalLabels.join(", ")}`,
      "",
      ...Object.entries(
        changes.reduce<Record<string, TuningChange[]>>((acc, c) => {
          if (!acc[c.section]) acc[c.section] = [];
          acc[c.section].push(c);
          return acc;
        }, {})
      ).flatMap(([section, schanges]) => [
        `── ${section} ──`,
        ...schanges.map(
          (c) =>
            `• ${c.label}: ${c.currentValue} → ${c.recommendedValue} [${c.priority.toUpperCase()}]\n  ${c.reason}`
        ),
        "",
      ]),
    ];

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={copyText}
      className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
          </svg>
          Copy Change List
        </>
      )}
    </button>
  );
}
