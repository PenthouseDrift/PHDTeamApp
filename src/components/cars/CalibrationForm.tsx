"use client";

import { useState } from "react";

interface CustomParamInput {
  name: string;
  value: string;
}

interface CalibrationFormData {
  name: string;
  [key: string]: unknown;
  customParams: CustomParamInput[];
}

interface CalibrationFormProps {
  onSubmit: (data: CalibrationFormData) => Promise<void>;
  initialData?: Partial<CalibrationFormData>;
}

interface FieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "range";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
}

const sections: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Steering & Alignment",
    fields: [
      { key: "frontCamber", label: "Front Camber", type: "number", min: -15, max: 0, step: 0.5, unit: "°" },
      { key: "rearCamber", label: "Rear Camber", type: "number", min: -15, max: 0, step: 0.5, unit: "°" },
      { key: "frontToe", label: "Front Toe", type: "number", min: -5, max: 5, step: 0.5, unit: "°" },
      { key: "rearToe", label: "Rear Toe", type: "number", min: -5, max: 5, step: 0.5, unit: "°" },
      { key: "frontCaster", label: "Front Caster", type: "number", min: 0, max: 30, step: 1, unit: "°" },
      { key: "ackermann", label: "Ackermann", type: "number", min: -100, max: 100, step: 5, unit: "%" },
      { key: "steeringAngle", label: "Steering Angle / Throw", type: "number", min: 0, max: 90, step: 1, unit: "°" },
    ],
  },
  {
    title: "Suspension",
    fields: [
      { key: "frontRideHeight", label: "Front Ride Height", type: "number", min: 0, max: 20, step: 0.5, unit: "mm" },
      { key: "rearRideHeight", label: "Rear Ride Height", type: "number", min: 0, max: 20, step: 0.5, unit: "mm" },
      { key: "frontSpringRate", label: "Front Spring", type: "text", placeholder: "e.g. Silver / Soft" },
      { key: "rearSpringRate", label: "Rear Spring", type: "text", placeholder: "e.g. Gold / Medium" },
      { key: "frontDamping", label: "Front Damping", type: "range", min: 0, max: 10, step: 1 },
      { key: "rearDamping", label: "Rear Damping", type: "range", min: 0, max: 10, step: 1 },
      { key: "frontRebound", label: "Front Rebound", type: "range", min: 0, max: 10, step: 1 },
      { key: "rearRebound", label: "Rear Rebound", type: "range", min: 0, max: 10, step: 1 },
      { key: "frontDroop", label: "Front Droop", type: "number", min: 0, max: 10, step: 0.5, unit: "mm" },
      { key: "rearDroop", label: "Rear Droop", type: "number", min: 0, max: 10, step: 0.5, unit: "mm" },
    ],
  },
  {
    title: "Drivetrain & Electronics",
    fields: [
      { key: "gyroGain", label: "Gyro Gain", type: "range", min: 0, max: 100, step: 5 },
      { key: "throttleEPA", label: "Throttle EPA", type: "range", min: 0, max: 100, step: 5 },
      { key: "steeringEPA", label: "Steering EPA", type: "range", min: 0, max: 100, step: 5 },
      { key: "boost", label: "Boost", type: "range", min: 0, max: 100, step: 5 },
      { key: "turbo", label: "Turbo", type: "range", min: 0, max: 100, step: 5 },
    ],
  },
  {
    title: "Geometry & Weight",
    fields: [
      { key: "frontTrackWidth", label: "Front Track Width", type: "number", min: 0, max: 250, step: 1, unit: "mm" },
      { key: "rearTrackWidth", label: "Rear Track Width", type: "number", min: 0, max: 250, step: 1, unit: "mm" },
      { key: "wheelbase", label: "Wheelbase", type: "number", min: 0, max: 300, step: 1, unit: "mm" },
      { key: "totalWeight", label: "Total Weight", type: "number", min: 0, max: 5000, step: 10, unit: "g" },
      { key: "batteryPosition", label: "Battery Position", type: "text", placeholder: "e.g. Front / Mid / Rear" },
    ],
  },
  {
    title: "Tyres",
    fields: [
      { key: "frontTyres", label: "Front Tyres", type: "text", placeholder: "e.g. DS Racing Drift Element" },
      { key: "rearTyres", label: "Rear Tyres", type: "text", placeholder: "e.g. DS Racing Drift Element" },
    ],
  },
];

