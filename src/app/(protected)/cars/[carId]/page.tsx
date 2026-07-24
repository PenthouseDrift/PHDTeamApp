import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCar } from "@/actions/cars";
import { getCarCalibrations } from "@/actions/calibration";
import { DeleteCarButton } from "./DeleteCarButton";
import { CalibrationCard } from "@/components/cars/CalibrationCard";
import { GearRatioTable } from "@/components/cars/GearRatioTable";
import type { GearRatio } from "@/types";

export const dynamic = "force-dynamic";

interface CarDetailPageProps {
  params: Promise<{ carId: string }>;
}

export default async function CarDetailPage({ params }: CarDetailPageProps) {
  const { carId } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const result = await getCar(carId, session.user.id);
  if (!result.success) {
    notFound();
  }

  const car = result.data;

  // Fetch calibrations and gear ratios in parallel
  const [calibrations, gearRatioRaw] = await Promise.all([
    getCarCalibrations(carId),
    redis.lrange(`car:${carId}:ratios`, 0, -1),
  ]);

  const gearRatios: Array<GearRatio & { fdr?: number; internalRatio?: number }> = (gearRatioRaw || []).map((r) => {
    if (typeof r === "string") {
      try { return JSON.parse(r); } catch { return null; }
    }
    return r as unknown;
  }).filter(Boolean) as Array<GearRatio & { fdr?: number; internalRatio?: number }>;

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back link */}
        <Link
          href="/cars"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
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
          Back to My Cars
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{car.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/tuning-advisor"
              className="rounded-xl bg-purple-500/15 border border-purple-500/30 px-3.5 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 transition-colors hover:bg-purple-500/25 flex items-center gap-1.5"
            >
              <TuningIcon className="w-4 h-4" />
              <span>AI Tune Setup</span>
            </Link>
            <Link
              href={`/cars/${carId}/edit`}
              className="rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Edit Car
            </Link>
            <DeleteCarButton carId={carId} carName={car.name} />
          </div>
        </div>

        {/* Image Gallery */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Photos</h2>
          {car.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {car.images.map((imageUrl, index) => (
                <div
                  key={index}
                  className="aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800"
                >
                  <img
                    src={imageUrl}
                    alt={`${car.name} photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No photos uploaded for this car.</p>
          )}
        </section>

        {/* Calibrations */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Calibration Setups
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/cars/${carId}/calibrations/beginner-ai`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 px-3 py-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors shadow-sm"
              >
                <span>✨</span> Generate AI Calibration Setup
              </Link>
              <Link
                href={`/cars/${carId}/calibrations/new`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 shadow-sm"
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
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Add Manual Calibration
              </Link>
            </div>
          </div>

          {calibrations.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-600 dark:text-purple-400">
                <TuningIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">No Calibration Setups Saved Yet</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                  Generate a complete starting baseline setup for your chassis and surface using AI, or log your setup parameters manually.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <Link
                  href={`/cars/${carId}/calibrations/beginner-ai`}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-500/15 border border-purple-500/30 px-4 py-2.5 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors shadow-sm"
                >
                  <span>✨</span> Generate AI Calibration Setup
                </Link>
                <Link
                  href={`/cars/${carId}/calibrations/new`}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 shadow-sm"
                >
                  + Add Manual Calibration
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {calibrations.map((cal) => (
                <CalibrationCard key={cal.calibrationId} cal={cal} />
              ))}
            </div>
          )}
        </section>

        {/* Gear Ratios */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Saved Gear Ratios
            </h2>
            <Link
              href="/calculator"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              FDR Calculator
            </Link>
          </div>
          {gearRatios.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 text-center shadow-sm">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">No gear ratios saved for this car yet.</p>
              <Link
                href="/calculator"
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-500 hover:text-amber-700"
              >
                Open FDR Calculator →
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <GearRatioTable carId={carId} ratios={gearRatios} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TuningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}
