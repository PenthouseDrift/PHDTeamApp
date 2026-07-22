import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getCar } from "@/actions/cars";
import { getCarCalibrations } from "@/actions/calibration";
import { DeleteCarButton } from "./DeleteCarButton";
import { CalibrationCard } from "@/components/cars/CalibrationCard";
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
          Back to My Cars
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{car.name}</h1>
          <div className="flex gap-2">
            <Link
              href={`/cars/${carId}/edit`}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200"
            >
              Edit
            </Link>
            <DeleteCarButton carId={carId} carName={car.name} />
          </div>
        </div>

        {/* Image Gallery */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Photos</h2>
          {car.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {car.images.map((imageUrl, index) => (
                <div
                  key={index}
                  className="aspect-square overflow-hidden rounded-lg bg-zinc-100"
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos uploaded.</p>
          )}
        </section>

        {/* Calibrations */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Calibration Setups
            </h2>
            <Link
              href={`/cars/${carId}/calibrations/new`}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-amber-400"
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
              Add Calibration
            </Link>
          </div>

          {calibrations.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center">
              <svg
                className="mx-auto mb-3 h-12 w-12 text-zinc-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                />
              </svg>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No calibrations yet</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Add a calibration setup to track your car&apos;s settings.
              </p>
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
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Saved Gear Ratios
            </h2>
            <Link
              href="/calculator"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Calculator
            </Link>
          </div>
          {gearRatios.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No gear ratios saved yet.</p>
              <Link
                href="/calculator"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                Open Calculator →
              </Link>
            </div>
          ) : (
            <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                  <tr className="text-left text-zinc-600 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Spur</th>
                    <th className="px-4 py-2.5 font-medium">Pinion</th>
                    <th className="px-4 py-2.5 font-medium">Ratio</th>
                    <th className="px-4 py-2.5 font-medium text-blue-600 dark:text-blue-400">FDR*</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {gearRatios.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium">{r.spur}T</td>
                      <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium">{r.pinion}T</td>
                      <td className="px-4 py-2.5 text-amber-600 dark:text-amber-400 font-bold">{r.ratio}</td>
                      <td className="px-4 py-2.5 text-blue-600 dark:text-blue-400 font-bold">
                        {r.fdr ? r.fdr : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[10px] text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
                * FDR (Final Drive Ratio) shown if chassis internal ratio was set in calculator
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
