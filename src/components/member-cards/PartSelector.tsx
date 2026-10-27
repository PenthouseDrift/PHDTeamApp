"use client";

import { useId, useState } from "react";
import { OTHER, splitPart, type PartCategory } from "@/lib/rc-parts-data";

/**
 * Pick one RC part: choose the brand, then the model, or type your own when it isn't listed.
 * Reports "Brand Model" (or "" while nothing is chosen). The value is read once when the picker
 * appears, so going back to this step shows what was already picked.
 */

const select =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const text =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function PartSelector({
  category,
  value,
  onChange,
}: {
  category: PartCategory;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [initial] = useState(() => splitPart(category, value));
  const [brand, setBrand] = useState(initial.brand);
  const [model, setModel] = useState(initial.model);
  const [custom, setCustom] = useState(initial.custom);

  const brands = Object.keys(category.catalog).sort();
  const models = brand && brand !== OTHER ? (category.catalog[brand] ?? []) : [];
  const typing = brand === OTHER || model === OTHER;

  const pickBrand = (next: string) => {
    setBrand(next);
    setModel("");
    setCustom("");
    onChange("");
  };

  const pickModel = (next: string) => {
    setModel(next);
    setCustom("");
    onChange(next && next !== OTHER ? `${brand} ${next}` : "");
  };

  const typeCustom = (next: string) => {
    setCustom(next);
    const clean = next.trim();
    onChange(!clean ? "" : brand === OTHER ? clean : `${brand} ${clean}`);
  };

  return (
    <fieldset className="space-y-2 rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">{category.label}</legend>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-brand`} className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Brand
          </label>
          <select id={`${id}-brand`} className={select} value={brand} onChange={(e) => pickBrand(e.target.value)}>
            <option value="">Not set</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            <option value={OTHER}>Other / not listed</option>
          </select>
        </div>

        {brand && brand !== OTHER && (
          <div>
            <label htmlFor={`${id}-model`} className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Model
            </label>
            <select id={`${id}-model`} className={select} value={model} onChange={(e) => pickModel(e.target.value)}>
              <option value="">Choose a model</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>Other / not listed</option>
            </select>
          </div>
        )}
      </div>

      {typing && (
        <div>
          <label htmlFor={`${id}-custom`} className="mb-1 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {brand === OTHER ? "Brand and model" : `${brand} model`}
          </label>
          <input
            id={`${id}-custom`}
            className={text}
            value={custom}
            maxLength={brand === OTHER ? 32 : 24}
            placeholder={brand === OTHER ? "e.g. Brand Model 13.5T" : "e.g. Model 13.5T"}
            onChange={(e) => typeCustom(e.target.value)}
          />
        </div>
      )}
    </fieldset>
  );
}
