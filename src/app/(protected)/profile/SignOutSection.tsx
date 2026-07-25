"use client";

import { signOut } from "next-auth/react";

export function SignOutSection() {
  return (
    <section className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Sign Out</h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Sign out of your Penthouse Drift account.
      </p>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors shadow-xs"
      >
        Sign Out
      </button>
    </section>
  );
}
