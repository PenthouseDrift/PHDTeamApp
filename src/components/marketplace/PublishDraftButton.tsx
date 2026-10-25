"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishListing } from "@/actions/marketplace";

/** Publishes a draft listing so it can be bought and reserved. */
export function PublishDraftButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function publish() {
    if (!window.confirm("Publish this listing? It will become visible to members and on the website.")) return;
    setError(null);
    startTransition(async () => {
      const res = await publishListing(listingId);
      if (res.success) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={publish}
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-amber-500 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Publishing…" : "Publish listing"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
