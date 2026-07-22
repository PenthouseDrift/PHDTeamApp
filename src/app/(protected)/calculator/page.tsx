"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { computeGearRatio, validateGearInput } from "@/lib/calculator";
import { saveGearRatio, getMemberCarsForSelect } from "@/actions/calculator";
import { chassisPresets, brands } from "@/lib/chassis-data";

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
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedChassis, setSelectedChassis] = useState<string>("");
  const [internalRatio, setInternalRatio] = useState<number>(2.6);

  const [cars, setCars] = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Handle chassis selection
  function handleChassisChange(value: string) {
    setSelectedChassis(value);
    const preset = chassisPresets.find(c => `${c.brand} ${c.model}` === value);
    if (preset) {
      setInternalRatio(preset.internalRatio);
    }
  }

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
      fdr: Math.round(ratio * internalRatio * 100) / 100,
      internalRatio,
    });

    if (result.success) {
      setSaveStatus("Gear ratio saved successfully!");
    } else {
      setSaveStatus(result.error);
    }
    setSaving(false);
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Gear Ratio Calculator
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Calculate and save gear ratios for your car profiles.
          </p>
        </div>

        {/* Chassis Preset Selector */}
        <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Chassis Internal Ratio
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select your chassis to auto-fill the internal gear ratio, or enter it manually.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Brand</label>
              <select
                value={selectedBrand}
                onChange={(e) => {
                  setSelectedBrand(e.target.value);
                  setSelectedChassis("");
                }}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">All brands</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Chassis</label>
              <select
                value={selectedChassis}
                onChange={(e) => handleChassisChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">Select chassis...</option>
                {chassisPresets
                  .filter(c => !selectedBrand || c.brand === selectedBrand)
                  .map((c) => (
                    <option key={`${c.brand} ${c.model}`} value={`${c.brand} ${c.model}`}>
                      {c.brand} {c.model} ({c.internalRatio}:1)
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Internal Ratio (or enter manually)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={internalRatio}
              onChange={(e) => {
                const num = parseFloat(e.target.value);
                if (!isNaN(num) && num > 0) setInternalRatio(num);
              }}
              className="w-32 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </section>

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
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Gear Ratio (Spur/Pinion)</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{ratio}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {spur}T / {pinion}T
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Final Drive Ratio (FDR)</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {(ratio * internalRatio).toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {ratio} × {internalRatio} internal
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Save to Car Profile Section */}
        <section className="rounded-xl bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Save to Car Profile
          </h2>

          {carsLoading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading car profiles...</p>
          ) : cars.length === 0 ? (
            <div className="rounded-lg bg-zinc-100 p-4 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
