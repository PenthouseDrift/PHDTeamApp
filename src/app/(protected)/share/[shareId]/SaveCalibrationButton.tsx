"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getMemberCarsForSelect } from "@/actions/calculator";
import { createCalibration } from "@/actions/calibration";
import type { CalibrationSetup } from "@/types";

interface SaveCalibrationButtonProps {
  calibration: CalibrationSetup;
}

export function SaveCalibrationButton({ calibration }: SaveCalibrationButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cars, setCars] = useState<{ carId: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    async function loadCars() {
      if (!session?.user?.id) return;
      const result = await getMemberCarsForSelect(session.user.id);
      if (result.success) {
        setCars(result.data);
        if (result.data.length > 0) {
          setSelectedCarId(result.data[0].carId);
        }
      }
      setLoading(false);
    }
    loadCars();
  }, [session?.user?.id]);

  function handleSave() {
    if (!session?.user?.id || !selectedCarId) return;

    startTransition(async () => {
      const data = {
        name: calibration.name,
        frontCamber: calibration.frontCamber,
        rearCamber: calibration.rearCamber,
        frontToe: calibration.frontToe,
        rearToe: calibration.rearToe,
        frontCaster: calibration.frontCaster,
        ackermann: calibration.ackermann,
        steeringAngle: calibration.steeringAngle,
        frontRideHeight: calibration.frontRideHeight,
        rearRideHeight: calibration.rearRideHeight,
        frontSpringRate: calibration.frontSpringRate,
        rearSpringRate: calibration.rearSpringRate,
        frontDamping: calibration.frontDamping,
        rearDamping: calibration.rearDamping,
        frontRebound: calibration.frontRebound,
        rearRebound: calibration.rearRebound,
        frontDroop: calibration.frontDroop,
        rearDroop: calibration.rearDroop,
        gyroGain: calibration.gyroGain,
        throttleEPA: calibration.throttleEPA,
        steeringEPA: calibration.steeringEPA,
        boost: calibration.boost,
        turbo: calibration.turbo,
        frontTrackWidth: calibration.frontTrackWidth,
        rearTrackWidth: calibration.rearTrackWidth,
        wheelbase: calibration.wheelbase,
        batteryPosition: calibration.batteryPosition,
        totalWeight: calibration.totalWeight,
        frontTyres: calibration.frontTyres,
        rearTyres: calibration.rearTyres,
        customParams: calibration.customParams,
      };

      const result = await createCalibration(selectedCarId, session.user.id, data);
      if (result.success) {
        setFeedback({ type: "success", message: "Calibration saved to your car!" });
        setTimeout(() => router.push(`/cars/${selectedCarId}`), 1500);
      } else {
        setFeedback({ type: "error", message: result.error });
      }
    });
  }

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
      >
        Save to My Car
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-900">Save to Your Car</h3>

      {feedback && (
        <div className={`rounded-lg px-3 py-2 text-sm ${
          feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {feedback.message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading your cars...</p>
      ) : cars.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            You don't have any cars yet. Create one to save this calibration.
          </p>
          <button
            onClick={() => router.push("/cars/new")}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Create a Car Profile
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="save-car" className="block text-xs font-medium text-zinc-600 mb-1">
              Select car
            </label>
            <select
              id="save-car"
              value={selectedCarId}
              onChange={(e) => setSelectedCarId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {cars.map((car) => (
                <option key={car.carId} value={car.carId}>
                  {car.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Calibration"}
          </button>
        </div>
      )}

      <button
        onClick={() => setShowPanel(false)}
        className="w-full text-xs text-zinc-400 hover:text-zinc-600"
      >
        Cancel
      </button>
    </div>
  );
}
