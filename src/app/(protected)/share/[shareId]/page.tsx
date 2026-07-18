import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import type { CalibrationSetup } from "@/types";

interface SharePageProps {
  params: Promise<{ shareId: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareId } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Look up share data
  const shareData = await redis.hgetall(`share:${shareId}`);

  if (!shareData || shareData.active !== "true") {
    return (
      <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-zinc-900 p-8 text-center">
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
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            <h1 className="text-lg font-semibold text-white">
              This setup is no longer available
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              The owner may have revoked sharing for this calibration setup.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Load calibration data
  const calibrationId = shareData.calibrationId as string;
  const calData = await redis.hgetall(`calibration:${calibrationId}`);

  if (!calData || Object.keys(calData).length === 0) {
    return (
      <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-zinc-900 p-8 text-center">
            <h1 className="text-lg font-semibold text-white">
              This setup is no longer available
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              The calibration setup may have been deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const calibration: CalibrationSetup = {
    calibrationId: calData.calibrationId as string,
    carId: calData.carId as string,
    userId: calData.userId as string,
    name: calData.name as string,
    camber: Number(calData.camber),
    toe: Number(calData.toe),
    caster: Number(calData.caster),
    boost: Number(calData.boost),
    customParams: JSON.parse((calData.customParams as string) || "[]"),
    createdAt: Number(calData.createdAt),
  };

  // Load car profile
  const carData = await redis.hgetall(`car:${calibration.carId}`);
  const carName = (carData?.name as string) || "Unknown Car";

  // Load creator info
  const creatorData = await redis.hgetall(`member:${calibration.userId}`);
  const creatorName = (creatorData?.name as string) || "Unknown User";

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <p className="text-sm text-zinc-400">Shared Calibration Setup</p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            {calibration.name}
          </h1>
        </div>

        {/* Meta info */}
        <div className="rounded-xl bg-zinc-900 p-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Car</dt>
              <dd className="mt-0.5 font-medium text-white">{carName}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Created by</dt>
              <dd className="mt-0.5 font-medium text-white">{creatorName}</dd>
            </div>
          </dl>
        </div>

        {/* Parameters */}
        <div className="rounded-xl bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Setup Parameters
          </h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-zinc-500">Camber</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white">
                {calibration.camber}°
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Toe</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white">
                {calibration.toe}°
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Caster</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white">
                {calibration.caster}°
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Boost</dt>
              <dd className="mt-0.5 text-lg font-semibold text-white">
                {calibration.boost}%
              </dd>
            </div>
          </dl>
        </div>

        {/* Custom Parameters */}
        {calibration.customParams.length > 0 && (
          <div className="rounded-xl bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Custom Parameters
            </h2>
            <dl className="space-y-2">
              {calibration.customParams.map((param, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2"
                >
                  <dt className="text-sm text-zinc-400">{param.name}</dt>
                  <dd className="text-sm font-medium text-white">
                    {param.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
