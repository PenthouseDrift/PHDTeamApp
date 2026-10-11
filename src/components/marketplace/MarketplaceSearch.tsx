"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface MarketplaceSearchProps {
  /** Current query from the URL. The parent keys this component on it, so a
   * change (back button, clear link) remounts with the right initial value. */
  initialQuery?: string;
}

/**
 * Marketplace search box. Debounces typing and pushes the query to the URL
 * (?q=...), always resetting to page 1. Server component re-renders with the
 * filtered, paginated results.
 */
export function MarketplaceSearch({ initialQuery = "" }: MarketplaceSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  // Debounced navigation on typing. Skips pushing when the value already matches
  // the URL query the component mounted with (no redundant navigation).
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === initialQuery.trim()) return;
    const t = setTimeout(() => {
      router.push(trimmed ? `/marketplace?q=${encodeURIComponent(trimmed)}` : "/marketplace");
    }, 300);
    return () => clearTimeout(t);
  }, [value, initialQuery, router]);

  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the marketplace…"
        aria-label="Search the marketplace"
        className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-10 pr-10 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
