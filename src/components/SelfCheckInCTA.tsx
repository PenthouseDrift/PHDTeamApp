"use client";

import Link from "next/link";

export function SelfCheckInCTA() {
  return (
    <div className="w-full rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 sm:p-6 shadow-lg relative overflow-hidden text-center">
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-1">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
          Self Check-In is Active
        </h3>
        <p className="text-sm text-emerald-50 font-medium max-w-[280px]">
          Skip the line! You can check yourself in for today's track event right now.
        </p>

        <Link
          href="/track-checkin"
          className="mt-2 w-full max-w-[240px] rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 font-black text-sm sm:text-base py-3.5 px-6 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          Check In Now
        </Link>
      </div>
    </div>
  );
}
