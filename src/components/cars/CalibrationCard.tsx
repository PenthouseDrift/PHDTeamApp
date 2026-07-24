"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShareCalibrationButton } from "./ShareCalibrationButton";
import { deleteCalibration } from "@/actions/calibration";
import { useSession } from "next-auth/react";
import type { CalibrationSetup } from "@/types";

interface CalibrationCardProps {
  cal: CalibrationSetup;
}

export function CalibrationCard({ cal }: CalibrationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const { data: session } = useSession();

  function handleDelete() {
    if (!session?.user?.id) return;
    startDeleteTransition(async () => {
      await deleteCalibration(cal.calibrationId, session.user.id);
    });
  }

  return (
    <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
      {/* Header row — share button + delete + date */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <h3 className="text-sm font-medium text-zinc-900">{cal.name}</h3>
        <div className="flex items-center gap-2">
          <ShareCalibrationButton calibrationId={cal.calibrationId} calibrationName={cal.name} />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
            title="Delete calibration"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          <span className="text-xs text-zinc-400">
            {new Date(cal.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-bold text-zinc-900">Delete Calibration?</h4>
            <p className="text-xs text-zinc-500">
              Are you sure you want to delete <strong>"{cal.name}"</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tappable area to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 pb-4 pt-2 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>F.Camber: {cal.frontCamber}°</span>
            <span>R.Camber: {cal.rearCamber}°</span>
            <span>Gyro: {cal.gyroGain}%</span>
            <span>Boost: {cal.boost}%</span>
            {cal.customParams.length > 0 && (
              <span>+{cal.customParams.length} custom</span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ml-2 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 p-4 space-y-4 bg-zinc-50">
          {/* Steering */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Steering & Alignment</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Front Camber" value={`${cal.frontCamber ?? 0}°`} />
              <Param label="Rear Camber" value={`${cal.rearCamber ?? 0}°`} />
              <Param label="Front Toe" value={`${cal.frontToe ?? 0}°`} />
              <Param label="Rear Toe" value={`${cal.rearToe ?? 0}°`} />
              <Param label="Front Caster" value={`${cal.frontCaster ?? 0}°`} />
              <Param label="Ackermann" value={`${cal.ackermann ?? 0}%`} />
              <Param label="Steering Angle" value={`${cal.steeringAngle ?? 0}°`} />
            </div>
          </div>

          {/* Suspension */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Suspension & Shocks</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Front Ride Height" value={`${cal.frontRideHeight ?? 0}mm`} />
              <Param label="Rear Ride Height" value={`${cal.rearRideHeight ?? 0}mm`} />
              <Param label="Front Spring" value={cal.frontSpringRate || "Not set"} />
              <Param label="Rear Spring" value={cal.rearSpringRate || "Not set"} />
              <Param label="Front Oil Weight" value={cal.frontOilWeight || "Not set"} />
              <Param label="Rear Oil Weight" value={cal.rearOilWeight || "Not set"} />
              <Param label="Front Oil Brand" value={cal.frontOilBrand || "Not set"} />
              <Param label="Rear Oil Brand" value={cal.rearOilBrand || "Not set"} />
              <Param label="Front Piston Holes" value={`${cal.frontPistonHoles ?? 0}`} />
              <Param label="Rear Piston Holes" value={`${cal.rearPistonHoles ?? 0}`} />
              <Param label="Front Piston Hole Size" value={cal.frontPistonHoleSize || "Not set"} />
              <Param label="Rear Piston Hole Size" value={cal.rearPistonHoleSize || "Not set"} />
              <Param label="Front Shock Length" value={`${cal.frontShockLength ?? 0}mm`} />
              <Param label="Rear Shock Length" value={`${cal.rearShockLength ?? 0}mm`} />
              <Param label="Front Shock Brand" value={cal.frontShockBrand || "Not set"} />
              <Param label="Rear Shock Brand" value={cal.rearShockBrand || "Not set"} />
              <Param label="Front O-Rings" value={cal.frontORings || "Not set"} />
              <Param label="Rear O-Rings" value={cal.rearORings || "Not set"} />
              <Param label="Front Droop" value={`${cal.frontDroop ?? 0}mm`} />
              <Param label="Rear Droop" value={`${cal.rearDroop ?? 0}mm`} />
            </div>
          </div>

          {/* Electronics & Drivetrain */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Electronics & Drivetrain</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Motor Turns" value={`${cal.motorTurns ?? 0}T`} />
              <Param label="Motor Timing" value={`${cal.motorTiming ?? 0}°`} />
              <Param label="Motor Placement" value={cal.motorPlacement || "Not set"} />
              <Param label="Spur Gear" value={`${cal.spurGear ?? 0}T`} />
              <Param label="Pinion Gear" value={`${cal.pinionGear ?? 0}T`} />
              <Param label="FDR" value={`${cal.finalDriveRatio ?? 0}`} />
              <Param label="Gyro Gain" value={`${cal.gyroGain ?? 0}%`} />
              <Param label="Throttle Expo" value={`${cal.throttleExpo ?? 0}%`} />
              <Param label="Steering Expo" value={`${cal.steeringExpo ?? 0}%`} />
              <Param label="Boost" value={`${cal.boost ?? 0}%`} />
              <Param label="Turbo" value={`${cal.turbo ?? 0}%`} />
            </div>
          </div>

          {/* Geometry & Tyres */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Geometry & Tyres</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Front Track" value={`${cal.frontTrackWidth ?? 0}mm`} />
              <Param label="Rear Track" value={`${cal.rearTrackWidth ?? 0}mm`} />
              <Param label="Wheelbase" value={`${cal.wheelbase ?? 0}mm`} />
              <Param label="Weight" value={`${cal.totalWeight ?? 0}g`} />
              <Param label="Battery" value={cal.batteryPosition || "Not set"} />
              <Param label="Front Tyres" value={cal.frontTyres || "Not set"} />
              <Param label="Rear Tyres" value={cal.rearTyres || "Not set"} />
            </div>
          </div>

          {/* Custom params */}
          {cal.customParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Custom</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {cal.customParams.map((p, i) => (
                  <Param key={i} label={p.name} value={p.value} />
                ))}
              </div>
            </div>
          )}

          {/* Edit link */}
          <div className="pt-2 border-t border-zinc-200">
            <Link
              href={`/cars/${cal.carId}/calibrations/${cal.calibrationId}/edit`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
              Edit Calibration
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5 border border-zinc-100">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="font-medium text-zinc-900">{value}</p>
    </div>
  );
}
