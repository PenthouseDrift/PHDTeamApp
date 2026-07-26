"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createCalibration } from "@/actions/calibration";
import { getCar } from "@/actions/cars";
import CalibrationForm from "@/components/cars/CalibrationForm";
import Link from "next/link";
import { chassisPresets } from "@/lib/chassis-data";

export default function NewCalibrationPage() {
  const { carId } = useParams<{ carId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [carName, setCarName] = useState<string | null>(null);
  const [chassisLabel, setChassisLabel] = useState<string | null>(null);
  const [detectedRatio, setDetectedRatio] = useState<number | null>(null);

  useEffect(() => {
    async function loadCarChassis() {
      if (!session?.user?.id) return;
      const result = await getCar(carId, session.user.id);
      if (result.success && result.data.chassis) {
        setCarName(result.data.name);
        setChassisLabel(result.data.chassis);
        const preset = chassisPresets.find(
          (c) => `${c.brand} ${c.model}` === result.data.chassis
        );
        if (preset) setDetectedRatio(preset.internalRatio);
      } else if (result.success) {
        setCarName(result.data.name);
      }
    }
    loadCarChassis();
  }, [carId, session?.user?.id]);

  async function handleSubmit(data: Record<string, unknown> & { customParams: { name: string; value: string }[] }) {
    setError(null);

    if (!session?.user?.id) {
      setError("You must be logged in");
      return;
    }

    const result = await createCalibration(carId, session.user.id, data);

    if (result.success) {
      router.push(`/cars/${carId}`);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back link */}
        <Link
          href={`/cars/${carId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Car
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            New Calibration Setup
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Record your suspension and power settings for this car.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Chassis pre-fill banner */}
        {chassisLabel && (
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
            <span className="text-xl">⚙️</span>
            <div className="text-sm">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                Chassis detected: <span className="text-amber-600 dark:text-amber-400">{chassisLabel}</span>
              </p>
              {detectedRatio && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Internal ratio <strong className="text-zinc-700 dark:text-zinc-300">{detectedRatio}:1</strong> has been pre-filled in the Drivetrain section.
                </p>
              )}
              {!detectedRatio && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Custom chassis — please enter your internal ratio manually.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <CalibrationForm
          onSubmit={handleSubmit}
          initialData={detectedRatio ? { internalRatio: detectedRatio } : undefined}
        />
      </div>
    </div>
  );
}
