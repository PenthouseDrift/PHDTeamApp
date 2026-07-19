"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getCalibration, updateCalibration } from "@/actions/calibration-edit";
import CalibrationForm from "@/components/cars/CalibrationForm";
import Link from "next/link";

export default function EditCalibrationPage() {
  const { carId, calibrationId } = useParams<{ carId: string; calibrationId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!session?.user?.id) return;
      const result = await getCalibration(calibrationId, session.user.id);
      if (result.success) {
        setInitialData(result.data as unknown as Record<string, unknown>);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    load();
  }, [calibrationId, session?.user?.id]);

  async function handleSubmit(data: Record<string, unknown>) {
    setError(null);
    if (!session?.user?.id) {
      setError("You must be logged in");
      return;
    }

    const result = await updateCalibration(calibrationId, session.user.id, data);
    if (result.success) {
      router.push(`/cars/${carId}`);
    } else {
      setError(result.error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 flex items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/cars/${carId}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Car
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Edit Calibration</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Update your setup parameters.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {initialData && (
          <CalibrationForm onSubmit={handleSubmit} initialData={initialData} />
        )}
      </div>
    </div>
  );
}
