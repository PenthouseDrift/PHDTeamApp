import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMemberCars, getCarCalibrationCount } from "@/actions/cars";

import { AITuningBanner } from "@/components/cars/AITuningBanner";

export const dynamic = "force-dynamic";

export default async function CarsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const result = await getMemberCars(session.user.id);
  const cars = result.success ? result.data : [];

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">My Cars</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Manage your RC drift car profiles and setup calibrations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/tuning-advisor"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-500/15 border border-purple-500/30 px-3.5 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors"
            >
              <TuningIcon className="w-4 h-4" />
              <span>AI Tuning Advisor</span>
            </Link>
            <Link
              href="/cars/new"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-amber-400 shadow-sm"
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
              Add New Car
            </Link>
          </div>
        </div>

        {/* Dismissible AI Tuning Banner Prompt */}
        <AITuningBanner />

        {/* Car Grid */}
        {cars.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center shadow-sm">
            <svg
              className="mb-4 h-16 w-16 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
              />
            </svg>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No cars in your garage yet</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Add your first RC drift car to start tracking setup calibrations and AI tuning.
            </p>
            <Link
              href="/cars/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 shadow-md"
            >
              Add Your First Car
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {await Promise.all(
              cars.map(async (car) => {
                const calibrationCount = await getCarCalibrationCount(car.carId);
                return (
                  <Link
                    key={car.carId}
                    href={`/cars/${car.carId}`}
                    className="group overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all hover:border-amber-500/60 shadow-sm"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
                      {car.images[0] ? (
                        <img
                          src={car.images[0]}
                          alt={car.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <svg
                            className="h-12 w-12 text-zinc-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-4 space-y-1">
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-amber-500 transition-colors">
                        {car.name}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                        <span>
                          {calibrationCount}{" "}
                          {calibrationCount === 1 ? "calibration" : "calibrations"}
                        </span>
                        <span className="font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                          <TuningIcon className="w-3.5 h-3.5" /> AI Tune
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}
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
