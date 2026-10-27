"use client";

import { useState, useTransition } from "react";
import { deleteMemberCard } from "@/actions/admin/member-cards";

/**
 * Admin-only "Delete card" with a confirm step, for the dark card viewers. The server checks the
 * admin role again, so this button is only a convenience. Give it `key={card.id}` so it starts
 * fresh for each card.
 */
export function DeleteCardButton({ cardId, onDeleted }: { cardId: string; onDeleted: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteMemberCard(cardId);
      if (res.success) onDeleted(res.data.id);
      else setError(res.error);
    });
  }

  const outline = "min-h-11 rounded-xl border border-zinc-700 px-4 text-sm font-bold hover:bg-zinc-800 disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-400">
          {error}
        </p>
      )}
      {confirm ? (
        <>
          <p className="text-sm font-bold">
            Delete this card for good? It is removed from the owner&apos;s collection and from the community pool. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} disabled={pending} className={outline}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-300">Admin only</p>
          <button type="button" onClick={() => setConfirm(true)} className={`${outline} text-red-300`}>
            Delete card
          </button>
        </div>
      )}
    </div>
  );
}
