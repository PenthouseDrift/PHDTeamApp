import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCar } from "@/actions/cars";
import { getCarCalibrations } from "@/actions/calibration";
import { DeleteCarButton } from "./DeleteCarButton";

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
  const calibrations = await getCarCalibrations(carId);

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
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
          <h1 className="text-2xl font-bold text-zinc-900">{car.name}</h1>
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
          <h2 className="text-lg font-semibold text-zinc-900">Photos</h2>
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
            <p className="text-sm text-zinc-500">No photos uploaded.</p>
          )}
        </section>

        {/* Calibrations */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">
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
              <p className="text-sm text-zinc-500">No calibrations yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Add a calibration setup to track your car&apos;s settings.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {calibrations.map((cal) => (
                <Link
                  key={cal.calibrationId}
                  href={`/cars/${carId}/calibrations/${cal.calibrationId}/edit`}
                  className="block rounded-xl bg-white p-4 transition-colors hover:bg-zinc-100"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-900">
                      {cal.name}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {new Date(cal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>F.Camber: {cal.frontCamber}°</span>
                    <span>R.Camber: {cal.rearCamber}°</span>
                    <span>Gyro: {cal.gyroGain}%</span>
                    <span>Boost: {cal.boost}%</span>
                    {cal.customParams.length > 0 && (
                      <span>+{cal.customParams.length} custom</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
