"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Appearance
      </h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Choose your preferred theme.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => { if (theme === "dark") toggleTheme(); }}
          className={`flex-1 rounded-lg border-2 p-4 text-center transition-colors ${
            theme === "light"
              ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
          }`}
        >
          <div className="text-2xl mb-1">☀️</div>
          <span className={`text-sm font-medium ${theme === "light" ? "text-amber-700" : "text-zinc-600 dark:text-zinc-400"}`}>
            Light
          </span>
        </button>
        <button
          onClick={() => { if (theme === "light") toggleTheme(); }}
          className={`flex-1 rounded-lg border-2 p-4 text-center transition-colors ${
            theme === "dark"
              ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
          }`}
        >
          <div className="text-2xl mb-1">🌙</div>
          <span className={`text-sm font-medium ${theme === "dark" ? "text-amber-700 dark:text-amber-400" : "text-zinc-600 dark:text-zinc-400"}`}>
            Dark
          </span>
        </button>
      </div>
    </section>
  );
}
