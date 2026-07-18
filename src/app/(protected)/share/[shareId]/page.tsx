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
      <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
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
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            <h1 className="text-lg font-semibold text-zinc-900">
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
      <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-8 text-center">
            <h1 className="text-lg font-semibold text-zinc-900">
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
    calibrationId: (calData.calibrationId as string) || calibrationId,
    carId: (calData.carId as string) || "",
    userId: calData.userId as string,
    name: (calData.name as string) || "Untitled",
    frontCamber: Number(calData.frontCamber) || 0,
    rearCamber: Number(calData.rearCamber) || 0,
    frontToe: Number(calData.frontToe) || 0,
    rearToe: Number(calData.rearToe) || 0,
    frontCaster: Number(calData.frontCaster) || 0,
    ackermann: Number(calData.ackermann) || 0,
    steeringAngle: Number(calData.steeringAngle) || 0,
    frontRideHeight: Number(calData.frontRideHeight) || 0,
    rearRideHeight: Number(calData.rearRideHeight) || 0,
    frontSpringRate: (calData.frontSpringRate as string) || "",
    rearSpringRate: (calData.rearSpringRate as string) || "",
    frontDamping: Number(calData.frontDamping) || 0,
    rearDamping: Number(calData.rearDamping) || 0,
    frontRebound: Number(calData.frontRebound) || 0,
    rearRebound: Number(calData.rearRebound) || 0,
    frontDroop: Number(calData.frontDroop) || 0,
    rearDroop: Number(calData.rearDroop) || 0,
    gyroGain: Number(calData.gyroGain) || 0,
    throttleEPA: Number(calData.throttleEPA) || 100,
    steeringEPA: Number(calData.steeringEPA) || 100,
    boost: Number(calData.boost) || 0,
    turbo: Number(calData.turbo) || 0,
    frontTrackWidth: Number(calData.frontTrackWidth) || 0,
    rearTrackWidth: Number(calData.rearTrackWidth) || 0,
    wheelbase: Number(calData.wheelbase) || 0,
    batteryPosition: (calData.batteryPosition as string) || "",
    totalWeight: Number(calData.totalWeight) || 0,
    frontTyres: (calData.frontTyres as string) || "",
    rearTyres: (calData.rearTyres as string) || "",
    customParams: Array.isArray(calData.customParams) ? calData.customParams : JSON.parse((calData.customParams as string) || "[]"),
    createdAt: Number(calData.createdAt),
  };

  // Load car profile
  const carData = await redis.hgetall(`car:${calibration.carId}`);
  const carName = (carData?.name as string) || "Unknown Car";

  // Load creator info
  const creatorData = await redis.hgetall(`member:${calibration.userId}`);
  const creatorName = (creatorData?.name as string) || "Unknown User";

  return (
    <div className="min-h-full bg-zinc-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <p className="text-sm text-zinc-400">Shared Calibration Setup</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">
            {calibration.name}
          </h1>
        </div>

        {/* Meta info */}
        <div className="rounded-xl bg-white p-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-400">Car</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">{carName}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Created by</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">{creatorName}</dd>
            </div>
          </dl>
        </div>

        {/* Parameters */}
        <div className="rounded-xl bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-600">
            Steering & Alignment
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><dt className="text-xs text-zinc-400">Front Camber</dt><dd className="font-medium text-zinc-900">{calibration.frontCamber}°</dd></div>
            <div><dt className="text-xs text-zinc-400">Rear Camber</dt><dd className="font-medium text-zinc-900">{calibration.rearCamber}°</dd></div>
            <div><dt className="text-xs text-zinc-400">Front Toe</dt><dd className="font-medium text-zinc-900">{calibration.frontToe}°</dd></div>
            <div><dt className="text-xs text-zinc-400">Rear Toe</dt><dd className="font-medium text-zinc-900">{calibration.rearToe}°</dd></div>
            <div><dt className="text-xs text-zinc-400">Caster</dt><dd className="font-medium text-zinc-900">{calibration.frontCaster}°</dd></div>
            <div><dt className="text-xs text-zinc-400">Ackermann</dt><dd className="font-medium text-zinc-900">{calibration.ackermann}%</dd></div>
            <div><dt className="text-xs text-zinc-400">Steering Angle</dt><dd className="font-medium text-zinc-900">{calibration.steeringAngle}°</dd></div>
          </dl>
        </div>

        <div className="rounded-xl bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-600">
            Suspension
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><dt className="text-xs text-zinc-400">Front Ride Height</dt><dd className="font-medium text-zinc-900">{calibration.frontRideHeight}mm</dd></div>
            <div><dt className="text-xs text-zinc-400">Rear Ride Height</dt><dd className="font-medium text-zinc-900">{calibration.rearRideHeight}mm</dd></div>
            {calibration.frontSpringRate && <div><dt className="text-xs text-zinc-400">Front Spring</dt><dd className="font-medium text-zinc-900">{calibration.frontSpringRate}</dd></div>}
            {calibration.rearSpringRate && <div><dt className="text-xs text-zinc-400">Rear Spring</dt><dd className="font-medium text-zinc-900">{calibration.rearSpringRate}</dd></div>}
            <div><dt className="text-xs text-zinc-400">Front Damping</dt><dd className="font-medium text-zinc-900">{calibration.frontDamping}/10</dd></div>
            <div><dt className="text-xs text-zinc-400">Rear Damping</dt><dd className="font-medium text-zinc-900">{calibration.rearDamping}/10</dd></div>
            <div><dt className="text-xs text-zinc-400">Front Rebound</dt><dd className="font-medium text-zinc-900">{calibration.frontRebound}/10</dd></div>
            <div><dt className="text-xs text-zinc-400">Rear Rebound</dt><dd className="font-medium text-zinc-900">{calibration.rearRebound}/10</dd></div>
          </dl>
        </div>

        <div className="rounded-xl bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-600">
            Electronics
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><dt className="text-xs text-zinc-400">Gyro Gain</dt><dd className="font-medium text-zinc-900">{calibration.gyroGain}%</dd></div>
            <div><dt className="text-xs text-zinc-400">Boost</dt><dd className="font-medium text-zinc-900">{calibration.boost}%</dd></div>
            <div><dt className="text-xs text-zinc-400">Turbo</dt><dd className="font-medium text-zinc-900">{calibration.turbo}%</dd></div>
            <div><dt className="text-xs text-zinc-400">Throttle EPA</dt><dd className="font-medium text-zinc-900">{calibration.throttleEPA}%</dd></div>
            <div><dt className="text-xs text-zinc-400">Steering EPA</dt><dd className="font-medium text-zinc-900">{calibration.steeringEPA}%</dd></div>
          </dl>
        </div>

        {(calibration.frontTrackWidth > 0 || calibration.wheelbase > 0 || calibration.totalWeight > 0 || calibration.frontTyres) && (
          <div className="rounded-xl bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-600">
              Geometry, Weight & Tyres
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              {calibration.frontTrackWidth > 0 && <div><dt className="text-xs text-zinc-400">Front Track</dt><dd className="font-medium text-zinc-900">{calibration.frontTrackWidth}mm</dd></div>}
              {calibration.rearTrackWidth > 0 && <div><dt className="text-xs text-zinc-400">Rear Track</dt><dd className="font-medium text-zinc-900">{calibration.rearTrackWidth}mm</dd></div>}
              {calibration.wheelbase > 0 && <div><dt className="text-xs text-zinc-400">Wheelbase</dt><dd className="font-medium text-zinc-900">{calibration.wheelbase}mm</dd></div>}
              {calibration.totalWeight > 0 && <div><dt className="text-xs text-zinc-400">Weight</dt><dd className="font-medium text-zinc-900">{calibration.totalWeight}g</dd></div>}
              {calibration.batteryPosition && <div><dt className="text-xs text-zinc-400">Battery Position</dt><dd className="font-medium text-zinc-900">{calibration.batteryPosition}</dd></div>}
              {calibration.frontTyres && <div><dt className="text-xs text-zinc-400">Front Tyres</dt><dd className="font-medium text-zinc-900">{calibration.frontTyres}</dd></div>}
              {calibration.rearTyres && <div><dt className="text-xs text-zinc-400">Rear Tyres</dt><dd className="font-medium text-zinc-900">{calibration.rearTyres}</dd></div>}
            </dl>
          </div>
        )}

        {/* Custom Parameters */}
        {calibration.customParams.length > 0 && (
          <div className="rounded-xl bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-600">
              Custom Parameters
            </h2>
            <dl className="space-y-2">
              {calibration.customParams.map((param, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2"
                >
                  <dt className="text-sm text-zinc-400">{param.name}</dt>
                  <dd className="text-sm font-medium text-zinc-900">
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
