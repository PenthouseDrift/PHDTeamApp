"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createCalibration } from "@/actions/calibration";
import CalibrationForm from "@/components/cars/CalibrationForm";
import Link from "next/link";

export default function NewCalibrationPage() {
  const { carId } = useParams<{ carId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [error, setError] = useState<string | null>(null);

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

        {/* Form */}
        <CalibrationForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
