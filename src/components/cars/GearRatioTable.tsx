"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { removeGearRatio } from "@/actions/calculator";

interface GearRatioEntry {
  spur: number;
  pinion: number;
  ratio: number;
  fdr?: number;
  internalRatio?: number;
}

interface GearRatioTableProps {
  carId: string;
  ratios: GearRatioEntry[];
}

export function GearRatioTable({ carId, ratios: initialRatios }: GearRatioTableProps) {
  const { data: session } = useSession();
  const [ratios, setRatios] = useState(initialRatios);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove(index: number) {
    if (!session?.user?.id) return;
    startTransition(async () => {
      const result = await removeGearRatio(carId, session.user.id, index);
      if (result.success) {
        setRatios(ratios.filter((_, i) => i !== index));
      }
      setConfirmIndex(null);
    });
  }

  if (ratios.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
        No gear ratios saved yet.
      </p>
    );
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
          <tr className="text-left text-zinc-600 dark:text-zinc-400">
            <th className="px-4 py-2.5 font-medium">Spur</th>
            <th className="px-4 py-2.5 font-medium">Pinion</th>
            <th className="px-4 py-2.5 font-medium">Ratio</th>
            <th className="px-4 py-2.5 font-medium text-blue-600 dark:text-blue-400">FDR</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {ratios.map((r, i) => (
            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
              <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium">{r.spur}T</td>
              <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium">{r.pinion}T</td>
              <td className="px-4 py-2.5 text-amber-600 dark:text-amber-400 font-bold">{r.ratio}</td>
              <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">
                {r.fdr ? r.fdr : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => setConfirmIndex(i)}
                  className="text-zinc-400 hover:text-red-500 transition-colors p-1"
                  aria-label="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
        * FDR requires chassis internal ratio to be set in calculator
      </p>

      {/* Confirm delete modal */}
      {confirmIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmIndex(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-xs rounded-2xl bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Remove Gear Ratio?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Remove {ratios[confirmIndex]?.spur}T/{ratios[confirmIndex]?.pinion}T ({ratios[confirmIndex]?.ratio}) from this car?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmIndex(null)}
                className="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmIndex)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
