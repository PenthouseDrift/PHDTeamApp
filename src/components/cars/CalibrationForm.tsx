"use client";

import { useState } from "react";

interface CustomParamInput {
  name: string;
  value: string;
}

interface CalibrationFormData {
  name: string;
  camber: number;
  toe: number;
  caster: number;
  boost: number;
  customParams: CustomParamInput[];
}

interface CalibrationFormProps {
  onSubmit: (data: CalibrationFormData) => Promise<void>;
  initialData?: Partial<CalibrationFormData>;
}

export default function CalibrationForm({
  onSubmit,
  initialData,
}: CalibrationFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [camber, setCamber] = useState<string>(
    initialData?.camber?.toString() ?? "0"
  );
  const [toe, setToe] = useState<string>(
    initialData?.toe?.toString() ?? "0"
  );
  const [caster, setCaster] = useState<string>(
    initialData?.caster?.toString() ?? "0"
  );
  const [boost, setBoost] = useState<number>(initialData?.boost ?? 50);
  const [customParams, setCustomParams] = useState<CustomParamInput[]>(
    initialData?.customParams ?? []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim() || name.trim().length > 50) {
      newErrors.name = "Name is required (1-50 characters)";
    }

    const camberNum = parseFloat(camber);
    if (isNaN(camberNum) || camberNum < -15 || camberNum > 15) {
      newErrors.camber = "Camber must be between -15.0 and +15.0";
    }

    const toeNum = parseFloat(toe);
    if (isNaN(toeNum) || toeNum < -10 || toeNum > 10) {
      newErrors.toe = "Toe must be between -10.0 and +10.0";
    }

    const casterNum = parseFloat(caster);
    if (isNaN(casterNum) || casterNum < -15 || casterNum > 15) {
      newErrors.caster = "Caster must be between -15.0 and +15.0";
    }

    if (boost < 0 || boost > 100 || !Number.isInteger(boost)) {
      newErrors.boost = "Boost must be an integer between 0 and 100";
    }

    for (let i = 0; i < customParams.length; i++) {
      const param = customParams[i];
      if (!param.name.trim() || param.name.trim().length > 30) {
        newErrors[`customParam_${i}_name`] =
          "Parameter name is required (1-30 chars)";
      }
      if (!param.value.trim() || param.value.trim().length > 30) {
        newErrors[`customParam_${i}_value`] =
          "Parameter value is required (1-30 chars)";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        camber: parseFloat(camber),
        toe: parseFloat(toe),
        caster: parseFloat(caster),
        boost,
        customParams: customParams.map((p) => ({
          name: p.name.trim(),
          value: p.value.trim(),
        })),
      });
    } finally {
      setSubmitting(false);
    }
  }

  function addCustomParam() {
    if (customParams.length >= 10) return;
    setCustomParams([...customParams, { name: "", value: "" }]);
  }

  function removeCustomParam(index: number) {
    setCustomParams(customParams.filter((_, i) => i !== index));
    // Clear related errors
    const newErrors = { ...errors };
    delete newErrors[`customParam_${index}_name`];
    delete newErrors[`customParam_${index}_value`];
    setErrors(newErrors);
  }

  function updateCustomParam(
    index: number,
    field: "name" | "value",
    val: string
  ) {
    const updated = [...customParams];
    updated[index] = { ...updated[index], [field]: val };
    setCustomParams(updated);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label
          htmlFor="calibration-name"
          className="block text-sm font-medium text-zinc-300"
        >
          Setup Name
        </label>
        <input
          id="calibration-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Track Day Grip Setup"
          maxLength={50}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {errors.name && (
          <p className="mt-1.5 text-sm text-red-400">{errors.name}</p>
        )}
        <p className="mt-1.5 text-xs text-zinc-500">
          {name.length}/50 characters
        </p>
      </div>

      {/* Camber */}
      <div>
        <label
          htmlFor="calibration-camber"
          className="block text-sm font-medium text-zinc-300"
        >
          Camber (°)
        </label>
        <input
          id="calibration-camber"
          type="number"
          step="0.1"
          min={-15}
          max={15}
          value={camber}
          onChange={(e) => setCamber(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {errors.camber && (
          <p className="mt-1.5 text-sm text-red-400">{errors.camber}</p>
        )}
        <p className="mt-1.5 text-xs text-zinc-500">Range: -15.0 to +15.0</p>
      </div>

      {/* Toe */}
      <div>
        <label
          htmlFor="calibration-toe"
          className="block text-sm font-medium text-zinc-300"
        >
          Toe (°)
        </label>
        <input
          id="calibration-toe"
          type="number"
          step="0.1"
          min={-10}
          max={10}
          value={toe}
          onChange={(e) => setToe(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {errors.toe && (
          <p className="mt-1.5 text-sm text-red-400">{errors.toe}</p>
        )}
        <p className="mt-1.5 text-xs text-zinc-500">Range: -10.0 to +10.0</p>
      </div>

      {/* Caster */}
      <div>
        <label
          htmlFor="calibration-caster"
          className="block text-sm font-medium text-zinc-300"
        >
          Caster (°)
        </label>
        <input
          id="calibration-caster"
          type="number"
          step="0.1"
          min={-15}
          max={15}
          value={caster}
          onChange={(e) => setCaster(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {errors.caster && (
          <p className="mt-1.5 text-sm text-red-400">{errors.caster}</p>
        )}
        <p className="mt-1.5 text-xs text-zinc-500">Range: -15.0 to +15.0</p>
      </div>

      {/* Boost */}
      <div>
        <label
          htmlFor="calibration-boost"
          className="block text-sm font-medium text-zinc-300"
        >
          Boost: {boost}%
        </label>
        <input
          id="calibration-boost"
          type="range"
          min={0}
          max={100}
          step={1}
          value={boost}
          onChange={(e) => setBoost(parseInt(e.target.value, 10))}
          className="mt-1.5 w-full accent-amber-500"
        />
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>0%</span>
          <span>100%</span>
        </div>
        {errors.boost && (
          <p className="mt-1.5 text-sm text-red-400">{errors.boost}</p>
        )}
      </div>

      {/* Custom Parameters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-zinc-300">
            Custom Parameters
          </label>
          <button
            type="button"
            onClick={addCustomParam}
            disabled={customParams.length >= 10}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Parameter
          </button>
        </div>

        {customParams.length === 0 && (
          <p className="text-xs text-zinc-500">
            No custom parameters added. Up to 10 allowed.
          </p>
        )}

        {customParams.map((param, index) => (
          <div
            key={index}
            className="flex items-start gap-2 rounded-lg bg-zinc-900 p-3"
          >
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={param.name}
                onChange={(e) =>
                  updateCustomParam(index, "name", e.target.value)
                }
                placeholder="Parameter name"
                maxLength={30}
                aria-label={`Custom parameter ${index + 1} name`}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {errors[`customParam_${index}_name`] && (
                <p className="text-xs text-red-400">
                  {errors[`customParam_${index}_name`]}
                </p>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={param.value}
                onChange={(e) =>
                  updateCustomParam(index, "value", e.target.value)
                }
                placeholder="Value"
                maxLength={30}
                aria-label={`Custom parameter ${index + 1} value`}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {errors[`customParam_${index}_value`] && (
                <p className="text-xs text-red-400">
                  {errors[`customParam_${index}_value`]}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeCustomParam(index)}
              aria-label={`Remove parameter ${index + 1}`}
              className="mt-1 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}

        {customParams.length >= 10 && (
          <p className="text-xs text-zinc-500">
            Maximum of 10 custom parameters reached.
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Save Calibration"}
      </button>
    </form>
  );
}
