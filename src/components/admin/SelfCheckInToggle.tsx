"use client";

import * as React from "react";
import { useTransition } from "react";
import { toggleSelfCheckInStatus } from "@/actions/admin/checkins";

interface SelfCheckInToggleProps {
  adminId: string;
  initialActive: boolean;
}

export function SelfCheckInToggle({ adminId, initialActive }: SelfCheckInToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = React.useState(initialActive);

  React.useEffect(() => {
    setActive(initialActive);
  }, [initialActive]);

  const handleToggle = () => {
    const nextState = !active;
    setActive(nextState); // Optimistic UI update
    
    startTransition(async () => {
      const res = await toggleSelfCheckInStatus(adminId);
      if (!res?.success) {
        setActive(!nextState); // Revert on failure
      }
    });
  };

  return (
    <div className="flex items-center justify-between p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl -mr-10 -mt-10 pointer-events-none transition-colors duration-500 ${active ? 'bg-emerald-500/10' : 'bg-transparent'}`}></div>
      
      <div className="flex items-center gap-4 relative z-10">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 transition-colors duration-500 ${active ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
          </svg>
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Self Check-In
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            {active ? "Active: Members can check themselves in via dashboard." : "Inactive: Manual admin QR scan required."}
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={active}
        disabled={isPending}
        onClick={handleToggle}
        className={`relative inline-flex h-7 w-12 sm:h-8 sm:w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ${
          active ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
        } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="sr-only">Toggle Self Check-in</span>
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-6 w-6 sm:h-7 sm:w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            active ? "translate-x-5 sm:translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
