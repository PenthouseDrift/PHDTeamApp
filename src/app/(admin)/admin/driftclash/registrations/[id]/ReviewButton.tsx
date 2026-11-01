"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRegistrationReviewedAction } from "@/actions/admin/driftclash-registrations";

export function ReviewButton({ id, reviewed }: { id: string; reviewed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    startTransition(async () => {
      const result = await setRegistrationReviewedAction(id, !reviewed);
      if (result.success) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`rounded-xl px-4 py-2 text-sm font-black transition-colors disabled:opacity-60 ${
          reviewed
            ? "border border-zinc-300 text-zinc-700 hover:border-amber-400 dark:border-zinc-700 dark:text-zinc-200"
            : "bg-amber-500 text-black hover:bg-amber-400"
        }`}
      >
        {pending ? "Saving..." : reviewed ? "Mark as new again" : "Mark as reviewed"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-bold text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
