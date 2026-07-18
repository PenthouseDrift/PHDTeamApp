"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { computeGearRatio, validateGearInput } from "@/lib/calculator";
import { saveGearRatio, getMemberCarsForSelect } from "@/actions/calculator";

interface CarOption {
  carId: string;
  name: string;
}

export default function CalculatorPage() {
  const { data: session } = useSession();

  const [spur, setSpur] = useState<string>("80");
  const [pinion, setPinion] = useState<string>("25");
  const [ratio, setRatio] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const [cars, setCars] = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Fetch car profiles on mount
  useEffect(() => {
    async function loadCars() {
      if (!session?.user?.id) return;
      const result = await getMemberCarsForSelect(session.user.id);
      if (result.success) {
        setCars(result.data);
        if (result.data.length > 0) {
          setSelectedCarId(result.data[0].carId);
        }
      }
      setCarsLoading(false);
    }
    loadCars();
  }, [session?.user?.id]);

  // Compute ratio with debounce
  const computeRatio = useCallback((spurVal: string, pinionVal: string) => {
    const spurNum = Number(spurVal);
    const pinionNum = Number(pinionVal);

    if (!spurVal || !pinionVal) {
      setRatio(null);
      setErrors([]);
      return;
    }

    const validation = validateGearInput(spurNum, pinionNum);
    setErrors(validation.errors);

    if (validation.valid) {
      setRatio(computeGearRatio(spurNum, pinionNum));
    } else {
      setRatio(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      computeRatio(spur, pinion);
    }, 200);
    return () => clearTimeout(timer);
  }, [spur, pinion, computeRatio]);

  async function handleSave() {
    if (!session?.user?.id || !selectedCarId || ratio === null) return;

    setSaving(true);
    setSaveStatus("");

    const result = await saveGearRatio(selectedCarId, session.user.id, {
      spur: Number(spur),
      pinion: Number(pinion),
      ratio,
    });

    if (result.success) {
      setSaveStatus("Gear ratio saved successfully!");
    } else {
      setSaveStatus(result.error);
    }
    setSaving(false);
  }

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Gear Ratio Calculator
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Calculate and save gear ratios for your car profiles.
          </p>
        </div>

        {/* Calculator Section */}
        <section className="rounded-xl bg-white p-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="spur"
                className="block text-sm font-medium text-zinc-600"
              >
                Spur Gear (30–130)
              </label>
              <input
                id="spur"
                type="number"
                min={30}
                max={130}
                step={1}
                value={spur}
                onChange={(e) => setSpur(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="80"
              />
            </div>
            <div>
              <label
                htmlFor="pinion"
                className="block text-sm font-medium text-zinc-600"
              >
                Pinion Gear (10–60)
              </label>
              <input
                id="pinion"
                type="number"
                min={10}
                max={60}
                step={1}
                value={pinion}
                onChange={(e) => setPinion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="25"
              />
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="rounded-lg bg-red-900/30 border border-red-700/50 p-3">
              <ul className="space-y-1">
                {errors.map((error, i) => (
                  <li key={i} className="text-sm text-red-300">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Computed Ratio */}
          {ratio !== null && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-center">
              <p className="text-sm text-amber-300">Gear Ratio</p>
              <p className="text-4xl font-bold text-amber-400">{ratio}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {spur}T spur / {pinion}T pinion
              </p>
            </div>
          )}
        </section>

        {/* Save to Car Profile Section */}
        <section className="rounded-xl bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Save to Car Profile
          </h2>

          {carsLoading ? (
            <p className="text-sm text-zinc-400">Loading car profiles...</p>
          ) : cars.length === 0 ? (
            <div className="rounded-lg bg-zinc-100 p-4 text-center">
              <p className="text-sm text-zinc-400">
                Create a car profile first to save gear ratios.
              </p>
              <Link
                href="/cars/new"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-400 hover:text-amber-300"
              >
                Create a car profile
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="car-select"
                  className="block text-sm font-medium text-zinc-600"
                >
                  Select Car
                </label>
                <select
                  id="car-select"
                  value={selectedCarId}
                  onChange={(e) => setSelectedCarId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {cars.map((car) => (
                    <option key={car.carId} value={car.carId}>
                      {car.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || ratio === null}
                className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save to Car Profile"}
              </button>

              {saveStatus && (
                <p
                  className={`text-sm ${
                    saveStatus.includes("success")
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {saveStatus}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
