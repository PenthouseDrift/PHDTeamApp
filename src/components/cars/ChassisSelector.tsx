"use client";

import { useState, useEffect } from "react";
import { chassisPresets, brands } from "@/lib/chassis-data";

interface ChassisSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ChassisSelector({ value, onChange }: ChassisSelectorProps) {
  // Derive initial state from value prop (e.g. "Yokomo YD-2 Series (Standard)" or "Other: Custom Name")
  function deriveInitialState(val: string): { brand: string; model: string; isOther: boolean; customText: string } {
    if (!val) return { brand: "", model: "", isOther: false, customText: "" };

    const match = chassisPresets.find((c) => `${c.brand} ${c.model}` === val);
    if (match) {
      return { brand: match.brand, model: val, isOther: false, customText: "" };
    }

    // Check if it matches a known brand but unknown model
    const brandMatch = brands.find((b) => val.startsWith(b + " "));
    if (brandMatch) {
      return { brand: brandMatch, model: "", isOther: true, customText: val.replace(brandMatch + " ", "") };
    }

    // Fully custom
    return { brand: "Other", model: "", isOther: true, customText: val };
  }

  const init = deriveInitialState(value);
  const [selectedBrand, setSelectedBrand] = useState(init.brand);
  const [selectedModel, setSelectedModel] = useState(init.model);
  const [isOther, setIsOther] = useState(init.isOther);
  const [customText, setCustomText] = useState(init.customText);

  // When value changes externally (e.g. loaded from edit), re-derive
  useEffect(() => {
    const derived = deriveInitialState(value);
    setSelectedBrand(derived.brand);
    setSelectedModel(derived.model);
    setIsOther(derived.isOther);
    setCustomText(derived.customText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const modelsForBrand = chassisPresets.filter((c) => c.brand === selectedBrand);
  const selectedPreset = chassisPresets.find((c) => `${c.brand} ${c.model}` === selectedModel);

  function handleBrandChange(brand: string) {
    setSelectedBrand(brand);
    setSelectedModel("");
    setIsOther(false);
    setCustomText("");
    onChange(""); // clear until model is chosen
  }

  function handleModelChange(model: string) {
    if (model === "__other__") {
      setSelectedModel("");
      setIsOther(true);
      setCustomText("");
      onChange("");
    } else {
      setSelectedModel(model);
      setIsOther(false);
      setCustomText("");
      onChange(model);
    }
  }

  function handleCustomTextChange(text: string) {
    setCustomText(text);
    if (selectedBrand && selectedBrand !== "Other") {
      onChange(`${selectedBrand} ${text}`);
    } else {
      onChange(text);
    }
  }

  return (
    <div className="space-y-3">
      {/* Step 1: Brand */}
      <div>
        <label htmlFor="chassis-brand" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
          Step 1 — Select Brand
        </label>
        <select
          id="chassis-brand"
          value={selectedBrand}
          onChange={(e) => handleBrandChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm"
        >
          <option value="">Select brand...</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
          <option value="Other">Other / Not listed</option>
        </select>
      </div>

      {/* Step 2: Model — only show once brand is selected */}
      {selectedBrand && selectedBrand !== "Other" && (
        <div>
          <label htmlFor="chassis-model" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
            Step 2 — Select Model
          </label>
          <select
            id="chassis-model"
            value={isOther ? "__other__" : selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm"
          >
            <option value="">Select model...</option>
            {modelsForBrand.map((c) => (
              <option key={`${c.brand} ${c.model}`} value={`${c.brand} ${c.model}`}>
                {c.model}{c.notes ? ` — ${c.notes}` : ""}
              </option>
            ))}
            <option value="__other__">Other / Not listed</option>
          </select>
        </div>
      )}

      {/* Step 2 (Other brand): show text input immediately */}
      {selectedBrand === "Other" && (
        <div>
          <label htmlFor="chassis-custom" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
            Step 2 — Enter Chassis Name
          </label>
          <input
            id="chassis-custom"
            type="text"
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="e.g. Custom Build, HPI RS4, Tamiya TT-02D..."
            maxLength={100}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm"
          />
        </div>
      )}

      {/* Step 2 (Known brand, Other model): show text input */}
      {isOther && selectedBrand && selectedBrand !== "Other" && (
        <div>
          <label htmlFor="chassis-custom-model" className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
            Enter Model Name
          </label>
          <input
            id="chassis-custom-model"
            type="text"
            value={customText}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder={`e.g. ${selectedBrand} Custom Model...`}
            maxLength={100}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 text-sm"
          />
        </div>
      )}

      {/* Result preview */}
      {selectedPreset && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3.5 py-2.5">
          <span className="text-amber-500 text-base">⚙️</span>
          <div className="text-xs">
            <p className="font-bold text-zinc-900 dark:text-zinc-100">{selectedPreset.brand} {selectedPreset.model}</p>
            <p className="text-zinc-500 dark:text-zinc-400">
              Internal ratio: <span className="font-semibold text-amber-600 dark:text-amber-400">{selectedPreset.internalRatio}:1</span>
              {selectedPreset.notes && <span className="ml-2 text-zinc-400">· {selectedPreset.notes}</span>}
            </p>
          </div>
        </div>
      )}

      {(isOther || selectedBrand === "Other") && customText && (
        <div className="flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3.5 py-2.5">
          <span className="text-base">📝</span>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Saved as: <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {selectedBrand && selectedBrand !== "Other" ? `${selectedBrand} ${customText}` : customText}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
