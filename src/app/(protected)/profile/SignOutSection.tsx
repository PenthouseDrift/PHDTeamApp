"use client";

import { signOut } from "next-auth/react";

export function SignOutSection() {
  return (
    <section className="rounded-xl bg-white border border-zinc-200 p-6">
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Sign Out</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Sign out of your Penthouse Drift account.
      </p>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
      >
        Sign Out
      </button>
    </section>
  );
}
