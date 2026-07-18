import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMemberCars, getCarCalibrationCount } from "@/actions/cars";

export default async function CarsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const result = await getMemberCars(session.user.id);
  const cars = result.success ? result.data : [];

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">My Cars</h1>
          <Link
            href="/cars/new"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
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

        {/* Car Grid */}
        {cars.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-900 p-12 text-center">
            <svg
              className="mb-4 h-16 w-16 text-zinc-600"
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
            <h2 className="text-lg font-semibold text-white">No cars yet</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Add your first RC car to start tracking setups and calibrations.
            </p>
            <Link
              href="/cars/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-400"
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
                    className="group overflow-hidden rounded-xl bg-zinc-900 transition-colors hover:bg-zinc-800"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video w-full overflow-hidden bg-zinc-800">
                      {car.images[0] ? (
                        <img
                          src={car.images[0]}
                          alt={car.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <svg
                            className="h-12 w-12 text-zinc-600"
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
                    <div className="p-4">
                      <h3 className="font-semibold text-white truncate">
                        {car.name}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        {calibrationCount}{" "}
                        {calibrationCount === 1 ? "calibration" : "calibrations"}
                      </p>
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
