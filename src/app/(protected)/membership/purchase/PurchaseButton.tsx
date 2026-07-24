"use client";

import { useFormStatus } from "react-dom";

interface PurchaseButtonProps {
  isActive: boolean;
  price: number;
  durationDays: number;
}

export function PurchaseButton({ isActive, price, durationDays }: PurchaseButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3.5 text-base font-semibold text-black transition-all hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-75 disabled:cursor-not-allowed shadow-lg active:scale-[0.99]"
    >
      {pending ? (
        <>
          <svg className="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Connecting to SumUp...</span>
        </>
      ) : (
        <span>
          {isActive
            ? `Renew Membership - £${price.toFixed(2)}`
            : `Purchase ${durationDays}-Day Membership - £${price.toFixed(2)}`}
        </span>
      )}
    </button>
  );
}
