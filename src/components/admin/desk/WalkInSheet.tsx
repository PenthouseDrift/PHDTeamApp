"use client";

import { useState, useTransition } from "react";
import { addNonMemberCheckIn } from "@/actions/admin/checkins";
import { BASE_PRICES } from "@/lib/activity-pricing";
import { money } from "./desk-utils";
import { SheetFrame, PaymentToggle } from "./desk-ui";

type GuestMethod = "day_pass" | "rental" | "manual";

const OPTIONS: Array<{ value: GuestMethod; title: string; sub: string; paid: boolean; price?: number }> = [
  { value: "day_pass", title: "Day pass", sub: "Cash or card at the desk", paid: true, price: BASE_PRICES.daypass },
  { value: "rental", title: "Car rental", sub: "Starts a rental timer", paid: true, price: BASE_PRICES.rental },
  { value: "manual", title: "Free track access", sub: "No charge", paid: false },
];

/** Check in someone with no account. Same actions as before, one screen. */
export function WalkInSheet({
  initialName,
  onClose,
  onDone,
}: {
  initialName: string;
  onClose: () => void;
  onDone: (t: { message: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [method, setMethod] = useState<GuestMethod>("day_pass");
  const [payLater, setPayLater] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = OPTIONS.find((o) => o.value === method)!;
  const trimmed = name.trim();

  function submit() {
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addNonMemberCheckIn(trimmed, "", method, chosen.paid && payLater);
      if (res.success) {
        const label =
          method === "manual" ? "free access" : `${chosen.title.toLowerCase()}, ${payLater ? "pay later" : "paid"}`;
        onDone({ message: `${trimmed} · ${label}` });
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <SheetFrame title="Walk-in" subtitle="Someone without an account" onClose={onClose}>
      <div>
        <label htmlFor="walkin-name" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Name
        </label>
        <input
          id="walkin-name"
          autoFocus={!initialName}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          maxLength={60}
          placeholder="Customer name"
          className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      <div role="radiogroup" aria-label="What are they paying for?" className="space-y-2">
        {OPTIONS.map((o) => {
          const active = method === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMethod(o.value)}
              className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                active
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/60"
              }`}
            >
              <span>
                <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">{o.title}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{o.sub}</span>
              </span>
              <span className="text-sm font-black text-zinc-700 dark:text-zinc-200">{o.price ? money(o.price) : "Free"}</span>
            </button>
          );
        })}
      </div>

      {chosen.paid && <PaymentToggle payLater={payLater} onChange={setPayLater} disabled={pending} />}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!trimmed || pending}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-md transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Checking in…" : trimmed ? `Check in ${trimmed}` : "Enter a name"}
      </button>
    </SheetFrame>
  );
}
