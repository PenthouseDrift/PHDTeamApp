"use client";

import { useState } from "react";
import Link from "next/link";
import { ShareCalibrationButton } from "./ShareCalibrationButton";
import type { CalibrationSetup } from "@/types";

interface CalibrationCardProps {
  cal: CalibrationSetup;
}

export function CalibrationCard({ cal }: CalibrationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
      {/* Header row — share button + date on right */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <h3 className="text-sm font-medium text-zinc-900">{cal.name}</h3>
        <div className="flex items-center gap-2">
          <ShareCalibrationButton calibrationId={cal.calibrationId} calibrationName={cal.name} />
          <span className="text-xs text-zinc-400">
            {new Date(cal.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

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
              <Param label="Front Camber" value={`${cal.frontCamber}°`} />
              <Param label="Rear Camber" value={`${cal.rearCamber}°`} />
              <Param label="Front Toe" value={`${cal.frontToe}°`} />
              <Param label="Rear Toe" value={`${cal.rearToe}°`} />
              <Param label="Caster" value={`${cal.frontCaster}°`} />
              <Param label="Ackermann" value={`${cal.ackermann}%`} />
              <Param label="Steering Angle" value={`${cal.steeringAngle}°`} />
            </div>
          </div>

          {/* Suspension */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Suspension</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Front Ride Height" value={`${cal.frontRideHeight}mm`} />
              <Param label="Rear Ride Height" value={`${cal.rearRideHeight}mm`} />
              {cal.frontSpringRate && <Param label="Front Spring" value={cal.frontSpringRate} />}
              {cal.rearSpringRate && <Param label="Rear Spring" value={cal.rearSpringRate} />}
              <Param label="Front Damping" value={`${cal.frontDamping}/10`} />
              <Param label="Rear Damping" value={`${cal.rearDamping}/10`} />
              <Param label="Front Rebound" value={`${cal.frontRebound}/10`} />
              <Param label="Rear Rebound" value={`${cal.rearRebound}/10`} />
              <Param label="Front Droop" value={`${cal.frontDroop}mm`} />
              <Param label="Rear Droop" value={`${cal.rearDroop}mm`} />
            </div>
          </div>

          {/* Electronics */}
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Electronics</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Param label="Gyro Gain" value={`${cal.gyroGain}%`} />
              <Param label="Boost" value={`${cal.boost}%`} />
              <Param label="Turbo" value={`${cal.turbo}%`} />
              <Param label="Throttle EPA" value={`${cal.throttleEPA}%`} />
              <Param label="Steering EPA" value={`${cal.steeringEPA}%`} />
            </div>
          </div>

          {/* Geometry */}
          {(cal.frontTrackWidth > 0 || cal.wheelbase > 0 || cal.totalWeight > 0 || cal.frontTyres) && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Geometry & Tyres</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {cal.frontTrackWidth > 0 && <Param label="Front Track" value={`${cal.frontTrackWidth}mm`} />}
                {cal.rearTrackWidth > 0 && <Param label="Rear Track" value={`${cal.rearTrackWidth}mm`} />}
                {cal.wheelbase > 0 && <Param label="Wheelbase" value={`${cal.wheelbase}mm`} />}
                {cal.totalWeight > 0 && <Param label="Weight" value={`${cal.totalWeight}g`} />}
                {cal.batteryPosition && <Param label="Battery" value={cal.batteryPosition} />}
                {cal.frontTyres && <Param label="Front Tyres" value={cal.frontTyres} />}
                {cal.rearTyres && <Param label="Rear Tyres" value={cal.rearTyres} />}
              </div>
            </div>
          )}

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
