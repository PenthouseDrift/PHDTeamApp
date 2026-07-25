"use client";

import { useState, useTransition } from "react";
import { createMembershipCheckout } from "@/actions/membership";

interface PurchaseButtonProps {
  userId: string;
  isActive: boolean;
  price: number;
  durationDays: number;
  isDisabled?: boolean;
  disabledReason?: string;
}

export function PurchaseButton({
  userId,
  isActive,
  price,
  durationDays,
  isDisabled = false,
  disabledReason,
}: PurchaseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handlePurchaseClick() {
    if (isDisabled) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await createMembershipCheckout(userId);
        if (res.success) {
          window.location.href = res.data.url;
        } else {
          setErrorMsg(res.error || "Payment initialization failed");
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Payment checkout error");
      }
    });
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}
      <button
        type="button"
        onClick={handlePurchaseClick}
        disabled={isPending || isDisabled}
        className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-base font-semibold transition-all shadow-lg active:scale-[0.99] ${
          isDisabled
            ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-300 dark:border-zinc-700"
            : "bg-amber-500 text-black hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-75 disabled:cursor-not-allowed"
        }`}
      >
        {isPending ? (
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
        ) : isDisabled ? (
          <span>{disabledReason || "Purchasing Disabled for Staff"}</span>
        ) : (
          <span>
            {isActive
              ? `Renew Membership - £${price.toFixed(2)}`
              : `Purchase ${durationDays}-Day Membership - £${price.toFixed(2)}`}
          </span>
        )}
      </button>
    </div>
  );
}