export default function CalibrationForm({ onSubmit, initialData }: CalibrationFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const initial: Record<string, string | number> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        const val = initialData?.[field.key];
        if (field.type === "text") {
          initial[field.key] = (val as string) ?? "";
        } else {
          initial[field.key] = (val as number) ?? (field.key === "throttleEPA" || field.key === "steeringEPA" ? 100 : 0);
        }
      }
    }
    return initial;
  });
  const [customParams, setCustomParams] = useState<CustomParamInput[]>(
    (initialData?.customParams as CustomParamInput[]) ?? []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateValue(key: string, val: string | number) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function addCustomParam() {
    if (customParams.length >= 10) return;
    setCustomParams([...customParams, { name: "", value: "" }]);
  }

  function removeCustomParam(index: number) {
    setCustomParams(customParams.filter((_, i) => i !== index));
  }

  function updateCustomParam(index: number, field: "name" | "value", val: string) {
    const updated = [...customParams];
    updated[index] = { ...updated[index], [field]: val };
    setCustomParams(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Setup name is required");
      return;
    }

    setSubmitting(true);
    try {
      const data: CalibrationFormData = {
        name: name.trim(),
        ...values,
        customParams: customParams.filter((p) => p.name.trim() && p.value.trim()),
      };
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Name */}
      <div>
        <label htmlFor="cal-name" className="block text-sm font-medium text-zinc-600">
          Setup Name
        </label>
        <input
          id="cal-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Track Day Grip Setup"
          maxLength={50}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* Parameter Sections */}
      {sections.map((section) => (
        <fieldset key={section.title} className="space-y-4">
          <legend className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
            {section.title}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  {field.label}
                  {field.unit && <span className="text-zinc-600 ml-1">({field.unit})</span>}
                </label>
                {field.type === "range" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={1}
                      value={Number(values[field.key]) || 0}
                      onChange={(e) => updateValue(field.key, Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={values[field.key]}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          updateValue(field.key, 0);
                        } else {
                          const num = parseInt(val, 10);
                          if (!isNaN(num)) updateValue(field.key, num);
                        }
                      }}
                      className="w-14 text-center rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm font-medium text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                ) : field.type === "text" ? (
                  <input
                    type="text"
                    value={values[field.key] as string}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={Number(values[field.key]) || 0}
                      onChange={(e) => updateValue(field.key, Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values[field.key]}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || val === "-" || val === "-." || val === ".") {
                          updateValue(field.key, val as unknown as number);
                        } else {
                          const num = parseFloat(val);
                          if (!isNaN(num)) updateValue(field.key, num);
                        }
                      }}
                      className="w-16 text-center rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm font-medium text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {/* Custom Parameters */}
      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
            Custom Parameters
          </legend>
          <button
            type="button"
            onClick={addCustomParam}
            disabled={customParams.length >= 10}
            className="text-xs font-medium text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
        {customParams.length === 0 && (
          <p className="text-xs text-zinc-500">No custom parameters. Add up to 10.</p>
        )}
        {customParams.map((param, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={param.name}
              onChange={(e) => updateCustomParam(index, "name", e.target.value)}
              placeholder="Name"
              maxLength={30}
              className="flex-1 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <input
              type="text"
              value={param.value}
              onChange={(e) => updateCustomParam(index, "value", e.target.value)}
              placeholder="Value"
              maxLength={30}
              className="flex-1 rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={() => removeCustomParam(index)}
              className="p-2 text-zinc-500 hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </fieldset>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Saving..." : "Save Calibration"}
      </button>
    </form>
  );
}
