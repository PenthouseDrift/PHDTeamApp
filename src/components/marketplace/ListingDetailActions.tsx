"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteListing, setListingStatus } from "@/actions/marketplace";

interface ListingDetailActionsProps {
  listingId: string;
  initialStatus: "available" | "sold";
}

export function ListingDetailActions({ listingId, initialStatus }: ListingDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);

  const handleToggleSold = () => {
    const next = status === "sold" ? "available" : "sold";
    startTransition(async () => {
      const result = await setListingStatus(listingId, next);
      if (result.success) {
        setStatus(result.data.status);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (result.success) {
        router.push("/marketplace");
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/marketplace/${listingId}/edit`}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={handleToggleSold}
        disabled={isPending}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {status === "sold" ? "Mark as available" : "Mark as sold"}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        Delete listing
      </button>
    </div>
  );
}
