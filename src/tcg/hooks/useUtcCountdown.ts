"use client";

import { useEffect, useState } from "react";
import { getUtcMidnightCountdown } from "@/tcg/progression";

/**
 * Live ticking countdown to the next 00:00:00 UTC reset (e.g. "15h 22m 04s").
 * Updates every 1,000ms.
 */
export function useUtcMidnightCountdown(): string {
  const [countdown, setCountdown] = useState<string>(() => getUtcMidnightCountdown().formatted);

  useEffect(() => {
    setCountdown(getUtcMidnightCountdown().formatted);
    const interval = setInterval(() => {
      setCountdown(getUtcMidnightCountdown().formatted);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return countdown;
}

